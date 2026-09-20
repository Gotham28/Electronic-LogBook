# Antigravity dispatch 33 — Mirror test department (fix missing studentsTable fixture row)

job_id: b7543bdb53b14ea1a2d608a5d72268d2
workdir: D:\Electronic-LogBook-main
branch: feature/mirror-test-department
model: Gemini 3.1 Pro (High)
allowed_paths:
- artifacts/api-server/tests/mirror-department.test.ts
- HANDOFF.md

## Guard
This prompt is for "Electronic-LogBook" (Arogya platform, Pediatrics pilot), task file
`CURRENT_TASK.md` at the repo root, feature "mirror test department" — this is a small fix
round after Claude Code ran the real test suite and found one fixture bug in the previous
dispatch's new test. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command, and not `pnpm test`. Use file-reading and file-editing tools
only. Claude Code runs `pnpm test` after this dispatch returns.

## What's wrong
`artifacts/api-server/tests/mirror-department.test.ts`'s `before()` block (around lines
54-69) creates the "Mirror Student" fixture by inserting only into `usersTable` (role:
"student"). It never inserts a matching row into `studentsTable`. The analytics route
(`department.ts`'s `GET /:departmentId/analytics`) joins `studentsTable` to `usersTable`
(`INNER JOIN`) to build its student list, so a user with no `studentsTable` row is invisible
to it. Running `pnpm test` confirms this: the new test "/:departmentId/analytics as test HOD
-> only test-department students" gets `totalStudents: 0` instead of `1` — 94/95 tests pass,
this is the one remaining failure.

## Build
In the same `before()` block, right after the existing "Insert mirror student" `usersTable`
insert (around line 55-62), add a matching `studentsTable` insert for that same user, using
the exact same shape already used elsewhere in this test suite —
`artifacts/api-server/tests/support.ts:48-50`:
```
const [student] = await db.insert(studentsTable).values({ userId: user.id, batch: "2026",
  registrationNumber: "TEST-" + user.id, kuhsId: "UNIV-" + user.id, specialty: name, dateOfJoining: "2026-01-01" }).returning();
```
Adapt the literal values to this file's own variable names (the mirror student's `usersTable`
row, whatever it's called locally) and add whatever import `studentsTable` needs (check
`database.js`'s existing exports, same module `departmentsTable`/`departmentConfigsTable`
are already imported from at the top of this file). Do not change anything else in the file.

## Do NOT touch
- Any file other than `artifacts/api-server/tests/mirror-department.test.ts` and `HANDOFF.md`.
- Any other test case or fixture already in this file.
- Any shell command whatsoever, including `pnpm test`, or any `git` command.

## Report
Append a short section to `HANDOFF.md`: the exact change made, file:line. State you did not
run the test (sandbox constraint) — Claude Code will. Do not open a pull request. Do not run
`git commit` or `git push`.
