# HANDOFF — Task 3c-1: Custom fields on case logs

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
