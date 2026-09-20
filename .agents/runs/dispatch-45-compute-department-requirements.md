# Antigravity dispatch 45 — Compute department requirements from the Training Catalog

## Guard
This prompt is for the project at Electronic-LogBook (Gotham28/Electronic-LogBook), task file `CURRENT_TASK.md` (repo root, not `.agents/`) dated 2026-09-19. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. The developer has already confirmed the
repo is up to date; that step is done and is not part of your task. Do not run typecheck,
lint, or the test suite yourself either — all verification happens outside this dispatch,
in Claude Code, after you finish. Do the entire task using only file-reading and
file-editing tools.

## Read first
- `CURRENT_TASK.md` (repo root) — the confirmed scope
- `artifacts/api-server/src/routes/admin.ts` — the six mutation routes and the config route, in full
- `artifacts/api-server/src/lib/validation.ts` — the schema gating `POST /department/config`
- `lib/db/src/schema/department_configs.ts`, `department_catalog.ts`, `procedure_types.ts` — exact column names and types
- `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx` — the "Department requirements" card and its submit handler
- `artifacts/api-server/tests/catalog-competency.test.ts`, `catalog-delete.test.ts`, `catalog-leave-type.test.ts`, `mirror-department.test.ts` — existing fixtures/assertions in this area

## Build
- [ ] Add a helper (in `admin.ts` or a new/existing lib file under `artifacts/api-server/src/lib/`) that, given a department id, recomputes and stores into that department's `department_configs` row:
  - `requiredProcedures` = SUM of `required` across all `procedure_types` rows for that department (no period filter — procedure types have no period column).
  - `requiredCases` = SUM of `required` across `department_catalog` rows for that department where `kind = 'case_category'` AND `period = 'total'` (rows with `period = 'month'` are excluded entirely from the sum).
  - `requiredAcademic` = SUM of `required` across `department_catalog` rows for that department where `kind = 'academic'` AND `period = 'total'` (same exclusion).
  - If no `department_configs` row exists yet for the department, insert one with these computed values (leave `programDurationMonths`/`casualLeaveAllowance`/`academicLeaveAllowance` unset/null on a fresh insert, matching current behavior for a department with no config yet); if one exists, update only these three columns, leaving the other three columns exactly as they are.
- [ ] Call the relevant part of this helper (recompute just the one or two fields actually affected) after each of these six routes successfully completes its mutation: `POST /department/procedures`, `PATCH /department/procedures/:id`, `DELETE /department/procedures/:id` (each affects `requiredProcedures`); `POST /department/catalog` (only when `kind` is `case_category` or `academic` — `posting`/`competency_level`/`leave_type` don't affect any total, so no recompute needed for those), `PATCH /department/catalog/:id`, `DELETE /department/catalog/:id` (affects `requiredCases` or `requiredAcademic` depending on that row's `kind`).
- [ ] In `POST /department/config`, stop reading `requiredCases`/`requiredProcedures`/`requiredAcademic` from `req.body` and stop writing them in either the update or insert branch — this route should only ever write `programDurationMonths`, `casualLeaveAllowance`, `academicLeaveAllowance` from now on.
- [ ] In `artifacts/api-server/src/lib/validation.ts`, remove `requiredCases`/`requiredProcedures`/`requiredAcademic` from whatever schema object gates `POST /department/config`, since the client no longer sends them.
- [ ] In `DepartmentSettings.tsx`'s "Department requirements" card: change `requiredCases`, `requiredProcedures`, `requiredAcademic` from editable `<Input>` fields to a read-only display of their current value (e.g. plain text or a disabled input — your choice, but it must not accept user input). Keep `programDurationMonths`, `casualLeaveAllowance`, `academicLeaveAllowance` exactly as editable inputs, unchanged. Update the submit handler so it no longer includes the three computed fields in the request body sent to `POST /department/config`.
- [ ] Read the four named test files. If any assertion depends on the old behavior (e.g. expects `POST /department/config` to accept and store a manually-supplied `requiredCases` value, or expects a catalog/procedure mutation to leave `department_configs` unchanged), update that specific assertion to match the new computed behavior. Do not add new test files — only adjust existing assertions if they now assert something false.

## Do NOT touch
- `GET /department/config` and `GET /department/procedures` — already correct, do not modify.
- `admin.ts:549-551`, `artifacts/api-server/src/routes/department.ts`, `professor.ts`, `student.ts`, `artifacts/mockup-sandbox/src/components/Dashboard.tsx` — all read the computed columns correctly already; no changes needed anywhere in these files.
- The "mirror department" 403 guard (`configSourceDepartmentId !== null` checks) in any of the six routes — leave exactly as is.
- Any schema file — no new columns, no migration, this task only changes what writes to existing columns.
- Any file in `artifacts/mockup-sandbox` other than `DepartmentSettings.tsx`.
- Any clinical table or ownership-resolution code.
- Anything not named under Build above.

## Hard stops — stop and report, do not decide
- Any change to a route or query touching the clinical tables, or to anything resolving ownership server-side (AGENTS.md §3).
- Any place `studentsTable.id` and `usersTable.id` could be conflated (AGENTS.md §4).
- Any schema change, migration, or backfill (AGENTS.md §6) — if you find yourself needing a new column or table, stop and report instead.
- Anything that puts patient text or leave reasons near a log, error, or audit trail (AGENTS.md §8).
- Any secret, credential, or `.env` value (AGENTS.md §10, §13).
- The task turning out to be more than one feature (AGENTS.md §9).
- Any value you would otherwise guess or invent.

## Report
Write `HANDOFF.md` at the repo root:
- What changed, per file, and why — including the exact SQL/query logic used for each of the three sums, quoted.
- Which of the four named test files, if any, needed an assertion updated, and exactly what changed and why.
- Anything you skipped, and why.
- Anything you expanded beyond the Build list, and why.

Do not attempt to run typecheck, lint, or the test suite — that verification happens outside
this dispatch, in Claude Code, after you finish. A claim without file:line evidence is
recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
Claude Sonnet 4.6 (Thinking)
