import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getAccessToken, stkQuery } from "./daraja.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Reconcile a pending top-up by asking Daraja for its final state.
//
// This is the fallback for a missed/late M-Pesa callback: the client calls it
// while a payment stays pending, and it settles the row (idempotently, via
// complete_payment) so credits land even if the webhook never arrived. It never
// double-credits — complete_payment only acts on a row still in 'pending'.
//
// Ownership is enforced two ways: the row is looked up through the caller's RLS
// (payments_select_own), so a user can only reconcile their own payment.
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

  // RLS ensures this only resolves a payment owned by the caller.
  const { data: payment } = await userClient
    .from("payments")
    .select("status, credits, checkout_request_id")
    .eq("checkout_request_id", checkout_request_id)
    .maybeSingle();
  if (!payment) return json({ ok: false, message: "not_found" }, 404);

  // Already settled — return as-is (idempotent, no Daraja call needed).
  if (payment.status !== "pending") {
    return json({ ok: true, status: payment.status, credits: payment.credits });
  }

  // Still pending → ask Daraja and settle if final.
  let status = payment.status;
  let desc = "";
  try {
    const token = await getAccessToken();
    const q = await stkQuery(token, checkout_request_id);
    desc = q.desc;
    if (q.state !== "pending") {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await admin.rpc("complete_payment", {
        p_checkout_request_id: checkout_request_id,
        p_success: q.state === "success",
        p_receipt: null,
        p_result_desc: q.desc,
      });
      status = q.state;
    }
  } catch (e) {
    console.error("stk query failed", e);
    // Leave it pending; the client keeps polling / the callback may still land.
    return json({ ok: true, status: "pending" });
  }

  return json({ ok: true, status, message: desc });
});
