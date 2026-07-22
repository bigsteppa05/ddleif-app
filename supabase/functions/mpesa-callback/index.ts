import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Public webhook: Safaricom calls this with no JWT (verify_jwt is disabled for
// this function). Authentication is implicit — settlement only succeeds for a
// CheckoutRequestID we created that is still pending, and the credit is applied
// inside the SECURITY DEFINER `complete_payment` function, which is idempotent:
// it transitions pending→success/failed with a status guard, so Daraja's
// aggressive callback retries can never double-credit.
//
// Always responds 200 — Daraja retries any non-200 response.

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  let payload: { Body?: { stkCallback?: Record<string, unknown> } };
  try {
    payload = await req.json();
  } catch {
    return accepted();
  }

  const cb = payload?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return accepted();

  const success = Number(cb.ResultCode) === 0;
  const items: Array<{ Name: string; Value?: unknown }> =
    (cb.CallbackMetadata as { Item?: Array<{ Name: string; Value?: unknown }> })?.Item ?? [];
  const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value?.toString() ?? null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data, error } = await admin.rpc("complete_payment", {
    p_checkout_request_id: cb.CheckoutRequestID,
    p_success: success,
    p_receipt: receipt,
    p_result_desc: (cb.ResultDesc as string) ?? null,
  });
  if (error) console.error("complete_payment failed", error);
  else console.log("payment settled", JSON.stringify(data));

  return accepted();
});

function accepted(): Response {
  return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
