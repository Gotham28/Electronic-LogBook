# Antigravity dispatch 48 — Fix review findings on the computed-requirements feature

## Guard
This prompt is for the project at Electronic-LogBook (Gotham28/Electronic-LogBook), task file `CURRENT_TASK.md` (repo root). This is a fix-review-findings follow-up on the same task as dispatches 45-47 (computed department requirements). If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint — read this first, it is the most important part of this prompt
You have no shell access in this sandbox. Do not call `run_command`, or any shell tool, for
any reason, at any point — not to check your work, not to look something up, not to test
whether shell access exists, not even once, not even something harmless like `echo`. Three
previous attempts at this exact task all called `run_command` within the first minute and
were denied, ending the task with zero file edits every time. Do not repeat that. Every
single thing you need — including how to figure out the correct expected numbers for new
test assertions — must be done by reading files with your file tool and reasoning about
what you read. If you find yourself about to call any tool named `run_command` or similar,
stop, and use a file-reading tool instead.

## Read first
- `artifacts/api-server/src/lib/department-requirements.ts` — the two functions you're fixing
- `artifacts/api-server/src/lib/department-provisioning.ts` (around lines 30-31) — the existing atomic-upsert convention to match: `await tx.insert(departmentConfigsTable).values({ ...setup.config, departmentId: department.id }).onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: setup.config });`
- `artifacts/api-server/tests/access.test.ts` — the test named `"HOD requirements and training catalog are database-backed and reject cross-department updates"` (currently around lines 207-217)

## Context
Code review found two real issues in the computed-department-requirements feature (already applied to the working tree, uncommitted):

1. **Race condition.** Both functions in `department-requirements.ts` do a non-atomic SELECT-then-branch-to-insert-or-update against `department_configs`, which has a UNIQUE constraint on `departmentId`. Two near-concurrent calls for a department with no existing config row (a normal state) can both see "no row," both attempt INSERT, and the second throws a unique-violation — and since most of the six call sites in `admin.ts` have no try/catch, that request would hang rather than error cleanly.

2. **No real test coverage of the actual sum/filter logic.** The one relevant test asserts `requiredCases === 9`, but that "9" is a legacy value from a raw fixture insert in `support.ts` that the recompute logic never touched — there are zero `case_category` catalog rows anywhere in the test suite, so the case-category sum path has never actually run in a test. The academic sum path did run once (via an existing catalog POST in this test) but its result was never checked either.

## Build
- [ ] In `department-requirements.ts`, replace the SELECT-then-branch logic in both `recomputeProcedureRequirement` and `recomputeCatalogRequirements` with a single atomic upsert using Drizzle's `.onConflictDoUpdate`, targeting `departmentConfigsTable.departmentId`, matching the exact pattern shown above from `department-provisioning.ts`. Each function must still only set the column(s) it owns: `recomputeProcedureRequirement` sets only `requiredProcedures` on both the insert values and the conflict `set`; `recomputeCatalogRequirements` sets only `requiredCases` and `requiredAcademic` on both. Do not set any other column (`programDurationMonths`, `casualLeaveAllowance`, `academicLeaveAllowance`) in either function's insert values or conflict set — those must remain untouched either way, exactly as they are now.
- [ ] In `access.test.ts`'s `"HOD requirements and training catalog..."` test: after the existing `POST /admin/department/catalog` call that creates the `kind: "academic", period: "month"` entry (currently around line 214), add a new `POST /admin/department/catalog` call creating a `kind: "case_category"` entry with `period: "total"` and a known `required` value (e.g. `required: 5`) for the same department (as `"hod2"`, same as the existing calls in this test). Then add an assertion that reads `/departments/{departmentIds[2]}/catalog` again (as `"student2"`, same pattern as the existing read at what is now an earlier line) and confirms `body.config.requiredCases` now equals the correct sum — reason through this by reading the file yourself: find every place a `case_category` catalog row could already exist for `departmentIds[2]` before this new one you're adding (check `support.ts` and this test file itself), add up their `required` values (only counting `period: "total"` rows), then add your new row's `required` value on top — that total is the number to assert, not a guess. Also add a similar new `academic`/`period: "total"` catalog entry with a known `required` value, and an assertion afterward that `requiredAcademic` correctly reflects it (again, by tracing all pre-existing `period: "total"` academic rows for that department plus your new one — the pre-existing `period: "month"` entry already in this test must NOT be included in that sum).
- [ ] Do not change the existing assertions this test already has for status codes (200/400/403/404) — only add new assertions and the new catalog-creation calls needed to exercise them.

## Do NOT touch
- Any of the six call sites in `admin.ts` that call these two functions — those are correct and already wired up.
- `validation.ts`, `DepartmentSettings.tsx` — already correct, not part of this fix.
- Any other test in `access.test.ts` or any other file.
- The mirror-department guard gap on the two DELETE routes (a separate, pre-existing issue, not part of this fix).
- Anything not named under Build above.

## Do NOT touch
- Any of the six call sites in `admin.ts` that call these two functions — those are correct and already wired up.
- `validation.ts`, `DepartmentSettings.tsx` — already correct, not part of this fix.
- Any other test in `access.test.ts` or any other file.
- The mirror-department guard gap on the two DELETE routes (a separate, pre-existing issue, not part of this fix).
- Anything not named under Build above.

## Hard stops
- Any schema change, migration, or backfill.
- Any secret, credential, or `.env` value.
- Any value you would otherwise guess or invent — if after reading the fixture code you remain genuinely unsure what a number should be, say so plainly in your report rather than guessing.

## Report
Write `HANDOFF.md` at the repo root (this will overwrite dispatch 47's — that one only covered a one-line test fix that's no longer the most current record):
- The exact diff of both files.
- For the new test assertions specifically: show your reasoning for what the expected numbers should be, referencing the actual seed/fixture code you traced through.
- Confirm you touched only the two named files.

Do not attempt to run typecheck or the test suite. Do not open a pull request. Do not run
`git commit` or `git push`.

## Model
Claude Sonnet 4.6 (Thinking)


## Files you may touch
- artifacts/api-server/src/lib/department-requirements.ts
- artifacts/api-server/tests/access.test.ts
- HANDOFF.md