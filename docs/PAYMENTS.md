# M-Pesa settlement

How a top-up becomes credits, and why it takes two independent confirmations.

## The invariant

```
one CheckoutRequestID
+ one query-confirmed successful transaction
+ the expected amount
+ one unique receipt
= exactly one balance increment
```

Every clause is enforced in `public.complete_payment`, which is the only place
credits are created.

## Why the callback cannot be trusted alone

Safaricom's callback carries a `CheckoutRequestID`. That is an identifier, not a
signature or a shared secret — the endpoint is public and unauthenticated by
necessity, because Safaricom cannot present a Supabase credential. Matching a
pending row proves the *state* is plausible, not that the *caller* is Safaricom.

So `mpesa-callback` records and nothing more. Credits come only after
`mpesa-stk-query` asks Daraja directly, server-to-server, with our own
credentials.

A constraint shapes the whole design: Safaricom's `stkpushquery` endpoint returns
`ResultCode` and `ResultDesc` only — **no amount and no receipt**. The query can
confirm *that* a payment succeeded but never *what* was paid. Those facts exist
only in the callback. Neither source is sufficient alone; settlement requires
both to agree.

## States

| State | Meaning |
|---|---|
| `pending` | STK prompt sent; no callback yet |
| `reconciling` | Callback recorded; awaiting independent confirmation |
| `paid` | Query-confirmed, amount matched, receipt unique — credited once |
| `failed` | Query-confirmed failure, or a failure callback |
| `expired` | Daraja never accepted the request; no charge was placed |
| `manual_review` | Contradictory or unconfirmable — a human decides |

```
pending ──callback(success)──▶ reconciling ──query(success)+checks──▶ paid
   │                                │
   ├──callback(failure)─────────────┼──▶ failed
   ├──query(failure)────────────────┘
   └──never accepted by Daraja──────────▶ expired

anything unresolved after 15 min, or contradictory ──▶ manual_review
```

`manual_review` is reached by: query says paid but no callback ever arrived (no
receipt to check); callback says paid but query says failed; reported amount ≠
expected amount; a receipt already backing another payment; or Daraja giving no
usable answer inside the window. **An inconclusive answer is never treated as
paid, and never as failed either** — the customer's money may have moved.

## Concurrency and retries

- `record_payment_callback` compare-and-sets on `status = 'pending'`, so Daraja's
  retries match zero rows the second time.
- `complete_payment` takes `FOR UPDATE` on the row and guards its final write on
  `status = 'reconciling'`, so concurrent reconcilers produce one increment.
- A unique index on `upper(btrim(mpesa_receipt))` means one receipt backs one
  payment, regardless of casing or whitespace.
- `mpesa-stk-query` backs off 5s → 10s → 20s … capped at 60s, tracked in
  `reconcile_attempts` / `last_reconcile_at`, so a stuck payment cannot flood
  Daraja no matter how many clients poll it.

## The one-pending-per-user guard

`payments_one_pending_per_user` is a unique partial index on `user_id WHERE
status = 'pending'`. It deliberately does **not** cover `reconciling`: moving a
row out of `pending` the moment a callback lands frees the user to start another
top-up instead of being locked out while reconciliation runs. If both
transactions were genuinely paid, both credit — once each, guarded by receipt
uniqueness.

## Access

`complete_payment` and `record_payment_callback` are `SECURITY DEFINER` with
`search_path = ''` and fully qualified relations. `EXECUTE` is revoked from
`public`, `anon` and `authenticated`, and granted only to `service_role`. Neither
is reachable over PostgREST by a signed-in user.

## The scheduled sweep

Client polling only covers users who stay in the app. `mpesa-sweep` covers the
rest: a customer who pays and closes the app must not stay uncredited because
nobody was watching.

`pg_cron` calls it every 5 minutes through `pg_net`. It selects `pending` and
`reconciling` rows with a `CheckoutRequestID`, older than a 3-minute prompt
grace and younger than 7 days, oldest first, 25 per run — then runs each through
the **same** `reconcilePayment()` the client path uses. One reconciliation
implementation, one crediting path, no inference of missing amounts or receipts.

The cron job is a no-op by its own `WHERE` clause unless there is work to do
**and** the sweep key is configured, so it stays silent before launch.

### Enabling it

1. Dashboard → **Project Settings → API Keys → Secret keys** → create a secret
   key named `mpesa-sweep`.
2. Store it in Vault so the cron body carries no literal:

```sql
select vault.create_secret('<the mpesa-sweep secret key>', 'mpesa_sweep_key', 'Auth for scheduled reconciliation');
```

3. Deploy the function (`supabase/config.toml` already sets `verify_jwt = false`):

```bash
supabase functions deploy mpesa-sweep
```

Until step 1–2 are done the function is fail-closed (401) and the job never
calls it. To check it afterwards:

```sql
-- job_run_details keys on jobid, not jobname — join to cron.job.
select j.jobname, d.status, d.return_message, d.start_time
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where j.jobname = 'mpesa-reconcile-sweep'
order by d.start_time desc limit 10;
```

`succeeded` with `0 rows` is the healthy idle result: the guard held and no HTTP
call was made. Once the sweep key is in Vault and a payment needs reconciling,
successful runs return `1 row` — the queued `net.http_post` request id.

## Operating manual_review

The sweep escalates rather than guesses, so `manual_review` needs a human.

```sql
select id, user_id, expected_amount_kes, reported_amount_kes,
       mpesa_receipt, result_desc, created_at
from public.payments
where status in ('manual_review', 'reconciling')
order by created_at desc;
```

Check the row against the M-Pesa statement, then credit deliberately — there is
no "force settle" function on purpose.

## Acceptance criteria

Frozen once these all hold. Anything failing here reopens this area; nothing
else does.

- [x] Receipt uniqueness enforced
- [x] Expected and reported amounts must match
- [x] Callback cannot directly credit
- [x] Daraja query confirmation required
- [x] Missing callback facts never auto-credit
- [x] Duplicate settlement credits exactly once
- [x] Failed payments cannot become paid
- [x] Closing the app does not strand a successful payment — scheduled sweep
- [x] Credit History displays completed payments
- [ ] Production Edge Functions deploy and execute
- [ ] One real low-value top-up: `pending → reconciling → paid`, credited once,
      and a repeated callback/query adds no second credit

The applied DDL is kept in [sql/](sql/).
