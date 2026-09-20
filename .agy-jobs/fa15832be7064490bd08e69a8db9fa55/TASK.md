# Antigravity dispatch 18 — add 2 regression tests for Item 2 fix round 2

## Guard
This prompt is for the project `Electronic-LogBook-main`, task file `CURRENT_TASK.md`
at the repo root (test-only addition after a completed code review and fix round for
Item 2), dated 2026-09-14. If this is not that repo, stop, say which repo this is, and
wait.

## Sandbox constraint — overrides AGENTS.md §1 for this dispatch only
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. Use file-reading tools only. You cannot
run `pnpm test` — the developer runs it themselves after this dispatch and reports back.

## Context
Two fix rounds already landed on `DELETE /api/superadmin/departments/:id` in
`artifacts/api-server/src/routes/superadmin.ts`: fixing the FK-violation error detection,
then fixing the delete order (users were being deleted before `assignments`/
`assignment_types`, which reference `users.id`) and adding an explicit pre-check for
clinical-table references before any delete runs. All 77 existing tests pass, and the code
looks correct on direct review, but **neither of those two logic fixes has a dedicated
regression test** — the existing tests happen to pass without exercising the specific bugs
that were found. This dispatch is test-only: add exactly two new test cases to
`artifacts/api-server/tests/superadmin.test.ts`. Do not change any other file, and do not
change any existing test.

For reference, the relevant schema (`lib/db/src/schema/assignments.ts`):
```ts
export const assignmentTypesTable = pgTable("assignment_types", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp(...).notNull().defaultNow(),
});
export const assignmentsTable = pgTable("assignments", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id),
  typeId: integer("type_id").notNull().references(() => assignmentTypesTable.id),
  facultyId: integer("faculty_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  dueAt: timestamp(...).notNull(),
  createdAt: timestamp(...).notNull().defaultNow(),
});
export const assignmentRecipientsTable = pgTable("assignment_recipients", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => assignmentsTable.id),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  status: text("status", {...}).notNull().default("assigned"),
  ...
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
});
```

## Build

**Test 1 — proves the delete-order fix (a department with assignments can actually be
deleted, not just an empty one):**
- Create a department + HOD via the existing `POST /superadmin/departments` API (same
  pattern as the existing tests — see test 14/16 in the current file for the exact call
  shape).
- Insert an `assignmentTypesTable` row directly via `db.insert(...)` (import
  `assignmentTypesTable`, `assignmentsTable` from `./database.js`, following the same
  import pattern already used for `departmentConfigsTable` etc. in test 14): `departmentId`
  = the new department's id, `name`/`description` = any test values, `createdBy` = the new
  HOD's user id.
- Insert an `assignmentsTable` row: `departmentId` = same department, `typeId` = the
  assignment type just created, `facultyId` = the HOD's user id, `title`/`instructions` =
  any test values, `dueAt` = any future `Date`.
- Verify both rows exist (a `db.select()` before delete, like the existing pattern).
- Call `DELETE /superadmin/departments/:id` on this department. **Assert `200`** (not 409 —
  before the delete-order fix, this would have incorrectly returned 409 due to the ordering
  bug; this test exists specifically to prove that no longer happens).
- Verify the department, the HOD user, the assignment, and the assignment type are all gone
  afterward (`db.select()` returning empty/undefined for each, same pattern as test 14).

**Test 2 — proves the cross-department assignment-recipient cleanup fix:**
- Create **two** departments with their own HODs via the API: call them Dept A and Dept B.
- In Dept A: as Dept A's HOD (or however the existing test helpers authenticate a
  department-scoped action — check `support.js`/existing tests for the pattern, e.g. how
  `hod0`/`faculty0` accounts are used elsewhere in this file), or simply via direct
  `db.insert(...)` if simpler and consistent with this file's style: create an
  `assignmentTypesTable` row and an `assignmentsTable` row both scoped to **Dept A**
  (`departmentId` = Dept A's id, `createdBy`/`facultyId` = Dept A's HOD id).
- Create a student in **Dept B** via `POST /superadmin/departments/:id/students` (same
  pattern as test 16). Look up that student's `studentsTable.id` profile row the same way
  test 16 does.
- Insert an `assignmentRecipientsTable` row linking Dept A's assignment to Dept B's student
  (`assignmentId` = Dept A's assignment id, `studentId` = Dept B's student profile id).
  This models a cross-department assignment recipient link.
- Call `DELETE /superadmin/departments/:id` on **Dept B** (the student's own department,
  not the department that owns the assignment). **Assert `200`** — before the fix, this
  would have failed with a 409/500 because the old cleanup only removed
  `assignment_recipients` rows matching Dept B's *own* assignments, missing this
  cross-department link, and the student delete would then trip an FK violation on the
  leftover `assignment_recipients` row.
- Verify afterward: Dept B, its HOD, and its student are all gone; the
  `assignment_recipients` row linking to that student is gone; but **Dept A, its HOD, its
  assignment, and its assignment type all still exist** (deleting Dept B must not touch
  Dept A's data).

Use realistic, distinct test emails/names (following this file's existing convention of
`*@example.test` addresses) to avoid unique-constraint collisions with other tests in this
file.

## Do NOT touch
- Any file other than `artifacts/api-server/tests/superadmin.test.ts`
- Any existing test in that file — add two new tests only, do not modify test 14, 15, or 16
- `superadmin.ts`, `AdminPortal.tsx`, `apiClient.ts` — no logic changes, this dispatch is
  test-only
- Any shell command whatsoever

## Hard stops — stop and report, do not decide
- If the existing test-authentication helpers (`support.js`) don't provide an obvious way
  to act as a specific department's HOD/faculty for creating an assignment, and direct
  `db.insert(...)` (as suggested above) seems like it would produce a row that doesn't match
  what the real API would ever produce, say so explicitly rather than guessing — but note
  that test 14 already sets this precedent (inserting `departmentConfigsTable`,
  `departmentCatalogTable`, `procedureTypesTable` rows directly rather than through an API
  that doesn't exist for them), so the same approach is expected to be fine here too.
- Any value you would otherwise guess or invent

## Report
Write `HANDOFF.md` at the repo root (append a new dated section on top of what's there):
- The two tests added, with file:line
- Confirm you did NOT modify any existing test or any non-test file

Do not open a pull request. Do not run `git commit` or `git push`.

## Model
Gemini 3.1 Pro (High) — dispatched here because Claude tiers may still be quota-limited;
this is a precisely-specified, mechanical test-writing task, not new design judgment.


## Files you may touch
- artifacts/api-server/tests/superadmin.test.ts
- HANDOFF.md