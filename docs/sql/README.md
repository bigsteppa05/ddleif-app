# Applied DDL baseline

This project applies schema changes directly to Supabase; the authoritative
migration history lives in the remote `supabase_migrations.schema_migrations`
table, not in this repo.

The files here are a **record of launch-critical DDL as applied**, kept in git so
the settlement rules and release tooling are reviewable and diffable. They are
named for their remote migration version. They are not a complete migration set
and are not meant to be replayed against a fresh database — earlier migrations
are not here.

Reconstructing the full history in git is post-launch backlog.

| Version | File | What it did |
|---|---|---|
| 20260725015625 | [harden_payment_settlement.sql](20260725015625_harden_payment_settlement.sql) | Settlement invariant: receipt uniqueness, expected vs reported amounts, callback cannot credit |
| 20260725020631 | [schedule_mpesa_reconciliation_sweep.sql](20260725020631_schedule_mpesa_reconciliation_sweep.sql) | pg_cron sweep so an abandoned payment is still reconciled |
| 20260729220000 | [review_env_tooling.sql](20260729220000_review_env_tooling.sql) | `scope_review_event()` + `review_env_check()`: re-point and assert the App Store reviewer environment |

See [../PAYMENTS.md](../PAYMENTS.md) for the payment state machine, and
[../APP-STORE.md](../APP-STORE.md) §5 for how the reviewer functions are used.
