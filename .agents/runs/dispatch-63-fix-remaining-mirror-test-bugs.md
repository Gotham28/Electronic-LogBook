# Antigravity dispatch 63 — fix the last two test bugs in mirror-department.test.ts

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
Dispatch 62 fixed three bugs in the new tests dispatch 60 added to
`artifacts/api-server/tests/mirror-department.test.ts`. Re-running the full suite afterward
surfaced two more, narrower bugs in the same two tests, fully diagnosed below by reading the
actual application response shapes. This dispatch applies those two fixes only.

## Read first
- `CURRENT_TASK.md` (repo root) — `## Order` step 3, same diagnosis as below.
- `artifacts/api-server/tests/mirror-department.test.ts` — the two failing tests: "Test
  student's leave-record submission succeeds (resolves leave_type against real)" and "Test
  student case-log submission is visible to test prof and HOD".
- `artifacts/api-server/src/routes/student.ts` lines 594-609 — the leave-balance check that
  rejects the current test's request.
- `artifacts/api-server/src/routes/professor.ts` lines 128-193 and 259-263 — the actual
  shape of `GET /:professorId/review-queue`'s response: `pendingReviews` (not `caseLogs`),
  a flat array where each row has `dbId` (the underlying log table's numeric id) and
  `logType` (`"case"`, `"procedure"`, `"academic"`, or `"conference"`).
- `artifacts/api-server/tests/support.ts` lines 37-47 — confirms `leaveTypes` catalog
  values for a seeded department include `casual` (`required: 9 + index`), `academic`
  (`required: 4 + index`), `medical` (`required: 15`), `maternity` (`required: 0`,
  unlimited/no cap since the leave-balance check only applies `if (catalogEntry.required >
  0)`).

## Build
Both fixes are inside `artifacts/api-server/tests/mirror-department.test.ts` only.

- [ ] **Test 1 — "Test student's leave-record submission succeeds (resolves leave_type
      against real)".** Currently picks `realResponse.body.leaveTypes[0]`, which
      alphabetically resolves to "Academic Leave" (`required: 4` for the source
      department), while the test requests a 5-day leave (`startDate: "2026-10-01"`,
      `endDate: "2026-10-05"`, inclusive = 5 days) — this exceeds the 4-day balance and the
      app correctly 400s. Fix the test, not the app: select the catalog entry whose `value`
      is `"casual"` specifically (`realResponse.body.leaveTypes.find((l: any) => l.value
      === "casual")`), which has a 9-day balance for the source department, comfortably
      covering the 5-day request. Keep the rest of the test (dates, reason, assertion of
      201) unchanged.
- [ ] **Test 2 — "Test student case-log submission is visible to test prof and HOD".**
      Currently reads `profRes.body.caseLogs.some(...)`, `hodRes.body.caseLogs.some(...)`,
      and `realHodRes.body.caseLogs.some(...)`, but the endpoint has no `caseLogs` field.
      Replace all three with `pendingReviews`, filtering for the row this test's own
      case-log submission produced: `body.pendingReviews.some((l: any) => l.logType ===
      "case" && l.dbId === postRes.body.id)`. Do not change the `postRes` assertion (POST
      `/students/:id/case-logs` already correctly returns 201 with the inserted row as the
      body, so `postRes.body.id` is already correct) or the three request calls themselves
      — only the three `.some(...)` lookups need to change from `caseLogs` to
      `pendingReviews` with the `logType`/`dbId` shape.

## Do NOT touch
- Any file other than `artifacts/api-server/tests/mirror-department.test.ts`.
- Any test in this file other than these two.
- Application/source code — both of these are test-only bugs. Nothing under
  `artifacts/api-server/src/` needs to change.
- Any file outside `artifacts/api-server/`.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).

## Explicitly not in scope for this dispatch
The same four pre-existing, unrelated failures noted in dispatch 62 remain out of scope:
`access.test.ts`'s department-loop test, `catalog-competency.test.ts`'s two failures, and
`catalog-leave-type.test.ts`'s concurrency test. Do not touch them.

## Hard stops — stop and report, do not decide
- If, after these fixes, either test still fails for a reason not covered by the two bugs
  above, stop and report the new failure rather than guessing at another fix.
- Any value you would otherwise guess or invent.

## Verification
File-reads only (no shell available in this sandbox): after each edit, re-read the two
tests and confirm the field names and values used now match what the real endpoints return,
per the files listed in "Read first" above. Do not attempt to run the test suite — Claude
Code will do that after this dispatch returns.

## Report
Write `HANDOFF.md` at the repo root (overwrite the existing one — this is a continuation of
the same task):
- What changed, per test.
- Confirmation you touched no other file.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)` — Opus 4.6 (Thinking) quota is still exhausted from earlier in this
task (dispatch 59); not retrying it. Disclosed; this diff gets extra scrutiny at
`code-review`.
