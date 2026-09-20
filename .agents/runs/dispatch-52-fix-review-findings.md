# Antigravity dispatch 52 — fix review finding on faculty progress endpoint

Dispatched directly via `agy_start_edit`, job id `e0f876af33894410ad913c87c16247c1`,
model `Claude Opus 4.6 (Thinking)`, workdir `D:\Electronic-LogBook-main`, branch
`feature/faculty-progress-breakdown`. Follow-up to dispatch 51, fixing the one correctness
finding from the code-review pass (NULL case_logs.status silently dropped from counts).

## Guard
This prompt is for the project at Electronic-LogBook, task file `CURRENT_TASK.md` at the
repo root, section `## Review findings to fix (dispatch 52)`, on branch
`feature/faculty-progress-breakdown`. If this is not that repo, stop, say which repo this
is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Read first
- `CURRENT_TASK.md` — specifically the `## Review findings to fix (dispatch 52)` section at
  the bottom, in full
- `artifacts/api-server/src/routes/student.ts` — the `GET /:studentId/progress` route added
  in the previous dispatch (currently the last route before `// Postings`), specifically the
  case-category reshape loop (`caseCategoryMap`, around lines 313-327)

## Build
- [ ] In the case-category reshape loop only, change the condition that currently reads
      `else if (row.status === "pending")` to also match `row.status === null`, so a
      `case_logs` row with a `NULL` status (the column has no `NOT NULL` constraint at the DB
      level, unlike `procedure_logs.status` and `academic_logs.status`) is counted as pending
      rather than silently excluded. Add a short comment next to the change explaining why,
      matching the style of the existing comment that explains the `NULL` category handling
      in this same block.

## Do NOT touch
- The procedure reshape loop (`procedureMap`/`competencyMap`) — do not add NULL-status
  handling there. `procedure_logs.status` is `NOT NULL`.
- The academic reshape loop (`academicMap`) — do not add NULL-status handling there.
  `academic_logs.status` is `NOT NULL`.
- The redundant department re-check block earlier in the same route — leave exactly as is,
  do not remove or simplify it.
- Any other line in `student.ts`, or any other file.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).

## Hard stops — stop and report, do not decide
- If the case-category reshape loop does not match the shape described above (e.g. it has
  already changed since the last dispatch), stop and report the discrepancy rather than
  guessing.
- Any schema change, migration, or backfill.
- Any value you would otherwise guess or invent.

## Report
Update `HANDOFF.md` at the repo root (append a new section, do not remove the existing
one from the previous dispatch):
- The exact one-condition diff
- Confirmation, read directly from the file, that the procedure and academic reshape loops
  were not touched, and no other line in the file changed

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`. Do not run any test.

## Model
Claude Opus 4.6 (Thinking)
