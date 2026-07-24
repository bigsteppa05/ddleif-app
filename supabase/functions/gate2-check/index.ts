import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────────────────────
// Gate 2 pre-flight. Reports whether each required function secret is present
// AND actually works, without ever returning a secret value.
//
// Presence alone is not enough: DARAJA_* is read through requireEnv() at call
// time, so a typo'd credential deploys clean and only fails when a reviewer
// taps Top Up. This exercises each credential against its real endpoint.
//
// Authorization is enforced in the body (admin JWT or service-role key), so
// verify_jwt is off to allow the service-role bearer path.
// Delete this function once the app has shipped — it is a launch tool, not
// part of the product.
// ─────────────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const has = (n: string) => !!Deno.env.get(n)?.trim();

/** Proves the .p8 parses and signs, then that Apple accepts the client secret. */
async function checkApple(): Promise<Record<string, unknown>> {
  const names = ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_CLIENT_ID", "APPLE_PRIVATE_KEY"];
  const present = Object.fromEntries(names.map((n) => [n, has(n)]));
  if (!names.every((n) => has(n))) {
    return { ...present, status: "missing_secrets", verified: false };
  }

  let clientSecret: string;
  try {
    const pem = Deno.env.get("APPLE_PRIVATE_KEY")!.replace(/\\n/g, "\n");
    const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey(
      "pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
    );
    const b64url = (b: Uint8Array) => {
      let s = ""; for (const x of b) s += String.fromCharCode(x);
      return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    };
    const now = Math.floor(Date.now() / 1000);
    const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
    const input = `${enc({ alg: "ES256", kid: Deno.env.get("APPLE_KEY_ID") })}.${
      enc({
        iss: Deno.env.get("APPLE_TEAM_ID"), iat: now, exp: now + 300,
        aud: "https://appleid.apple.com", sub: Deno.env.get("APPLE_CLIENT_ID"),
      })
    }`;
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input),
    );
    clientSecret = `${input}.${b64url(new Uint8Array(sig))}`;
  } catch (e) {
    return { ...present, status: "private_key_unusable", verified: false, detail: String(e) };
  }

  // Revoke a deliberately bogus token. Apple rejects the TOKEN (invalid_grant)
  // when the client secret is good, and rejects the CLIENT (invalid_client)
  // when the key/team/bundle triple is wrong — which is exactly the signal we
  // want, with no side effect on any real account.
  try {
    const res = await fetch("https://appleid.apple.com/auth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("APPLE_CLIENT_ID")!,
        client_secret: clientSecret,
        token: "gate2-check-not-a-real-token",
        token_type_hint: "refresh_token",
      }),
    });
    const data = await res.json().catch(() => ({}));
    const err = (data as { error?: string }).error;
    if (res.ok || err === "invalid_grant" || err === "invalid_request") {
      return { ...present, status: "credentials_accepted_by_apple", verified: true };
    }
    if (err === "invalid_client") {
      return {
        ...present, verified: false, status: "rejected_by_apple",
        hint: "team id, key id, bundle id, or .p8 do not match. Confirm APPLE_CLIENT_ID is the bundle id com.fitxball.app and the .p8 belongs to that key id.",
      };
    }
    return { ...present, verified: false, status: `unexpected: ${err ?? res.status}` };
  } catch (e) {
    return { ...present, verified: false, status: "network_error", detail: String(e) };
  }
}

/** Proves the Daraja consumer key/secret mint an access token on the given host. */
async function checkDaraja(): Promise<Record<string, unknown>> {
  const names = [
    "DARAJA_BASE_URL", "DARAJA_CONSUMER_KEY", "DARAJA_CONSUMER_SECRET",
    "DARAJA_SHORTCODE", "DARAJA_PASSKEY",
  ];
  const present = Object.fromEntries(names.map((n) => [n, has(n)]));
  const base = Deno.env.get("DARAJA_BASE_URL")?.trim() ?? "";
  // The host is not a secret, and sandbox-vs-production is the whole question.
  const env = base.includes("sandbox")
    ? "SANDBOX"
    : base.includes("api.safaricom.co.ke")
    ? "PRODUCTION"
    : "unrecognised";

  if (!names.every((n) => has(n))) {
    return { ...present, environment: env, status: "missing_secrets", verified: false };
  }
  try {
    const auth = btoa(
      `${Deno.env.get("DARAJA_CONSUMER_KEY")}:${Deno.env.get("DARAJA_CONSUMER_SECRET")}`,
    );
    const res = await fetch(
      `${base}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    const data = await res.json().catch(() => ({}));
    const ok = res.ok && !!(data as { access_token?: string }).access_token;
    return {
      ...present,
      environment: env,
      verified: ok,
      status: ok ? "access_token_minted" : `rejected (HTTP ${res.status})`,
      ...(ok ? {} : { hint: "consumer key/secret do not match this host, or the app is not live on the production portal" }),
    };
  } catch (e) {
    return { ...present, environment: env, verified: false, status: "network_error", detail: String(e) };
  }
}

/** Proves the personal API key can reach the project (needed to delete persons). */
async function checkPostHog(): Promise<Record<string, unknown>> {
  const names = ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID", "POSTHOG_API_HOST"];
  const present = Object.fromEntries(names.map((n) => [n, has(n)]));
  const host = Deno.env.get("POSTHOG_API_HOST")?.trim().replace(/\/$/, "") ?? "";
  const project = Deno.env.get("POSTHOG_PROJECT_ID")?.trim() ?? "";
  if (!names.every((n) => has(n))) {
    return { ...present, host, project_id: project, status: "missing_secrets", verified: false };
  }
  try {
    const res = await fetch(`${host}/api/projects/${project}/`, {
      headers: { Authorization: `Bearer ${Deno.env.get("POSTHOG_PERSONAL_API_KEY")}` },
    });
    if (res.ok) {
      return { ...present, host, project_id: project, verified: true, status: "project_reachable" };
    }
    return {
      ...present, host, project_id: project, verified: false,
      status: `rejected (HTTP ${res.status})`,
      hint: res.status === 401
        ? "personal API key invalid or lacks person:write scope"
        : "project id or region host is wrong (EU keys do not work on us.posthog.com)",
    };
  } catch (e) {
    return { ...present, host, project_id: project, verified: false, status: "network_error", detail: String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  let authorized = bearer.length > 0 && bearer === serviceKey;
  if (!authorized) {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: profile } = await admin
        .from("profiles").select("is_admin").eq("id", user.id).single();
      authorized = !!profile?.is_admin;
    }
  }
  if (!authorized) return json({ ok: false, message: "admin or service role required" }, 401);

  const [apple, daraja, posthog] = await Promise.all([
    checkApple(), checkDaraja(), checkPostHog(),
  ]);

  const platform = {
    SUPABASE_URL: has("SUPABASE_URL"),
    SUPABASE_ANON_KEY: has("SUPABASE_ANON_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: has("SUPABASE_SERVICE_ROLE_KEY"),
  };

  const gate2_ready = !!apple.verified && !!daraja.verified && !!posthog.verified &&
    daraja.environment === "PRODUCTION";

  return json({
    gate2_ready,
    checked_at: new Date().toISOString(),
    apple,
    daraja,
    posthog,
    platform,
    note: "Booleans only — no secret value is ever returned. Daraja must read PRODUCTION before the build.",
  });
});
