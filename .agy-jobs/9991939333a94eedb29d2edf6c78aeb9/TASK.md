# Antigravity dispatch — faculty progress endpoint (Task 1 of 2)

## Guard
This prompt is for the project at Electronic-LogBook, task file `CURRENT_TASK.md` at the
repo root, on branch `feature/faculty-progress-breakdown`. If this is not that repo, stop,
say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Read first
- `AGENTS.md` — §3 ownership, §4 the two ID systems, §8 no patient text near logs, §16 rule map
- `CURRENT_TASK.md` — the confirmed scope, in full
- `artifacts/api-server/src/routes/student.ts` — read the whole file, especially the
  `/:studentId/logs` handler (around lines 138-225) and `router.use("/:studentId", studentAccess)`
  near the top
- `artifacts/api-server/src/middlewares/student-access.ts` — read in full
- `artifacts/api-server/src/lib/validation.ts` — for existing schema/helper conventions

## Build
- [ ] Add exactly one new route, `GET /:studentId/progress`, to
      `artifacts/api-server/src/routes/student.ts`, inserted immediately after the closing
      `});` of the existing `/:studentId/logs` handler and before the `// Postings` comment.
      Follow the full specification under `## What to build` in `CURRENT_TASK.md` exactly:
      the three GROUP BY queries (case_logs, procedure_logs, academic_logs), the exact
      response JSON shape, the deliberate no-supervisorId-filter departure (with an
      explanatory comment referencing the existing "Faculty inspection is assignment-scoped"
      comment above it), the defense-in-depth department re-check mirroring `/:studentId/logs`,
      and the counts-only / no-patient-text constraint.

## Do NOT touch
- Any file other than `artifacts/api-server/src/routes/student.ts`.
- `studentAccess` middleware or any of `requireAuth`/`requireRole`/`requireDepartment`.
- The existing `/:studentId/logs`, `/:studentId/dashboard`, or any other existing route —
  read-only reference, no edits.
- Any test file.
- `professor.ts`, `admin.ts`, `department.ts`, or any file outside `student.ts`.
- Any schema file or migration file.
- Any conferences-related table or field — explicitly out of scope, see `CURRENT_TASK.md`
  Context section.
- Any target/`required`/percentage field in the new response — this endpoint returns counts
  only, no targets.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).
- Anything not named under Build above.

## Hard stops — stop and report, do not decide
- Any change to a route or query touching case_logs, procedure_logs, academic_logs,
  leave_records, postings, research, assessments, or attendance beyond the one route
  specified above.
- Any place `studentsTable.id` and `usersTable.id` could be conflated.
- Any schema change, migration, or backfill.
- Anything that would put patient text or a leave reason near a log, error, or audit trail.
- Any secret, credential, or `.env` value.
- Any value you would otherwise guess or invent — including any target/requirement number,
  which does not belong in this response at all.
- If `/:studentId/logs`, `student-access.ts`, or `validation.ts` do not match what
  `CURRENT_TASK.md` describes (e.g. line numbers have shifted further, or the
  enumeration-collapse behavior in `studentAccess` looks different from what is described),
  stop and report the discrepancy rather than guessing which version is correct.

## Report
Write `HANDOFF.md` at the repo root:
- What changed, per file, and why
- The exact diff for `student.ts`
- Anything you skipped, and why (including any step you could not do because it would have
  required a shell command)
- Anything you expanded beyond the Build list, and why
- Confirmation, read directly from the file, that no `supervisorId` filter appears in any of
  the three new queries, no `conferences` reference was added, and no target/`required`
  field appears in the response shape

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`. Do not run any test.

## Model
Claude Opus 4.6 (Thinking)

## Files you may touch
- artifacts/api-server/src/routes/student.ts
- HANDOFF.md