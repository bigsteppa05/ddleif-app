import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getAccessToken, stkQuery } from "./daraja.ts";

// ─────────────────────────────────────────────────────────────────────────────
// The reconciler. This is the ONLY path that creates credits.
//
// mpesa-callback records what Safaricom reported and parks the row in
// 'reconciling'. Nothing is credited on the strength of that callback alone —
// a CheckoutRequestID is an identifier, not a signature. Here we ask Daraja
// directly, on a server-to-server call authenticated with our own credentials,
// and settle only when the independent answer agrees.
//
// State machine:
//   pending      → callback not seen yet (or lost)
//   reconciling  → callback recorded; awaiting independent confirmation
//   paid         → query-confirmed, amount matched, unique receipt, credited once
//   failed       → query-confirmed failure (or a failure callback)
//   manual_review→ contradictory or unresolvable; a human decides
//   expired      → set by mpesa-stk-push for rows Daraja never accepted
//
// A hard constraint shapes this: Safaricom's stkpushquery endpoint returns
// ResultCode/ResultDesc only — no amount and no receipt. So the query can
// confirm THAT a payment succeeded but never WHAT was paid. Those facts come
// from the callback. A query-confirmed success with no callback on file
// therefore cannot be credited; it goes to manual_review once the window
// closes, which is the conservative direction to fail in.
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// How long we keep asking before handing the row to a human.
const RECONCILE_WINDOW_MS = 15 * 60_000;
// Bounded backoff so a stuck payment cannot hammer Daraja: 5s, 10s, 20s … 60s.
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;

const TERMINAL = ["paid", "failed", "expired", "manual_review"];

type Payment = {
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, message: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ ok: false, message: "unauthorized" }, 401);

  const { checkout_request_id } = await req.json().catch(() => ({}));
  if (!checkout_request_id || typeof checkout_request_id !== "string") {
    return json({ ok: false, message: "missing checkout_request_id" }, 400);
  }

  // RLS (payments_select_own) means this only resolves a payment the caller owns.
  const { data: payment } = await userClient
    .from("payments")
    .select(
      "id, status, credits, checkout_request_id, mpesa_receipt, reported_amount_kes, result_desc, created_at, reconcile_attempts, last_reconcile_at",
    )
    .eq("checkout_request_id", checkout_request_id)
    .maybeSingle();
  if (!payment) return json({ ok: false, message: "not_found" }, 404);
  const p = payment as Payment;

  // Already final — idempotent, no Daraja call needed.
  if (TERMINAL.includes(p.status)) {
    return json({ ok: true, status: p.status, credits: p.credits, message: p.result_desc ?? "" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Bounded backoff. Polling clients and a sweep can both land here; neither
  // should be able to turn one stuck payment into a Daraja flood.
  const backoffMs = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** (p.reconcile_attempts ?? 0));
  const sinceLast = p.last_reconcile_at ? Date.now() - new Date(p.last_reconcile_at).getTime() : Infinity;
  if (sinceLast < backoffMs) {
    return json({ ok: true, status: p.status, message: "waiting" });
  }

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
    q = await stkQuery(token, checkout_request_id);
  } catch (e) {
    console.error("stk query failed", e);
    // Daraja unreachable is not evidence of anything. Never settle on it.
    return json(await inconclusive(admin, p, windowClosed, "Status unavailable"));
  }

  // ── Confirmed failure ─────────────────────────────────────────────────────
  if (q.state === "failed") {
    const { data } = await admin.rpc("complete_payment", {
      p_checkout_request_id: checkout_request_id,
      p_success: false,
      p_receipt: null,
      p_reported_amount_kes: null,
      p_result_desc: q.desc,
    });
    const r = data as { ok?: boolean; reason?: string } | null;
    if (r?.ok) return json({ ok: true, status: "failed", message: q.desc });
    // The callback said paid and the query says failed. Do not guess.
    if (r?.reason === "contradicts_callback") {
      await flag(admin, p, "Callback and M-Pesa status disagree — under review.");
      return json({ ok: true, status: "manual_review", message: "Under review." });
    }
    return json({ ok: true, status: p.status, message: q.desc });
  }

  // ── Confirmed success ─────────────────────────────────────────────────────
  if (q.state === "success") {
    const { data } = await admin.rpc("complete_payment", {
      p_checkout_request_id: checkout_request_id,
      p_success: true,
      p_receipt: p.mpesa_receipt,
      p_reported_amount_kes: p.reported_amount_kes,
      p_result_desc: q.desc,
    });
    const r = data as { ok?: boolean; reason?: string; credits?: number } | null;
    if (r?.ok) return json({ ok: true, status: "paid", credits: r.credits ?? p.credits });

    // Query says paid but the row cannot satisfy the settlement invariant.
    if (r?.reason === "no_callback_facts") {
      // The callback carrying the receipt and amount has not arrived. It may
      // still. Keep waiting until the window closes, then hand it to a human —
      // this is a real payment we are declining to credit automatically.
      if (!windowClosed) return json({ ok: true, status: p.status, message: "Confirming…" });
      await flag(admin, p, "Paid at M-Pesa but no callback received — under review.");
      return json({ ok: true, status: "manual_review", message: "Under review." });
    }
    // Amount mismatch, receipt reuse, receipt missing: never auto-credit.
    await flag(admin, p, `Settlement check failed (${r?.reason ?? "unknown"}) — under review.`);
    return json({ ok: true, status: "manual_review", message: "Under review." });
  }

  // ── Inconclusive ──────────────────────────────────────────────────────────
  return json(await inconclusive(admin, p, windowClosed, q.desc));
});

// Daraja gave no usable answer. Retry until the window closes, then escalate.
// Never treat an inconclusive response as paid, and never as failed either —
// the customer's money may have moved.
async function inconclusive(
  admin: SupabaseClient,
  p: Payment,
  windowClosed: boolean,
  desc: string,
): Promise<Record<string, unknown>> {
  if (!windowClosed) return { ok: true, status: p.status, message: desc };
  await flag(admin, p, "M-Pesa could not confirm this payment — under review.");
  return { ok: true, status: "manual_review", message: "Under review." };
}

// Guarded so a concurrent settle always wins over an escalation.
async function flag(admin: SupabaseClient, p: Payment, desc: string): Promise<void> {
  await admin
    .from("payments")
    .update({ status: "manual_review", result_desc: desc })
    .eq("id", p.id)
    .in("status", ["pending", "reconciling"]);
}
