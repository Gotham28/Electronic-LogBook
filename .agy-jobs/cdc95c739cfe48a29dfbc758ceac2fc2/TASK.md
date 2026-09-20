# Antigravity dispatch 27 — Fix a bug introduced by dispatch 26's assignment_types fix

## Guard
This prompt is for the project `Electronic-LogBook` (Gotham28/Electronic-LogBook), branch
`feature/hard-delete-students-faculty`. If this is not that repo, stop, say which repo this
is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. Do the entire task using only file-reading
and file-editing tools.

## Context — a bug in the previous fix, found and root-caused by Claude Code directly
The previous dispatch (26) stopped `DELETE /users/:id/hard`'s professor branch from deleting
`assignmentTypesTable` rows, intending to leave them in place as shared department catalog
data. This broke the professor-delete path entirely: `assignmentTypesTable.createdBy` is a
`NOT NULL` foreign key to `usersTable.id` (see `lib/db/src/schema/assignments.ts`:
`createdBy: integer("created_by").notNull().references(() => usersTable.id)`). Leaving an
assignment_type row in place while deleting the professor who created it is structurally
impossible — that row still points at the user being deleted, regardless of whether any
other professor's assignment also references the type via `typeId`.

Claude Code reproduced this directly (bypassing the route's generic error handling to see
the raw Postgres error) and confirmed the exact failure:
```
error: update or delete on table "users" violates foreign key constraint
"assignment_types_created_by_users_id_fk" on table "assignment_types"
detail: Key (id)=(14) is still referenced from table "assignment_types".
```
This happens on every professor hard-delete that has ever created an assignment type, not
just the shared-type scenario dispatch 26 was trying to fix.

## Build
In `artifacts/api-server/src/routes/admin.ts`'s professor branch of
`DELETE /users/:id/hard` (search `router.delete("/users/:id/hard"`):

- [ ] Before the final `usersTable` delete, reassign `createdBy` on every `assignmentTypesTable`
  row currently owned by the professor being deleted (`WHERE createdBy = targetUserId`) to the
  HOD performing the deletion (`req.user!.id`) — an UPDATE, not a delete, exactly the same
  pattern already used a few lines earlier in this same branch for `studentsTable.mentorId`
  (`await tx.update(studentsTable).set({ mentorId: null }).where(eq(studentsTable.mentorId, targetUserId));`
  — same idea, but since `assignmentTypesTable.createdBy` is `NOT NULL` you cannot set it to
  `null`, you must set it to a valid user id, and `req.user!.id` — the HOD driving the
  deletion — is the only value available at this point that's guaranteed to be a valid,
  in-department user).
- [ ] This UPDATE must run for every affected `assignmentTypesTable` row regardless of whether
  any other professor's assignment references it — the FK is on the row itself
  (`created_by → users.id`), not conditional on downstream usage, so there's no "safe to skip"
  case here the way there might be for a delete.
- [ ] Do not add a `deletedRecords.assignmentTypes` count back (dispatch 26 correctly removed
  it, since these rows are being reassigned, not deleted) — but if you want to report how many
  were reassigned, add a separate field, e.g. `deletedCounts.assignmentTypesReassigned`, purely
  informational, your call whether it's worth adding.
- [ ] Everything else in the route stays exactly as dispatch 26 left it. Do not re-add the
  `assignmentTypesTable` delete.

Update `artifacts/api-server/tests/hard-delete.test.ts`'s professor-delete test: it currently
asserts (after dispatch 26's change) that the assignment_types row still exists and is still
owned by the professor being deleted (`eq(assignmentTypesTable.createdBy, a.faculty2.id)`,
expecting length 1) — that assertion is now wrong, since `createdBy` will have changed. Update
it to confirm the assignment_type row still exists (query by its known id or by
`departmentId`/`name` instead of by the now-stale `createdBy`), and separately assert that its
`createdBy` now equals the HOD's id (`a.hod2.id` — check `support.ts` for the exact account key
pattern, department index 2 means `hod2`) rather than the deleted professor's id.

## Do NOT touch
- Anything else in `admin.ts` outside this one change
- `artifacts/mockup-sandbox/src/components/HODPortal.tsx`
- `artifacts/api-server/src/routes/auth.ts`, `superadmin.ts`, `AdminPortal.tsx`
- Any schema file under `lib/db/`
- The existing `DELETE /users/:id` soft-delete handler
- Any other test or assertion in `hard-delete.test.ts` beyond the one update named above

## Hard stops — stop and report, do not decide
- If `req.user!.id` is not reliably available at this point in the handler (it should be,
  via `requireAuth`, same as every other route in this file), stop and report rather than
  inventing a different value to reassign `createdBy` to

## Report
Overwrite `HANDOFF.md` with what changed and why. Do not open a pull request. Do not run
`git commit` or `git push`.


## Files you may touch
- artifacts/api-server/src/routes/admin.ts
- artifacts/api-server/tests/hard-delete.test.ts
- HANDOFF.md