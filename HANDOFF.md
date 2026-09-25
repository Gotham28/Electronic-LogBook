# HANDOFF.md — Dispatch 67: Procedure experience on for every department

Branch: `feat/procedure-experience-all-departments`  
Worked from: `main` at `4fb3257` (verified in pre-dispatch, Claude Code session, 2026-09-25).  
Agent ran: no shell commands. All work done via file-reading and file-editing tools only.

---

## Step 0 Result

**(a) Does the frontend's read of `enabledFeatures` resolve mirror departments through `configSourceDepartmentId`?**

**YES.**

- `ProcedureLogsPage.tsx:40` destructures `config` from `useDepartment()`.
- `useDepartment()` returns context from `DepartmentProvider`, which calls `GET /api/departments/${departmentId}/catalog` (`department-context.tsx:26`).
- `department.ts:30`: `const configSourceId = await resolveConfigDepartmentId(departmentId);`
- `department.ts:35`: `db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1)` — config is keyed on `configSourceId`, which for a mirror is the real department's ID.
- `department-config-source.ts:18-20`: if `configSourceDepartmentId` is null, returns `dept.id`; otherwise resolves to the source's ID at lines `27-38`.

**(b) Does the `competency_level` catalog read resolve mirrors through `configSourceDepartmentId`?**

**YES.**

- Same route and same `configSourceId`.
- `department.ts:37`: `db.select().from(departmentCatalogTable).where(eq(departmentCatalogTable.departmentId, configSourceId))` — the entire catalog (including `competency_level` rows) is keyed on `configSourceId`.

**Both pass. Build proceeds.**

---

## Files changed

| File | Change |
|---|---|
| `lib/db/migrations/0011_procedure_experience_all_departments.sql` | **New.** SQL migration. |
| `lib/db/src/migrations.ts` | Registered `0011_procedure_experience_all_departments.sql` as last entry of `files` array (line 13). |
| `lib/db/src/schema/department_configs.ts` | Line 11: `.default({})` → `.default({ procedureExperience: true })`. |
| `artifacts/api-server/src/lib/department-provisioning.ts` | Lines 30-37: always ensures a config row; merges `procedureExperience:true` when `setup.config` is present. |
| `artifacts/api-server/src/routes/admin.ts` | Line 477: insert branch now uses `{ procedureExperience: true, ...(enabledFeatures ?? {}) }`. |
| `artifacts/mockup-sandbox/src/components/pages/ProcedureLogsPage.tsx` | Lines 201-214: empty-state message when flag is on but levels array is empty. |
| `artifacts/api-server/tests/procedure-experience-all-departments.test.ts` | **New.** Test file. |
| `HANDOFF.md` | **Overwritten** (this file; supersedes dispatch-66 content). |

**Not touched:** `student.ts`, `logs.ts`, migrations `0001`–`0010`, all other existing test files.

---

## What changed and why

### `0011_procedure_experience_all_departments.sql`

Four idempotent statements, in order:

1. `ALTER TABLE department_configs ALTER COLUMN enabled_features SET DEFAULT '{"procedureExperience": true}'::jsonb` — future rows (no explicit `enabled_features`) get the flag automatically.
2. `INSERT INTO department_configs (department_id) SELECT d.id FROM departments d WHERE d.is_test = false AND NOT EXISTS (...)` — creates a row (using the new default) for every real department that has none. Guards with `NOT EXISTS`.
3. `UPDATE department_configs SET enabled_features = enabled_features || '{"procedureExperience": true}'::jsonb FROM departments d WHERE department_configs.department_id = d.id AND d.is_test = false` — merges the key into every real department's row. Never replaces the JSON. An existing explicit `false` is overwritten (developer decision, CURRENT_TASK.md §Decisions).
4. A single `INSERT INTO department_catalog ... SELECT ... FROM departments d CROSS JOIN (VALUES ...) ... WHERE NOT EXISTS (...)` statement. The previous draft used four separate `INSERT` statements, each checking `NOT EXISTS`; because they ran in the same transaction, after the first level was inserted, the guard failed for the remaining three levels, resulting in only one level per department. Using a single statement ensures the `NOT EXISTS` guard evaluates once against the initial state, properly seeding all four levels per department.

Column names confirmed against `lib/db/src/schema/users.ts` (`departments.is_test`, `departments.id`) and `lib/db/src/schema/department_catalog.ts` (`department_id`, `kind`, `name`, `value`, `required`, `period`). Table names confirmed against `lib/db/migrations/0002` and `lib/db/migrations/0006`. No `BEGIN`/`COMMIT` — the runner wraps each file in its own transaction.

### `lib/db/src/migrations.ts`

Added `"0011_procedure_experience_all_departments.sql"` as the last entry in the `files` array (line 13). Nothing else changed.

### `lib/db/src/schema/department_configs.ts`

Line 11: `.default({})` → `.default({ procedureExperience: true })`. Matches the column default set by the migration.

### `artifacts/api-server/src/lib/department-provisioning.ts`

Lines 30–37 (was lines 30–31):

```ts
if (setup.config) {
  const enabledFeatures = { procedureExperience: true, ...setup.config.enabledFeatures };
  await tx.insert(departmentConfigsTable).values({ ...setup.config, enabledFeatures, departmentId: department.id })
    .onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: { ...setup.config, enabledFeatures } });
} else {
  await tx.insert(departmentConfigsTable).values({ departmentId: department.id })
    .onConflictDoNothing();
}
```

- With no `setup.config`: inserts `{ departmentId }` with `onConflictDoNothing` — the column default provides `procedureExperience: true`. A re-run of provisioning on the same department does not overwrite.
- With `setup.config`: `procedureExperience: true` is the base; `setup.config.enabledFeatures` is spread on top. If `setup.config.enabledFeatures.procedureExperience` is explicitly `false`, the spread overwrites it — so an explicit `false` stays `false` (correct per spec).

### `artifacts/api-server/src/routes/admin.ts`

Line 477 (insert branch only):

```ts
enabledFeatures: { procedureExperience: true, ...(enabledFeatures ?? {}) }
```

`procedureExperience: true` is the base. If the body sent `enabledFeatures: { procedureExperience: false }`, the spread produces `false` — so an explicit `false` is respected. The update branch (lines 466–472) and all auth/validation code are unchanged.

### `artifacts/mockup-sandbox/src/components/pages/ProcedureLogsPage.tsx`

Lines 201–214 (was 201–210):

```tsx
{config?.enabledFeatures?.procedureExperience && (
  <Field label="Procedure experience">
    <Select value={form.experience} onValueChange={(value) => setForm({ ...form, experience: value })}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {competencyLevels.map((c) => <SelectItem key={c.id} value={c.value}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
    {competencyLevels.length === 0 && (
      <p className="text-sm text-slate-600">No procedure experience levels are set up for your department. Ask your HOD to add them in Department Settings.</p>
    )}
  </Field>
)}
```

**How a failed fetch is shown differently from an empty list:**

- `DepartmentProvider` (`department-context.tsx:37`) catches fetch errors and calls `setError(err.message)`. While `data` remains null, the provider renders a full-page error with a "Try again" button — `ProcedureLogsPage` never mounts.
- If the fetch succeeds and the API returns `competencyLevels: []`, `setData` is called with an empty array and `setError("")`. The page mounts and renders the empty-state message.
- These two states are distinguishable: fetch failure = page does not render; empty array = page renders, message is shown.
- The `error` state in `ProcedureLogsPage` itself (`line 50`) is for the `fetchLogs` call (the procedure-log list), not for the department catalog. That error path (`lines 162–167`) shows a separate rose-coloured error box. It does not affect the dropdown or the empty-state message.

Submission stays blocked when `competencyLevels.length === 0` via the existing `disabled` logic at `ProcedureLogsPage.tsx:232`:

```tsx
disabled={
  isSubmitting ||
  (Boolean(config?.enabledFeatures?.procedureExperience) && (!competencyLevels.length || !form.experience))
}
```

This was not changed.

---

## Read-only check queries for the developer (SELECT only — not run by this agent)

Run from any SQL client connected to the database, **before** and **after** running the migration.

**(i) Real departments that lack a `department_configs` row:**

```sql
SELECT d.id, d.name, d.code
FROM departments d
WHERE d.is_test = false
  AND NOT EXISTS (
    SELECT 1 FROM department_configs dc WHERE dc.department_id = d.id
  )
ORDER BY d.name;
```

**(ii) Each real department's `enabled_features->>'procedureExperience'`:**

```sql
SELECT d.id, d.name, dc.enabled_features->>'procedureExperience' AS procedure_experience
FROM departments d
LEFT JOIN department_configs dc ON dc.department_id = d.id
WHERE d.is_test = false
ORDER BY d.name;
```

**(iii) Real departments with zero `competency_level` catalog rows:**

```sql
SELECT d.id, d.name, d.code
FROM departments d
WHERE d.is_test = false
  AND NOT EXISTS (
    SELECT 1 FROM department_catalog c
    WHERE c.department_id = d.id AND c.kind = 'competency_level'
  )
ORDER BY d.name;
```

This agent ran nothing against any database.

---

## Test approach

**Migration-level tests** use isolated `new PGlite()` instances (closed after each test), never the shared engine from `database.ts`. The pre-0011 state is built by calling `applyMigrationsUpTo0010()` — a local helper that reads and applies migration files 0001–0010 directly via `database.exec()`, bypassing the runner's checksum tracking. Fixtures are then inserted in their pre-0011 shape (explicit `enabled_features` JSON without the `procedureExperience` key). The 0011 SQL text is then executed via `database.exec()` and the state is asserted.

**Provisioning and admin-route tests** use the shared `setup()` and a single `before`/`after` pair. Provisioning tests directly call `provisionDepartment()`, verifying both the database inserts and the resulting row for the real department, matching the approach in `auto-provision.test.ts`. Admin-route tests use `request()` against the running server.

### Test names in the new file

```
0011 is registered in the runner and runs through applyMigrations on a fresh PGlite
0011: every real department gets procedureExperience:true, test department untouched
0011 idempotency: running twice produces identical results
0011 column default: config row inserted without enabled_features gets procedureExperience:true
[describe: provisioning] department provisioned without setup.config gets procedureExperience:true from column default
[describe: provisioning] setup.config omitting procedureExperience key gets true from merge
[describe: provisioning] setup.config with explicit procedureExperience:false stays false (spread overrides default)
[describe: admin insert branch] POST /admin/department/config without enabledFeatures yields procedureExperience:true
[describe: admin insert branch] POST /admin/department/config with enabledFeatures:{procedureExperience:false} keeps false
```

---

## Items noticed and not fixed (§9)

### `admin.ts` update branch — whole-object replace

`admin.ts:470`:

```ts
enabledFeatures: enabledFeatures ?? existing[0].enabledFeatures
```

When a body sends `enabledFeatures`, the update **replaces** the entire JSON with the body's value. If a key is missing from the body (e.g., `{ attendedConferences: true }` with no `procedureExperience`), `procedureExperience` is silently dropped. This is the whole-object replace the task requires reporting but not fixing (CURRENT_TASK.md `## Explicitly out of scope`). Reported here per §9. Not touched.

### `migrations.test.ts` stale assertions (baseline failures, untouched)

- `migrations.test.ts:16`: expects 7 migration rows; now 10 exist. Stale.
- `migrations.test.ts:48`: reads `program_duration_months`, dropped in `0008`. Stale.

These are part of the known baseline of 11 failing tests. Not touched (CURRENT_TASK.md §Decisions, §Do NOT touch).

### Existing competency-level seed in provisioning

`department-provisioning.ts:35-42` seeds four competency levels when a department is provisioned and none are provided in the catalog. This pre-existing behaviour is unchanged and works correctly alongside the migration.

---

## Items skipped

- No shell commands of any kind were run.
- `pnpm test`, `pnpm typecheck`, and `git diff` will be run by Claude Code in its own verification shell session.
- The migration itself is not run; it is drafted for the developer to run by hand after review.

---

## Anything expanded beyond the Build list

Nothing expanded. The changes are exactly those listed in `CURRENT_TASK.md § Files/areas in scope`.

---

## Send-back (dispatch 68)

1. **Finding 1 (Migration seeded one competency level per department instead of four)**
   - **Fix:** Replaced the four separate `INSERT` statements in step 4 of `0011_procedure_experience_all_departments.sql` with a single `INSERT ... SELECT` using a `CROSS JOIN (VALUES ...)` approach. This evaluates the `NOT EXISTS` guard exactly once against the original state, properly seeding all four default levels per eligible department. Updated the step 4 comment to accurately describe the single statement.

2. **Finding 2 (Provisioning tests bypassed the code they claimed to test)**
   - **Fix:** Rewrote the three provisioning tests in `procedure-experience-all-departments.test.ts`. They now each construct a realistic input payload and call `provisionDepartment()` directly, checking the database for the resulting configuration row, matching the style in `auto-provision.test.ts`.

3. **Finding 3 (Empty-state message replaced the dropdown instead of sitting next to it)**
   - **Fix:** Updated `ProcedureLogsPage.tsx` to restore the unconditional rendering of the procedure experience `<Select>` dropdown. The empty-state message now renders unconditionally adjacent to the dropdown when `competencyLevels` is empty, avoiding a silent omission of the UI element.

## Dispatch 69

In `artifacts/api-server/tests/superadmin.test.ts`, the `db.insert(departmentConfigsTable)` block (lines 448-450) was changed to use an `.onConflictDoUpdate()` clause. The insert now handles conflicts on `departmentId`, setting `requiredCases`, `requiredProcedures`, and `requiredAcademic` to `5` whether the row already exists or not. Nothing else in `superadmin.test.ts` changed.

**Noticed, not changed:** The comment just above the insert (lines 436-438) still says provisioning creates no config row, which is no longer true. The developer limited this change to the insert, so the comment was left unedited.
