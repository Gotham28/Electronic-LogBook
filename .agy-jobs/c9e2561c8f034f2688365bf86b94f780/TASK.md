# Antigravity dispatch 48 — Fix review findings on the computed-requirements feature

## Guard
This prompt is for the project at Electronic-LogBook (Gotham28/Electronic-LogBook), task file `CURRENT_TASK.md` (repo root). Follow-up to dispatches 45-47 on the same task. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint — read this first
You have no shell access. Do not call `run_command`, or any shell tool (including `echo`,
`findstr`, `grep`, or anything similar), for any reason, at any point. Five previous attempts
at this exact task all called a shell tool within the first minute and were denied, ending
every one with zero file edits. Do not open, read, or reference `AGENTS.md` — it is written
for a human developer and does not apply to you. All the fixture math you might otherwise
want to search for has already been worked out below and handed to you directly — you do
not need to search, trace, or compute anything yourself. Just make the two edits described.
Use only file-reading and file-editing tools, and only on the three files named under "Read
first" below.

## Read first
- `artifacts/api-server/src/lib/department-requirements.ts`
- `artifacts/api-server/src/lib/department-provisioning.ts` (lines ~30-31 only, for the upsert pattern shown below)
- `artifacts/api-server/tests/access.test.ts` (the test named `"HOD requirements and training catalog are database-backed and reject cross-department updates"`, currently around lines 207-217)

## Build item 1 — atomic upsert (fixes a real race condition)
In `department-requirements.ts`, both `recomputeProcedureRequirement` and `recomputeCatalogRequirements` currently do a SELECT to check if a `department_configs` row exists, then branch to a separate INSERT or UPDATE. This is not atomic: two near-simultaneous calls for a department with no existing row can both see "no row" and both INSERT, and the second throws a unique-constraint violation (`department_configs.departmentId` is UNIQUE) with no try/catch anywhere upstream, hanging the request.

Replace the SELECT-then-branch in both functions with a single atomic upsert using Drizzle's `.onConflictDoUpdate`, exactly matching this existing convention from `department-provisioning.ts:30-31`:
```ts
await tx.insert(departmentConfigsTable).values({ ...setup.config, departmentId: department.id })
  .onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: setup.config });
```
For `recomputeProcedureRequirement`: `.insert(departmentConfigsTable).values({ departmentId, requiredProcedures }).onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: { requiredProcedures } })`. Do not set any other column.
For `recomputeCatalogRequirements`: `.insert(departmentConfigsTable).values({ departmentId, requiredCases, requiredAcademic }).onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: { requiredCases, requiredAcademic } })`. Do not set any other column.
Remove the now-unused SELECT-existence-check code in both functions. Keep the two SUM queries exactly as they are — only the upsert mechanism changes.

## Build item 2 — real test coverage (exact values, already computed for you)
In `access.test.ts`, in the test named above, AFTER the existing line that does:
```ts
const option = await call("/admin/department/catalog", "hod2", "POST", { kind: "academic", name: "Custom seminar", value: "custom-seminar", required: 2, period: "month" });
assert.equal(option.status, 201);
```
...and BEFORE the final existing line (`assert.equal((await call("/admin/department/catalog/" + option.body.id, ...`), insert exactly this block:

```ts
const caseCategory = await call("/admin/department/catalog", "hod2", "POST", { kind: "case_category", name: "Custom case type", value: "custom-case-type", required: 5, period: "total" });
assert.equal(caseCategory.status, 201);
assert.equal((await call("/departments/" + departmentIds[2] + "/catalog", "student2")).body.config.requiredCases, 5);
const academicTotal = await call("/admin/department/catalog", "hod2", "POST", { kind: "academic", name: "Custom total seminar", value: "custom-total-seminar", required: 7, period: "total" });
assert.equal(academicTotal.status, 201);
assert.equal((await call("/departments/" + departmentIds[2] + "/catalog", "student2")).body.config.requiredAcademic, 12);
```

Do not change these two numbers (`5` and `12`) — they are already correctly derived: department index 2 (`departmentIds[2]`) starts with zero `case_category` catalog rows (so after adding one with `required: 5`, the computed total is exactly `5`), and starts with exactly one existing `academic`/`period: "total"` row seeded at `required: 5` in `tests/support.ts` (the "Test discussion 2" entry — the `period: "month"` "Custom seminar" entry added earlier in this same test is excluded from the sum), so after adding a second `academic`/`period: "total"` row at `required: 7`, the computed total is `5 + 7 = 12`.

Do not change any of this test's existing lines or assertions — only insert the new block exactly where specified.

## Do NOT touch
- Any of the six call sites in `admin.ts` — already correct.
- `validation.ts`, `DepartmentSettings.tsx` — already correct.
- `tests/support.ts` or any other test file.
- Anything not named under Build above.

## Hard stops
- Any schema change, migration, or backfill.
- Any secret, credential, or `.env` value.

## Report
Write `HANDOFF.md` at the repo root (overwrite dispatch 47's — superseded):
- The exact diff of both files.

Do not run typecheck, the test suite, or any command. Do not open a pull request. Do not
run `git commit` or `git push`.

## Model
Claude Sonnet 4.6 (Thinking)


## Files you may touch
- artifacts/api-server/src/lib/department-requirements.ts
- artifacts/api-server/tests/access.test.ts
- HANDOFF.md