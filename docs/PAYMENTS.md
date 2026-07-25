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

## Operating manual_review

There is no automated sweep yet. Until one exists, reconciliation is driven by
the client polling `mpesa-stk-query`, which means a user who closes the app
before their payment resolves leaves a row that nothing will revisit.

```sql
select id, user_id, expected_amount_kes, reported_amount_kes,
       mpesa_receipt, result_desc, created_at
from public.payments
where status in ('manual_review', 'reconciling')
order by created_at desc;
```

Check the row against the M-Pesa statement, then credit deliberately — there is
no "force settle" function on purpose.
