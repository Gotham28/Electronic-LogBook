# Antigravity dispatch 35 — Auto-provision: delete-cascade fix + regression fixes

## Guard
This prompt is for "Electronic-LogBook" (Arogya platform, Pediatrics pilot), task file
`CURRENT_TASK.md` at the repo root, feature "auto-provision a paired test department" — this
is a fix round following dispatch 34, whose real diff Claude Code already read directly and
whose test suite Claude Code already ran directly, finding 3 real regressions (not test
bugs) plus 2 fixture bugs in its own new tests. If this is not that repo, stop, say which
repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`, and not `pnpm test`. If you are tempted to
run one, don't; use file-reading tools instead (view a file, list a directory, search file
contents). A denied shell call is not something to work around and continue past — some
environments do not recover cleanly from one and simply stop the task instead of falling
back. Do the entire task using only file-reading and file-editing tools. Write/fix tests as
files; do not attempt to run them — Claude Code runs `pnpm test` after this dispatch returns
and reports the real result.

The branch `feature/mirror-test-department` is already checked out for you. Do not check
out, create, or switch any branch. Do not run `git` at all.

## Read first
- `AGENTS.md` — all sections; §16 is a rule-map table (cited section numbers already
  resolve through it)
- `CURRENT_TASK.md` — the confirmed, revised scope in full, especially the
  `## Revision (2026-09-17, mid-task)` section near the top
- `artifacts/api-server/src/lib/department-provisioning.ts` — dispatch 34's already-shipped
  extension (the second `db.transaction` near the bottom of `provisionDepartment()`) — do
  not change its core logic, only the one logging line described below
- `artifacts/api-server/src/routes/superadmin.ts` lines 176-306 — the `DELETE
  /departments/:id` route you are extending. Read it in full; it is reproduced in the Build
  section below for exact line references, but the live file is the source of truth
- `artifacts/api-server/tests/auto-provision.test.ts` — dispatch 34's own new test file,
  which has a fixture bug (see Build)
- `artifacts/api-server/src/lib/validation.ts` — `configSchema`'s real fields

## What's wrong (confirmed by Claude Code directly, not claimed)
Running `pnpm test`: 92 pass / 5 fail out of 97.
1. **Real regression, 3 tests**: `superadmin.test.ts`'s `admin can delete an empty
   department...`, `admin can delete a department that has assignments...`, and `delete
   department cleans up cross-department assignment recipients...` all now fail, `409`
   instead of `200`. Root cause: `POST /superadmin/departments` now always creates a mirror
   (dispatch 34), and `DELETE /departments/:id` has no awareness of it. The FK
   `departments_config_source_department_id_departments_id_fk` (`ON DELETE no action`)
   blocks deleting the real department while its mirror still references it — the raw
   Postgres `23503` falls through to the route's generic handler (`superadmin.ts:295-302`),
   producing the misleading 409. This is not an edge case: every department created through
   the normal flow now has a mirror, so every department is currently undeletable.
2. **Fixture bug, 2 tests**: `auto-provision.test.ts`'s first test's `config` object uses
   field names (`requireGps`, `blockBackdatedLogs`, `allowRetrospectiveLeave`) that don't
   exist on `configSchema` (`artifacts/api-server/src/lib/validation.ts:13-17` — the real
   fields are `requiredCases`, `requiredProcedures`, `requiredAcademic`,
   `programDurationMonths`, `casualLeaveAllowance`, `academicLeaveAllowance`), so
   `provisionDepartment()` throws a `ZodError` on input validation before it even runs.

## Build

### 1. Delete-cascade fix (superadmin.ts, DELETE /departments/:id only)
Extract the existing per-department delete logic — everything currently inside the route's
`db.transaction` callback from "2. Collect user IDs..." (`superadmin.ts:190`) through "4.
Delete the department row itself" (`superadmin.ts:279`), i.e. NOT the initial existence
check at lines 180-188 — into a small reusable async helper, e.g.
`deleteDepartmentCascade(tx, departmentId): Promise<void>`, in the same file. It must:
- Do the exact same collection (userIds/studentIds/assignmentIds), the exact same
  clinical-conflict pre-check across the same 11 tables in the same order, and the exact
  same FK-safe delete order — byte-for-byte the same logic, just parameterized by
  `departmentId` instead of hardcoded to the route's own local variable, so behavior for the
  route's existing (non-mirror) callers is provably unchanged.
- Throw the exact same sentinel-error shape on conflict (`err.statusOverride = 409;
  err.conflictMessage = ...`) so the route's existing `catch` block handles it without
  changes. When called for a mirror department, prefix the conflict message so it's
  distinguishable from a conflict on the target department itself (e.g. `` `Cannot delete
  the linked test department (id ${departmentId}) due to existing clinical data: ...` ``) —
  this should be unreachable in practice (mirrors are never supposed to have clinical data)
  but must fail with a clear message rather than a confusing one if it ever happens.

Then change the route handler itself to, inside the same transaction, after the existing
department-existence check (lines 180-188) and before calling the new helper for the target:
- Look up every department where `configSourceDepartmentId` equals the target
  `departmentId` (there should be at most one by design, but do not assume — handle zero or
  more).
- For each one found, call `deleteDepartmentCascade(tx, mirror.id)` — deleting the mirror
  and everything under it completely, before touching the target department at all.
- Then call `deleteDepartmentCascade(tx, departmentId)` for the target department itself —
  this replaces the route's current inline logic at lines 190-279.
- Leave the existence check (180-188), the final `req.log.info`/response (282-283), and the
  entire `catch` block (284-305) exactly as they are — they already handle everything the
  helper can throw.

Do not touch any other route in this file.

### 2. Fix `auto-provision.test.ts`'s fixture bug
In the first test, either fix the `config` object's field names to match `configSchema`
exactly, or remove the `config` key from the test input entirely (it's optional on
`setupSchema`) — whichever keeps the test's actual intent (verifying the auto-provisioned
mirror never gets its own `department_configs`/`procedure_types` rows) clearest. Prefer
removing it if that assertion doesn't depend on the real department having a config, since
the mirror-config-absence check only cares about the mirror side.

### 3. Fix the raw-error logging (department-provisioning.ts)
Dispatch 34 added `console.warn(\`Failed to provision mirror test department for
${setup.code}:\`, error);`. Change it to log a string only, no `error` argument — matching
the pattern the pre-existing email-failure catch two lines below it already uses (`
console.warn(\`HOD account created but welcome email failed to send to
${setup.hod.email}\`);` takes no second argument). Keep the department code in the message
for debuggability, just drop the raw error object.

### 4. New tests for the delete-cascade fix, in `auto-provision.test.ts` or a new file — your
   judgement on which reads more naturally
- Create a real department (which auto-provisions its mirror, per dispatch 34). `DELETE` the
  real department. Assert `200`. Then assert, via direct query, that BOTH the real
  department's row AND the mirror's row are gone from `departmentsTable`, and that the
  mirror's 3 test-account `usersTable` rows (and the test student's `studentsTable` row) are
  also gone.
- Confirm the 3 pre-existing `superadmin.test.ts` delete-department tests are unaffected —
  you do not need to touch that file at all if the extraction in Build item 1 is truly
  behavior-preserving for the non-mirror case; do not modify `superadmin.test.ts`.
- One case proving the pre-check still works for the real department's OWN clinical-data
  conflicts (should already be covered by the existing `superadmin.test.ts` tests once they
  pass again — do not duplicate that coverage here, just don't break it).
- Do not run any of these tests — write only, per the sandbox constraint above.

## Do NOT touch
- Any query selecting rows from `users`, `students`, `assignments`, `case_logs`,
  `procedure_logs`, `academic_logs`, `leave_records`, `postings`, `research`,
  `assessments`, `attendance_logs`, `leave_applications`, `thesis_milestones`, `appraisals`
  — this task deletes department/HOD/professor/student rows and the pre-existing 11-table
  clinical-conflict pre-check, exactly as already written. Do not weaken, skip, or alter the
  pre-check's logic, tables, or order in any way while extracting it into the helper.
- Every route in `superadmin.ts` except `DELETE /departments/:id`. `POST /departments`,
  `POST /departments/:id/replace-hod`, `GET /departments`, `GET /departments/:id/roster`,
  `POST /departments/:id/faculty`, `POST /departments/:id/students`,
  `POST /users/:id/deactivate` are all unchanged.
- `resolveConfigDepartmentId()` / `artifacts/api-server/src/lib/department-config-source.ts`
  — read-only reference, do not edit.
- Any existing migration file, `lib/db/src/migrations.ts`'s `files` array, or
  `lib/db/src/schema/users.ts` — no schema change in this task.
- `artifacts/mockup-sandbox/**` — no frontend file, of any kind.
- Any branch other than `feature/mirror-test-department`.
- `.env`, `TASK_LOG.md`, `STATUS.md`, `CURRENT_TASK.md` (read-only — do not edit it).
- `artifacts/api-server/tests/superadmin.test.ts` — do not modify it; the fix should make it
  pass again unchanged.
- Any file not named in `## Build` or `allowed_paths` above.
- Any shell command whatsoever, including `pnpm test`, `pnpm install`, `drizzle-kit
  generate/push/migrate`, `psql`, or `git` of any kind.

## Hard stops — stop and report, do not decide
- Any place `studentsTable.id` and `usersTable.id` could be conflated.
- Any schema change, migration, or backfill.
- Anything that puts patient text or leave reasons near a log, error, or audit trail.
- Any secret, credential, or `.env` value.
- The task turning out to be more than described here (e.g. do not also build Task C).
- Any value you would otherwise guess or invent — if the exact conflict-message wording for
  a mirror-side conflict is ambiguous, pick the most literal, unambiguous phrasing rather
  than something clever.

## Report
Update `HANDOFF.md` (append a new section; keep everything above it):
- Every file changed, mapped 1:1 to which of the 4 Build items it addresses.
- Confirmation the extraction in item 1 is behavior-preserving for the non-mirror case
  (walk through why, referencing the original line numbers).
- Every test added/changed, with the file and what it asserts — explicitly state you did not
  run them (sandbox constraint) and that pass/fail is unverified until Claude Code runs
  `pnpm test`.
- Anything you skipped, and why.
- Anything you expanded beyond this list, and why.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/src/lib/department-provisioning.ts
- artifacts/api-server/src/routes/superadmin.ts
- artifacts/api-server/tests/