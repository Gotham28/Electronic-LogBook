# Handoff Report: Item 2 Regression Tests (2026-09-14)

## Tests Added
Exactly two new tests were added to `artifacts/api-server/tests/superadmin.test.ts`:
- **Test 17** (`superadmin.test.ts:532`): "admin can delete a department that has assignments (delete-order fix)". Proves that a department with assignment types and assignments can be successfully deleted, verifying the delete-order fix.
- **Test 18** (`superadmin.test.ts:583`): "delete department cleans up cross-department assignment recipients correctly". Proves that an assignment recipient linked to a student in a different department is cleaned up when the student's department is deleted, verifying the cross-department cleanup fix.

## Files Touched
- `artifacts/api-server/tests/superadmin.test.ts`: Added imports and the two new tests at the end.
- `HANDOFF.md`: Added this report section.

I confirm that no existing tests or non-test files (`superadmin.ts`, `AdminPortal.tsx`, `apiClient.ts`) were modified.

---

# Handoff Report: Fix for Item 2 Review Findings (2026-09-14)

## 1. Delete Order Reordered (Finding 1)
The hard-delete transaction order was violating FK constraints by deleting `usersTable` rows before `assignmentsTable` and `assignmentTypesTable` rows, which have `facultyId` and `createdBy` referencing `usersTable.id` respectively. 
I read the schema definitions for `assignments.ts`, `students.ts`, `department_configs.ts`, `department_catalog.ts`, `procedure_types.ts`, `departments.ts` and `users.ts` to determine the correct order:
1. `assignmentRecipientsTable` (references `assignments.id`, `students.id`, and `users.id`)
2. `assignmentsTable` and `assignmentTypesTable` (reference `users.id` and `departments.id`)
3. `studentsTable` (references `users.id`)
4. `usersTable` (references `departments.id`)
5. `departmentConfigsTable`, `departmentCatalogTable`, `procedureTypesTable` (reference `departments.id`)
6. `departmentsTable`
This new order allows successful cascade deletion without tripping internal FK constraints.

## 2. Clinical Data Pre-Check (Finding 2)
Added an explicit check before any deletes begin in `artifacts/api-server/src/routes/superadmin.ts` (lines 216-248). The query checks if the collected `studentIds` or `userIds` are referenced in any of the following clinical tables:
`case_logs`, `procedure_logs`, `academic_logs`, `leave_records`, `postings`, `research`, `assessments`, `attendance_logs`, `leave_applications`, `thesis_milestones`, `appraisals`, and `audit`.
If any matches are found, it collects the specific tables and row counts and halts the transaction immediately, returning a 409 error specifying the exact tables and counts that blocked the deletion. The original `23503` fallback block is kept intact.

## 3. Frontend Crash Fixed (Finding 3)
Fixed the crash in `artifacts/mockup-sandbox/src/components/AdminPortal.tsx` by updating `fetchDepartments` (lines 49-59) to check if the currently `selectedDeptId` still exists in the newly fetched departments list. If it is missing (because the department was just deleted), `selectedDeptId` is cleanly set to `null`. I also safeguarded the render (line 381) to ensure `departments.find(...)` does not dereference `undefined`.

## 4. Cross-Department Assignment Recipients Cleanup (Finding 4)
Updated the delete sequence in `superadmin.ts` (lines 254-256) to also clean up `assignmentRecipientsTable` rows where `studentId` is one of this department's `studentIds`. This catches students receiving cross-department assignments, clearing them prior to student deletion.

## 5. Route Test Coverage Added (Finding 5)
Added the `DELETE /superadmin/departments/:id` route to both the 403 test list (line 46) and 401 test assertions (line 382) in `artifacts/api-server/tests/superadmin.test.ts` to ensure it is covered by the blanket unauthenticated and unauthorized assertion checks.

---

# Handoff Report: Fix for DELETE /departments/:id FK Violation Catch

## 1. Findings (Why `error.code` didn't match)
During a database operation, Drizzle ORM's drivers (both `drizzle-orm/pglite` and `drizzle-orm/node-postgres`) catch the underlying driver errors and wrap them in a `DrizzleQueryError` class. The actual database error—which contains the Postgres SQLSTATE `code` property—is stored in the `cause` property of the `DrizzleQueryError`.

Because the route handler simply checked `error.code === "23503"`, it was inspecting the wrapper (`DrizzleQueryError`), which has no `code` property. This caused the condition to evaluate to false and the route to fall through to the generic 500 error handler. 

I also investigated the existing `error.code === "23503"` check in `admin.ts` (`DELETE /users/:id`). I confirmed this is dead/unverified code: that route actually performs a soft-delete (`UPDATE status = 'rejected'`) rather than a hard `DELETE`. An `UPDATE` to a non-foreign-key column will never trigger an FK violation, which explains why this bug had never surfaced in the test suite previously.

## 2. The Fix
I updated the catch block in `artifacts/api-server/src/routes/superadmin.ts` to inspect both the wrapper and the underlying cause:

```typescript
const pgErrorCode = error.code ?? error.cause?.code;
if (pgErrorCode === "23503") {
  // ... handle 409 FK violation
```

This ensures that the SQLSTATE is properly extracted whether it is wrapped in a `DrizzleQueryError` (as Drizzle does) or thrown directly. This fix is completely agnostic and supports both `@electric-sql/pglite` (for tests) and `pg` (for production) as both adapters correctly attach the `code` property to their database error instances.

## 3. Transaction Rollback Assessment
**The 500 path did NOT compromise the database or leave partial deletions.** 

Drizzle implements nested transactions using Postgres savepoints (`SAVEPOINT spX`). Inside `drizzle-orm`, the transaction execution is wrapped in a try/catch block. If an operation (like the `DELETE` on `studentsTable`) throws an error (e.g., an FK violation), the Postgres transaction enters an aborted state. Drizzle catches this error immediately and successfully executes `ROLLBACK TO SAVEPOINT spX` (which Postgres allows even in an aborted state). 

After rolling back the savepoint, Drizzle re-throws the error up to the route handler. Therefore, by the time our route handler catches the error and incorrectly returns a 500, the database state has already been cleanly rolled back. The partial deletion of `assignmentRecipientsTable` that occurred before the FK violation was safely reverted. No data corruption or partial state leaked into the database.
