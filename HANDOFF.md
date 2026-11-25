# Handoff — Psychiatry workspace

The working branch is `codex/psychiatry-logbook` from `9db447ef024385d961f32450129b6de404f381dc`. The Psychiatry audit ZIP supplied the 23 resident navigation items, form fields, and screen references. Production content comes from the authenticated LogBook account, department configuration, and saved records.

## Deployment order

1. The developer applies the drafted `lib/db/migrations/0037_psychiatry_workspace.sql` through the existing migration runner before deploying the API. The migration adds two tables and does not backfill existing data. General account and department deletion paths need the new tables present.
2. Deploy the API and frontend together through the existing release process.
3. The Psychiatry HOD enables **Department Settings → Psychiatry workspace → Enable Psychiatry workspace**. The switch is off until enabled. Other departments keep their existing workspace.

## Production behavior

- Psychiatry resident routes use `/psychiatry/*`. Standard resident deep links remain available. The resident summary prints from the Psychiatry workspace. The regular HOD progress aggregates and standard printable logbook continue to use their existing record sources. The new Psychiatry review history contains the stand-alone Psychiatry records.
- Short cases use the existing case log and faculty review queue. The selected WHO code, title, and URI are persisted with the intake details. All 858 Chapter 06 codes are indexed using the published hierarchy.
- Monthly clinical records have one entry per resident, section, and month. Long cases can be saved as drafts. Assigned faculty can verify or return entries, and the department HOD can review department entries. The new record and review writes check the revision.
- Shared academic sessions create attendance links for approved people in the author's department. Tagged attendees see their attendance and session information. Department-wide views show the date and title of verified sessions and recorded CME conferences. Private discussion and review notes stay within the owner and review workflow.
- The audit left several prototype actions unverified. The main LogBook uses its existing authentication and roles, real department rosters and counts, a returned-entry notification panel, and the browser print dialog.

The migration was exercised only against in-process PGlite. No command connected to a live database. Repository review and developer acceptance precede opening a PR.

## Review

### Scope adherence

Part 1 implements the 23 sidebar destinations, list and entry views, resident home, summary and header actions. Part 2 implements persisted records and permission-scoped ownership, attendance, and review. Part 3 adds the nested WHO catalogue and validates the saved diagnosis at the API.

### Rule violations

The two read-only reviews identified deletion safeguards, access projections, existing route compatibility, and form issues. The changes now include restrictive clinical record references, explicit deletion handling, limited session data, route preservation, and conditional date validation. No live data or schema was touched. Deployment of migration 0037 belongs to the developer under §6.

### Evidence check

The workspace build and typecheck passed. A focused API run passed 30 tests, including migration reruns, new Psychiatry access, and existing case, hard-delete, and department delete paths. The isolated browser passed the 23 menu routes, the short case form and 20 other add forms, switching long-case date modes, 390 px layout, the `6A7` query with 26 choices, and saving and reading back `6A70`.

The full API run reported 467 passes and 18 failures. A side-by-side run of the Clinical Work, Physiology LogBook, and Surgery procedure-field suites produced the same 14 failures on the working branch and clean baseline `9db447e`. Four failures from the full run were outside that comparison.

| Case | Request | Response |
|---|---|---|
| Resident, unauthenticated | `PATCH /api/psychiatry/entries/opd/1` | `401 {"message":"No token found in cookies or authorization header"}` |
| Resident, wrong owner | `PATCH /api/psychiatry/entries/opd/1` | `403 {"message":"Entry is outside your access scope"}` |
| Resident, correct owner | `PATCH /api/psychiatry/entries/opd/1` | `200 {"id":1}` |
| Resident, nonexistent | `PATCH /api/psychiatry/entries/opd/999999` | `404 {"message":"Entry not found"}` |
| Review, unauthenticated | `PATCH /api/psychiatry/reviews/1` | `401 {"message":"No token found in cookies or authorization header"}` |
| Review, unassigned faculty | `PATCH /api/psychiatry/reviews/1` | `403 {"message":"Entry is outside your assigned reviews"}` |
| Review, assigned faculty | `PATCH /api/psychiatry/reviews/1` | `200 {"id":1}` |
| Review, nonexistent | `PATCH /api/psychiatry/reviews/999999` | `404 {"message":"Entry not found"}` |

### Blast radius

The HOD setting limits the Psychiatry UI and writes to participating departments. Short cases intentionally participate in existing case reviews. New Psychiatry records constrain department and resident deletion, and production deployment must apply migration 0037 before deploying code that references those tables.

### Expanded scope

The new clinical records required updates to production department deletion checks, test department cleanup, and record counts for authorized hard deletes. These changes preserve the existing behavior for clinical data retention and clean deletion of synthetic test departments.

### Skipped

The audited resident mock-up provides the visual reference. Prototype seed records, targets, and the demo role switch are excluded from production. Standard HOD progress counters still use their existing data sources. Actual print pagination and the deployed environment were outside local verification.

### Verdict

Accept for PR review, with the full-suite limitations documented above. The repository close-out process commits, pushes, and opens the PR after developer acceptance.

## Changed project files

```text
CURRENT_TASK.md
HANDOFF.md
artifacts/api-server/src/lib/hard-delete-user.ts
artifacts/api-server/src/routes/index.ts
artifacts/api-server/src/routes/psychiatry.ts
artifacts/api-server/src/routes/student.ts
artifacts/api-server/src/routes/superadmin.ts
artifacts/api-server/tests/migrations.test.ts
artifacts/api-server/tests/psychiatry-workspace.test.ts
artifacts/mockup-sandbox/src/App.tsx
artifacts/mockup-sandbox/src/components/CaseLogDetails.tsx
artifacts/mockup-sandbox/src/components/Chapter06DiagnosisPicker.tsx
artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx
artifacts/mockup-sandbox/src/components/PsychiatrySettings.tsx
artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx
artifacts/mockup-sandbox/src/components/pages/CaseLogsPage.tsx
artifacts/mockup-sandbox/src/components/pages/PsychiatryShortCasesPage.tsx
artifacts/mockup-sandbox/src/components/pages/PsychiatryWorkspace.tsx
lib/api-zod/src/department-settings.ts
lib/api-zod/src/icd11-chapter06-data.ts
lib/api-zod/src/index.ts
lib/api-zod/src/psychiatry-case-id.ts
lib/api-zod/src/psychiatry-short-cases.ts
lib/api-zod/src/psychiatry-workspace.ts
lib/db/migrations/0037_psychiatry_workspace.sql
lib/db/src/migrations.ts
lib/db/src/schema/index.ts
lib/db/src/schema/psychiatry.ts
```

## Build and verification commands

The API checks use in-process PostgreSQL fixtures and loopback HTTP. A disposable detached baseline worktree and the local browser harness were used only for verification. Reference screenshots, browser screenshots, the browser harness, and the comparison logs are in the ignored `node_modules/.psychiatry-qa` directory.

```powershell
git status
git stash list
git checkout main
if ($LASTEXITCODE -eq 0) { git pull origin main }
git log --oneline -5
git switch -c codex/psychiatry-logbook
pnpm.cmd install --frozen-lockfile
pnpm.cmd run typecheck
pnpm.cmd --dir artifacts/mockup-sandbox run build
pnpm.cmd run build
pnpm.cmd --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test tests/migrations.test.ts
pnpm.cmd --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/migrations.test.ts tests/psychiatry-workspace.test.ts tests/case-log-custom-fields.test.ts
pnpm.cmd --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/migrations.test.ts tests/psychiatry-workspace.test.ts tests/hard-delete.test.ts tests/delete-cascade.test.ts tests/mirror-cascade-coverage.test.ts tests/case-log-custom-fields.test.ts
pnpm.cmd --dir artifacts/api-server test
node artifacts/api-server/node_modules/tsx/dist/cli.mjs --tsconfig artifacts/api-server/tests/tsconfig.json node_modules/.psychiatry-qa/browser.mts
git worktree add --detach node_modules/.psychiatry-qa/baseline 9db447ef024385d961f32450129b6de404f381dc
pnpm.cmd --dir node_modules/.psychiatry-qa/baseline install --frozen-lockfile --offline
$repo = (Resolve-Path -LiteralPath '.').Path
$source = (Resolve-Path -LiteralPath 'node_modules/.psychiatry-qa/baseline').Path
$target = Join-Path $repo '.psychiatry-baseline'
if ($source -ne (Join-Path $repo 'node_modules\.psychiatry-qa\baseline') -or (Test-Path -LiteralPath $target)) { throw 'Unexpected baseline worktree path' }
git worktree move $source $target
$baseline = (Resolve-Path -LiteralPath '.psychiatry-baseline').Path
if ($baseline -ne (Join-Path $repo '.psychiatry-baseline')) { throw 'Unexpected baseline worktree path' }
pnpm.cmd --dir $baseline install --frozen-lockfile --offline --config.confirmModulesPurge=false
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
pnpm.cmd --dir .psychiatry-baseline/artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 --test-reporter=tap tests/clinical-works.test.ts tests/physiology-logbook.test.ts tests/surgery-procedure-fields.test.ts *> node_modules/.psychiatry-qa/baseline-tests.log
pnpm.cmd --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 --test-reporter=tap tests/clinical-works.test.ts tests/physiology-logbook.test.ts tests/surgery-procedure-fields.test.ts *> node_modules/.psychiatry-qa/branch-legacy-tests.log
$baselineFailures = @(Get-Content -Encoding UTF8 node_modules/.psychiatry-qa/baseline-tests.log | Where-Object { $_ -match '^not ok ' })
$branchFailures = @(Get-Content -Encoding UTF8 node_modules/.psychiatry-qa/branch-legacy-tests.log | Where-Object { $_ -match '^not ok ' })
Compare-Object -ReferenceObject $baselineFailures -DifferenceObject $branchFailures
git worktree remove $baseline
Remove-Item -LiteralPath $baseline -Recurse -Force -ErrorAction Stop
Test-Path -LiteralPath $baseline
git restore --worktree -- artifacts/mockup-sandbox/src/.generated/mockup-components.ts
git diff --check
git status --short
```

The first baseline run was located under `node_modules`, where the TSX loader skipped the test database alias. The worktree was relocated, its dependencies were relinked offline, and the baseline comparison completed. Git unregistered the disposable worktree but encountered a Windows path length limit during deletion. PowerShell removed the verified temporary directory.

---

# Previous handoff — Task 3c-1: Custom fields on case logs

Branch `task/custom-log-fields`, created from `origin/main` `fde56c6` (includes 0032–0035, 2a, 2b, 3a, Task 4). **Nothing is committed, pushed, or opened as a PR.**
`CURRENT_TASK.md` sha256 preserved byte-for-byte: `018FB27B3650C7AE51D74D1FEF359CD466C459E42BE6425D37CC819DC06154B9`.

**No command connected to a database.** `DATABASE_URL` remained unset; all tests ran against in-process PGlite. Migration `0036_case_log_custom_fields.sql` is drafted only and never applied (§6). `pnpm install --frozen-lockfile --offline` was run to create `node_modules`.

## RELEASE GATE
**Apply migration `lib/db/migrations/0036_case_log_custom_fields.sql` (developer, `src/migrate.ts`) BEFORE deploying this code (after `0035`).** The new code selects `department_configs.case_log_fields` and `case_logs.custom_fields` and will fail queries if deployed before `0036` is applied.

## What changed (in-scope files only)
- `lib/db/migrations/0036_case_log_custom_fields.sql` (new, DRAFT): Adds nullable `department_configs.case_log_fields jsonb` and `case_logs.custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb`.
- `lib/db/src/migrations.ts`: Registered `0036_case_log_custom_fields.sql`.
- `lib/db/src/schema/department_configs.ts`: Added `StoredLogCustomFieldDefinition` and `caseLogFields`.
- `lib/db/src/schema/logs.ts`: Added `customFields` to `caseLogsTable` only.
- `lib/api-zod/src/log-custom-fields.ts` (new) & `lib/api-zod/src/index.ts`: Added `logCustomFieldDefinitionSchema`, `logCustomFieldDefinitionsSchema` (max 40, unique keys and case-insensitive labels, `requiredWhen` and type rules), `logCustomFieldVisible`, `validateLogCustomFieldValues` (returns field-label messages only, never values), and `normalizeLogCustomFieldValues`.
- `artifacts/api-server/src/lib/department-features.ts`: Returns `caseLogFields` resolved from `configSourceId`.
- `artifacts/api-server/src/routes/admin.ts`: Added `GET /api/admin/department/case-log-fields` and `PATCH /api/admin/department/case-log-fields` (HOD-only, `req.user.departmentId` only, mirrored test dept `403`, last-write-wins matching `procedure-fields` since `department_configs` has no `updatedAt` column).
- `artifacts/api-server/src/routes/department.ts`: `GET /:departmentId/catalog` now returns `caseLogFields` alongside `procedureFields`.
- `artifacts/api-server/src/routes/student.ts`: `POST /:studentId/case-logs` and `PATCH /:studentId/case-logs/:logId` validate and normalize `customFields` (enforcing required fields on older log edits per developer decision; null/empty clears keys; orphan keys survive PATCH; catch blocks log nothing). `professor.ts` and `logs.ts` required no changes (`caseLogsTable` whole row is already selected and `updateData` does not touch `customFields`).
- `artifacts/api-server/tests/migrations.test.ts`: Bumped migration count from `35` to `36`.
- `artifacts/api-server/tests/case-log-custom-fields.test.ts` (new): §11 cases, validation, orphan preservation, null clearing, unchanged legacy rendering, and professor review preservation.
- Frontend (`artifacts/mockup-sandbox/src/`): `lib/log-custom-fields.ts` (new), `lib/department-context.tsx`, `components/LogCustomFields.tsx` (new), `components/CaseLogFieldsCard.tsx` (new), `components/DepartmentSettings.tsx`, `components/pages/CaseLogsPage.tsx`, `components/CaseLogDetails.tsx`, `components/ProfessorPortal.tsx`, `components/pages/PrintableLogbook.tsx`.

## Verification

### Typecheck — `pnpm run typecheck` (repo root), exit `0`
```
Scope: 3 of 8 workspace projects
scripts typecheck: Done
artifacts/api-server typecheck: Done
artifacts/mockup-sandbox typecheck: Done
```

### §8 grep check (`git grep -n -E "customFields|custom_fields" artifacts/api-server/src`, raw output)
Zero logger, `console`, or error-payload references to custom field values:
```
artifacts/api-server/src/lib/voice-log/provider.ts:98:            if (!procFields.customFields?.[field.id] && !missing.includes(field.id)) {
artifacts/api-server/src/lib/voice-log/provider.ts:204:      customFields: {
artifacts/api-server/src/lib/voice-log/provider.ts:328:        customFields: {},
artifacts/api-server/src/lib/voice-log/provider.ts:617:    const customFields: Record<string, string> = {};
artifacts/api-server/src/lib/voice-log/provider.ts:618:    if (procCtx.dynamicProcedureFields && rawFields.customFields && typeof rawFields.customFields === "object") {
artifacts/api-server/src/lib/voice-log/provider.ts:619:      const rawCustom = rawFields.customFields as Record<string, unknown>;
artifacts/api-server/src/lib/voice-log/provider.ts:628:              customFields[field.id] = matchedOpt;
artifacts/api-server/src/lib/voice-log/provider.ts:633:            customFields[field.id] = trimmed;
artifacts/api-server/src/lib/voice-log/provider.ts:649:      customFields,
artifacts/api-server/src/routes/professor.ts:533:              const value = isBuiltInProcedureField(field) ? item.log[field] : item.log.customFields?.[field];
artifacts/api-server/src/routes/professor.ts:607:        customFields: (p.log as any).customFields ?? {},
artifacts/api-server/src/routes/student.ts:1434:const customFieldsInputSchema = z.record(procedureFieldIdSchema, z.string().max(8000).nullable()).refine(
artifacts/api-server/src/routes/student.ts:1448:  customFields: caseCustomFieldsInputSchema }).strict()), async (req, res) => {
artifacts/api-server/src/routes/student.ts:1460:    const rawCustomFields = req.body.customFields ?? {};
artifacts/api-server/src/routes/student.ts:1479:      customFields: normalizedCustomFields,
artifacts/api-server/src/routes/student.ts:1499:  customFields: customFieldsInputSchema,
artifacts/api-server/src/routes/student.ts:1533:      if (req.body.customFields && Object.keys(req.body.customFields).length > 0) {
artifacts/api-server/src/routes/student.ts:1609:      finalCustomFields = normalizeCustomProcedureFieldValues(req.body.customFields, customFieldIds);
artifacts/api-server/src/routes/student.ts:1624:      customFields: finalCustomFields,
artifacts/api-server/src/routes/student.ts:1953:  customFields: caseCustomFieldsInputSchema }).strict().partial()), async (req, res) => {
artifacts/api-server/src/routes/student.ts:1969:    const previousCustomFields = (guard.log?.customFields ?? {}) as Record<string, string>;
artifacts/api-server/src/routes/student.ts:1971:    if (req.body.customFields) {
artifacts/api-server/src/routes/student.ts:1972:      for (const [k, v] of Object.entries(req.body.customFields as Record<string, string | null>)) {
artifacts/api-server/src/routes/student.ts:1987:    const updateBody = { ...req.body, customFields: normalizedCustomFields, status: "pending", facultyRemarks: null };
artifacts/api-server/src/routes/student.ts:2007:  customFields: customFieldsInputSchema,
artifacts/api-server/src/routes/student.ts:2038:      if (req.body.customFields && Object.keys(req.body.customFields).length > 0) {
artifacts/api-server/src/routes/student.ts:2069:      const { customFields: _ignoredCustomFields, ...restBody } = req.body;
artifacts/api-server/src/routes/student.ts:2075:      const prevCustom = (existingLog.customFields && typeof existingLog.customFields === "object" && !Array.isArray(existingLog.customFields))
artifacts/api-server/src/routes/student.ts:2076:        ? { ...(existingLog.customFields as Record<string, string>) }
artifacts/api-server/src/routes/student.ts:2080:      if (req.body.customFields) {
artifacts/api-server/src/routes/student.ts:2081:        for (const [key, rawVal] of Object.entries(req.body.customFields as Record<string, string | null>)) {
artifacts/api-server/src/routes/student.ts:2104:        entry: { ...resulting, customFields: mergedCustom },
artifacts/api-server/src/routes/student.ts:2128:      if (req.body.customFields !== undefined) updateBody.customFields = mergedCustom;
```

### `<CaseLogDetails` grep in `ProfessorPortal.tsx` (only 2 occurrences exist; both receive `customFieldDefinitions={caseLogFields}`)
```
artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx:602:                  <CaseLogDetails caseLog={currentItem as CaseLogDetailRecord} hideUhid={hideUhid} medicalSummaryCaseFields={Boolean(config?.enabledFeatures?.medicalSummaryCaseFields)} microbiologyCaseFields={microbiologyCaseFields} customFieldDefinitions={caseLogFields} />
artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx:1150:                              <CaseLogDetails caseLog={log} hideUhid={hideUhid} showReview medicalSummaryCaseFields={Boolean(config?.enabledFeatures?.medicalSummaryCaseFields)} microbiologyCaseFields={microbiologyCaseFields} customFieldDefinitions={caseLogFields} />
```

### §11 verbatim evidence (`tests/case-log-custom-fields.test.ts`)
- Note on `PATCH /api/admin/department/case-log-fields`: `404` is **not applicable** because the route has no row id — the department always comes from `req.user`. Instead, `case-fields HOD with no config row` proves that a HOD with no `department_configs` row gets `200` and creates the row.
- Note on `POST /api/students/:studentId/case-logs`: `studentAccess` collapses nonexistent `studentId` to `403` by design (`enumeration-collapse.test.ts`).
```json
{"case":"case-fields unauthenticated","request":{"method":"PATCH","path":"/api/admin/department/case-log-fields","body":{"fields":[{"key":"ward","label":"Ward","type":"select","required":true,"options":["PICU","NICU","General"]},{"key":"icu_days","label":"ICU days","type":"number","required":true,"min":0,"max":365,"requiredWhen":{"field":"ward","value":"PICU"}},{"key":"followup_date","label":"Follow-up date","type":"date"},{"key":"short_note","label":"Short note","type":"text","maxLength":100},{"key":"summary","label":"Summary","type":"textarea"}]}},"response":{"status":401,"body":{"message":"No token found in cookies or authorization header"}}}
{"case":"case-fields student","request":{"method":"PATCH","path":"/api/admin/department/case-log-fields","body":{"fields":[{"key":"ward","label":"Ward","type":"select","required":true,"options":["PICU","NICU","General"]},{"key":"icu_days","label":"ICU days","type":"number","required":true,"min":0,"max":365,"requiredWhen":{"field":"ward","value":"PICU"}},{"key":"followup_date","label":"Follow-up date","type":"date"},{"key":"short_note","label":"Short note","type":"text","maxLength":100},{"key":"summary","label":"Summary","type":"textarea"}]}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"case-fields professor","request":{"method":"PATCH","path":"/api/admin/department/case-log-fields","body":{"fields":[{"key":"ward","label":"Ward","type":"select","required":true,"options":["PICU","NICU","General"]},{"key":"icu_days","label":"ICU days","type":"number","required":true,"min":0,"max":365,"requiredWhen":{"field":"ward","value":"PICU"}},{"key":"followup_date","label":"Follow-up date","type":"date"},{"key":"short_note","label":"Short note","type":"text","maxLength":100},{"key":"summary","label":"Summary","type":"textarea"}]}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"case-fields mirror HOD","request":{"method":"PATCH","path":"/api/admin/department/case-log-fields","body":{"fields":[{"key":"ward","label":"Ward","type":"select","required":true,"options":["PICU","NICU","General"]},{"key":"icu_days","label":"ICU days","type":"number","required":true,"min":0,"max":365,"requiredWhen":{"field":"ward","value":"PICU"}},{"key":"followup_date","label":"Follow-up date","type":"date"},{"key":"short_note","label":"Short note","type":"text","maxLength":100},{"key":"summary","label":"Summary","type":"textarea"}]}},"response":{"status":403,"body":{"message":"Test departments cannot modify mirrored settings"}}}
{"case":"case-fields HOD0","request":{"method":"PATCH","path":"/api/admin/department/case-log-fields","body":{"fields":[{"key":"ward","label":"Ward","type":"select","required":true,"options":["PICU","NICU","General"]},{"key":"icu_days","label":"ICU days","type":"number","required":true,"min":0,"max":365,"requiredWhen":{"field":"ward","value":"PICU"}},{"key":"followup_date","label":"Follow-up date","type":"date"},{"key":"short_note","label":"Short note","type":"text","maxLength":100},{"key":"summary","label":"Summary","type":"textarea"}]}},"response":{"status":200,"body":{"readOnlyConfig":false,"fields":[{"key":"ward","label":"Ward","type":"select","required":true,"options":["PICU","NICU","General"]},{"key":"icu_days","label":"ICU days","type":"number","required":true,"min":0,"max":365,"requiredWhen":{"field":"ward","value":"PICU"}},{"key":"followup_date","label":"Follow-up date","type":"date"},{"key":"short_note","label":"Short note","type":"text","maxLength":100},{"key":"summary","label":"Summary","type":"textarea"}]}}}
{"case":"case-fields HOD with no config row","request":{"method":"PATCH","path":"/api/admin/department/case-log-fields","body":{"fields":[{"key":"short_note","label":"Short note","type":"text","maxLength":100}]}},"response":{"status":200,"body":{"readOnlyConfig":false,"fields":[{"key":"short_note","label":"Short note","type":"text","maxLength":100}]}}}
{"case":"case-fields invalid definition","request":{"method":"PATCH","path":"/api/admin/department/case-log-fields","body":{"fields":[{"key":"bad_select","label":"Bad Select","type":"select"}]}},"response":{"status":400,"body":{"message":"fields.0: Dropdown fields need choices"}}}
{"case":"case POST unauthenticated","request":{"method":"POST","path":"/api/students/1/case-logs","body":{"supervisorId":2,"date":"2026-10-20","patientAge":"5y","patientGender":"female","diagnosisFinal":"Acute bronchiolitis","customFields":{"ward":"PICU","icu_days":"3","followup_date":"2026-11-01","short_note":"Stable"}}},"response":{"status":401,"body":{"message":"No token found in cookies or authorization header"}}}
{"case":"case POST wrong owner (student20 on student0)","request":{"method":"POST","path":"/api/students/1/case-logs","body":{"supervisorId":2,"date":"2026-10-20","patientAge":"5y","patientGender":"female","diagnosisFinal":"Acute bronchiolitis","customFields":{"ward":"PICU","icu_days":"3","followup_date":"2026-11-01","short_note":"Stable"}}},"response":{"status":403,"body":{"message":"Student is outside your access scope"}}}
{"case":"case POST nonexistent studentId (collapsed 403 by studentAccess)","request":{"method":"POST","path":"/api/students/99999999/case-logs","body":{"supervisorId":2,"date":"2026-10-20","patientAge":"5y","patientGender":"female","diagnosisFinal":"Acute bronchiolitis","customFields":{"ward":"PICU","icu_days":"3","followup_date":"2026-11-01","short_note":"Stable"}}},"response":{"status":403,"body":{"message":"Student is outside your access scope"}}}
{"case":"case POST owner","request":{"method":"POST","path":"/api/students/1/case-logs","body":{"supervisorId":2,"date":"2026-10-20","patientAge":"5y","patientGender":"female","diagnosisFinal":"Acute bronchiolitis","customFields":{"ward":"PICU","icu_days":"3","followup_date":"2026-11-01","short_note":"Stable"}}},"response":{"status":201,"body":{"id":2,"studentId":1,"supervisorId":2,"date":"2026-10-20","attemptNumber":1,"patientUhid":null,"patientAge":"5y","patientGender":"female","chiefComplaints":null,"diagnosisProvisional":null,"diagnosisFinal":"Acute bronchiolitis","history":null,"examination":null,"investigations":null,"differentialDiagnosis":null,"managementPlan":null,"outcome":null,"learningPoints":null,"category":null,"customFields":{"ward":"PICU","icu_days":"3","short_note":"Stable","followup_date":"2026-11-01"},"status":"pending","facultyRemarks":null,"facultyGrade":null,"reviewedBy":null,"reviewedAt":null,"deletedAt":null,"createdAt":"2026-11-25T12:24:59.460Z"}}}
{"case":"case PATCH unauthenticated","request":{"method":"PATCH","path":"/api/students/1/case-logs/2","body":{"diagnosisFinal":"Updated"}},"response":{"status":401,"body":{"message":"No token found in cookies or authorization header"}}}
{"case":"case PATCH wrong owner","request":{"method":"PATCH","path":"/api/students/1/case-logs/2","body":{"diagnosisFinal":"Updated"}},"response":{"status":403,"body":{"message":"Student is outside your access scope"}}}
{"case":"case PATCH nonexistent id","request":{"method":"PATCH","path":"/api/students/1/case-logs/99999999","body":{"diagnosisFinal":"Updated"}},"response":{"status":404,"body":{"message":"Log not found"}}}
{"case":"case PATCH owner","request":{"method":"PATCH","path":"/api/students/1/case-logs/2","body":{"customFields":{"short_note":null}}},"response":{"status":200,"body":{"id":2,"studentId":1,"supervisorId":2,"date":"2026-10-20","attemptNumber":1,"patientUhid":null,"patientAge":"5y","patientGender":"female","chiefComplaints":null,"diagnosisProvisional":null,"diagnosisFinal":"Acute bronchiolitis","history":null,"examination":null,"investigations":null,"differentialDiagnosis":null,"managementPlan":null,"outcome":null,"learningPoints":null,"category":null,"customFields":{"ward":"PICU","icu_days":"3","followup_date":"2026-11-01"},"status":"pending","facultyRemarks":null,"facultyGrade":null,"reviewedBy":null,"reviewedAt":null,"deletedAt":null,"createdAt":"2026-11-25T12:24:59.460Z"}}}
```

### Full `pnpm test` (`artifacts/api-server`, `DATABASE_URL` unset)
- `ℹ tests 480 / ℹ pass 462 / ℹ fail 18` (all 3 migration tests including `0036` and all 4 `case-log-custom-fields` tests pass; 0 new failures).
- Exact sorted list of 18 pre-existing baseline failures:
```
DELETE clinical-works: 401 / 403 / 200 / 404, and a deleted row cannot be edited
HOD adds sub-types under a category; bad parents, wrong kinds and in-use categories are refused
HOD hard-delete of a student removes their clinical work logs
PATCH changing the category clears a stale sub-type and re-checks it
PATCH clinical-works: 401 / 403 / 200 / 404
POST clinical-works: 401 / 403 / 201 / nonexistent student
a dry run reports the changes and saves nothing
applying merges flags without dropping existing ones and loads the catalog and schedule
applying twice changes nothing more
category and sub-type rules
faculty review: only the named supervisor or the HOD can verify, and verified rows are locked
logbook read: owner and HOD see all entries, a professor sees only entries they supervise
rejected entries can be edited and go back to pending with remarks cleared
review queue lists pending clinical works with category names
the document's 15, 15 and 18 sections are available in the corresponding years
the radiology template matches the requested lists
the supplied SQL creates Surgery, its config and exactly the four requested role codes
validation covers participation, year, date ranges, attendance, appraisal ratings and discussion
```

### Screenshots / Browser verification
- Not run in this headless pass (recorded as unverified here).
