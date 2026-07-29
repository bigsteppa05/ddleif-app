import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// Public webhook: Safaricom calls this with no Supabase credential (verify_jwt
// is false for this function in supabase/config.toml).
//
// This endpoint RECORDS, it does not pay. A CheckoutRequestID is an identifier,
// not a signature or a shared secret, so possession of a valid pending one is
// not evidence that the callback is authentic. All this handler does is store
// what Safaricom reported and move the row pending → reconciling. Credits are
// created only by mpesa-stk-query, after an independent Daraja status query,
// through complete_payment.
//
// Idempotency lives in record_payment_callback: the compare-and-set on
// status='pending' means Daraja's aggressive retries match zero rows the second
// time. A receipt that already backs another payment is refused by a unique
// index rather than absorbed.
//
// Always responds 200 — Daraja retries any non-200 response.
// ─────────────────────────────────────────────────────────────────────────────

type Item = { Name: string; Value?: unknown };

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return accepted();

  let payload: { Body?: { stkCallback?: Record<string, unknown> } };
  try {
    payload = await req.json();
  } catch {
    return accepted();
  }

  const cb = payload?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return accepted();

  const success = Number(cb.ResultCode) === 0;
  const items: Item[] = (cb.CallbackMetadata as { Item?: Item[] })?.Item ?? [];
  const pick = (name: string) => items.find((i) => i.Name === name)?.Value;

  const receipt = pick("MpesaReceiptNumber")?.toString().trim() || null;
  // Compare money with money: this is what Safaricom says was actually paid,
  // checked against expected_amount_kes before any credit is granted.
  const rawAmount = pick("Amount");
  const reportedAmount = rawAmount === undefined || rawAmount === null
    ? null
    : Number(rawAmount);
  const amount = reportedAmount !== null && Number.isFinite(reportedAmount) && reportedAmount > 0
    ? reportedAmount
    : null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin.rpc("record_payment_callback", {
    p_checkout_request_id: cb.CheckoutRequestID,
    p_success: success,
    p_receipt: receipt,
    p_reported_amount_kes: amount,
    p_merchant_request_id: (cb.MerchantRequestID as string) ?? null,
    p_result_desc: (cb.ResultDesc as string) ?? null,
    p_payload: cb,
  });

  if (error) console.error("record_payment_callback failed", error);
  else console.log("callback recorded", JSON.stringify(data));

  return accepted();
});

function accepted(): Response {
  return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
