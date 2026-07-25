import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { IN_FLIGHT, PAYMENT_COLS, type Payment, reconcilePayment } from "./reconcile.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled reconciliation sweep.
//
// Without this, a customer can pay, close the app, and stay uncredited forever:
// client polling is the only thing that would ever revisit their row. This
// picks up payments nobody is watching and runs them through exactly the same
// reconcilePayment() the client path uses — no second settlement path, no
// inference of missing amounts or receipts, complete_payment still the only
// thing that credits.
//
// Invoked by pg_cron via pg_net every 5 minutes; see docs/PAYMENTS.md.
// Authenticated by a dedicated secret API key named "mpesa-sweep", so it is
// fail-closed until that key exists. verify_jwt is false in config.toml.
// ─────────────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Small enough that one run cannot stall on Daraja, large enough to drain a
// backlog over a few cycles.
const BATCH = 25;
// Leave a live STK prompt alone; the user's own polling owns it first.
const PROMPT_GRACE_MS = 180_000;
// Older than this and the row is a data-retention question, not a payment one.
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export default {
  fetch: withSupabase({ auth: "secret:mpesa-sweep", cors: "disabled" }, async () => {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = Date.now();
    const { data, error } = await admin
      .from("payments")
      .select(PAYMENT_COLS)
      .in("status", IN_FLIGHT)
      .not("checkout_request_id", "is", null)
      .lt("created_at", new Date(now - PROMPT_GRACE_MS).toISOString())
      .gt("created_at", new Date(now - MAX_AGE_MS).toISOString())
      .order("created_at", { ascending: true })
      .limit(BATCH);

    if (error) {
      console.error("sweep candidate query failed", error);
      return json({ ok: false, message: "query_failed" }, 500);
    }

    const rows = (data ?? []) as Payment[];
    const outcomes: Record<string, number> = {};

    // Sequential on purpose: a burst of parallel Daraja calls is exactly what
    // the per-row backoff exists to prevent.
    for (const row of rows) {
      const o = await reconcilePayment(admin, row);
      outcomes[o.status] = (outcomes[o.status] ?? 0) + 1;
    }

    console.log("sweep complete", JSON.stringify({ examined: rows.length, outcomes }));
    return json({ ok: true, examined: rows.length, outcomes });
  }),
};
