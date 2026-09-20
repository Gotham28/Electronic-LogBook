# Antigravity dispatch 08 — Admin role backend API

## Guard
This prompt is for the project `Electronic-LogBook` (Gotham28/Electronic-LogBook), task file
`CURRENT_TASK.md` at the repo root, dated 2026-09-14. If this is not that repo, stop, say
which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Read first
- `AGENTS.md` — §3 (ownership before data), §4 (the two ID systems), §6 (schema changes),
  §8 (no patient text near logs), §9 (one feature per task), §10 (secrets), §14.3-14.5
  (execution routes and halt conditions)
- `CURRENT_TASK.md` — the confirmed scope for this task

## Build
- [ ] New router, `requireAuth` + `requireRole(["admin"])`, no `requireDepartment`, in a new
      file `artifacts/api-server/src/routes/superadmin.ts`.
- [ ] `GET` departments list, each with its current HOD (name, email, id).
- [ ] `POST` create department + HOD, reusing `provisionDepartment()` from
      `artifacts/api-server/src/lib/department-provisioning.ts` (read and call it; do not
      modify that file).
- [ ] `POST`/`PATCH` replace a department's HOD in one transaction: demote the outgoing HOD
      to `professor` in the same department, promote the incoming user to `hod`, bump
      `sessionVersion` on both accounts. Enforce the one-approved-HOD-per-department
      constraint the same way `provisionDepartment` already does (check-then-insert inside
      the transaction).
- [ ] `GET` a chosen department's roster: plain user rows only (id, fullName, email, role,
      status), no clinical-table joins.
- [ ] `POST` create faculty in a chosen department — reuse the validation schemas from
      `artifacts/api-server/src/lib/validation.ts` and `sendAccountCreatedEmail` from
      `artifacts/api-server/src/lib/mailer.ts` (read and call them; do not modify those
      files); bcrypt cost 12 (matching the rest of the codebase).
- [ ] `POST` create student in a chosen department — status `pending`, so the student lands
      in that department's existing HOD approval queue (payment gate untouched).
- [ ] `POST`/`DELETE` soft-deactivate a student or faculty account in any department: same
      pattern as `artifacts/api-server/src/routes/admin.ts`'s `DELETE /users/:id`
      (`status: "rejected"`, `sessionVersion + 1`, records retained — read that route for the
      pattern, do not modify that file). Refuse (403) if the target role is `admin` or `hod`
      — HOD removal only happens via the "replace HOD" endpoint above, not this one.
- [ ] Mount the new router in `artifacts/api-server/src/routes/index.ts` at its own path
      (e.g. `/superadmin`), separate from the existing `/admin` mount — add the import and
      one `router.use(...)` line only, following the exact pattern already used there for
      every other router.
- [ ] New CLI bootstrap script `artifacts/api-server/src/provision-admin.ts`, modeled on the
      existing `artifacts/api-server/src/provision-department.ts`: reads `ADMIN_EMAIL` and
      `ADMIN_INITIAL_PASSWORD` from the environment, throws naming the missing variable if
      either is absent, no hardcoded fallback value.
- [ ] Confirm `/auth/register` cannot create an `admin`-role account. Add a test that proves
      current behavior already rejects it. If it does NOT already reject it, stop and report
      this as a finding rather than editing `routes/auth.ts` yourself (that file is not in
      this dispatch's Build list).
- [ ] Document `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` in `.env.example` (names only, no
      values), following the existing format used for `HOD_INITIAL_PASSWORD`.
- [ ] Logging on every new route: id and status code only — never the request body, never a
      password, never a full error object.
- [ ] Tests in `artifacts/api-server/tests/`, following the existing style in
      `access.test.ts`:
      - HOD, professor, and student accounts get 403 on every new admin route.
      - An admin account gets 403 on the HOD-only student-approve/reject routes.
      - The HOD-swap is transactional (a forced failure mid-transaction leaves neither the
        demotion nor the promotion applied).
      - Deactivating a student/faculty account retains their existing logs/records.
      - Registration cannot create an `admin` role.
      - Admin cannot deactivate another admin or an HOD via the deactivate endpoint.

## Do NOT touch
- `artifacts/api-server/src/routes/admin.ts` (the HOD router) — reuse its patterns by
  reading it, do not edit it.
- `artifacts/api-server/src/lib/department-provisioning.ts`,
  `artifacts/api-server/src/lib/validation.ts`, `artifacts/api-server/src/lib/mailer.ts` —
  read and call, do not modify.
- The `users_one_approved_hod_per_department` unique index, or any other schema object.
- Student-approval endpoints (`POST /api/admin/students/:id/approve`,
  `POST /api/admin/students/:id/reject`) and the payment-gate check inside them.
- `lib/db/src/schema/users.ts` — the `role` enum already includes `"admin"`; no schema edit
  needed or permitted.
- Any file not named under Build above, including `artifacts/api-server/src/routes/auth.ts`
  unless you are only adding a test that exercises its existing behavior.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).
- The admin dashboard frontend (`artifacts/mockup-sandbox/`) — that is a separate follow-up
  task, not this one.

## Hard stops — stop and report, do not decide
- Any change to a route or query touching the clinical tables (`case_logs`, `procedure_logs`,
  `academic_logs`, `leave_records`, `postings`, `research`, `assessments`, `attendance`), or
  to anything resolving ownership server-side.
- Any place `studentsTable.id` and `usersTable.id` could be conflated.
- Any schema change, migration, or backfill — none is expected for this task; if you find
  you need one, stop immediately and report rather than writing or running it.
- Any secret, credential, or `.env` value you would have to guess rather than read from the
  environment.
- The task turning out to be more than one feature.
- If `/auth/register` currently does NOT reject an `admin`-role registration attempt — do
  not fix it yourself; report it as a finding.

## Report
Write `HANDOFF.md` at the repo root:
- What changed, per file, and why.
- Anything you skipped, and why (including any step you could not do because it would have
  required a shell command — e.g. running the test suite or typechecking; note that these
  verification steps will be run separately by Claude Code after this dispatch returns, so
  do not attempt them yourself).
- Anything you expanded beyond the Build list, and why.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/src/routes/superadmin.ts
- artifacts/api-server/src/routes/index.ts
- artifacts/api-server/src/provision-admin.ts
- artifacts/api-server/tests/
- .env.example
- HANDOFF.md