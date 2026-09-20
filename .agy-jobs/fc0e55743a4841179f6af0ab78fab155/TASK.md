# Antigravity dispatch 32 — Mirror test department (fix review findings)

## Guard
This prompt is for "Electronic-LogBook" (Arogya platform, Pediatrics pilot), task file
`CURRENT_TASK.md` at the repo root, feature "mirror test department" — this is a FIX round
following a code review of dispatch 31, not new scope. If this is not that repo, stop, say
which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command, and not `pnpm test`. Use file-reading and file-editing tools
only. Write/edit tests as files; do not attempt to run them — Claude Code runs `pnpm test`
after this dispatch returns and reports the real result. Branch `feature/mirror-test-department`
is already checked out; do not touch git at all.

## Read first
- `CURRENT_TASK.md` — the confirmed scope
- `HANDOFF.md` — sections 1-5, the prior dispatches' inventory and implementation report
- `artifacts/api-server/src/middlewares/auth.ts` lines 23-70, specifically 48-58 — read this
  closely before touching anything below. It proves `req.user.departmentId` is ALWAYS
  re-resolved fresh from `usersTable.departmentId` server-side (never trusted from a JWT
  claim), and that `requireAuth` already rejects any student/professor/hod account with no
  department (403) before any route handler runs. Combined with the real foreign key
  `users_department_id_departments_id_fk` (`ON DELETE no action`, in
  `lib/db/migrations/0001_baseline.sql:284`), an authenticated caller's own department can
  never fail to resolve. Do not add a defensive check for that case anywhere — it would be
  untestable dead code for a scenario the schema already makes impossible, and this
  codebase's convention (see `department.ts:110-115`, a similar dead check already there)
  is not to add more of it.

## Why this dispatch exists
A 4-lens review of dispatch 31 found 1 Critical and several Major/Minor issues. All are
fixes to what dispatch 31 built — no new feature surface. Each item below names its finding.

## Build

### 1. Fix the overclaimed 404 evidence (Critical finding)
The "Settings write" four-case test in `artifacts/api-server/tests/mirror-department.test.ts`
currently targets `POST /department/config`, which cannot genuinely produce a 404 (see Read
first — the department always resolves). The developer decided: use a route that has a real,
already-working 404 instead. `PATCH /department/procedures/:id` (`admin.ts:590-597`) already
returns `404 { message: "Procedure not found" }` when the id doesn't exist or doesn't belong
to the caller's department (`admin.ts:595`) — this is pre-existing, correct behavior, not
something to build.

Replace the current "Settings write" test block with one exercising
`PATCH /department/procedures/:id`, asserting all four cases individually with real
request/response evidence:
- Unauthenticated → `401`.
- Authenticated as the mirror department's own HOD, targeting a real procedure id that
  belongs to the SOURCE department → `403` (`admin.ts:591-592`'s existing block), with the
  source department's procedure `required` value asserted unchanged both before and after
  the attempt.
- Authenticated as a real (non-mirror) department's HOD, updating one of their own
  procedures → `200`, with the updated value asserted in the response.
- Authenticated as the same real HOD, targeting a procedure id that does not exist (or
  belongs to a different department) → `404`.

Delete the old fixture-based test that tried to insert an HOD with no `departmentId` (it
tripped the pre-existing `users_department_required` CHECK constraint before reaching the
route under test, and is superseded by the above).

### 2. Close the registration gap into a mirror department (Major finding)
`artifacts/api-server/src/routes/auth.ts:104-109`, `POST /register`: the department lookup
has no `isTest` filter, so a caller who knows or guesses a mirror department's id can
register directly into it, bypassing the public directory's hiding of it entirely. Add
`eq(departmentsTable.isTest, false)` to the existing query's conditions (the same pattern
already used in `department.ts:16`), so registering against a mirror department fails with
the same `400 { message: "Choose an available department" }` a nonexistent department id
already gets (`auth.ts:109`). Add a test asserting this: registration against a seeded
`isTest = true` department is rejected the same way as registration against a nonexistent
department id.

### 3. Stop leaking isTest/configSourceDepartmentId in the catalog response (Major finding)
`artifacts/api-server/src/routes/department.ts:33,40`, `GET /:departmentId/catalog`: the
department sub-query does `db.select().from(departmentsTable)...` (the full row) and returns
it verbatim as `department: department[0]`. This now includes `isTest` and
`configSourceDepartmentId`, visible to any caller in that department — including a mirror
department's own test HOD/professor/student, who would see which real department they
mirror. Change the select to only the fields the response actually needs (match the field
set already used in the public listing at `department.ts:12` — `id`, `name`, `code` — plus
anything else this endpoint's existing response shape genuinely required before this diff;
check the actual pre-existing usage before deciding). Add or extend a test confirming the
response's `department` object never contains `isTest` or `configSourceDepartmentId`.

### 4. Add the missing analytics coverage (Major finding)
`CURRENT_TASK.md`'s verification list requires: "`/:departmentId/analytics` as test HOD →
only test-department students; zero source-department students" — no test exists for this.
Add one: seed a source department with at least one real student and a mirror department
with at least one test student, call `GET /:departmentId/analytics` as the mirror
department's test HOD, and assert the response includes only the test-department student(s)
and zero source-department students.

### 5. Logging consistency (Minor finding)
`artifacts/api-server/src/routes/department.ts:43` logs the raw `error` object in a new
catch block. Change it to match this codebase's own established convention (see
`admin.ts:577`, `req.log.error({ departmentId: ..., status: 500 }, "...")`) — log
`departmentId` and a status/label only, never the `error` object itself.

### 6. Check ordering (Minor finding)
`artifacts/api-server/src/routes/department.ts:108-115`, `GET /:departmentId/analytics`:
`resolveConfigDepartmentId(departmentId)` is called before the route's own "department not
found" 404 check. Reorder so the 404 check runs first.

### 7. Stale migration count (Minor finding)
`artifacts/api-server/tests/migrations.test.ts:15` hardcodes an expectation of 3 migration
files; there are now 4 (`0004_mirror_test_department.sql`, added by dispatch 31). Update the
expected count to 4.

## Do NOT touch
- Any query selecting rows from `users`, `students`, `assignments`, `case_logs`,
  `procedure_logs`, `academic_logs`, `leave_records`, `postings`, `research`,
  `assessments`, `attendance_logs`, `leave_applications`, `thesis_milestones`, or
  `appraisals` — same as every prior dispatch in this task.
- `assignment_types`, `users_one_approved_hod_per_department`, `provisionDepartment()`,
  `routes/superadmin.ts`, any frontend file, any branch other than
  `feature/mirror-test-department`, `.env`, `TASK_LOG.md`, `STATUS.md`, `CURRENT_TASK.md`
  (read-only), any existing migration file, any existing entry in `migrations.ts`'s `files`
  array.
- Do NOT add the defensive `if (!dept) return 404` check discussed in "Read first" above —
  it was considered and explicitly rejected as untestable dead code.
- Do NOT touch `lib/db/src/schema/users.ts`, `lib/db/migrations/0004_mirror_test_department.sql`,
  `lib/db/src/migrations.ts`, or `artifacts/api-server/src/lib/department-config-source.ts` —
  none of the review findings require changing them.
- Any file not named in `## Build` or `allowed_paths` above.
- Any shell command whatsoever, including `pnpm test`, `pnpm install`, `drizzle-kit
  generate/push/migrate`, `psql`, or `git` of any kind.

## Hard stops — stop and report, do not decide
- Any place `studentsTable.id` and `usersTable.id` could be conflated.
- Any schema change, migration, or backfill.
- Anything that puts patient text or leave reasons near a log.
- Any secret, credential, or `.env` value.
- Any value you would otherwise guess or invent — if the exact pre-existing field set
  `GET /:departmentId/catalog` needs for item 3 above is unclear from the code, say so in
  HANDOFF.md and leave that site's field list as narrow as you're confident is correct
  rather than guessing.

## Report
Update `HANDOFF.md` (append a new section, keep everything above it): every file changed,
mapped 1:1 to the finding it fixes; every test added/changed and what it asserts (state
explicitly that you did not run them); anything skipped and why; anything you expanded
beyond this list and why.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/src/routes/auth.ts
- artifacts/api-server/src/routes/department.ts
- artifacts/api-server/src/routes/admin.ts
- artifacts/api-server/tests/mirror-department.test.ts
- artifacts/api-server/tests/migrations.test.ts
- HANDOFF.md