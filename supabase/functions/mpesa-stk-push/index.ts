import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Daraja config — all values come from function secrets ────────────────────
// Set via: supabase secrets set --project-ref <ref> DARAJA_CONSUMER_KEY=… etc.
// Production cutover: point DARAJA_BASE_URL at https://api.safaricom.co.ke and
// swap in the real shortcode/passkey.
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing required secret: ${name}`);
  return value;
}

const BASE_URL = requireEnv("DARAJA_BASE_URL");
const CONSUMER_KEY = requireEnv("DARAJA_CONSUMER_KEY");
const CONSUMER_SECRET = requireEnv("DARAJA_CONSUMER_SECRET");
const SHORTCODE = requireEnv("DARAJA_SHORTCODE");
const PASSKEY = requireEnv("DARAJA_PASSKEY");

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

// 07XXXXXXXX / +2547XXXXXXXX / 2547XXXXXXXX → 2547XXXXXXXX
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (/^254(7|1)\d{8}$/.test(digits)) return digits;
  if (/^0(7|1)\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Identify the calling user from their JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "unauthorized" }, 401);

  const { amount, credits, phone } = await req.json().catch(() => ({}));
  const amountInt = Math.round(Number(amount));
  const creditsInt = Math.round(Number(credits));
  if (!amountInt || amountInt < 1 || !creditsInt || creditsInt < 1) {
    return json({ error: "invalid_amount" }, 400);
  }
  const msisdn = normalizePhone(String(phone ?? ""));
  if (!msisdn) return json({ error: "invalid_phone", message: "Use format 07XXXXXXXX or 2547XXXXXXXX" }, 400);

  // 1. OAuth token
  const tokenRes = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`)}` },
  });
  if (!tokenRes.ok) {
    console.error("daraja oauth failed", tokenRes.status, await tokenRes.text());
    return json({ error: "daraja_auth_failed" }, 502);
  }
  const { access_token } = await tokenRes.json();

  // 2. STK push
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14); // yyyyMMddHHmmss
  const password = btoa(`${SHORTCODE}${PASSKEY}${ts}`);
  const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mpesa-callback`;

  const stkRes = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: amountInt,
      PartyA: msisdn,
      PartyB: SHORTCODE,
      PhoneNumber: msisdn,
      CallBackURL: callbackUrl,
      AccountReference: "fitXball",
      TransactionDesc: `${creditsInt} credits top-up`,
    }),
  });
  const stk = await stkRes.json().catch(() => ({}));
  if (!stkRes.ok || stk.ResponseCode !== "0") {
    console.error("stk push failed", stkRes.status, JSON.stringify(stk));
    return json({ error: "stk_push_failed", message: stk.errorMessage ?? stk.ResponseDescription ?? "M-Pesa rejected the request" }, 502);
  }

  // 3. Record the pending payment (service role bypasses RLS)
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error: insertErr } = await admin.from("payments").insert({
    user_id: user.id,
    phone: msisdn,
    amount_kes: amountInt,
    credits: creditsInt,
    checkout_request_id: stk.CheckoutRequestID,
    merchant_request_id: stk.MerchantRequestID,
    status: "pending",
  });
  if (insertErr) {
    console.error("payments insert failed", insertErr);
    return json({ error: "db_error" }, 500);
  }

  return json({ ok: true, checkout_request_id: stk.CheckoutRequestID });
});
