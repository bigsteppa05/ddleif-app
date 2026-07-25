import { type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getAccessToken, stkQuery } from "./daraja.ts";

// ─────────────────────────────────────────────────────────────────────────────
// The reconciliation step. Shared by mpesa-stk-query (client-driven, while a
// user waits) and mpesa-sweep (scheduled, for payments nobody is watching).
// Both go through complete_payment, which stays the only path that credits.
//
// NOTE: duplicated into each function folder at deploy time, like daraja.ts.
// Keep mpesa-stk-query/reconcile.ts and mpesa-sweep/reconcile.ts in sync.
// ─────────────────────────────────────────────────────────────────────────────

// How long we keep asking before handing the row to a human.
export const RECONCILE_WINDOW_MS = 15 * 60_000;
// Bounded backoff so a stuck payment cannot hammer Daraja: 5s, 10s, 20s … 60s.
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;

export const IN_FLIGHT = ["pending", "reconciling"];
export const TERMINAL = ["paid", "failed", "expired", "manual_review"];

export const PAYMENT_COLS =
  "id, status, credits, checkout_request_id, mpesa_receipt, reported_amount_kes, result_desc, created_at, reconcile_attempts, last_reconcile_at";

export type Payment = {
  id: string;
  status: string;
  credits: number;
  checkout_request_id: string;
  mpesa_receipt: string | null;
  reported_amount_kes: string | number | null;
  result_desc: string | null;
  created_at: string;
  reconcile_attempts: number;
  last_reconcile_at: string | null;
};

export type Outcome = { status: string; message: string; credits?: number };

/**
 * Ask Daraja for the truth about one payment and settle it if the answer is
 * conclusive AND the row carries the facts the settlement invariant needs.
 * Safe to call repeatedly: terminal rows short-circuit, backoff throttles the
 * rest, and complete_payment credits at most once.
 */
export async function reconcilePayment(admin: SupabaseClient, p: Payment): Promise<Outcome> {
  if (TERMINAL.includes(p.status)) {
    return { status: p.status, message: p.result_desc ?? "", credits: p.credits };
  }

  // Polling clients and the scheduled sweep can both land on the same row;
  // neither should be able to turn one stuck payment into a Daraja flood.
  const backoffMs = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (p.reconcile_attempts ?? 0));
  const sinceLast = p.last_reconcile_at
    ? Date.now() - new Date(p.last_reconcile_at).getTime()
    : Infinity;
  if (sinceLast < backoffMs) return { status: p.status, message: "waiting" };

  const windowClosed = Date.now() - new Date(p.created_at).getTime() > RECONCILE_WINDOW_MS;

  await admin
    .from("payments")
    .update({
      reconcile_attempts: (p.reconcile_attempts ?? 0) + 1,
      last_reconcile_at: new Date().toISOString(),
    })
    .eq("id", p.id);

  let q: { state: "success" | "failed" | "pending"; desc: string };
  try {
    const token = await getAccessToken();
    q = await stkQuery(token, p.checkout_request_id);
  } catch (e) {
    console.error("stk query failed", e);
    // Daraja being unreachable is not evidence of anything. Never settle on it.
    return await inconclusive(admin, p, windowClosed, "Status unavailable");
  }

  // ── Confirmed failure ───────────────────────────────────────────────────
  if (q.state === "failed") {
    const { data } = await admin.rpc("complete_payment", {
      p_checkout_request_id: p.checkout_request_id,
      p_success: false,
      p_receipt: null,
      p_reported_amount_kes: null,
      p_result_desc: q.desc,
    });
    const r = data as { ok?: boolean; reason?: string } | null;
    if (r?.ok) return { status: "failed", message: q.desc };
    // The callback said paid and the query says failed. Do not guess.
    if (r?.reason === "contradicts_callback") {
      await flag(admin, p, "Callback and M-Pesa status disagree — under review.");
      return { status: "manual_review", message: "Under review." };
    }
    return { status: p.status, message: q.desc };
  }

  // ── Confirmed success ───────────────────────────────────────────────────
  if (q.state === "success") {
    const { data } = await admin.rpc("complete_payment", {
      p_checkout_request_id: p.checkout_request_id,
      p_success: true,
      p_receipt: p.mpesa_receipt,
      p_reported_amount_kes: p.reported_amount_kes,
      p_result_desc: q.desc,
    });
    const r = data as { ok?: boolean; reason?: string; credits?: number } | null;
    if (r?.ok) return { status: "paid", message: "Paid", credits: r.credits ?? p.credits };

    if (r?.reason === "no_callback_facts") {
      // The callback carrying the receipt and amount has not arrived. It may
      // still. Keep waiting until the window closes, then hand it to a human —
      // this is a real payment we are declining to credit automatically.
      if (!windowClosed) return { status: p.status, message: "Confirming…" };
      await flag(admin, p, "Paid at M-Pesa but no callback received — under review.");
      return { status: "manual_review", message: "Under review." };
    }
    // Amount mismatch, receipt reuse, receipt missing: never auto-credit.
    await flag(admin, p, `Settlement check failed (${r?.reason ?? "unknown"}) — under review.`);
    return { status: "manual_review", message: "Under review." };
  }

  return await inconclusive(admin, p, windowClosed, q.desc);
}

// Daraja gave no usable answer. Retry until the window closes, then escalate.
// Never treat an inconclusive response as paid, and never as failed either —
// the customer's money may have moved.
async function inconclusive(
  admin: SupabaseClient,
  p: Payment,
  windowClosed: boolean,
  desc: string,
): Promise<Outcome> {
  if (!windowClosed) return { status: p.status, message: desc };
  await flag(admin, p, "M-Pesa could not confirm this payment — under review.");
  return { status: "manual_review", message: "Under review." };
}

// Guarded so a concurrent settle always wins over an escalation.
async function flag(admin: SupabaseClient, p: Payment, desc: string): Promise<void> {
  await admin
    .from("payments")
    .update({ status: "manual_review", result_desc: desc })
    .eq("id", p.id)
    .in("status", IN_FLIGHT);
}
