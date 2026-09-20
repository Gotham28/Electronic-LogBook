# Antigravity dispatch 34 — Auto-provision a paired test department

## Guard
This prompt is for "Electronic-LogBook" (Arogya platform, Pediatrics pilot), task file
`CURRENT_TASK.md` at the repo root, feature "auto-provision a paired test department". If
this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`, and not `pnpm test`. If you are tempted to
run one, don't; use file-reading tools instead (view a file, list a directory, search file
contents). A denied shell call is not something to work around and continue past — some
environments do not recover cleanly from one and simply stop the task instead of falling
back. Do the entire task using only file-reading and file-editing tools. Write tests as
files; do not attempt to run them — Claude Code runs `pnpm test` after this dispatch returns
and reports the real result.

The branch `feature/mirror-test-department` is already checked out for you, with the
already-shipped mirror-department feature sitting uncommitted on top of `main`. Do not check
out, create, or switch any branch. Do not run `git` at all.

## Read first
- `AGENTS.md` — all sections; §16 is a rule-map table (cited section numbers below already
  resolve through it)
- `CURRENT_TASK.md` — the confirmed scope in full
- `artifacts/api-server/src/lib/department-provisioning.ts` — the function you're extending
- `artifacts/api-server/src/lib/department-config-source.ts` — the existing
  `resolveConfigDepartmentId` helper (read-only reference; do not modify)
- `artifacts/api-server/src/routes/superadmin.ts` lines ~396-427 — the existing
  `POST /departments/:id/faculty` and `POST /departments/:id/students` routes, as the exact
  shape reference for creating the test professor and test student (same field set, same
  `studentsTable` row shape for the student)
- `lib/db/src/schema/users.ts` — `departmentsTable` (already has `isTest`,
  `configSourceDepartmentId`, both CHECK constraints — no schema change needed) and
  `usersTable` (`email` is `unique()`)
- `artifacts/api-server/tests/mirror-department.test.ts` and `tests/support.ts` — test style
  and fixture conventions to match

## Build
- [ ] Extend `provisionDepartment()` in `department-provisioning.ts` with a **second,
      separate `db.transaction`**, run after the real department's own transaction commits,
      before the existing best-effort welcome-email block. It must never roll back or fail
      the real department/HOD creation if this second step fails — wrap it the same way the
      existing email send is already wrapped (try/catch, log a warning, do not throw).
  - That second transaction:
    1. Inserts a mirror `departmentsTable` row: `isTest: true`, `configSourceDepartmentId` =
       the real department's id, name `` `${setup.name} (Test)` ``, a derived `code`
       respecting the existing regex (`^[a-zA-Z0-9_-]+$`, ≤32 chars — truncate `setup.code`
       as needed and append `-TEST`). Before inserting, check whether a mirror already
       exists for this real department id (`configSourceDepartmentId` has no unique
       constraint, so nothing else prevents a duplicate) — skip creating a second mirror if
       one is already found.
    2. Inserts an **approved** test HOD, professor, and student in the mirror department
       (`status: "approved"` immediately, not `"pending"`). The student needs a real
       `studentsTable` row too, in the same shape `superadmin.ts`'s student-creation route
       already uses.
    3. Does **not** insert any `department_configs`, `procedure_types`, or
       `department_catalog` row for the mirror department — leave those tables completely
       untouched by this transaction. They already resolve live through the existing
       `resolveConfigDepartmentId` helper wherever they're read; inserting rows here would
       create stale duplicates.
  - Test-account emails: deterministic, on the `.invalid` reserved TLD (e.g.
    `` `test-hod.${code}@elogbook.invalid` ``, and similarly for professor/student), so they
    can never collide with `usersTable.email`'s unique constraint or a real registrant.
    Passwords: random, bcrypt-hashed the same way every other account in this file already
    is (`bcrypt.hash(password, 12)`). Do **not** call `sendAccountCreatedEmail` for these
    three accounts — skip it entirely, don't attempt-and-catch it.
- [ ] Tests in `artifacts/api-server/tests/` (new file, or extend `mirror-department.test.ts`
      — your judgement on which reads more naturally) covering exactly:
  - Creating a department also produces a discoverable mirror: `isTest: true`,
    `configSourceDepartmentId` correct, with an approved test HOD, professor, and student.
  - Calling `provisionDepartment()` twice with the same `code` does not duplicate the mirror
    department or its three accounts.
  - The three test-account emails never collide with real fixture emails and are on the
    `.invalid` TLD.
  - No test in this file inserts, updates, or reads `case_logs`, `procedure_logs`,
    `academic_logs`, or any other clinical/log table.
  - Do not run these tests — write only, per the sandbox constraint above.

## Do NOT touch
- Any query selecting rows from `users`, `students`, `assignments`, `case_logs`,
  `procedure_logs`, `academic_logs`, `leave_records`, `postings`, `research`,
  `assessments`, `attendance_logs`, `leave_applications`, `thesis_milestones`, `appraisals`
  — this task creates department/HOD/professor/student rows only. It must never touch a
  clinical or log table in any way.
- `department_configs`, `procedure_types`, `department_catalog` — do not insert rows into
  these for the mirror department under any circumstance.
- `DELETE /api/superadmin/departments/:id` and every other existing route in
  `routes/superadmin.ts` — only add to `provisionDepartment()` itself; do not modify any
  route handler, including the one that calls it.
- `artifacts/api-server/src/lib/department-config-source.ts` — already correct, shipped,
  and reviewed. Read-only reference, do not edit.
- Any existing migration file, `lib/db/src/migrations.ts`'s `files` array, or
  `lib/db/src/schema/users.ts` — this task needs no schema change; `isTest` and
  `configSourceDepartmentId` already exist. Do not touch any of these files.
- `artifacts/mockup-sandbox/**` — no frontend file, of any kind.
- Any branch other than `feature/mirror-test-department`.
- `.env`, `TASK_LOG.md`, `STATUS.md`, `CURRENT_TASK.md` (read-only — do not edit it).
- Any file not named in `## Build` or `allowed_paths` above.
- Any shell command whatsoever, including `pnpm test`, `pnpm install`, `drizzle-kit
  generate/push/migrate`, `psql`, or `git` of any kind.

## Hard stops — stop and report, do not decide
- Any place `studentsTable.id` and `usersTable.id` could be conflated.
- Any schema change, migration, or backfill — none is in scope; this task is pure `INSERT`
  logic against existing columns.
- Anything that puts patient text or leave reasons near a log, error, or audit trail.
- Any secret, credential, or `.env` value. The three generated passwords must be
  bcrypt-hashed exactly like every other account, never logged, never printed, never
  emailed to a real address.
- The task turning out to be more than one feature (e.g. do not also build the admin
  "log in as" feature — that is a separate, later task).
- Any value you would otherwise guess or invent — if the exact derived `code`/email format
  is ambiguous for some edge case (e.g. a `setup.code` already very close to 32 characters),
  say so in `HANDOFF.md` and pick the most conservative truncation rather than guessing at
  something clever.

## Report
Write `HANDOFF.md` at the repo root (append a new section; the file already has content from
the prior mirror-department task — keep it, add below it):
- Every file created or modified, with paths.
- The exact transaction logic added: department-mirror insert, HOD/professor/student insert,
  the duplicate-mirror guard, and confirmation `department_configs`/`procedure_types`/
  `department_catalog` were never touched.
- Every test added, with the file and what it asserts — explicitly state you did not run
  them (sandbox constraint) and that pass/fail is unverified until Claude Code runs
  `pnpm test`.
- Anything you skipped, and why (including anything you could not do because it would have
  required a shell command).
- Anything you expanded beyond the Build list, and why.
- Anything that contradicts `CURRENT_TASK.md` or `AGENTS.md`.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/src/lib/department-provisioning.ts
- artifacts/api-server/tests/