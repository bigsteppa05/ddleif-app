// Sign in with Apple server helpers: mint the ES256 client-secret JWT, exchange
// an authorization code for a refresh token, and revoke it. Apple requires token
// revocation when a user deletes their account (App Store Guideline 5.1.1(v)).
//
// Secrets (set as function secrets — the .p8 key NEVER ships in the app):
//   APPLE_TEAM_ID      – 10-char Apple Developer Team ID
//   APPLE_KEY_ID       – Key ID of the Sign in with Apple .p8 key
//   APPLE_CLIENT_ID    – the native audience: the app Bundle ID (com.fitxball.app)
//   APPLE_PRIVATE_KEY  – contents of the AuthKey_XXXX.p8 (PKCS#8 PEM, incl. header)
//
// This file is duplicated into delete-account/ and apple-token/ for deploy.

export function appleConfigured(): boolean {
  return (
    !!Deno.env.get("APPLE_TEAM_ID") &&
    !!Deno.env.get("APPLE_KEY_ID") &&
    !!Deno.env.get("APPLE_CLIENT_ID") &&
    !!Deno.env.get("APPLE_PRIVATE_KEY")
  );
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function clientSecret(): Promise<string> {
  const teamId = Deno.env.get("APPLE_TEAM_ID")!;
  const keyId = Deno.env.get("APPLE_KEY_ID")!;
  const clientId = Deno.env.get("APPLE_CLIENT_ID")!;
  const privateKey = Deno.env.get("APPLE_PRIVATE_KEY")!.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 300,
    aud: "https://appleid.apple.com",
    sub: clientId,
  };
  const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const key = await importPrivateKey(privateKey);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

async function post(path: string, params: Record<string, string>): Promise<Response> {
  return await fetch(`https://appleid.apple.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

/** Exchange a native authorization code for a long-lived refresh token. */
export async function exchangeAppleCode(code: string): Promise<string | null> {
  if (!appleConfigured()) return null;
  try {
    const res = await post("/auth/token", {
      client_id: Deno.env.get("APPLE_CLIENT_ID")!,
      client_secret: await clientSecret(),
      code,
      grant_type: "authorization_code",
    });
    const data = await res.json().catch(() => ({}));
    return (data as { refresh_token?: string }).refresh_token ?? null;
  } catch (e) {
    console.error("apple code exchange failed", e);
    return null;
  }
}

/** Revoke a stored Apple refresh token (invalidates the app's access). */
export async function revokeAppleToken(refreshToken: string): Promise<boolean> {
  if (!appleConfigured()) return false;
  try {
    const res = await post("/auth/revoke", {
      client_id: Deno.env.get("APPLE_CLIENT_ID")!,
      client_secret: await clientSecret(),
      token: refreshToken,
      token_type_hint: "refresh_token",
    });
    return res.ok;
  } catch (e) {
    console.error("apple revoke failed", e);
    return false;
  }
}
