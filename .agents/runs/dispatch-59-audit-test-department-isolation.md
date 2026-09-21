# Antigravity dispatch 59 — audit test-department isolation & config mirroring

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

## Read first
- `AGENTS.md` (repo root) — §3 Ownership before data, §4 The two ID systems, §5 No
  hardcoded department behaviour, §14.5 Halt conditions, §16 Rule map (translates any
  differently-numbered citation you see elsewhere).
- `CURRENT_TASK.md` (repo root) — the confirmed scope for this task.

## Build
This is a read-only audit. Your only output is one new file:
`.agents/runs/audit-test-department-isolation.md`. Do not edit any other file.

Produce that file with exactly these three parts:

**(a) Department-scoped query table.** For every department-scoped query in:
- `artifacts/api-server/src/lib/department-config-source.ts` (`resolveConfigDepartmentId()`
  and every call site of it)
- `artifacts/api-server/src/routes/student.ts`
- `artifacts/api-server/src/routes/professor.ts`
- `artifacts/api-server/src/routes/department.ts`
- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/api-server/src/routes/logs.ts`

List every query that lists students, logs, or supervisors, and every call site of
`resolveConfigDepartmentId` (~20 expected across these files). For each row give:
file:line, endpoint, which id it uses (the caller's own `departmentId` vs the resolved
config-source department id), whether the data touched is config data or user/clinical data
(students, logs, supervisors), and a verdict: correct / wrong-direction / leak. A "leak"
means test-department data could reach a real account or vice versa, or a supervisor picker
could surface a supervisor from the wrong department.

**(b) Department-level config/requirements table.** For every department-level
config table or flag — including the ones covered by
`artifacts/api-server/src/routes/department-requirements.ts` (the HOD Requirements tab
backend) and anything added since the mirror-department feature was built (procedure
groups, the Ward/Posting label, the Dermatology procedure-experience gating from PR #61,
assignment types) — search `artifacts/api-server/src` broadly for any such table/flag this
list doesn't already name. For each one give: read path resolved through
`resolveConfigDepartmentId` (Y/N), write path guarded so a mirror (test) department cannot
be written to (403) (Y/N), and any value that looks copied once at mirror-creation time in
`artifacts/api-server/src/lib/department-provisioning.ts`
(`provisionMirrorForRealDepartment`, around line 71) that should instead be resolved live
from the real department every time it's read.

**(c) The break trace.** Trace the path "a test student submits a case log → the test
professor's queue → the test HOD's view" through the actual route/query code, and name the
exact file:line where that chain currently breaks (i.e. where the test prof/HOD would not
see the log, or where a real prof/HOD would incorrectly see it). If it does not break,
say so and show the file:line evidence that it works end to end.

Also note, as a short list at the end of the report, anything you found that
`CURRENT_TASK.md`'s `## Explicitly out of scope` already excludes (e.g. existing
test-department rows already written with a wrong real supervisorId) — list them for the
developer, do not fix them.

## Do NOT touch
- Any file other than `.agents/runs/audit-test-department-isolation.md`. This dispatch
  makes no code change of any kind — no source, no tests, no config.
- Schema/migrations — no `drizzle-kit push`/`migrate`, no new tables or columns. If you find
  a case that seems to need a schema change, note it in the report; do not act on it.
- Any code path unrelated to department-scoping/config-resolution.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).

## Hard stops — stop and report, do not decide
- You will not encounter a decision point in a read-only audit, but if you find yourself
  wanting to change code to "fix" something you notice: don't. Write it into the report
  instead. This entire dispatch is report-only.
- Any value you would otherwise guess or invent — if a call site's intent is ambiguous, say
  so in the report rather than assuming which id it "should" use.

## Report
Write `HANDOFF.md` at the repo root, in addition to the audit file above:
- Confirm the one file you created/changed: `.agents/runs/audit-test-department-isolation.md`.
- Anything you could not determine from reading the code alone, and why.
- Anything you expanded beyond the three parts (a)/(b)/(c) above, and why.

A claim in the audit without file:line evidence is recorded as unverified. Do not open a
pull request. Do not run `git commit` or `git push`.

## Model
Claude Opus 4.6 (Thinking) — per `CURRENT_TASK.md`'s `## Suggested Antigravity model`.
