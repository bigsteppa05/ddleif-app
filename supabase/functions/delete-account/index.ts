import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { revokeAppleToken } from "./apple.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Permanently delete the calling user's account and personal data (App Store
// Guideline 5.1.1(v) — in-app deletion, not deactivation).
//
// The caller is identified from their JWT and can only delete themselves. Order:
//   1. Revoke the user's Sign in with Apple token (if one was stored).
//   2. Remove personal data: avatar files, then null the PII on financial records
//      (payments are anonymized, not deleted — kept for legal/financial record,
//      no longer identifying the person).
//   3. Delete the auth user → cascades profiles + bookings + apple_auth_tokens.
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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Revoke Sign in with Apple, if we stored a refresh token for this user.
  try {
    const { data: appleRow } = await admin
      .from("apple_auth_tokens")
      .select("refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();
    if (appleRow?.refresh_token) await revokeAppleToken(appleRow.refresh_token);
  } catch (e) {
    // Never block deletion on a revoke failure — the account still gets removed.
    console.error("apple revoke step failed", e);
  }

  // 2a. Remove avatar files from the 'avatars' bucket ({userId}/…).
  try {
    const { data: files } = await admin.storage.from("avatars").list(user.id);
    const paths = (files ?? []).map((f) => `${user.id}/${f.name}`);
    if (paths.length) await admin.storage.from("avatars").remove(paths);
  } catch (e) {
    console.error("avatar cleanup failed", e);
  }

  // 2b. Anonymize financial records (kept for legal/financial record, PII stripped).
  const { error: payErr } = await admin
    .from("payments")
    .update({ user_id: null, phone: "redacted" })
    .eq("user_id", user.id);
  if (payErr) {
    console.error("payments anonymize failed", payErr);
    return json({ ok: false, message: "Could not delete your account data. Please try again." }, 500);
  }

  // 3. Delete the auth user → cascades profiles + bookings + apple_auth_tokens.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error("deleteUser failed", delErr);
    return json({ ok: false, message: "Could not delete your account. Please try again." }, 500);
  }

  return json({ ok: true });
});
