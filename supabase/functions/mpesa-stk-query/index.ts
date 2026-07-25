import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { PAYMENT_COLS, type Payment, reconcilePayment } from "./reconcile.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Client-driven reconciliation: settle the payment a user is waiting on.
//
// mpesa-callback records what Safaricom reported and parks the row in
// 'reconciling'. Nothing is credited on that callback alone — a
// CheckoutRequestID is an identifier, not a signature. reconcilePayment() asks
// Daraja directly, server-to-server with our own credentials, and settles only
// when the independent answer agrees with the callback's facts.
//
// The same logic runs unattended in mpesa-sweep, for payments whose owner
// closed the app. See docs/PAYMENTS.md for the state machine.
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
    .select(PAYMENT_COLS)
    .eq("checkout_request_id", checkout_request_id)
    .maybeSingle();
  if (!payment) return json({ ok: false, message: "not_found" }, 404);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const outcome = await reconcilePayment(admin, payment as Payment);
  return json({ ok: true, ...outcome });
});
