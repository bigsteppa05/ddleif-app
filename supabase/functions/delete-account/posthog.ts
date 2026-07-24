// Server-side PostHog person deletion for account deletion. Because the app
// calls identify(supabaseUserId), PostHog holds an identified person; reset() on
// the client only stops *future* association. This removes the historical person
// and their events (delete_events=true).
//
// Secrets (Edge Function only — never in the app):
//   POSTHOG_PERSONAL_API_KEY  – a personal API key with person-delete scope
//   POSTHOG_PROJECT_ID        – numeric project id (e.g. 230531)
//   POSTHOG_API_HOST          – API host, default https://eu.posthog.com (EU cloud)
//
// No-ops gracefully when unconfigured, and never blocks account deletion.

export function posthogConfigured(): boolean {
  return !!Deno.env.get("POSTHOG_PERSONAL_API_KEY") && !!Deno.env.get("POSTHOG_PROJECT_ID");
}

export async function deletePosthogPerson(distinctId: string): Promise<void> {
  if (!posthogConfigured()) return;
  const key = Deno.env.get("POSTHOG_PERSONAL_API_KEY")!;
  const projectId = Deno.env.get("POSTHOG_PROJECT_ID")!;
  const host = Deno.env.get("POSTHOG_API_HOST") ?? "https://eu.posthog.com";
  const auth = { Authorization: `Bearer ${key}` };

  try {
    // Find the person by their distinct id (= the Supabase user id we identify with).
    const findRes = await fetch(
      `${host}/api/projects/${projectId}/persons/?distinct_id=${encodeURIComponent(distinctId)}`,
      { headers: auth },
    );
    if (!findRes.ok) {
      console.error("posthog person lookup failed", findRes.status);
      return;
    }
    const data = await findRes.json().catch(() => ({}));
    const person = (data as { results?: Array<{ id?: string | number }> }).results?.[0];
    if (!person?.id) return; // never sent events / already gone

    // Delete the person and all their associated events.
    const delRes = await fetch(
      `${host}/api/projects/${projectId}/persons/${person.id}/?delete_events=true`,
      { method: "DELETE", headers: auth },
    );
    if (!delRes.ok) console.error("posthog person delete failed", delRes.status);
  } catch (e) {
    console.error("posthog deletion error", e);
  }
}
