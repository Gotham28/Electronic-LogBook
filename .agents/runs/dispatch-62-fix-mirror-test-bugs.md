# Antigravity dispatch 62 — fix three test bugs in dispatch 60's new mirror-department tests

## Guard
This prompt is for the project at Electronic-LogBook (Arogya Electronic LogBook), task file
`CURRENT_TASK.md` (repo root) dated 2026-09-21. If this is not that repo, stop, say which
repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Context — why this dispatch exists
Dispatch 60 added five new tests to `artifacts/api-server/tests/mirror-department.test.ts`.
Three of them fail — not because the application code is wrong, but because the new test
code itself has bugs. This was confirmed by running the full suite and by git-stash-isolating
the dispatch 60/61 changes to compare against baseline. All three bugs and their fixes are
fully diagnosed below; this dispatch is to apply the fixes, not to re-diagnose.

## Read first
- `CURRENT_TASK.md` (repo root) — `## Order` step 3, the full diagnosis of these three test
  bugs (same content as below, for cross-reference).
- `artifacts/api-server/tests/mirror-department.test.ts` — read the whole file, especially
  the `before()` block (lines ~19-83) and the five new tests at the end (added by
  dispatch 60, after the "Write to assignmentTypesTable..." test that already passes).
- `artifacts/api-server/tests/access.test.ts` lines ~152-179 (the department-loop test) and
  ~205-212 (the `enabledFeatures` config-write test) — these show the established, working
  patterns this dispatch needs to copy: how `Account.studentId` (not `.id`) is used to build
  `/students/:id/...` URLs, and how `POST /admin/department/config` enables a feature flag.
- `artifacts/api-server/tests/support.ts` — the `Account` type (line 23: has both `id` and
  an optional `studentId`) and the `setup()` fixture (lines 27-48): confirm for yourself
  that none of the three seeded departments have `procedureExperience` enabled by default.
- `artifacts/api-server/src/middlewares/student-access.ts` — confirms `:studentId` route
  params are checked against `studentsTable.id`, never `usersTable.id`.
- `artifacts/api-server/src/routes/department.ts` lines 27-46 (`GET /:departmentId/catalog`)
  — confirms the actual response shape: `config` is a single department-config object
  (unrelated to catalog rows), and `competencyLevels`/`leaveTypes` are the pre-filtered
  arrays of catalog rows, each with `kind`, `name`, `value` fields
  (`lib/db/src/schema/department_catalog.ts`).

## Build
All three fixes are inside `artifacts/api-server/tests/mirror-department.test.ts` only.

- [ ] **Bug 1 — wrong id.** In the `before()` block, where `testStudent` is constructed
      (around line 76-82), add a `studentId: student.id` field to the object (the `student`
      variable already in scope from the preceding
      `const [student] = await db.insert(studentsTable).values({...}).returning();` call).
      Then, in all three of the following new tests, change every
      `/students/${testStudent.id}/...` URL to `/students/${testStudent.studentId}/...`:
      "Test student's procedure-log submission succeeds against mirror", "Test student's
      leave-record submission succeeds", and "Test student case-log submission is visible to
      test prof and HOD". Do not change `testStudent.id` itself or how the JWT is signed —
      that part (using the user id) is correct and must stay as-is.
- [ ] **Bug 2 — wrong response shape.** In "Test student's procedure-log submission succeeds
      against mirror", replace
      `const compLevel = realResponse.body.config.find((c: any) => c.kind === "competency_level");`
      with reading from `realResponse.body.competencyLevels` (an array of catalog rows —
      pick any entry, e.g. `realResponse.body.competencyLevels[0]`) and use its `.value`
      field for `competencyLevel` in the request body. In "Test student's leave-record
      submission succeeds", replace the equivalent
      `realResponse.body.config.find((c: any) => c.kind === "leave_type")` with reading from
      `realResponse.body.leaveTypes` the same way, using its `.value` field for `leaveType`.
- [ ] **Bug 3 — feature flag never enabled.** In "Test student's procedure-log submission
      succeeds against mirror", before submitting the procedure log, first call
      `POST /admin/department/config` as `realHod` with body
      `{ enabledFeatures: { procedureExperience: true } }` (same pattern as
      `access.test.ts:209-210`) and assert it returns 200. Without this, the department's
      `procedureExperience` flag stays unset and the procedure-logs handler never reaches
      the competency-level check this test exists to exercise (it always 400s earlier, on
      the "not enabled" branch, for an unrelated reason).

## Do NOT touch
- Any file other than `artifacts/api-server/tests/mirror-department.test.ts`.
- Any test in this file other than the three named above (do not touch the two tests
  dispatch 60 also added that already pass: "Real-department assignmentTypesTable change is
  visible on mirror" and "Write to assignmentTypesTable scoped to a mirror department
  returns 403").
- Application/source code — these are test-only bugs, not application bugs. Nothing under
  `artifacts/api-server/src/` needs to change for this dispatch.
- Any file outside `artifacts/api-server/`.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).

## Explicitly not in scope for this dispatch
Do not touch or attempt to fix these four pre-existing, unrelated test failures (confirmed
via stash-isolated re-run against baseline, before any of this task's changes existed):
`access.test.ts` "existing case, procedure, academic, posting and leave workflows work in
every department"; `catalog-competency.test.ts`'s two failures; `catalog-leave-type.test.ts`
"Concurrency: advisory lock serializes near-simultaneous leave submissions". They are
recorded in `CURRENT_TASK.md` for the developer and are not part of this task.

## Hard stops — stop and report, do not decide
- If, after these fixes, a test still fails for a reason not covered by the three bugs
  above, stop and report the new failure rather than guessing at another fix.
- Any value you would otherwise guess or invent.

## Verification
File-reads only (no shell available in this sandbox): after each edit, re-read the test to
confirm the URL, the response-shape access, and the new config-enabling call are all
internally consistent. Do not attempt to run the test suite — Claude Code will do that
after this dispatch returns.

## Report
Write `HANDOFF.md` at the repo root (overwrite the existing one — this is a continuation of
the same task):
- What changed, per test, matching the three bugs above.
- Confirmation you touched no other file.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)` — Opus 4.6 (Thinking) quota is still exhausted from earlier in this
task (dispatch 59); not retrying it. Disclosed; this diff gets extra scrutiny at
`code-review`.
