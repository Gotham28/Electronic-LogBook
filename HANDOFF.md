# Handoff Report

## Fix — assignment_types FK deadlock (Critical)
**What changed**: 
- In `artifacts/api-server/src/routes/admin.ts`, the hard-delete route for professors now reassigns `assignmentTypesTable` rows (`createdBy = targetUserId`) to the HOD driving the deletion (`req.user!.id`). We also added an informational metric `deletedCounts.assignmentTypesReassigned`.
- In `artifacts/api-server/tests/hard-delete.test.ts`, updated the cascade deletion test to query the preserved `assignment_types` by `id` rather than the stale `createdBy` ID, and asserted that its `createdBy` now points to the HOD (`a.hod2.id`).

**Why**:
Assignment types are department-level catalog data. Deleting them caused data loss, which was addressed in a prior fix, but omitting the deletion completely caused a foreign key constraint violation (`assignment_types_created_by_users_id_fk`) and deadlocked the transaction since `createdBy` is `NOT NULL` and still referenced the deleted user. Reassigning `createdBy` to the HOD permanently anchors the shared catalog data while allowing the professor's account to be safely deleted.
