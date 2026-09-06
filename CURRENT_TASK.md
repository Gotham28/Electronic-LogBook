# Current Task

## Feature
Razorpay subscription backend — CLOSED pending the production migration. Built: order
creation and signature verification for the Rs 1,400 / 3-year subscription paid after
registration and before HOD approval. Full detail in TASK_LOG.md's 2026-09-06 "Razorpay
subscription backend" entry: commit list, files changed, and deploy order.

Nothing has been applied to any database and no endpoint has been executed.
`0003_subscriptions_payments.sql` has never run anywhere, not even against PGlite.
AGENTS.md §11 evidence has NOT been produced.

## Plan reference
TASK_LOG.md's 2026-09-06 "Razorpay subscription backend" entry.

## Blocked on developer input
- [ ] Neon credential rotation — the connection string committed at `10bbd69` is live and
      unrotated.
- [ ] PG 18 client tools — local `pg_dump` is 16.12 and refuses an 18.6 server, so no
      verified backup exists and the migration has no rollback path.
- [ ] `pnpm install` repair — `zod` is not linked into
      `artifacts/api-server/node_modules` and `@electric-sql/pglite` is absent entirely;
      the build has never been green.
- [ ] `tests/migrations.test.ts:15` asserts 2 ledger rows; must become 3 now that
      migration 0003 exists.

## Next scheduled
1. Razorpay webhook.
2. Frontend payment step.
