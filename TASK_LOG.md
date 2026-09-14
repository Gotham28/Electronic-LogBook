### 2026-08-19 — Remove hardcoded JWT_SECRET fallback

**What changed**
- Added `artifacts/api-server/src/lib/env.ts`. Reads `process.env.JWT_SECRET` with no
  default and throws at module load if it is missing or empty. The error names the
  variable and does not print its value.
- Deleted the local `const JWT_SECRET = process.env.JWT_SECRET ||
  "fallback-secret-for-dev-only"` from `middlewares/auth.ts` and `routes/auth.ts`; both
  now import from `lib/env.ts`.
- No other logic changed. `git diff --stat`: 2 files, 1 line in and 1 line out each.
  Call sites in `middlewares/auth.ts` and `routes/auth.ts` originally kept their line numbers
  (subsequent security fixes like SEC-11/12 and payment flows have since expanded both files).

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
- `artifacts/api-server/verify-jwt.mjs` no longer appears in `git status`; the "decide
  whether it is committed" question is moot.
- `CURRENT_TASK.md` and `TASK_LOG.md` are tracked, as of commit `a291788` "chore: track
  task file and task log in git" (2026-08-19), on both `main` and this branch.

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
- AGENTS.md §11 evidence standard has NOT been produced. The migration has not been
  applied to any database and no endpoint has been executed. No request has been made
  against any of this code.
- `0003_subscriptions_payments.sql` has never run anywhere, not even against PGlite.
- **Update, 2026-09-13:** `0003_subscriptions_payments.sql` is now applied in production,
  per the developer's direct confirmation.
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
- PGlite migration test: resolved — `tests/migrations.test.ts:15` already asserts 3 ledger
  rows (covering `0003_subscriptions_payments.sql`).
- `pnpm install` incomplete — `zod` is not linked into `artifacts/api-server/node_modules`
  and `@electric-sql/pglite` is absent entirely. The build has never been green.
- No Razorpay webhook. A payment that succeeds after the browser dies is invisible to the
  database. Must land before live keys.
- Frontend payment step not built; a 402 from login is unhandled by the UI.
- HOD approval screen does not show payment status; an unpaid student can be approved.
- Refund policy undecided; `refundStatus`, `refundedAt` and `refundNote` exist unused.
- `payment_capture: 1` unconfirmed against current Razorpay Orders API docs.
- `.pnpm-store` is tracked in git and is what broke workspace linking.
- The seven credential-bearing scripts in `lib/db/`, recorded in AGENTS.md §13.

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

**PR** — none opened at the time of writing. **Update, 2026-09-13:** PR #4 ("Razorpay subscription: backend and migration") and PR #5 ("feat(payment): add Razorpay payment step to registration and login") were both opened from branch `feat/razorpay-subscription` and merged on 2026-09-06 (at 18:58:40Z and 19:54:37Z respectively).

---

### 2026-09-13 — Documentation-accuracy audit and fixes

**What changed**
- Full claim-by-claim accuracy audit of all 14 Markdown files in the repository against the
  actual codebase, plus a re-verification of all 37 (now 38) SEC-01..38 security findings
  across the three security documents. Findings written to `HANDOFF.md`.
- Applied the developer-approved fixes from that audit: corrected `AGENTS.md`'s internal
  contradictions (test-suite claims, stale credential-script status, four wrong
  `.agents/CURRENT_TASK.md` citations, an unrecoverable-history notice), updated this file's
  2026-09-06 entry with the now-confirmed production migration status and the PR numbers
  that entry was missing, corrected several SEC-finding citations (SEC-05, SEC-07, SEC-18,
  SEC-20, SEC-22) across `docs/SECURITY_REPORT.md` and `.agents/SECURITY_AUDIT.md`,
  documented a newly-found `nodemailer` vulnerability as SEC-38, added the 14 undocumented
  environment variables to `.env.example`, and struck a prohibited `drizzle-kit push`
  instruction from `replit.md`.

**Files**
- `AGENTS.md`, `TASK_LOG.md` (this file), `docs/SECURITY_REPORT.md`,
  `docs/SECURITY_FIXES.md`, `.agents/SECURITY_AUDIT.md`, `.env.example`, `replit.md`
- `HANDOFF.md` (new), `.agents/runs/dispatch-02-documentation-audit-no-shell.md` (new),
  `.agents/runs/dispatch-03-apply-documentation-fixes.md` (new)

**Evidence**
- No database command run, no dependency changed, no code file touched.
- Live test suite re-run at the time of the audit: 60/60 passing.
- CodeRabbit did not review PR #23 (repository has fewer than 10 GitHub stars, below its
  automatic-review threshold) — no bot findings to record.

**Commit** — `35e7eb4` "docs: apply approved documentation-accuracy audit fixes", merged as
`2567e925` via PR #23, on `main`.
**PR** — [#23](https://github.com/Gotham28/Electronic-LogBook/pull/23), merged 2026-09-13.

---

### 2026-09-14 — Admin role backend API (task 1 of 2)

**What changed**
- Added a college-level admin role above HOD, with its own authorization-gated backend API.
  Admin can: list departments with their current HOD; create a department + HOD (reusing
  `provisionDepartment()`); replace a department's HOD in one transaction (demotes the
  outgoing HOD to professor, promotes the incoming professor, bumps both accounts'
  `sessionVersion`); view a department's roster as plain user rows (deliberately no
  `studentsTable` join, to avoid conflating the two ID systems per `AGENTS.md` §4); create
  faculty or students in any department (a student created this way lands `pending`, in the
  normal HOD approval queue — student approval itself stays HOD-only, untouched); and
  soft-deactivate a student or faculty account in any department (same pattern as the
  existing HOD-side deactivation — status set to `rejected`, session revoked, records
  retained). Admin cannot approve students and cannot deactivate another admin or an HOD
  (HOD removal only happens through the explicit replace-HOD endpoint).
- Added a CLI bootstrap script for the first admin account, reading `ADMIN_EMAIL` /
  `ADMIN_INITIAL_PASSWORD` from the environment and failing closed (naming the missing
  variable) if either is absent — no hardcoded fallback, no public signup path can create an
  admin (confirmed: `/auth/register`'s schema is `.strict()` with a hardcoded `role:
  "student"`, so a `role` field in the request body is rejected before the handler runs).
- Built via two Antigravity dispatches (Opus-tier — the `AGENTS.md` §3 ownership-boundary
  trigger fired as expected, since this role's entire purpose is legitimate cross-department
  access). Dispatch 08 built the feature; a code-review (scope/rules/evidence/blast-radius
  lenses) found one Critical typecheck error, two Major findings (the "transactional HOD
  swap" test didn't actually force a mid-transaction failure; five success-path logs used
  `.error()` instead of `.info()`), and three Minor findings. Dispatch 09 fixed all of them —
  verified directly against the code, not taken on the dispatch's own claim, since dispatch
  09's job hit an Antigravity account-quota error before it could write its own `HANDOFF.md`
  update (its file edits landed correctly regardless; the quota error only cut off its final
  report-writing step).
- This is task 1 of 2. The admin dashboard frontend (`artifacts/mockup-sandbox`) is a
  separate, not-yet-scoped follow-up task.

**Files**
- `artifacts/api-server/src/routes/superadmin.ts` (new) — the admin router
- `artifacts/api-server/src/provision-admin.ts` (new) — CLI bootstrap script
- `artifacts/api-server/tests/superadmin.test.ts` (new) — 14 tests, including a genuine
  forced-mid-transaction-failure rollback test added in the fix round
- `artifacts/api-server/src/routes/index.ts` — mounts the new router at `/superadmin`
- `.env.example` — documents `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` (names only)
- `artifacts/api-server/package.json` — adds a `db:provision-admin` script
- `.agents/runs/dispatch-08-admin-role-backend-api.md`,
  `.agents/runs/dispatch-09-fix-review-findings.md` (new — the two dispatch prompts)

**Not touched** (confirmed byte-for-byte unchanged throughout both dispatches)
- `artifacts/api-server/src/routes/admin.ts` (the HOD router), `lib/department-provisioning.ts`,
  `lib/validation.ts`, `lib/mailer.ts`, `lib/db/src/schema/users.ts`, the
  `users_one_approved_hod_per_department` unique index, and both student-approval endpoints.

**Evidence**
- `pnpm run typecheck` (in `artifacts/api-server`): clean, no errors, after the dispatch-09
  fix (was failing with TS2345 on `superadmin.ts:145` after dispatch 08).
- `pnpm test` (in `artifacts/api-server`): 74/74 passing, including all 14 new tests (role
  gating on every new route; admin refused on HOD-only approve/reject; department list;
  department+HOD creation; roster shape with no `studentId` exposed; faculty/student
  creation; a genuine forced-failure test proving the HOD-swap transaction actually rolls
  back both writes, not just an HTTP-level rejection; deactivation retains records; admin
  cannot deactivate another admin or HOD; registration cannot create an admin role;
  unauthenticated 401; faculty deactivation invalidates the session). Runs against an
  in-memory PGlite engine, not a real `DATABASE_URL` — `AGENTS.md` §6.1's test-database
  conditions don't apply to this run.
- `git diff --stat` against `origin/main`: confirmed confined to exactly the files listed
  above. No schema or migration file touched.

**Left open**
- The admin dashboard frontend (task 2 of 2) is not yet scoped.
- `HANDOFF.md` at the repo root reflects only dispatch 08's report — dispatch 09's own
  report-writing step was cut off by the Antigravity quota error described above. Its actual
  file changes were independently verified (see Evidence) and are not in question; the
  document itself just wasn't regenerated to describe them. Left as-is rather than hand-
  written, since `HANDOFF.md` is Antigravity's own report artifact, not Claude Code's to
  author.

**Commit** — pending — see below.
**PR** — pending. Per this repo's standing developer instruction, Claude Code stops after
committing; the developer pushes and opens the PR themselves.
