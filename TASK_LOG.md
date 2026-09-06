### 2026-08-19 — Remove hardcoded JWT_SECRET fallback

**What changed**
- Added `artifacts/api-server/src/lib/env.ts`. Reads `process.env.JWT_SECRET` with no
  default and throws at module load if it is missing or empty. The error names the
  variable and does not print its value.
- Deleted the local `const JWT_SECRET = process.env.JWT_SECRET ||
  "fallback-secret-for-dev-only"` from `middlewares/auth.ts` and `routes/auth.ts`; both
  now import from `lib/env.ts`.
- No other logic changed. `git diff --stat`: 2 files, 1 line in and 1 line out each.
  Call sites at `middlewares/auth.ts:33`, `routes/auth.ts:386` and `routes/auth.ts:443`
  kept their original line numbers.

**Files**
- `artifacts/api-server/src/lib/env.ts` (new)
- `artifacts/api-server/src/middlewares/auth.ts`
- `artifacts/api-server/src/routes/auth.ts`

**Evidence**
- Old-secret rejection: token hand-signed with "fallback-secret-for-dev-only" sent to
  `GET /api/student/1/dashboard` returned 401 `{"message":"Invalid or expired token"}`.
- Control: same route with no token returned 401 `{"message":"Authentication required"}`.
  The differing bodies confirm the rejection was on signature, not a missing token.
- Both run against a `dist/` built from the final source, with a throwaway `JWT_SECRET`
  and a dead-port `DATABASE_URL`. Health check `GET /api/healthz` returned 200 first.
- Boot with `JWT_SECRET` unset: process exits at module load with
  `Error: Missing required environment variable: JWT_SECRET`.
- `git grep -n "fallback-secret-for-dev-only" -- artifacts lib`: no matches.
- `pnpm run typecheck`: 26 pre-existing errors, none in the three changed files.
- Real login test, developer-run against the production database: `POST
  http://localhost:5173/api/auth/login` returned 200; `GET
  http://localhost:5173/api/students/14/dashboard` returned 200. Confirms a real user can
  still log in and reach an authenticated route after the change.

**Left open**
- Neon database credentials need rotating: `.env` was printed into an agent transcript
  on 2026-08-19.
- Local `FRONTEND_URL` resolves to a production Vercel origin. Not investigated.
- `pnpm run build` is esbuild only and does not type-check. `pnpm run typecheck` is a
  separate script that nothing runs automatically.
- `artifacts/api-server/verify-jwt.mjs` is untracked. Decide whether it is committed.
- `CURRENT_TASK.md` and `TASK_LOG.md` are not tracked on this branch — it was cut from
  `origin/main`, which predates the commit that added them.

**Commit** — `76daae7` "fix(auth): require JWT_SECRET with no fallback default", on `main`.
**PR** — not recorded.

---

### 2026-09-06 — Razorpay subscription backend

**What changed**
- Built the server side of a Rs 1,400 / 3-year subscription that a prospective resident
  pays after registering and before the HOD approves them. Registration already created a
  `users` row with status `pending` and a linked `students` row; that flow is unchanged.
- Added two tables, `subscription_plans` and `payments`, and a hand-written migration
  `lib/db/migrations/0003_subscriptions_payments.sql` that seeds the single `pg-3yr` plan
  (140000 paise, 36 months, `department_id` NULL meaning every department).
- Added a narrow payment token: claims `{ id, scope: "payment" }`, 30-minute expiry, signed
  with the existing `JWT_SECRET`. Issued by `POST /api/auth/register` on success, and by
  `POST /api/auth/login` with a 402 when the account is a student, is `pending`, and holds
  no `paid` payments row. `requireAuth` now rejects any token carrying `scope: "payment"`,
  so a payment token can never act as a session token.
- Added `POST /api/payments/create-order` and `POST /api/payments/verify`. The amount is
  never accepted from the client; it is read from `subscription_plans` server-side. Order
  creation holds a per-user `pg_advisory_xact_lock` across the paid check, the reuse check
  and the insert, with the Razorpay HTTP call outside any transaction. Verification
  compares the HMAC-SHA256 signature with `crypto.timingSafeEqual` and checks that the
  order's `userId` matches the caller's token before writing anything.
- If `RAZORPAY_KEY_ID` or `RAZORPAY_KEY_SECRET` is unset both routes return 503 and the
  server still boots, so a payment misconfiguration cannot stop residents logging cases.

**Files**
- `lib/db/src/schema/subscription_plans.ts` (new)
- `lib/db/src/schema/payments.ts` (new)
- `lib/db/migrations/0003_subscriptions_payments.sql` (new)
- `lib/db/src/migrations.ts`, `lib/db/src/schema/index.ts`, `lib/db/package.json`
- `artifacts/api-server/src/routes/payments.ts` (new)
- `artifacts/api-server/src/middlewares/payment-token.ts` (new)
- `artifacts/api-server/src/routes/auth.ts`, `src/middlewares/auth.ts`, `src/routes/index.ts`
- `.env.example`, `AGENTS.md`

**Evidence**
- AGENTS.md §12 evidence standard (§11 before this task renumbered the sections) has NOT
  been produced. The migration has not been applied to any database and no endpoint has
  been executed. No request has been made against any of this code.
- `0003_subscriptions_payments.sql` has never run anywhere, not even against PGlite.
- TypeScript type checking was run and reports 20 errors, all pre-existing and unrelated to
  this work: 9 x TS2307 `Cannot find module 'zod'` and 11 x TS7006 implicit-any downstream
  of `zod` resolving to `any`. `routes/payments.ts` and `middlewares/payment-token.ts`
  contribute no error beyond the shared `zod` one.

**Deploy order**
- The migration must be applied BEFORE this code is deployed. `routes/auth.ts` queries the
  `payments` table on a pending student's login, so deploying first makes every pending
  student's login return 500 instead of the previous 403. Approved users are unaffected;
  the query sits behind the role and status guard.

**Left open**
- Neon credential rotation — the connection string committed at `10bbd69` is live and
  unrotated.
- `pg_dump` 18 client tools needed; the local `pg_dump` is 16.12 and refuses an 18.6
  server. No verified backup exists yet.
- PGlite migration test not yet run. `tests/migrations.test.ts:15` asserts 2 ledger rows
  and will fail at 3 until that number is corrected.
- `pnpm install` incomplete — `zod` is not linked into `artifacts/api-server/node_modules`
  and `@electric-sql/pglite` is absent entirely. The build has never been green.
- No Razorpay webhook. A payment that succeeds after the browser dies is invisible to the
  database. Must land before live keys.
- Frontend payment step not built; a 402 from login is unhandled by the UI.
- HOD approval screen does not show payment status; an unpaid student can be approved.
- Refund policy undecided; `refundStatus`, `refundedAt` and `refundNote` exist unused.
- `payment_capture: 1` unconfirmed against current Razorpay Orders API docs.
- `.pnpm-store` is tracked in git and is what broke workspace linking.
- The seven credential-bearing scripts in `lib/db/`, recorded in AGENTS.md §11.

**Commits** — on `feat/razorpay-subscription`
- `ef94fd4` docs: commit reconstructed AGENTS.md
- `f15e6dc` chore(db): remove drizzle-kit push scripts per AGENTS.md s6
- `d38b775` feat(db): draft subscription_plans and payments schema + migration
- `7372ef8` feat(auth): issue a scoped payment token for pending applicants
- `929ba69` feat(payments): add create-order and verify endpoints
- `2d141dc` docs(env): add Razorpay key names to .env.example
- `5300a70` fix(auth): restrict payment requirement to student accounts
- `fc7dfca` fix(payments): correct verify response and close create-order race
- `8b883f2` fix(db): remove duplicate unique constraint on payments
- `bb7e3bf` fix(payments): return 200 when a concurrent verify already marked the payment paid
- `cbb08cd` docs(agents): correct test-suite claim and record committed-credential debt

`f15e6dc` was also cherry-picked onto `main` as `8765917` so the `drizzle-kit push` scripts
would not wait on this branch.

**PR** — none opened.
