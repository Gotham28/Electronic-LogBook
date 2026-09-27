# Current Task — Say what failed in the department catalog error log

## Feature
`GET /api/departments/:id/catalog` logs "Error resolving config department" for any
failure, with no detail. The log line now also records which step failed and the Postgres
error code. Branch: `claude/sharp-goldberg-6d110o`, fast-forwarded to `main` at `1eb7559`
after PR #82 merged (no force-push).

## Plan reference
No MASTER_PLAN.md exists for this project (AGENTS.md §14.7). Unplanned: the live site's
admin "Log in as" test accounts showed "Internal server error", and the Render log line
could not say why.

## Developer decisions (recorded, not assumed)
- Separate PR for this change (§9), as the developer chose.
- §14.1 overridden again: code written directly in this Claude Code cloud session.
- §6 not overridden: the agent never connected to a database (tests use in-process PGlite).

## Review tier
Sonnet (§15.2): a log field on a non-clinical route. §8 applies (what may be logged): only
a fixed step name and a 5-character Postgres code are added, never error text.

## Changes
- `artifacts/api-server/src/routes/department.ts`: the catalog route's failure log adds
  `step` (`resolve-config-source` or `load-catalog`) and `code` (Postgres code such as
  `42P01`, else `UNEXPECTED`), using the same code check as `app.ts`.
- `artifacts/api-server/tests/catalog-error-log.test.ts` (new): a normal load (200); a
  missing table logs `load-catalog` / `42P01` with no error object or SQL text; a test
  department whose source is itself a test department logs `resolve-config-source`.

## Live issue this helps with (not fixed by code)
Render log: `GET /api/departments/19/catalog` → 500 "Error resolving config department".
The developer ran `db:migrate` from a local checkout on branch
`feat/procedure-experience-all-departments`, whose migration list ends at `0011`, so
`0012`–`0020` were not applied by that run even though it printed "completed". The
catalog route reads `department_posting_schedule` (added by `0020`, commit `d2a4ab7`).

## Manual (developer does)
- [ ] Back up the live database.
- [ ] Run `pnpm --filter @workspace/api-server db:migrate` from code at `main` (Render
      shell, or a local checkout on `main` whose `.env` points at the live database).
- [ ] Retry "Log in as" on a test account.
- [ ] Review and merge this PR by hand.
