import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getAccessToken, normalizePhone, stkPush, stkQuery } from "./daraja.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Start an M-Pesa STK push top-up.
//
// Robustness contract (see README of this flow):
//  • Pricing is server-authoritative — amount = credits × kes_per_credit, with a
//    minimum, both read from app_config. The client's amount is ignored, so a
//    tampered client can't buy credits cheaply.
//  • Double-charge guard — the pending payment row is inserted BEFORE Daraja is
//    called, protected by a partial unique index (one pending per user). A second
//    concurrent/retried request loses that insert and RESUMES the live prompt
//    instead of firing a second charge.
//  • Self-healing — a stale pending is reconciled via an STK status query before
//    a new push is allowed, so a missed callback never blocks the user forever
//    and a still-processing prompt is never double-charged.
//
// Responses are always HTTP 200 with a discriminated body unless the server
// itself faults, so the client can rely on the body for user-facing messaging:
//   { ok:true, checkout_request_id }                 → poll this id
//   { ok:true, resumed:true, checkout_request_id }   → an existing prompt is live
//   { ok:true, settled:"success", credits }          → a previous top-up completed
//   { ok:false, code, message }                      → show message, don't poll
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

// A pending that never received a CheckoutRequestID (Daraja never accepted it) is
// safe to expire after this, since no charge was placed.
const STALE_NO_ID_MS = 120_000;

type Payment = {
  id: string;
  status: "pending" | "success" | "failed";
  checkout_request_id: string | null;
  credits: number;
  created_at: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, message: "method_not_allowed" }, 405);

  // 1. Authenticate the caller.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ ok: false, message: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 2. Server-authoritative pricing + limits from app_config.
  const { data: cfg } = await admin
    .from("app_config")
    .select("kes_per_credit, min_credits, payments_live")
    .eq("id", 1)
    .maybeSingle();
  if (!cfg?.payments_live) {
    return json({ ok: false, code: "payments_disabled", message: "Top-ups are currently unavailable." });
  }
  const kesPerCredit = Number(cfg.kes_per_credit) || 10;
  const minCredits = Number(cfg.min_credits) || 25;

  const { credits, phone } = await req.json().catch(() => ({}));
  const creditsInt = Math.round(Number(credits));
  if (!Number.isFinite(creditsInt) || creditsInt < minCredits) {
    return json({ ok: false, code: "invalid_amount", message: `Minimum top-up is ${minCredits} credits.` });
  }
  const amountInt = creditsInt * kesPerCredit;

  const msisdn = normalizePhone(String(phone ?? ""));
  if (!msisdn) {
    return json({ ok: false, code: "invalid_phone", message: "Enter a valid M-Pesa number, e.g. 0712345678." });
  }

  // 3. Attempt to create the pending row and charge. Loop at most twice so a
  //    reconciled/expired prior pending can be cleared and this payment retried.
  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await getPendingForUser(admin, user.id);
    if (existing) {
      const resolved = await resolveExisting(admin, existing);
      if (resolved.kind === "resume") {
        return json({ ok: true, resumed: true, checkout_request_id: resolved.checkoutRequestId });
      }
      if (resolved.kind === "already_paid") {
        return json({ ok: true, settled: "success", credits: resolved.credits });
      }
      if (resolved.kind === "busy") {
        return json({ ok: false, code: "in_progress", message: "A payment is already being started. Please wait a moment." });
      }
      // resolved.kind === "cleared" → the old pending is now failed/expired; fall
      // through to create a fresh one.
    }

    // Insert the pending row FIRST. The partial unique index (user_id where
    // status='pending') means a racing request fails here and loops to resume.
    const { data: row, error: insErr } = await admin
      .from("payments")
      .insert({ user_id: user.id, phone: msisdn, amount_kes: amountInt, credits: creditsInt, status: "pending" })
      .select("id, status, checkout_request_id, credits, created_at")
      .single();
    if (insErr) {
      if ((insErr as { code?: string }).code === "23505") continue; // concurrent pending → retry/resume
      console.error("payments insert failed", insErr);
      return json({ ok: false, message: "Something went wrong. Please try again." }, 500);
    }

    // Now charge. Any failure marks this row failed so it never blocks the user.
    try {
      const token = await getAccessToken();
      const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mpesa-callback`;
      const push = await stkPush({ token, amount: amountInt, credits: creditsInt, msisdn, callbackUrl });
      if (!push.ok) {
        await failPayment(admin, row.id, push.message);
        return json({ ok: false, code: "stk_rejected", message: push.message });
      }
      const { error: updErr } = await admin
        .from("payments")
        .update({ checkout_request_id: push.checkoutRequestId, merchant_request_id: push.merchantRequestId })
        .eq("id", row.id);
      if (updErr) console.error("checkout id update failed", updErr);
      return json({ ok: true, checkout_request_id: push.checkoutRequestId });
    } catch (e) {
      console.error("stk push error", e);
      await failPayment(admin, row.id, "Could not reach M-Pesa. Please try again.");
      return json({ ok: false, code: "daraja_error", message: "Could not reach M-Pesa. Please try again." });
    }
  }

  return json({ ok: false, code: "in_progress", message: "A payment is already in progress. Please wait a moment." });
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function getPendingForUser(admin: SupabaseClient, userId: string): Promise<Payment | null> {
  const { data } = await admin
    .from("payments")
    .select("id, status, checkout_request_id, credits, created_at")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Payment) ?? null;
}

type Resolution =
  | { kind: "resume"; checkoutRequestId: string }
  | { kind: "already_paid"; credits: number }
  | { kind: "busy" }
  | { kind: "cleared" };

// Decide what to do about a pre-existing pending payment before charging again.
// The guiding rule: NEVER expire a payment that M-Pesa might still complete.
async function resolveExisting(admin: SupabaseClient, p: Payment): Promise<Resolution> {
  const ageMs = Date.now() - new Date(p.created_at).getTime();

  if (p.checkout_request_id) {
    // Ask Daraja for the truth and settle if it's final.
    let current = p;
    try {
      const token = await getAccessToken();
      const q = await stkQuery(token, p.checkout_request_id);
      if (q.state !== "pending") {
        await admin.rpc("complete_payment", {
          p_checkout_request_id: p.checkout_request_id,
          p_success: q.state === "success",
          p_receipt: null,
          p_result_desc: q.desc,
        });
        const { data } = await admin
          .from("payments")
          .select("id, status, checkout_request_id, credits, created_at")
          .eq("id", p.id)
          .single();
        if (data) current = data as Payment;
      }
    } catch (e) {
      console.error("reconcile query failed", e);
    }

    if (current.status === "success") return { kind: "already_paid", credits: current.credits };
    if (current.status === "failed") return { kind: "cleared" };
    // Still pending: a live or still-processing prompt. Keep waiting on it —
    // starting a new push here is what causes double charges.
    return { kind: "resume", checkoutRequestId: current.checkout_request_id! };
  }

  // No CheckoutRequestID: Daraja never accepted a charge for this row.
  if (ageMs < STALE_NO_ID_MS) {
    // Another request is probably mid-flight right now (inserted, not yet charged).
    return { kind: "busy" };
  }
  // Old and never charged → safe to expire and let the caller retry.
  await failPayment(admin, p.id, "Expired — no response from M-Pesa.");
  return { kind: "cleared" };
}

async function failPayment(admin: SupabaseClient, id: string, desc: string): Promise<void> {
  await admin
    .from("payments")
    .update({ status: "failed", result_desc: desc, completed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending");
}
