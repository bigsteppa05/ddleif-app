import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// Permanently delete the calling user's account and personal data (App Store
// Guideline 5.1.1(v) — in-app account deletion, not deactivation).
//
// The caller is identified from their JWT and can only delete themselves. The
// actual deletion runs with the service role:
//   • payments.user_id is ON DELETE NO ACTION, so those rows are removed first;
//   • deleting the auth user then cascades profiles + bookings.
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

  // payments.user_id is NO ACTION and would block the user delete — remove first.
  const { error: payErr } = await admin.from("payments").delete().eq("user_id", user.id);
  if (payErr) {
    console.error("payments delete failed", payErr);
    return json({ ok: false, message: "Could not delete your account data. Please try again." }, 500);
  }

  // Deleting the auth user cascades profiles + bookings.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error("deleteUser failed", delErr);
    return json({ ok: false, message: "Could not delete your account. Please try again." }, 500);
  }

  return json({ ok: true });
});
