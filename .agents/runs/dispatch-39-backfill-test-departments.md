# Antigravity dispatch 39 — Backfill mirror test departments for existing departments

job_id (attempt 1): 7ed4d44d8d424c81a7cdfb917bffac7a — CANCELLED, dispatched with a bogus
  `FILE:` path reference as `spec` instead of the actual prompt text; cancelled immediately
  after discovering the tool has no such convention.
job_id (attempt 2): 929b9de17fcc484f8ffb8add29834b35 — model: Claude Sonnet 4.6 (Thinking),
  full prompt text passed directly. BLOCKED — "Individual quota reached... Resets in
  24h44m36s." Same account-wide quota bucket as every other Claude-tier block this session.
job_id (attempt 3): 75fef14f92f8463eb8103b9d20c103fd — model: Gemini 3.1 Pro (High),
  fallback per established preference.
workdir: D:\Electronic-LogBook-main
branch: feature/mirror-test-department
model: Claude Sonnet 4.6 (Thinking)

allowed_paths:
- artifacts/api-server/src/lib/department-provisioning.ts
- artifacts/api-server/src/routes/superadmin.ts
- artifacts/mockup-sandbox/src/lib/apiClient.ts
- artifacts/mockup-sandbox/src/components/AdminPortal.tsx
- artifacts/api-server/tests/

## Guard
This prompt is for "Electronic-LogBook" (Arogya platform, Pediatrics pilot), task file
`CURRENT_TASK.md` at the repo root, feature "backfill mirror test departments for existing
departments". If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`, and not `pnpm test`. If you are tempted to
run one, don't; use file-reading tools instead (view a file, list a directory, search file
contents). A denied shell call is not something to work around and continue past — some
environments do not recover cleanly from one and simply stop the task instead of falling
back. Do the entire task using only file-reading and file-editing tools. Write tests as
files; do not attempt to run them — Claude Code runs `pnpm test` after this dispatch returns
and reports the real result.

The branch `feature/mirror-test-department` is already checked out for you. Do not check
out, create, or switch any branch. Do not run `git` at all.

## A note on the word "backfill" in this task's name
This repo's `AGENTS.md` §6 (a halt condition under §14.5) forbids an agent from running any
database-connecting command (`drizzle-kit push`/`migrate`, `psql`, or any raw DB connection) —
that rule is about how data changes are made, not about what this task does. This task never
runs a database-connecting command and makes no schema change. It only extracts an existing,
already-reviewed insert-row function and calls it from a new HTTP route the same way
`provisionDepartment()` already calls it today when a department is created — ordinary
application code reached through a normal request, exactly like every other route in
`superadmin.ts`. Do not treat this task's name as itself a §6/§14.5 trigger — it isn't one.

## Read first
- `AGENTS.md` — all sections; §16 is a rule-map table (cited section numbers below already
  resolve through it: §12.5 halt conditions → §14.5; §10 review tiers → §15)
- `CURRENT_TASK.md` — the confirmed scope in full
- `artifacts/api-server/src/lib/department-provisioning.ts` in full — `provisionDepartment()`,
  and specifically the second `db.transaction(...)` block (the mirror-creation logic: the
  existing-mirror check, the mirror department insert, the three approved `.invalid`-domain
  test accounts, the test student's `studentsTable` row, and the try/catch-and-warn wrapper
  around the whole thing). This is the exact logic to extract — read it closely enough to
  extract it as a pure refactor with no behavior change.
- `artifacts/api-server/src/routes/superadmin.ts` in full — the router you're extending.
  Note its existing patterns: router-level `requireAuth, requireRole(["admin"])` with no
  department-scoping middleware (every route does its own inline per-request logic instead);
  the existing `GET /departments` route (structurally closest read pattern for selecting
  departments); the existing `POST /users/:id/impersonate` route (closest example of this
  file's structured-log idiom, `req.log.info({...}, "...")`, and of returning a summary
  object rather than a single resource).
- `lib/db/src/schema/users.ts` — read the `departmentsTable` definition fresh, specifically
  the `isTest` column (`notNull().default(false)`) and the `configSourceDepartmentId` column
  and its check constraint, to confirm the exact, unambiguous filter for "a real department"
  (`isTest = false`, never nullable) and "a department that already has a mirror" (a row
  exists whose `configSourceDepartmentId` equals this department's id).
- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx` — the topbar's existing
  "New department" button (structurally closest example for the new button's placement and
  the `creatingDept`-style in-flight-disable pattern), and `fetchDepartments()` (the existing
  refresh call to reuse after a successful backfill).
- `artifacts/mockup-sandbox/src/lib/apiClient.ts` — existing API wrapper functions' style
  (naming, error handling), specifically `impersonateAdminUser` as the closest precedent for
  a wrapper with no path parameters.
- `artifacts/api-server/tests/auto-provision.test.ts` — style reference (bare `test()` +
  `support.ts`'s `call()` helper, real in-process PGlite DB) for the new test file, since
  you're testing the same provisioning domain.

## Build
- [ ] In `department-provisioning.ts`: extract the existing mirror-creation block (the second
      `db.transaction` inside `provisionDepartment()`) into its own exported function,
      `provisionMirrorForRealDepartment(realDepartmentId: number, realDepartmentName: string,
      realDepartmentDescription: string | null | undefined): Promise<{ created: boolean;
      mirrorDepartmentId?: number }>`. `provisionDepartment()` must call this new function in
      place of its current inline block, wrapped in the same try/catch-and-warn it already
      uses (no behavior change to the existing create-department path — same guarantee that
      this step never blocks or rolls back the real department's own success). This is a pure
      extraction: the mirror-creation logic itself (the `TEST-${id}` code format, the
      `.invalid` emails, the random per-account passwords, the approved status, the
      `studentsTable` row) does not change, only where it lives.
- [ ] In `superadmin.ts`: new route `POST /departments/backfill-test-departments`, admin-only
      (covered by this router's existing router-level `requireAuth, requireRole(["admin"])` —
      no new per-route middleware). Logic:
      1. Select every department where `isTest = false`.
      2. For each, call `provisionMirrorForRealDepartment(...)` (imported from
         `department-provisioning.ts`) inside its own try/catch, so one department's failure
         never aborts the loop — collect failures instead of throwing.
      3. Build three buckets from the results: `provisioned` (department ids where the call
         returned `created: true`), `skipped` (department ids where it returned
         `created: false` — already had a mirror), `failed` (`{ departmentId, message }` with
         a short message string only — never a raw error object or stack trace, per this
         repo's logging rule, AGENTS.md §8/§14.5).
      4. Respond `200` with `{ provisioned: number[], skipped: number[], failed: {
         departmentId: number, message: string }[] }`.
      5. Log one line: `req.log.info({ adminId: req.user!.id, provisionedCount:
         provisioned.length, skippedCount: skipped.length, failedCount: failed.length },
         "Backfilled mirror test departments")` — ids and counts only, matching this file's
         existing structured-log idiom exactly.
      This route must be safe to call more than once: a second call after every real
      department already has a mirror returns `200` with everything in `skipped`.
- [ ] `apiClient.ts` — add `backfillTestDepartments()` calling the new route, matching this
      file's existing wrapper style (see `impersonateAdminUser` as the closest precedent).
- [ ] `AdminPortal.tsx` — add a button next to the existing "New department" button in the
      topbar, outline variant, labeled "Provision test departments". On click: call
      `backfillTestDepartments()`, show a toast summarizing the result (e.g. "Provisioned N
      test departments" when `provisioned.length > 0`, or "All departments already have a
      test department" when `provisioned.length === 0 && failed.length === 0`), then call the
      existing `fetchDepartments()` to refresh the list and counts. Disable the button while
      the call is in flight, matching the existing `creatingDept`-style in-flight-disable
      pattern already used for "Create department + HOD".
- [ ] Tests, new file in `artifacts/api-server/tests/`, `node:test` style matching
      `tests/auto-provision.test.ts` — cover exactly what `CURRENT_TASK.md`'s
      `## Verification required` section lists: backfilling a real department with no
      existing mirror creates exactly one mirror with 3 approved test accounts; backfilling a
      real department that already has a mirror is a no-op (appears in `skipped`, no
      duplicate); calling the route twice in a row is idempotent; a department that is itself
      a mirror (`isTest = true`) is never selected as a candidate; one department's simulated
      provisioning failure does not prevent other departments in the same call from being
      provisioned; non-admin callers get `403`/`401` as appropriate; new department creation
      via `provisionDepartment()` still creates exactly one mirror with 3 approved test
      accounts, unchanged (re-run/extend the existing coverage for this rather than assuming
      it still holds).
- [ ] `pnpm test` in `artifacts/api-server` — do not run it yourself (sandbox constraint);
      write only. Claude Code runs it after this dispatch returns.

## Do NOT touch
- Any query selecting rows from `users`, `students`, `assignments`, `case_logs`,
  `procedure_logs`, `academic_logs`, `leave_records`, `postings`, `research`,
  `assessments`, `attendance_logs`, `leave_applications`, `thesis_milestones`, `appraisals`.
  This task only inserts department/test-account rows, identical in shape to what
  `provisionDepartment()` already inserts today — it must never touch a clinical or log table.
- `artifacts/api-server/src/routes/superadmin.ts`'s `POST /users/:id/impersonate` route,
  `GET /departments`, `POST /departments`, `POST /departments/:id/replace-hod`,
  `GET /departments/:id/roster`, `POST /departments/:id/faculty`,
  `POST /departments/:id/students`, `POST /users/:id/deactivate`,
  `DELETE /departments/:id` (including its `deleteDepartmentCascade` helper) — all unchanged
  except the one new route added above.
- `artifacts/api-server/src/routes/auth.ts`, `artifacts/api-server/src/middlewares/auth.ts` —
  no change needed for this task; read-only if referenced at all, do not edit.
- `artifacts/api-server/src/lib/department-config-source.ts` — already correct, shipped,
  reviewed. Read-only reference, do not edit.
- Any migration file, `lib/db/src/migrations.ts`, `lib/db/src/schema/users.ts` — no schema
  change; `isTest`/`configSourceDepartmentId` already exist and need no new column, table, or
  constraint.
- Any `artifacts/mockup-sandbox` file other than `apiClient.ts`, `AdminPortal.tsx`.
- `provisionDepartment()`'s own call site and behavior on the create-department path — this
  task must not change what happens when a new department is created, only add a way to
  catch up departments that predate it.
- Any branch other than `feature/mirror-test-department`.
- `.env`, `TASK_LOG.md`, `STATUS.md`, `CURRENT_TASK.md` (read-only — do not edit it).
- `artifacts/api-server/tests/superadmin.test.ts`, `tests/auto-provision.test.ts`,
  `tests/delete-cascade.test.ts`, `tests/mirror-department.test.ts`,
  `tests/impersonation.test.ts` — do not modify any of these; add a new test file instead.
- Any file not named in `## Build` or `allowed_paths` above.
- Any shell command whatsoever, including `pnpm test`, `pnpm install`, `drizzle-kit
  generate/push/migrate`, `psql`, or `git` of any kind.

## Hard stops — stop and report, do not decide
- Any place `studentsTable.id` and `usersTable.id` could be conflated.
- Any schema change, migration, or database-connecting command.
- Anything that puts patient text or leave reasons near a log, error, or audit trail.
- Any secret, credential, or `.env` value.
- The task turning out to be more than described here.
- Any change to a code path enforcing ownership/authorization outside the exact scope named
  above — if you find yourself wanting to touch `requireAuth`, `requireRole`, the
  impersonation route, or any other route's authorization logic to make this work, stop
  instead of doing it.
- Any value you would otherwise guess or invent — if an unspecified detail is ambiguous, pick
  the most conservative, closest-to-existing-pattern choice and say so in `HANDOFF.md`,
  rather than inventing something novel.

## Report
Write `HANDOFF.md` at the repo root (append a new section; keep everything above it):
- Every file created or modified, with paths.
- Confirmation the extracted `provisionMirrorForRealDepartment` function is behaviorally
  identical to the original inline block — cite the file:line range of both the old location
  (pre-extraction, from memory/diff) and the new one.
- The exact selection logic used to find "real departments lacking a mirror", with file:line.
- Every test added, with the file and what it asserts — explicitly state you did not run
  them (sandbox constraint) and that pass/fail is unverified until Claude Code runs
  `pnpm test`.
- Anything you skipped, and why (including anything you could not do because it would have
  required a shell command).
- Anything you expanded beyond the Build list, and why.
- Anything that contradicts `CURRENT_TASK.md` or `AGENTS.md`.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.
