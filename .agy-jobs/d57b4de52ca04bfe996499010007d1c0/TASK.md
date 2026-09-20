# Antigravity dispatch 26 — Fix review findings: hard-delete

## Guard
This prompt is for the project `Electronic-LogBook` (Gotham28/Electronic-LogBook), branch
`feature/hard-delete-students-faculty`. If this is not that repo, stop, say which repo this
is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. Do the entire task using only file-reading
and file-editing tools.

## Fix 1 — assignment_types FK deadlock (Major)
In `artifacts/api-server/src/routes/admin.ts`'s professor branch of `DELETE /users/:id/hard`
(search `router.delete("/users/:id/hard"`), the current code deletes `assignmentTypesTable`
rows `WHERE createdBy = targetUserId`. This breaks if another still-active professor's
`assignmentsTable` row still references that type (`typeId`, a NOT NULL FK) — the whole
transaction correctly rolls back but returns a generic 409 with no explanation, and the
professor becomes permanently undeletable with no path to resolution.

`assignment_types` are department-shared catalog data, not personal to their creator (see
`artifacts/api-server/src/routes/assignments.ts` — any professor or HOD in the department can
create assignments against any type in that department; `superadmin.ts`'s department-delete
route deletes `assignment_types` by `departmentId`, never by `createdBy`).

Fix: stop deleting `assignmentTypesTable` rows in this route at all. A professor's assignment
*types* are not exclusively theirs once other professors may have used them — leave them in
place (same treatment as `department_configs`/`procedure_types`, which this route already
correctly leaves untouched as department-level catalog data). Still delete the professor's own
`assignmentsTable` rows and the `assignmentRecipientsTable` rows tied to those, exactly as now
— only stop touching `assignmentTypesTable`. Remove the corresponding `deletedRecords.assignmentTypes`
count from the response (or leave it always `0` if that's simpler — your call, just don't
delete the rows).

Update the existing test in `artifacts/api-server/tests/hard-delete.test.ts` (the professor
cascade test) to match: it currently asserts `deletedRecords.assignmentTypes === 1` and that
the `assignment_types` row is gone afterward — change that assertion to confirm the
`assignment_types` row still exists after the professor is deleted (since it's no longer
deleted), while `assignments`/`assignment_recipients` are still gone as before.

## Fix 2 — deletedRecords counts not shown (Major)
In `artifacts/mockup-sandbox/src/components/HODPortal.tsx`'s `handleHardDeleteUser`, the
`apiDelete(...)` call's return value (which includes `deletedRecords`, an object of table-name
→ count) is currently discarded. Capture it and include a summary in the success toast — e.g.
list the non-zero counts, or a total record count, in whatever format reads cleanly next to
the existing "X permanently deleted" message. Keep it concise; this doesn't need every table
name if the count is zero.

## Do NOT touch
- Anything else in `admin.ts` or `HODPortal.tsx` outside these two fixes
- `artifacts/api-server/src/routes/auth.ts`, `superadmin.ts`, `AdminPortal.tsx`
- Any schema file under `lib/db/`
- The existing `DELETE /users/:id` soft-delete handler
- Any other test in `hard-delete.test.ts` beyond the one assertion update named in Fix 1

## Report
Overwrite `HANDOFF.md` with what changed and why. Do not open a pull request. Do not run
`git commit` or `git push`.


## Files you may touch
- artifacts/api-server/src/routes/admin.ts
- artifacts/mockup-sandbox/src/components/HODPortal.tsx
- artifacts/api-server/tests/hard-delete.test.ts
- HANDOFF.md