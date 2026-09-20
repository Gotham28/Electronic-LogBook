# Antigravity dispatch 15 — delete department (Item 2)

## Guard
This prompt is for the project `Electronic-LogBook-main`, task file `CURRENT_TASK.md`
at the repo root (Item 2 of that file), dated 2026-09-14. If this is not that repo,
stop, say which repo this is, and wait.

## Sandbox constraint — overrides AGENTS.md §1 for this dispatch only
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents).

`AGENTS.md` §1 tells every agent task to begin with `git status` / `git pull` / `git log`.
**Do not follow that instruction in this dispatch.** The developer's own session already
completed that pull-before-task step before this prompt was sent, and your execution
environment has no shell access at all — attempting any of those commands will be denied
and you will have nothing left to fall back on. Skip §1 entirely and start directly at
"Build" below using only file-reading and file-editing tools.

This also means you cannot run any test command, `pnpm test`, `pnpm typecheck`, or any DB
migration/query tool yourself. Write the tests; do not try to run them. That verification
step happens outside this dispatch, in the developer's own shell.

## Read first
- `AGENTS.md` §0 (what this project is — production, real patients, no staging), §3
  (ownership before data), §4 (the two ID systems), §7 (no fabricated data), §8 (never log
  patient text), §9 (one feature per diff), §14 (execution model) — skip §1, see above
- `CURRENT_TASK.md` — the confirmed scope (this dispatch covers Item 2 only; Item 1 is
  already reviewed and accepted, its changes are already in the working tree — do not
  revert or alter them)
- `artifacts/api-server/src/routes/superadmin.ts` and `artifacts/api-server/src/routes/admin.ts`
  — existing conventions to match (validation, `router.param`, the FK-violation 409 pattern
  in `admin.ts`'s `DELETE /users/:id`)
- `artifacts/api-server/src/lib/validation.ts` — `idSchema` and `validate()` helpers
- Schema files: `lib/db/src/schema/users.ts`, `department_configs.ts`, `department_catalog.ts`,
  `procedure_types.ts`, `assignments.ts` (the direct FK dependents of `departments.id`)

## Required investigation before writing the cascade — do this first, do not skip
A repo-wide search (already run by the developer, for your reference — verify it yourself
too) shows these files reference `usersTable` and/or `assignmentsTable` via foreign key:
`lib/db/src/schema/payments.ts`, `students.ts`, `research.ts`, `logs.ts` (this is where
`case_logs`, `procedure_logs`, `academic_logs` almost certainly live — confirm the exact
table names), `assignments.ts`, `leave.ts` (`leave_records`), `postings.ts`, `progress.ts`,
`assessments.ts`, `appraisals.ts`, `audit.ts`, `attendance.ts`.

Open every one of these files and record, for each: the table name, the column that
references `usersTable`/`assignmentsTable`, whether it is nullable, and whether an
`onDelete` cascade is specified (if none is specified, Postgres defaults to `NO ACTION` —
meaning the database itself will reject a hard-delete of a referenced row with error code
`23503`, which is the safe outcome, not a cascade).

This tells you concretely how dangerous "hard-delete every user in this department" really
is: if `case_logs`/`academic_logs`/`procedure_logs`/etc. reference a professor or HOD via
`supervisorId`/`reviewedBy`/similar, then hard-deleting that professor/HOD will fail at the
database level for any department that has ever had a supervised or reviewed log entry —
which in practice means **this feature is expected to legitimately refuse to fully delete
any department with real clinical activity, including the Pediatrics pilot department.**
That is correct, intended behavior, not a bug to engineer around. Do not add `onDelete:
"cascade"` to any of these existing schema relationships to make the hard-delete "succeed" —
that would be a schema change (AGENTS.md §6, and a §14.5 hard stop on its own) and would
silently destroy real clinical records. Do not attempt this under any circumstance.

## Build

**Backend — `artifacts/api-server/src/routes/superadmin.ts`:**
- [ ] Add `DELETE /departments/:id`, reusing the existing `router.param("id", ...)`
  numeric-id guard and this router's existing `requireRole(["admin"])` gate.
- [ ] Inside a single DB transaction: hard-delete every row in `users` with that
  `department_id`; delete dependent rows scoped to the department in
  `department_configs`, `department_catalog`, `procedure_types`, `assignment_types`, and
  `assignments`; then delete the `departments` row itself.
- [ ] Wrap the whole transaction so that any Postgres FK-violation (`error.code ===
  "23503"`) — expected per the investigation above, whenever real clinical data is
  attached — is caught and returned as `409` with a clear message (e.g. "This department
  has faculty, residents, or records that reference clinical data and cannot be deleted.
  Remove or reassign them first."), mirroring the existing pattern in `admin.ts`'s
  `DELETE /users/:id`. Do not let a raw Postgres error reach the client as a 500.
- [ ] Structured `req.log.info` / `req.log.error({...})` on delete attempt and outcome — id
  and status only. Never log patient text or leave reasons (§8).
- [ ] Extend `artifacts/api-server/tests/superadmin.test.ts` (reuse the existing
  `./database.js` test helper already imported there, which exposes `engine, db,
  usersTable, studentsTable, caseLogsTable` — do not build new test infrastructure). Cover:
  (a) success — deleting a freshly-created, empty test department (no users, no logs)
  actually removes it and its config/catalog/procedure-type rows; (b) 404 on an unknown id;
  (c) the 409 fallback path — create a test department with at least one user that has an
  attached `case_logs` row (via the existing `caseLogsTable` import), attempt to delete the
  department, and confirm it returns 409 and that nothing was actually deleted (the
  transaction rolled back cleanly — verify the department, user, and log row still exist
  afterward).

**Frontend — `artifacts/mockup-sandbox/src/lib/apiClient.ts` and
`artifacts/mockup-sandbox/src/components/AdminPortal.tsx`:**
- [ ] Add `deleteAdminDepartment(id: number)` to `apiClient.ts` using the existing
  `apiDelete` helper, calling `/api/superadmin/departments/${id}` — same pattern as
  `getAdminDepartments` / `createAdminDepartment`.
- [ ] Add a destructive-styled delete action on each department card / in
  `DepartmentDetail`. This performs a hard, cascading delete of real user accounts — do
  not use a bare `window.confirm`; show a real confirmation dialog naming the department
  and stating plainly what will be removed (its faculty, residents, HOD, and all
  department-scoped configuration). On success, refresh the department list. On any error
  response — including the 409 case, which is expected to be common — surface a visible,
  specific error state using the server's message. No silent failure, no mock or fallback
  data (§7).

## Do NOT touch
- Any file other than: `artifacts/api-server/src/routes/superadmin.ts`,
  `artifacts/api-server/tests/superadmin.test.ts`,
  `artifacts/mockup-sandbox/src/lib/apiClient.ts`,
  `artifacts/mockup-sandbox/src/components/AdminPortal.tsx`
- Do not revert or modify the density/spacing changes already present in `AdminPortal.tsx`
  from the prior accepted dispatch — only add the new delete action to it
- No schema file, no migration, no `onDelete` cascade addition anywhere (see investigation
  section above — this is absolute)
- Any shell command whatsoever, including any test-runner or typecheck invocation
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- If your investigation finds that deleting a user or an `assignments`/`procedure_types`
  row would silently cascade (rather than being blocked by the database) into any of the
  clinical tables named above — i.e. you find an existing `onDelete: "cascade"` you did not
  expect — **stop immediately, do not write the delete transaction, and report exactly
  which table/column has the cascade** in `HANDOFF.md` for developer review instead.
- Any change to a code path enforcing the §3/§4 ownership boundary beyond what's
  explicitly scoped above (the `requireRole(["admin"])` gate and `router.param("id", ...)`
  guard already exist — reuse them, don't rewrite them)
- Any migration, backfill, deploy, or other irreversible step
- Any value you would otherwise guess or invent

## Report
Write `HANDOFF.md` at the repo root (overwrite the prior dispatch's report — that one is
already reviewed and safely in git history):
- The investigation findings: table name, referencing column, nullability, and onDelete
  behavior for each of the ~12 files checked
- What changed, per file, with file:line evidence
- The three test scenarios added and what each one demonstrates
- Anything you skipped, and why (including anything you could not do because it would have
  required a shell command — name the exact command a human should run instead)
- Anything you expanded beyond the Build list, and why

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.

## Model
Claude Opus 4.6 (Thinking) — per this task's review tier (hard-deletion of `users` rows,
cascading deletes adjacent to ownership-relevant clinical data — AGENTS.md §3/§15.2).


## Files you may touch
- artifacts/api-server/src/routes/superadmin.ts
- artifacts/api-server/tests/superadmin.test.ts
- artifacts/mockup-sandbox/src/lib/apiClient.ts
- artifacts/mockup-sandbox/src/components/AdminPortal.tsx
- HANDOFF.md