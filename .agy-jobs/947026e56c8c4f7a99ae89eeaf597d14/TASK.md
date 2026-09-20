# Antigravity dispatch 46 — Fix access.test.ts fixture for computed department requirements

## Guard
This prompt is for the project at Electronic-LogBook (Gotham28/Electronic-LogBook), task file `CURRENT_TASK.md` (repo root). This is a direct follow-up to dispatch 45 (already applied to the working tree, uncommitted) on the same task — a real test failure found by actually running `pnpm test` in artifacts/api-server, not a hypothetical. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command. Do not run the test suite yourself to check your fix — that
verification happens outside this dispatch, in Claude Code, after you finish. Do the entire
task using only file-reading and file-editing tools.

## Context
Dispatch 45 made `requiredCases`/`requiredProcedures`/`requiredAcademic` on `department_configs`
computed from the Training Catalog instead of accepted directly in `POST /department/config`'s
request body. `configSchema` (in `artifacts/api-server/src/lib/validation.ts`) is `.strict()`,
so a request that still includes those three fields is now rejected with 400 (unrecognized
keys), not silently ignored.

Running `pnpm test` in `artifacts/api-server` after dispatch 45 shows 131/132 tests passing,
with exactly one failure:

```
test at tests\access.test.ts:1:14304
✖ HOD requirements and training catalog are database-backed and reject cross-department updates (11.4142ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  400 !== 200
      at TestContext.<anonymous> (D:\Electronic-LogBook-main\artifacts\api-server\tests\access.test.ts:210:10)
```

## Build
- [ ] In `artifacts/api-server/tests/access.test.ts`, in the test named `"HOD requirements and training catalog are database-backed and reject cross-department updates"` (currently around lines 207-217):
  - Line ~208: the `configuration` object currently is `{ requiredCases: 17, requiredProcedures: 21, requiredAcademic: 5, programDurationMonths: 31, casualLeaveAllowance: 12, academicLeaveAllowance: null }`. Remove `requiredCases`, `requiredProcedures`, and `requiredAcademic` from this object — only `programDurationMonths`, `casualLeaveAllowance`, `academicLeaveAllowance` should remain, since those are the only fields `POST /department/config` accepts now.
  - Line ~210 (`POST /admin/department/config` as `hod2` with `configuration`) should now correctly assert `200` (it already does — this line itself doesn't need to change, just the object it references).
  - Line ~211 (same POST plus an injected `departmentId` field, expecting `400`) needs no change — the `.strict()` schema still rejects that unrecognized field the same way it did before.
  - Line ~213 currently asserts `(await call("/departments/" + departmentIds[2] + "/catalog", "student2")).body.config.requiredCases` equals `17`. Since no case-category catalog entries have been created for this department at this point in the test, and `requiredCases` is now computed as the sum of `case_category`/`period=total` catalog entries (which is empty here), change the expected value from `17` to `0` — this correctly reflects that the field is now computed, not directly settable, and that the computed value for a department with no matching catalog entries is zero.
  - Do not change anything else in this test or file — the rest of the test (the catalog-entry POST at line ~214, the cross-department PATCH rejection at line ~216) is unaffected by dispatch 45 and must stay exactly as is.

## Do NOT touch
- Any other test in `access.test.ts` or any other test file.
- Any file touched by dispatch 45 (`admin.ts`, `validation.ts`, `department-requirements.ts`, `DepartmentSettings.tsx`) — those are already correct and complete; this dispatch only fixes the one stale test fixture.
- Anything not named under Build above.

## Hard stops — stop and report, do not decide
- Any schema change, migration, or backfill.
- Any secret, credential, or `.env` value.
- Any value you would otherwise guess or invent — if the exact line numbers have shifted from what's given above, find the test by its name string, not by assuming the line numbers are exact.

## Report
Write `HANDOFF.md` at the repo root (this will overwrite dispatch 45's HANDOFF.md — that one
was never actually written because dispatch 45 was cut off before its report step, so there
is nothing to preserve there):
- The exact diff of `access.test.ts`.
- Confirm you touched only this one file.

Do not attempt to run the test suite, typecheck, or any other command. Do not open a pull
request. Do not run `git commit` or `git push`.

## Model
Claude Sonnet 4.6 (Thinking)


## Files you may touch
- artifacts/api-server/tests/access.test.ts
- HANDOFF.md