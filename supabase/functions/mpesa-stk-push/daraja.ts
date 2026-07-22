// Shared Safaricom Daraja (M-Pesa) helpers for the STK push + query functions.
// All credentials come from function secrets. To go live, point DARAJA_BASE_URL
// at https://api.safaricom.co.ke and swap in the production shortcode/passkey.
//
// NOTE: this file is duplicated into each function folder at deploy time (Supabase
// bundles a function together with its own co-located files). Keep the copies in
// sync — mpesa-stk-push/daraja.ts and mpesa-stk-query/daraja.ts.

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing required secret: ${name}`);
  return v;
}

const DARAJA = {
  baseUrl: () => requireEnv("DARAJA_BASE_URL"),
  consumerKey: () => requireEnv("DARAJA_CONSUMER_KEY"),
  consumerSecret: () => requireEnv("DARAJA_CONSUMER_SECRET"),
  shortcode: () => requireEnv("DARAJA_SHORTCODE"),
  passkey: () => requireEnv("DARAJA_PASSKEY"),
};

// 07XXXXXXXX / +2547XXXXXXXX / 2547XXXXXXXX (and 01… / 011…) → 2547XXXXXXXX
export function normalizePhone(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (/^254(7|1)\d{8}$/.test(digits)) return digits;
  if (/^0(7|1)\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  return null;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14); // yyyyMMddHHmmss
}

function password(ts: string): string {
  return btoa(`${DARAJA.shortcode()}${DARAJA.passkey()}${ts}`);
}

export async function getAccessToken(): Promise<string> {
  const res = await fetch(
    `${DARAJA.baseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${btoa(`${DARAJA.consumerKey()}:${DARAJA.consumerSecret()}`)}` } },
  );
  if (!res.ok) {
    console.error("daraja oauth failed", res.status, await res.text().catch(() => ""));
    throw new Error("daraja_auth_failed");
  }
  const { access_token } = await res.json();
  if (!access_token) throw new Error("daraja_auth_no_token");
  return access_token;
}

export type StkPushResult =
  | { ok: true; checkoutRequestId: string; merchantRequestId: string }
  | { ok: false; message: string };

export async function stkPush(opts: {
  token: string;
  amount: number;
  credits: number;
  msisdn: string;
  callbackUrl: string;
}): Promise<StkPushResult> {
  const ts = timestamp();
  const res = await fetch(`${DARAJA.baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: DARAJA.shortcode(),
      Password: password(ts),
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: opts.amount,
      PartyA: opts.msisdn,
      PartyB: DARAJA.shortcode(),
      PhoneNumber: opts.msisdn,
      CallBackURL: opts.callbackUrl,
      AccountReference: "fitXball",
      TransactionDesc: `${opts.credits} credits top-up`,
    }),
  });
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || body.ResponseCode !== "0" || !body.CheckoutRequestID) {
    console.error("stk push rejected", res.status, JSON.stringify(body));
    return {
      ok: false,
      message: (body.errorMessage as string) ?? (body.ResponseDescription as string) ??
        "M-Pesa rejected the request. Please try again.",
    };
  }
  return {
    ok: true,
    checkoutRequestId: body.CheckoutRequestID as string,
    merchantRequestId: body.MerchantRequestID as string,
  };
}

export type StkStatus = { state: "success" | "failed" | "pending"; desc: string };

// Ask Daraja for the final state of a prompt. Result codes:
//   0    → paid
//   1032 → cancelled by the user
//   1037 → timed out / phone unreachable
//   2001 → wrong M-Pesa PIN
//   1    → insufficient funds
//   errorCode 500.001.1001 → "request is being processed" (still pending)
export async function stkQuery(token: string, checkoutRequestId: string): Promise<StkStatus> {
  const ts = timestamp();
  const res = await fetch(`${DARAJA.baseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: DARAJA.shortcode(),
      Password: password(ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  const body = await res.json().catch(() => ({} as Record<string, unknown>));

  // Still being processed — do NOT settle; the caller keeps waiting.
  if (body?.errorCode === "500.001.1001") return { state: "pending", desc: "Still processing" };

  const code = body?.ResultCode;
  if (code === undefined || code === null) {
    // The query itself failed (throttled, auth, etc.). Treat as pending so we
    // never settle a payment on incomplete information.
    return { state: "pending", desc: (body?.errorMessage as string) ?? "Status unavailable" };
  }
  if (Number(code) === 0) return { state: "success", desc: (body.ResultDesc as string) ?? "Success" };
  return { state: "failed", desc: friendlyResult(Number(code), body.ResultDesc as string | undefined) };
}

export function friendlyResult(code: number, fallback?: string): string {
  switch (code) {
    case 1032: return "You cancelled the M-Pesa prompt.";
    case 1037: return "The M-Pesa prompt timed out. Please try again.";
    case 2001: return "Wrong M-Pesa PIN. Please try again.";
    case 1: return "Insufficient M-Pesa balance.";
    default: return fallback ?? "Payment was not completed.";
  }
}
