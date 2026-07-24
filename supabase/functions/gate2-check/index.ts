import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server";

// ─────────────────────────────────────────────────────────────────────────────
// Gate 2 pre-flight. Reports whether each required function secret is present
// AND actually works, without ever returning a secret value.
//
// Presence alone is not enough: DARAJA_* is read through requireEnv() at call
// time, so a typo'd credential deploys clean and only fails when a reviewer
// taps Top Up. This exercises each credential against its real endpoint.
//
// Authorization: a dedicated secret key named "gate2-check" (Dashboard →
// Settings → API keys), sent on the `apikey` header. Deliberately NOT the
// project-wide service_role key — this endpoint reaches three external
// providers, so it gets its own independently revocable credential.
// Deploy with --no-verify-jwt: the platform JWT check runs before the handler
// and a secret key is not a JWT.
//
// Output discipline: booleans, a fixed status vocabulary, and static hints
// only. Never an upstream response body, a generated client secret, a token
// fragment, a project identifier, or an exception object. Nothing is logged —
// no request headers, no provider responses.
//
// Delete this function (and the gate2-check key) once Gate 2 is signed off —
// it is a launch tool, not part of the product.
// ─────────────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const has = (n: string) => !!Deno.env.get(n)?.trim();

/**
 * Pre-flight only. Proves the .p8 parses and signs, and that Apple accepts the
 * resulting client secret far enough to inspect the grant. It does NOT prove
 * the user-specific revocation flow works — Apple needs a real access or
 * refresh token for that, which only a TestFlight sign-in can produce.
 */
async function checkApple(): Promise<Record<string, unknown>> {
  const names = ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_CLIENT_ID", "APPLE_PRIVATE_KEY"];
  const present = Object.fromEntries(names.map((n) => [n, has(n)]));
  if (!names.every((n) => has(n))) {
    return { ...present, status: "missing_secrets", preflight: false };
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
  } catch {
    // The exception text can quote key material. Report the class, not the cause.
    return {
      ...present, preflight: false, status: "private_key_unusable",
      hint: "APPLE_PRIVATE_KEY is not a readable PKCS#8 ES256 .p8. Paste the whole file including the BEGIN/END lines.",
    };
  }

  // Revoke a deliberately bogus token. Apple rejects the TOKEN (invalid_grant)
  // when the client secret is good, and rejects the CLIENT (invalid_client)
  // when the key/team/bundle triple is wrong. No side effect on any real
  // account. invalid_grant can also mean a bad client id, so this is a
  // pre-flight signal, not proof.
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
      return { ...present, preflight: true, status: "client_secret_accepted" };
    }
    if (err === "invalid_client") {
      return {
        ...present, preflight: false, status: "rejected_by_apple",
        hint: "team id, key id, bundle id, or .p8 do not match. Confirm APPLE_CLIENT_ID is the bundle id com.fitxball.app and the .p8 belongs to that key id.",
      };
    }
    return { ...present, preflight: false, status: "unexpected_response" };
  } catch {
    return { ...present, preflight: false, status: "network_error" };
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
  // A classification, not a value: sandbox-vs-production is the whole question.
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
  } catch {
    return { ...present, environment: env, verified: false, status: "network_error" };
  }
}

/**
 * Proves the personal API key can reach the project (needed to delete persons).
 * The key should be scoped to project read + person write only — PostHog
 * personal keys can otherwise carry account-wide access.
 */
async function checkPostHog(): Promise<Record<string, unknown>> {
  const names = ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID", "POSTHOG_API_HOST"];
  const present = Object.fromEntries(names.map((n) => [n, has(n)]));
  const host = Deno.env.get("POSTHOG_API_HOST")?.trim().replace(/\/$/, "") ?? "";
  const project = Deno.env.get("POSTHOG_PROJECT_ID")?.trim() ?? "";
  if (!names.every((n) => has(n))) {
    return { ...present, status: "missing_secrets", verified: false };
  }
  try {
    const res = await fetch(`${host}/api/projects/${project}/`, {
      headers: { Authorization: `Bearer ${Deno.env.get("POSTHOG_PERSONAL_API_KEY")}` },
    });
    if (res.ok) {
      return { ...present, verified: true, status: "project_reachable" };
    }
    return {
      ...present, verified: false,
      status: `rejected (HTTP ${res.status})`,
      hint: res.status === 401 || res.status === 403
        ? "personal API key invalid, or missing project:read / person:write scope"
        : "project id or region host is wrong (EU keys do not work on us.posthog.com)",
    };
  } catch {
    return { ...present, verified: false, status: "network_error" };
  }
}

Deno.serve(
  withSupabase({ auth: "secret:gate2-check" }, async () => {
    const [apple, daraja, posthog] = await Promise.all([
      checkApple(), checkDaraja(), checkPostHog(),
    ]);

    const platform = {
      SUPABASE_URL: has("SUPABASE_URL"),
      SUPABASE_ANON_KEY: has("SUPABASE_ANON_KEY"),
      SUPABASE_SERVICE_ROLE_KEY: has("SUPABASE_SERVICE_ROLE_KEY"),
    };

    // Apple contributes its PRE-FLIGHT result only. Gate 5 (TestFlight sign-in
    // → account deletion → /auth/revoke) is what actually verifies revocation.
    const gate2_ready = !!apple.preflight && !!daraja.verified && !!posthog.verified &&
      daraja.environment === "PRODUCTION";

    return json({
      gate2_ready,
      checked_at: new Date().toISOString(),
      apple,
      daraja,
      posthog,
      platform,
      notes: [
        "Booleans and fixed statuses only — no secret value, upstream body, or project identifier is ever returned.",
        "apple.preflight proves Apple accepted the client secret. It is NOT proof that revocation works: verify that in TestFlight (sign in with Apple → delete account → /auth/revoke succeeds).",
        "Daraja must read PRODUCTION before the build.",
      ],
    });
  }),
);
