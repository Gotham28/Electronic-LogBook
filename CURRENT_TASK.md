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

## Decided
- Assignment types created by a deleted faculty member pass to that department's approved
  HOD (to the acting admin if there is none). The agent proposed it; the developer said
  "proceed".
- PR: open one PR for this branch; not merged by the agent.

## Separate issue found this session (not fixed in this branch)
The admin console's "Log in as" button on a test account shows "Internal server error"
on the live site. It could not be reproduced: on a database with every migration applied,
all three test accounts open their dashboards with no failed request (checked end to end
in a browser). Migrations 0017–0020 were all added on 2026-09-27, and the developer is not
sure they have been run on the live database. If 0018 or 0020 is missing,
`GET /api/departments/:id/catalog` (the first call every dashboard makes) fails with 500
for every account, not only test accounts.

## Manual (developer does)
- [ ] Review the diff.
- [ ] Check the live API log for the failed request: "Error resolving config department"
      or "Request failed" with code 42703 / 42P01 confirms a missing migration.
- [ ] Back up the live database, then run
      `pnpm --filter @workspace/api-server db:migrate` (one transaction; rolls back on
      failure). The agent may not run this (§6).
