# Antigravity dispatch 36 — Auto-provision: final review-finding fixes

## Guard
This prompt is for "Electronic-LogBook" (Arogya platform, Pediatrics pilot), task file
`CURRENT_TASK.md` at the repo root, feature "auto-provision a paired test department" — this
is the third and expected-final fix round on this task, following a 4-lens code review of
dispatch 35 that found 2 Major and 4 Minor findings, all addressed below. If this is not
that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`, and not `pnpm test`. If you are tempted to
run one, don't; use file-reading tools instead. A denied shell call is not something to work
around and continue past — some environments do not recover cleanly from one and simply stop
the task instead of falling back. Do the entire task using only file-reading and
file-editing tools. Write/fix tests as files; do not attempt to run them — Claude Code runs
`pnpm test` after this dispatch returns and reports the real result.

The branch `feature/mirror-test-department` is already checked out for you. Do not check
out, create, or switch any branch. Do not run `git` at all.

## Read first
- `CURRENT_TASK.md` — the confirmed, revised scope in full
- `artifacts/api-server/src/lib/department-provisioning.ts` — the current state of
  `provisionDepartment()`'s mirror-provisioning block
- `artifacts/api-server/src/routes/superadmin.ts` — the current state of
  `deleteDepartmentCascade()` and the `DELETE /departments/:id` route
- `artifacts/api-server/tests/auto-provision.test.ts` and `tests/delete-cascade.test.ts` —
  the existing test files you're extending
- `artifacts/api-server/tests/support.ts` — the captured-mail test transport (look for
  `mail`, around lines 15-19) you'll use for Build item 4

## Build

### 1. (Major) Skip the clinical-conflict pre-check for mirror departments
`deleteDepartmentCascade(tx, targetDepartmentId, isMirror)` currently runs the same
11-table clinical-conflict pre-check for a mirror department as it does for a real one, and
throws a 409 if the mirror has any. This is wrong: a mirror department's data is synthetic
test data, disposable by design — that is the entire premise of this feature. Once a future
task lets a test account create case/procedure/academic logs, this would make the real
department undeletable too, since the mirror is checked first inside the same transaction.
Change the function so that when `isMirror === true`, it skips the `conflicts.length > 0`
throw entirely (still run the collection/checks if you want the count for logging, but never
throw) and always proceeds straight to deleting the mirror's rows in the existing FK-safe
order. The target department (`isMirror === false`) keeps its exact current behavior —
conflicts still block deletion exactly as before. This is the only behavior change in this
item; do not alter the delete order or the table list for either case.

### 2. (Major) Add the missing "conflict + mirror present" test
In `delete-cascade.test.ts` (or a new test in the same file), add a case: create a real
department (which auto-provisions a mirror), seed a clinical-table row that conflicts for
the REAL department specifically (follow the existing pattern in
`superadmin.test.ts`'s "delete department returns 409 when clinical data blocks the delete"
test for how to seed a conflicting row), then call `DELETE /departments/:id` on the real
department and assert: `409`, the real department row still exists afterward, AND the
mirror department row still exists afterward (nothing was deleted, real transaction
rollback). This is the exact scenario `CURRENT_TASK.md`'s Verification list asked for and
was previously untested.

### 3. (Minor) Three separate passwords, not one shared
In `provisionDepartment()`'s mirror-provisioning block, generate a separate
`crypto.randomBytes(16).toString("hex")` (and a separate `bcrypt.hash(...)` call) for each
of the 3 test accounts (HOD, professor, student) instead of reusing one `randomPass`/
`testPasswordHash` for all three.

### 4. (Minor) Assert no real email is sent for the 3 mirror accounts
In `auto-provision.test.ts`'s first test, import the captured-mail test transport from
`tests/support.ts` (the same one `superadmin.test.ts` and other files already use — follow
its existing usage pattern) and assert that no email was captured for any of the 3 mirror
account addresses (`test-hod.*@elogbook.invalid`, etc.) after `provisionDepartment()` runs —
in addition to, not instead of, the existing `.endsWith("@elogbook.invalid")` checks.

### 5. (Minor) Collision-proof mirror department code
Currently `testCode = setup.code.slice(0, 27) + "-TEST"`, which can collide if two real
department codes share their first 27 characters, and cannot be retried once the real
department has an approved HOD (the mirror is then permanently missing). Change the derived
code to be based on the real department's own numeric `id` instead of a truncated string —
e.g. `` `TEST-${department.id}` `` (or similar, staying within the existing
`^[a-zA-Z0-9_-]+$`, ≤32-char constraint) — department ids are unique and short, so this
removes the collision risk entirely. Keep the mirror's `name` (`` `${setup.name} (Test)` ``)
unchanged.

### 6. (Minor) Explicit "no database command" statement in HANDOFF.md
When you write this dispatch's HANDOFF.md section, include the literal sentence: "No command
in this dispatch connected to or altered any database." (Your report already didn't run any
such command — this is a wording fix to satisfy AGENTS.md §6's exact reporting requirement,
not a behavior change.)

## Do NOT touch
- Any query selecting rows from `users`, `students`, `assignments`, `case_logs`,
  `procedure_logs`, `academic_logs`, `leave_records`, `postings`, `research`,
  `assessments`, `attendance_logs`, `leave_applications`, `thesis_milestones`, `appraisals`
  — except exactly the one behavior change described in Build item 1 (skip-conflict-check
  for `isMirror === true` only). Do not touch which tables are checked or how, for the
  non-mirror (real department) case — that logic stays byte-for-byte identical.
- Every route in `superadmin.ts` except `DELETE /departments/:id`.
- `resolveConfigDepartmentId()` / `artifacts/api-server/src/lib/department-config-source.ts`.
- Any migration file, `lib/db/src/migrations.ts`, `lib/db/src/schema/users.ts` — no schema
  change in this task.
- `artifacts/mockup-sandbox/**` — no frontend file.
- Any branch other than `feature/mirror-test-department`.
- `.env`, `TASK_LOG.md`, `STATUS.md`, `CURRENT_TASK.md` (read-only).
- `artifacts/api-server/tests/superadmin.test.ts` — do not modify it.
- Any file not named in `## Build` or `allowed_paths` above.
- Any shell command whatsoever, including `pnpm test`, `git`, or any DB-connecting command.

## Hard stops — stop and report, do not decide
- Any place `studentsTable.id` and `usersTable.id` could be conflated.
- Any schema change, migration, or backfill.
- Anything that puts patient text or leave reasons near a log, error, or audit trail.
- Any secret, credential, or `.env` value.
- The task turning out to be more than described here.
- Any value you would otherwise guess or invent.

## Report
Update `HANDOFF.md` (append a new section; keep everything above it):
- Every file changed, mapped 1:1 to which of the 6 Build items it addresses.
- Every test added/changed, with the file and what it asserts — explicitly state you did not
  run them and that pass/fail is unverified until Claude Code runs `pnpm test`.
- The literal database-command statement required by Build item 6.
- Anything you skipped, and why.
- Anything you expanded beyond this list, and why.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/src/lib/department-provisioning.ts
- artifacts/api-server/src/routes/superadmin.ts
- artifacts/api-server/tests/