import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { exchangeAppleCode } from "./apple.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Called right after a native Sign in with Apple. Exchanges the short-lived
// authorization code for a long-lived refresh token and stores it server-side,
// so account deletion can later revoke the app's Apple access (Guideline
// 5.1.1(v)). The .p8 key never touches the client.
//
// No-ops gracefully when Apple secrets aren't configured yet, so sign-in is never
// blocked by this.
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
  if (req.method !== "POST") return json({ ok: false }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ ok: false, message: "unauthorized" }, 401);

  const { authorization_code } = await req.json().catch(() => ({}));
  if (!authorization_code || typeof authorization_code !== "string") {
    return json({ ok: false, message: "missing authorization_code" }, 400);
  }

  const refreshToken = await exchangeAppleCode(authorization_code);
  // Not configured / exchange failed → nothing to store; sign-in already succeeded.
  if (!refreshToken) return json({ ok: true, stored: false });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await admin
    .from("apple_auth_tokens")
    .upsert({ user_id: user.id, refresh_token: refreshToken, updated_at: new Date().toISOString() });
  if (error) {
    console.error("store apple token failed", error);
    return json({ ok: false }, 500);
  }
  return json({ ok: true, stored: true });
});
