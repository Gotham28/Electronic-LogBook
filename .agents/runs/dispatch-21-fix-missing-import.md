# Antigravity dispatch 21 — Fix review finding: missing import in access.test.ts

job_id: 2acfe637dffd4fecb1507ec5dde6b899
workdir: D:\Electronic-LogBook-main
branch: feature/hod-direct-student-creation
model: Gemini 3.1 Pro (High)
allowed_paths:
- artifacts/api-server/tests/access.test.ts
- HANDOFF.md

Follow-up to dispatch 20. `pnpm test` from `artifacts/api-server/` showed 79/80 passing;
the one failure was `ReferenceError: studentsTable is not defined` at
`tests/access.test.ts:101:47` — the new test uses `studentsTable` but it was never added
to the destructured import from `./database.js`. This dispatch adds it.

## Guard
This prompt is for the project `Electronic-LogBook` (Gotham28/Electronic-LogBook), branch
`feature/hod-direct-student-creation`. If this is not that repo, stop, say which repo this
is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Context
A previous dispatch on this branch added a test to `artifacts/api-server/tests/access.test.ts`
titled "HOD-created students are bound to their HOD's department and require no payment;
duplicate emails are rejected". That test uses `studentsTable` (e.g.
`db.select().from(studentsTable).where(eq(studentsTable.registrationNumber, "DIR-001"))`)
but `studentsTable` was never added to the destructured import from `./database.js` at the
top of the file (currently: `import { engine, db, usersTable, assignmentsTable,
assignmentRecipientsTable, auditTable, subscriptionPlansTable, paymentsTable } from
"./database.js";`).

Running `pnpm test` from `artifacts/api-server/` confirms this fails with:
`ReferenceError: studentsTable is not defined` at `tests/access.test.ts:101:47`. All other
79 tests in the suite pass; this is the only failure.

`tests/database.ts` re-exports the full schema (`export * from
"../../../lib/db/src/schema/index.js";`), so `studentsTable` is available from
`./database.js` — it simply needs to be added to the existing import list.

## Build
- [ ] In `artifacts/api-server/tests/access.test.ts`, add `studentsTable` to the existing
  destructured import from `./database.js` (do not add a second import statement, do not
  change any other name already in that list).
- [ ] Read the rest of the file to confirm no other identifier used in the new test block
  (search for the test titled "HOD-created students are bound to their HOD's department and
  require no payment; duplicate emails are rejected") is similarly missing from the imports.
  If you find another one, add it the same way. Do not modify any test's assertions or logic
  — only import statements.

## Do NOT touch
- Any file other than `artifacts/api-server/tests/access.test.ts`
- Any test logic, assertion, or test body — this is an import-list fix only
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler)

## Hard stops — stop and report, do not decide
- If the fix would require anything beyond adding missing names to the existing import
  statement, stop and report rather than deciding on a different approach

## Report
Overwrite `HANDOFF.md` at the repo root with what changed and why. Do not open a pull
request. Do not run `git commit` or `git push`.
