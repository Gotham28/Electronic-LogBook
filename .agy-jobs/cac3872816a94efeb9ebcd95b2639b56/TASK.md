# Antigravity dispatch 41 — Collapse admin portal to one department per real department

workdir: D:\Electronic-LogBook-main
branch: feature/mirror-test-department
model: Gemini 3.1 Pro (High)

allowed_paths:
- artifacts/api-server/src/routes/superadmin.ts
- artifacts/mockup-sandbox/src/lib/apiClient.ts
- artifacts/mockup-sandbox/src/components/AdminPortal.tsx
- artifacts/api-server/tests/

## Guard
This prompt is for "Electronic-LogBook" (Arogya platform, Pediatrics pilot), task file
`CURRENT_TASK.md` at the repo root, feature "collapse the admin portal to one department per
real department" (Task D). If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`, and not `pnpm test`. If you are tempted to
run one, don't; use file-reading tools instead (view a file, list a directory, search file
contents). A denied shell call is not something to work around and continue past — some
environments do not recover cleanly from one and simply stop the task instead of falling
back. Do the entire task using only file-reading and file-editing tools. Write tests as
files; do not attempt to run them — Claude Code runs `pnpm test` and `tsc --noEmit` after
this dispatch returns and reports the real result.

The branch `feature/mirror-test-department` is already checked out for you. Do not check
out, create, or switch any branch. Do not run `git` at all.

## Read first
- `AGENTS.md` — all sections; §16 is a rule-map table (cited section numbers below already
  resolve through it)
- `CURRENT_TASK.md` — the confirmed scope in full
- `artifacts/api-server/src/routes/superadmin.ts` in full — specifically `GET /departments`
  (the route to change), the existing HOD-attachment query pattern in that same handler (the
  pattern to mirror for the new mirror-lookup query), `GET /departments/:id/roster` (already
  generic, read-only reference, do not change), and `POST /users/:id/impersonate` (read-only
  reference — confirm it never reads `GET /departments`'s response before concluding it's
  safe to leave untouched).
- `artifacts/mockup-sandbox/src/lib/apiClient.ts` — the exact current `AdminDepartment` type
  and the `getAdminDepartments()`/`getAdminDepartmentRoster()` wrapper functions.
- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx` in full — `DepartmentDetail()`'s
  existing `roster`/`loading`/`error` state and `fetchRoster()` function (the pattern to
  mirror for the new mirror-roster state/fetch), the existing `useEffect` that currently
  fetches on `[department.id]` only, the `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`
  structure for the existing Faculty/Residents tabs, the existing empty-state/spinner/error
  markup styles used elsewhere in this component (reuse these exactly, don't invent new
  markup), the two current `{department.isTest && u.status === "approved" && (...)}` "Log in
  as" blocks in the Faculty and Residents tables (find their exact current line numbers —
  they may have shifted from earlier dispatches on this branch), `handleImpersonate` (do not
  modify), and `fetchDepartments()`'s per-department roster-count loop and `stats.deptsTotal`
  (read-only — confirm these need no change once the backend response changes).
- `artifacts/api-server/tests/superadmin.test.ts` — find the existing `GET /departments` test
  coverage to extend, and this file's existing `test()` + `call()` helper style.

## Build
- [ ] In `superadmin.ts`'s `GET /departments` route:
      1. Add `.where(eq(departmentsTable.isTest, false))` to the primary select, and remove
         `isTest`/`configSourceDepartmentId` from that select's field list.
      2. Add a second query (same style as the existing HOD-attachment query in this same
         handler): select `{id, configSourceDepartmentId}` from `departmentsTable` where
         `isTest = true`, build a `Map<realDepartmentId, mirrorDepartmentId>` from it (key =
         `configSourceDepartmentId`, filtering out null `configSourceDepartmentId` values),
         and merge a new field `mirrorDepartmentId: number | null` onto each real department
         in the JSON response (`mirrorByRealDeptId.get(d.id) ?? null`).
      3. No other route in this file changes.
- [ ] In `apiClient.ts`: `AdminDepartment` type — remove `isTest?: boolean` and
      `configSourceDepartmentId?: number | null`, add `mirrorDepartmentId: number | null`.
      `getAdminDepartments()` and `getAdminDepartmentRoster(id)` stay exactly as they are.
- [ ] In `AdminPortal.tsx`'s `DepartmentDetail()`:
      1. Add `mirrorRoster` (`AdminUserRow[]`), `mirrorLoading` (boolean), `mirrorError`
         (string | null) state, matching the existing `roster`/`loading`/`error` state shape.
      2. Add a fetch function mirroring `fetchRoster()`: when `department.mirrorDepartmentId`
         is present, call `getAdminDepartmentRoster(department.mirrorDepartmentId)` and store
         the result; when it's null, set `mirrorRoster` to `[]` without a network call.
      3. Add `department.mirrorDepartmentId` to the dependency array of the existing
         `useEffect` that calls `fetchRoster()` (or add a second effect keyed on both
         `department.id` and `department.mirrorDepartmentId`), so that a mirror being
         provisioned while this detail view is already open triggers a refetch instead of a
         stale empty state.
      4. Add a third `TabsTrigger`/`TabsContent` pair, "Test accounts", after the existing
         Faculty/Residents tabs, using the same `Tabs` component already in use.
      5. That tab's content: if `department.mirrorDepartmentId` is null, an empty state
         matching this file's existing "No faculty/residents in this department." style, with
         copy directing the admin to the existing "Provision test departments" button in the
         page topbar (do not add any new provisioning UI in this tab). If present: reuse this
         file's existing spinner markup while `mirrorLoading`, reuse the existing
         error-banner-plus-retry markup on `mirrorError`, otherwise render one `Table` (all 3
         roles together, not split into sub-tabs) with columns Name, Email, Role, Status,
         Action. Action column: "Log in as" button when `u.status === "approved"`, calling the
         existing `handleImpersonate(u.id)` unchanged.
      6. Delete both existing `{department.isTest && u.status === "approved" && (...)}` "Log
         in as" button blocks from the Faculty table and the Residents table outright — no
         replacement condition. Leave every other part of those tables (HOD label, Deactivate
         button, rejected-status label) exactly as it is.
      7. Do not modify `fetchDepartments()`'s roster-count loop or `stats.deptsTotal` — verify
         by reading them that they need no change once the backend response changes; if you
         find they DO need a change, stop and report why rather than guessing.
- [ ] Tests: extend `artifacts/api-server/tests/superadmin.test.ts`'s existing `GET
      /departments` coverage (do not create a new file for this — add to the existing test
      covering this route) to assert: the response never includes a row that would have had
      `isTest = true`; a real department with a provisioned mirror returns the correct
      `mirrorDepartmentId`; a real department with no mirror returns `mirrorDepartmentId:
      null`.
- [ ] `pnpm test` in `artifacts/api-server` and `tsc -p tsconfig.json --noEmit` in
      `artifacts/mockup-sandbox` — do not run either yourself (sandbox constraint); write
      only. Claude Code runs both after this dispatch returns.

## Do NOT touch
- `artifacts/api-server/src/routes/superadmin.ts`'s `POST /users/:id/impersonate` route,
  `POST /departments/backfill-test-departments` route, `GET /departments/:id/roster`,
  `POST /departments`, `POST /departments/:id/replace-hod`, `POST /departments/:id/faculty`,
  `POST /departments/:id/students`, `POST /users/:id/deactivate`,
  `DELETE /departments/:id` (including `deleteDepartmentCascade`) — only `GET /departments`
  changes in this file.
- `artifacts/api-server/src/lib/department-provisioning.ts`,
  `artifacts/api-server/src/lib/department-config-source.ts` — already correct, shipped,
  reviewed. Read-only reference, do not edit.
- `artifacts/api-server/src/routes/auth.ts`, `artifacts/api-server/src/middlewares/auth.ts` —
  no change needed; read-only if referenced at all, do not edit.
- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx`'s `handleImpersonate` function
  and the "Provision test departments" button/handler — reuse both unchanged, do not modify
  their logic.
- `artifacts/mockup-sandbox/src/App.tsx`, `artifacts/mockup-sandbox/src/lib/session.ts` — no
  change needed for this task.
- Any query selecting rows from `users`, `students`, `assignments`, `case_logs`,
  `procedure_logs`, `academic_logs`, `leave_records`, `postings`, `research`,
  `assessments`, `attendance_logs`, `leave_applications`, `thesis_milestones`, `appraisals`.
- Any migration file, `lib/db/src/migrations.ts`, `lib/db/src/schema/users.ts` — no schema
  change.
- Any `artifacts/mockup-sandbox` file other than `apiClient.ts`, `AdminPortal.tsx`.
- Any branch other than `feature/mirror-test-department`.
- `.env`, `TASK_LOG.md`, `STATUS.md`, `CURRENT_TASK.md` (read-only — do not edit it).
- `artifacts/api-server/tests/auto-provision.test.ts`, `tests/delete-cascade.test.ts`,
  `tests/mirror-department.test.ts`, `tests/impersonation.test.ts`,
  `tests/backfill-test-departments.test.ts` — do not modify any of these; extend
  `tests/superadmin.test.ts` instead.
- Any file not named in `## Build` or `allowed_paths` above.
- Any shell command whatsoever, including `pnpm test`, `pnpm install`, `drizzle-kit
  generate/push/migrate`, `psql`, or `git` of any kind.

## Hard stops — stop and report, do not decide
- Any place `studentsTable.id` and `usersTable.id` could be conflated.
- Any schema change, migration, or database-connecting command.
- Anything that puts patient text or leave reasons near a log, error, or audit trail.
- Any secret, credential, or `.env` value.
- The task turning out to be more than described here.
- Any change to `POST /users/:id/impersonate`'s authorization logic, or to
  `requireAuth`/`requireRole`, or any other route's authorization logic — if you find yourself
  wanting to touch any of these to make this work, stop instead of doing it.
- If `fetchDepartments()`'s roster-count loop or `stats.deptsTotal` turns out to need a change
  beyond what the Build list describes, stop and report rather than deciding on your own.
- Any value you would otherwise guess or invent — if an unspecified detail is ambiguous, pick
  the most conservative, closest-to-existing-pattern choice and say so in `HANDOFF.md`,
  rather than inventing something novel.

## Report
Write `HANDOFF.md` at the repo root (append a new section; keep everything above it):
- Every file created or modified, with paths.
- The exact new `mirrorDepartmentId` query and merge logic, with file:line.
- The exact `useEffect` dependency-array change, with file:line, quoting the new dependency
  array so it's verifiable at a glance.
- Confirmation both dead "Log in as" gate blocks were fully removed, with the file:line range
  each occupied before removal.
- Confirmation `fetchDepartments()`'s roster-count loop and `stats.deptsTotal` needed no
  change (or, if they did, exactly what changed and why).
- Every test added/extended, with the file and what it asserts — explicitly state you did not
  run them (sandbox constraint) and that pass/fail is unverified until Claude Code runs
  `pnpm test` and `tsc --noEmit`.
- Anything you skipped, and why (including anything you could not do because it would have
  required a shell command).
- Anything you expanded beyond the Build list, and why.
- Anything that contradicts `CURRENT_TASK.md` or `AGENTS.md`.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/src/routes/superadmin.ts
- artifacts/mockup-sandbox/src/lib/apiClient.ts
- artifacts/mockup-sandbox/src/components/AdminPortal.tsx
- artifacts/api-server/tests/