# Antigravity dispatch 17 — fix Item 2 review findings (delete order, missing pre-check, frontend crash)

## Guard
This prompt is for the project `Electronic-LogBook-main`, task file `CURRENT_TASK.md`
at the repo root (fixes to Item 2's already-written code, from a completed code review),
dated 2026-09-14. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint — overrides AGENTS.md §1 for this dispatch only
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. Use file-reading tools only. You cannot
run `pnpm test`/`pnpm typecheck` — the developer runs those themselves after your fix.

## Context
A four-lens code review of the delete-department feature (`DELETE
/api/superadmin/departments/:id` in `artifacts/api-server/src/routes/superadmin.ts`, plus
its tests and a frontend delete UI in `AdminPortal.tsx`/`apiClient.ts`) found two Critical
and one Major bug. This dispatch fixes all three, plus two cheap Minor gaps found in the
same review. Verdict was **reject** — do not treat any part of the existing implementation
as presumptively correct; verify everything you touch against the actual schema files.

## Finding 1 (Critical) — delete order violates FK constraints
`superadmin.ts`'s `DELETE /departments/:id` transaction currently deletes `usersTable`
*before* `assignmentsTable` and `assignmentTypesTable`. But `assignmentsTable.facultyId`
and `assignmentTypesTable.createdBy` (see `lib/db/src/schema/assignments.ts`) are both
`NOT NULL` foreign keys to `usersTable.id`. Any department that has ever used the
Assignments feature will hit a Postgres FK violation on the users-delete step — the
transaction correctly rolls back (no data loss), but the operation fails for essentially
every real department, and the 409 response misleadingly says "has faculty, residents, or
records that reference clinical data" when the actual blocker is an internal ordering bug,
not real clinical data.

**Fix**: reorder the transaction's deletes so nothing is deleted before a row that still
references it. Read `lib/db/src/schema/assignments.ts`, `students.ts`,
`department_configs.ts`, `department_catalog.ts`, `procedure_types.ts` yourself to confirm
the full dependency graph rather than trusting this summary — but the corrected order is
expected to be approximately: `assignment_recipients` → `assignments` → `assignment_types`
→ `students` → `users` → `department_configs`/`department_catalog`/`procedure_types` →
`departments`. Verify this against the schema files directly; do not guess.

## Finding 2 (Critical) — the required explicit clinical-data pre-check was never built
`CURRENT_TASK.md`'s Item 2 required an application-level check, run *before* any delete,
for whether the department's users/students have any row in the clinical tables — `case_logs`,
`procedure_logs`, `academic_logs`, `leave_records`, `postings`, `research`, `assessments`,
`attendance` (confirm the exact table/export names by reading `lib/db/src/schema/logs.ts`,
`leave.ts`, `postings.ts`, `research.ts`, `assessments.ts`, `attendance.ts`, `progress.ts`,
`appraisals.ts`, `audit.ts`) — with the Postgres FK-violation catch documented only as a
defensive fallback "in case some dependency isn't covered by the check above." That
explicit check was never implemented; the shipped code relies solely on the FK catch. This
is a real, demonstrated gap: `procedure_types` has **zero FK protection**, because
`procedure_logs` stores procedure names as free text, not a foreign key to
`procedure_types.id` (confirm this yourself by reading `lib/db/src/schema/logs.ts`'s
procedure-log-related columns). A department's procedure catalog can currently be deleted
silently with no error at all, orphaning the meaning of any real procedure_logs entries
that used those names.

**Fix**: before the transaction begins any deletes, query whether the department (via its
current `userIds`/`studentIds`) has any row in each of the clinical tables listed above.
If any exist, do not delete anything — return `409` immediately, naming the specific
table(s) and row count(s) found (not the current generic message), matching what
`CURRENT_TASK.md` asked for ("report the exact table, column, and row count"). Keep the
existing FK-violation (`23503`) catch in place as a genuine defensive fallback for anything
this explicit check doesn't cover (it should now rarely if ever fire, but must stay for
safety) — do not remove it, and do not weaken the transaction/rollback behavior for the
tables that do have real FK protection.

## Finding 3 (Major) — successful delete crashes the frontend
`AdminPortal.tsx`'s `handleDeleteDepartment` calls `onRefresh()` (→ `fetchDepartments`) on
success but never clears `selectedDeptId`. `fetchDepartments` only assigns a new
`selectedDeptId` when it was already falsy, so the just-deleted department's id stays
selected. The next render does `departments.find(d => d.id === selectedDeptId)!` (forced
past TypeScript with `!`), gets `undefined`, and `DepartmentDetail` immediately
dereferences it — a runtime crash right after a correct 200 response, on every successful
delete.

**Fix**: after a successful delete, clear `selectedDeptId` (e.g. set it to `null`, or to
another remaining department's id if you prefer — either is acceptable, but it must not be
left pointing at the just-deleted id). Confirm the component handles a `null`/no-selection
state gracefully (check how it's initially rendered before any department is selected).

## Finding 4 (Minor) — `assignment_recipients` cleanup misses cross-department recipients
The current cleanup only deletes `assignmentRecipientsTable` rows where `assignmentId` is
one of this department's own assignments. A student who belongs to this department but is
a recipient of an assignment created by a *different* department is not covered, which
would later trip a `23503` on the student-delete step (fails safe, but incomplete — the
delete would incorrectly report "clinical data" for what's actually just a cross-department
assignment link).

**Fix**: also delete `assignment_recipients` rows where `studentId` is one of this
department's `studentIds`, in addition to the existing `assignmentId`-based cleanup, before
deleting `students`.

## Finding 5 (Minor) — new route missing from the blanket 401/403 test lists
`artifacts/api-server/tests/superadmin.test.ts` has existing tests asserting 401
(unauthenticated) and 403 (wrong role) across a list of superadmin routes, but the new
`DELETE /departments/:id` route was not added to those lists.

**Fix**: add `DELETE /superadmin/departments/:id` (using a real existing department id from
the test setup, or any valid id) to both the 401 and 403 blanket-coverage test lists.

## Do NOT touch
- Any file other than: `artifacts/api-server/src/routes/superadmin.ts`,
  `artifacts/api-server/tests/superadmin.test.ts`
- `AdminPortal.tsx` for anything other than Finding 3's `selectedDeptId` fix — do not touch
  Item 1's density/spacing changes, and do not touch anything else in the delete UI beyond
  what's needed for this one fix
- `apiClient.ts` — not in scope for this fix round
- Any schema file, any migration, any `onDelete` cascade addition anywhere
- Any shell command whatsoever

## Hard stops — stop and report, do not decide
- If you cannot determine the exact clinical-table column names/relationships with
  confidence from the schema files, say so explicitly in `HANDOFF.md` rather than guessing
  at a query
- Any value you would otherwise guess or invent
- Any change that would require a schema/migration change to implement the pre-check
  (it should be achievable with plain `select`/`count` queries against existing tables —
  if it turns out not to be, stop and report why)

## Report
Write `HANDOFF.md` at the repo root (append a new dated section on top of what's there —
do not destroy the prior fix-round's report):
- The corrected delete order, with your reasoning against the actual schema files you read
- The exact pre-check query/queries added, with file:line, and confirmation of which
  clinical tables it covers
- The `selectedDeptId` fix, with file:line
- The two Minor fixes, with file:line
- Anything you could not determine with confidence, named explicitly

Do not open a pull request. Do not run `git commit` or `git push`.

## Model
Gemini 3.1 Pro (High) — dispatched here because the Claude model tiers are quota-limited on
this account right now; this fix round includes new query/design work (the pre-check), not
just a one-line correction, and touches the same ownership-adjacent hard-delete logic that
triggered Opus tier originally.


## Files you may touch
- artifacts/api-server/src/routes/superadmin.ts
- artifacts/api-server/tests/superadmin.test.ts
- artifacts/mockup-sandbox/src/components/AdminPortal.tsx
- HANDOFF.md