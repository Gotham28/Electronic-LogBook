# Antigravity dispatch 37 — Fix stale test assertion after code-derivation change

## Guard
This prompt is for "Electronic-LogBook" (Arogya platform, Pediatrics pilot), task file
`CURRENT_TASK.md` at the repo root. If this is not that repo, stop, say which repo this is,
and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason. Use file-reading and
file-editing tools only. Do not run `pnpm test` or `git`.

## What's wrong
`artifacts/api-server/tests/auto-provision.test.ts:45` still asserts the OLD mirror
department code format: `assert.equal(mirrorDept.code, "NEWREAL123-TEST");`. A prior dispatch
correctly changed the actual implementation to derive the mirror's code from the real
department's numeric id instead (`` `TEST-${department.id}` ``, in
`artifacts/api-server/src/lib/department-provisioning.ts`), to remove a collision risk. This
one test assertion was never updated to match, so `pnpm test` now fails with `'TEST-4' !==
'NEWREAL123-TEST'` — the actual code behavior is correct, only this one line is stale.

## Build
In `artifacts/api-server/tests/auto-provision.test.ts`, change line 45 from
`assert.equal(mirrorDept.code, "NEWREAL123-TEST");` to
`` assert.equal(mirrorDept.code, `TEST-${realDeptId}`); `` — `realDeptId` is already in
scope two lines above it (line 33: `const realDeptId = result.departmentId;`). Change
nothing else in this file.

## Do NOT touch
- Any file other than `artifacts/api-server/tests/auto-provision.test.ts`.
- Any other line or test case in that file.
- Any shell command whatsoever.

## Report
Append one short line to `HANDOFF.md` stating the exact change made, file:line. Do not open
a pull request. Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/tests/auto-provision.test.ts