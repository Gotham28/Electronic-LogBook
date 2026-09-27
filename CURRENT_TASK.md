# Current Task — Admin can permanently delete and reactivate residents and faculty

## Feature
Let the platform admin permanently delete (and reactivate) residents and faculty, the
same way the HOD already can. Branch: `claude/sharp-goldberg-6d110o`, started from `main`
at `10bb16f`.

What existed before this task:
- HOD: Deactivate, Reactivate and Permanently delete for residents and faculty in their own
  department (`HODPortal.tsx`, `DELETE /api/admin/users/:id/hard`).
- Admin: Deactivate only (`POST /api/superadmin/users/:id/deactivate`).

## Plan reference
No MASTER_PLAN.md exists for this project (AGENTS.md §14.7). Unplanned: direct developer
request ("add the option to delete faculty and residents, by the admin and the HOD").

## Developer decisions (asked at the start of the session, recorded, not assumed)
- Scope: the HOD side already works; add delete (and reactivate) for the admin only.
- Faculty delete keeps today's behaviour: residents' records the faculty member supervised,
  reviewed or verified are deleted with them. This re-confirms the open item from the
  previous task ("Professor hard delete removes residents' records … Worth re-confirming").
- Admin may delete residents and faculty in any department, never an HOD or an admin.
- §14.1 overridden again: code written directly in this Claude Code cloud session.
- §14.2 is not overridden: no pull request until the developer decides.
- §6 is not overridden: no schema change; the agent never connected to a database (tests
  use in-process PGlite only; `DATABASE_URL` was unset for the whole session).

## Review tier
Opus (§15.2): the change deletes rows in the clinical tables and resolves a
`studentsTable.id` from a `usersTable.id` (§3, §4).

## Changes
- `artifacts/api-server/src/lib/hard-delete-user.ts` (new): the delete cascade, moved
  unchanged out of the HOD route so both routes run the same steps. One parameter added:
  who takes over assignment types the deleted user created.
- `artifacts/api-server/src/routes/admin.ts`: HOD route calls the shared cascade.
  Behaviour unchanged (existing `tests/hard-delete.test.ts` still passes).
- `artifacts/api-server/src/routes/superadmin.ts`: new
  `DELETE /api/superadmin/users/:id/hard` and `POST /api/superadmin/users/:id/reactivate`.
  Both refuse HOD and admin accounts (403). Nonexistent id is 404 (the admin sees every
  department, so there is nothing to hide, matching the existing admin deactivate route).
- `artifacts/mockup-sandbox/src/lib/apiClient.ts`, `components/AdminPortal.tsx`: Delete
  button with a confirmation panel (copied from the HOD screen), and Reactivate in place of
  the plain "Deactivated" label.
- `artifacts/api-server/tests/superadmin-user-delete.test.ts` (new): the four §11 cases for
  both new routes.

## Blocked on developer input
- Assignment types created by a deleted faculty member pass to that department's approved
  HOD (to the acting admin if there is none). The agent chose this; confirm or change.

## Manual (developer does)
- [ ] Review the diff.
- [ ] Decide whether to open a PR (§14.2 step 5).
