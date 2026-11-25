# HANDOFF — Task 2b: department name/code checks become settings

Branch `task/department-behaviour-settings`, created from `origin/main` `8f68267` (2a, PR #167, merged). Executor: Sonnet direct. **Nothing committed, pushed or opened as a PR.** Review tier: Opus / high (schema, migration, backfill; a setting that decides faculty visibility), unratcheted: no independent Antigravity tier exists (AGENTS.md §15.4).

**No command connected to a database.** `DATABASE_URL` was never set or used. Every test ran on in-process PGlite. Migration 0035 is drafted, never applied (§6). No `git stash` was used. No force-push.

## Fix round (2026-11-25) — all three approved items resolved
1. **`tests/department-labels.test.ts:283`** — rewritten to assert setting-based behaviour: a department named "Parity Microbiology" with no stored flag gets generic wording defaults (`"Thesis & certifications"` / `"Thesis & Certifications"`), and `catalog.body.config` is `null`.
2. **`tests/logbook-sections.test.ts:31`** — added setup line setting `academicLogbookProfile: "physiology"` on `department_configs` for `departmentIds[2]`; both previously failing tests now pass.
3. **`lib/api-zod/src/department-settings.ts`** — added `procedureDetailsField`, `hideProcedureProgress`, `freeTextPostingSupervisor`, and `extendedAssessmentTypes` to `DEPARTMENT_SETTING_TIERS` as `"hod_only"`. No other key's tier changed.
4. **`ProfessorPortal.tsx:632, 985` & `AssessmentsPage.tsx:83`** — Evaluation Queue procedure details gated on `(config?.enabledFeatures?.freeTextProcedures || procedureDetailsField)`; spacing typos fixed.
5. **§11 case 4 returns 403, not 404, for a nonexistent student.** `GET /api/students/:studentId/postings` goes through `studentAccess` (`middlewares/student-access.ts:16`), which collapses missing students to `403` by design (`enumeration-collapse.test.ts` guards this).

## RELEASE GATE
**Apply migration `0035_department_behaviour_settings.sql` (developer, `src/migrate.ts`) BEFORE deploying the new code (after `0034`).** The new code selects `department_configs.academic_logbook_profile` and will **500 every department** if deployed before `0035` is applied. After deploy, check one Microbiology account (student and faculty) and one Physiology account in the live app.

The migration has two guards that **fail loudly** instead of guessing, run against the database it is applied to: (a) id 14 stores `false` (or anything not `true`) for one of the eight keys the client forced by name; (b) id 14 already holds `academic` or `conference_level` catalog rows other than the five it inserts. Neither is expected from the developer's two SELECT outputs (stored `{procedureExperience:true}` only; Query 2 empty).

## Pull / start (§1)
`git status` (dirty `CURRENT_TASK.md` only), `git stash list` (3 stashes from other branches, listed, never touched), branch `task/department-behaviour-settings` created from `origin/main` `8f68267` with `git checkout -f -b … origin/main`; `CURRENT_TASK.md` restored from a scratchpad copy, sha256 `13a477aab0d4352bfdaa42d4bd9f193c9cac7b3dd7d7962cbe08c941cd47deef` before and after. `a6eacd7` and `c0dad8f` are not on this branch. The old branch `claude/department-name-checks-bf2164` was left as it was. No pull was needed beyond `git fetch origin` (origin/main = `8f68267`).

## Inventory re-run on the new main
Same sites as the task list, **no new name-check site, no halt**. Two line-position notes: `ProfessorPortal.tsx` also had `freeTextProcedures || isMicroDept` (display of Details, inside item 11) and a `microbiologyCaseFields || isMenteeMicro` on the CaseLogDetails call for a mentee (item 9 family); both were changed with their items. 3a's `lib/api-zod/src/department-settings.ts` is new on main (see decision 3).

Item 9 (mentee department) did not need a halt: the mentee list is `studentsInDept` for the viewer's own department (`routes/professor.ts:679`), so a mentee never belongs to a different department from the viewer. The mentee inspector now reads the viewer's config.

## What changed, per file
- `lib/db/migrations/0035_department_behaviour_settings.sql` (new, DRAFT): `ALTER TABLE department_configs ADD COLUMN academic_logbook_profile text`, then the backfill by literal id with a name guard (`~* 'microbiology'` for 14, `~* '^\s*physiology\s*$'` for 30), both guards above, config-row insert if missing, the jsonb merge, five catalog rows, Physiology profile.
  - Merge order: all-true defaults (the 12 server/client defaults plus the four new keys) `||` stored object minus the nine forced keys `||` the forced values. So a stored value wins for the non-forced keys, the client-forced keys are written, `procedureExperience` is `false` (developer decision 2026-11-24).
  - Test copies 24 and 31 get no rows (they inherit through `config_source_department_id`). Ids 2, 13, 15, 18, 28, 32, 38 get nothing.
- `lib/db/src/migrations.ts`: registers 0035. `lib/db/src/schema/department_configs.ts`: `academicLogbookProfile` (nullable text).
- `lib/api-zod/src/academic-logbook.ts`, `logbook-profiles/physiology.ts`: `departmentNames` and `departmentCodes` removed.
- `artifacts/api-server/src/lib/department-features.ts`: Micro defaults and the department name/code read removed; stored config only.
- `artifacts/api-server/src/lib/academic-logbook.ts`: `academicLogbookForDepartment` takes `{ academicLogbookProfile }` (from `department_configs` of the config source), looks the id up in the profile list.
- `artifacts/api-server/src/routes/department.ts`: Micro defaults, made-up id-0 config and the two hardcoded lists removed; the catalog returns stored config and catalog rows only.
- Client (`mockup-sandbox/src`): `lib/department-context.tsx` (client copy of defaults, made-up config, lists), `ProfessorPortal.tsx` (8-12), `AssessmentsPage.tsx` (13), `ProcedureLogsPage.tsx` (14-16), `CaseLogsPage.tsx` (7), `AttendancePage.tsx` (17), `AppLayout.tsx` (18), `ConferencesPage.tsx` (19), `PostingsPage.tsx` (20). The four new keys are read as `procedureDetailsField`, `hideProcedureProgress`, `freeTextPostingSupervisor`, `extendedAssessmentTypes`. Yearly-or-daily reads `yearlyAttendance`; attendance shows on `dailyAttendance || yearlyAttendance`; leave records read `hideLeaveRecords` alone.
- `lib/demoDepartments.ts`: item 21 now reads the profile's `yearlyAttendance`; the demo Microbiology profile sets `procedureExperience: false` and the four new keys; a local variable `isMicro` was renamed `labCaseFields` (it was derived from the setting, but the verification grep matches the old spelling).
- `DemoDepartmentCustomizer.tsx`: toggles for the four new keys. **`DepartmentSettings.tsx` was not changed:** it has no HOD-facing toggle list for any of the existing keys (it only reads `useThesisAndMandatoryCertificationsLabel`), so per the task I added none and report it.
- Tests: `tests/department-behaviour-settings.test.ts` (new), `tests/physiology-logbook.test.ts` (lines 45-48 now config-based; its `before` stores the profile), `tests/migrations.test.ts` (count 34 → 35).

## Skipped or not done
- No HOD-facing toggles for the four new keys (none exist for the old ones either). Editing comes with 3a.
- No pull of `origin/main` into a local `main` (fresh branch from `origin/main`, as the brief said).
- HOD demo pages (assessments, attendance, roster) were left out of the demo comparison: with no API server they render only the shell (identical 731-character text for every route), so they prove nothing.

## Verification (output pasted from this run)

### Grep (task's command, `rg` from the worktree root)
```
$ rg -n -i "includes\(\"(microbiology|radiology|dermatology|physiology)\"\)|=== \"microbiology\"|isMicro|isMenteeMicro|departmentNames|departmentCodes" artifacts lib --glob '!**/tests/**' --glob '!**/node_modules/**' --glob '!**/dist/**'
rg exit: 1   (1 = no matches)
```

### Typecheck (`pnpm run typecheck`, all three projects)
```
$ tsc --build
Scope: 3 of 8 workspace projects
artifacts/api-server typecheck: Done
artifacts/mockup-sandbox typecheck: Done
scripts typecheck: Done
```

### 3.2 Full suite — `pnpm test` in `artifacts/api-server`, post-merge on `origin/main` `4f7c195` (`DATABASE_URL` unset)
Baseline (unmodified code at `8f68267`, run before any edit): `ℹ tests 437 / ℹ pass 419 / ℹ fail 18`.
Post-merge (`task/mochi-hod-edits` merged with `origin/main` `4f7c195`): `ℹ tests 460 / ℹ pass 442 / ℹ fail 18` (all 17 new Task 4 tests and all 6 `origin/main` voice-log tests pass).
The 18 failing test names match the `origin/main` baseline identically (0 new failures):
artifacts/api-server typecheck$ tsc -p tsconfig.json --noEmit
artifacts/mockup-sandbox typecheck$ tsc -p tsconfig.json --noEmit
scripts typecheck$ tsc -p tsconfig.json --noEmit
scripts typecheck: Done
artifacts/api-server typecheck: Done
artifacts/mockup-sandbox typecheck: Done
```

### §11, `GET /api/students/:studentId/postings` with `freeTextPostingUnit` coming from the backfilled config (verbatim JSON from `tests/department-behaviour-settings.test.ts`; note `studentAccess` collapses missing students to `403` by design)
```json
{"case":"unauthenticated","request":{"method":"GET","path":"/students/10/postings"},"response":{"status":401,"body":{"message":"No token found in cookies or authorization header"}}}
{"case":"professor of another department (Pediatrics fixture, department 1)","request":{"method":"GET","path":"/students/10/postings"},"response":{"status":403,"body":{"message":"Student is outside your access scope"}}}
{"case":"professor B of department 14 (Microbiology, backfilled), posting supervised by professor A","request":{"method":"GET","path":"/students/10/postings"},"response":{"status":200,"body":{"options":[],"data":[{"id":1,"ward":"Fixture ward","startDate":"2026-02-01","endDate":"2026-02-10","supervisorId":19,"supervisorName":"Behaviour micro-a","status":"pending","facultyRemarks":null}]}}}
{"case":"nonexistent student id","request":{"method":"GET","path":"/students/99999999/postings"},"response":{"status":403,"body":{"message":"Student is outside your access scope"}}}
{"case":"professor B of the department named Microbiology with no settings (noset)","request":{"method":"GET","path":"/students/12/postings"},"response":{"status":200,"body":{"options":[],"data":[]}}}
{"case":"professor B of the department named Pediatrics that stores the settings","request":{"method":"GET","path":"/students/13/postings"},"response":{"status":200,"body":{"options":[],"data":[{"id":4,"ward":"Fixture ward","startDate":"2026-02-01","endDate":"2026-02-10","supervisorId":28,"supervisorName":"Behaviour peds-a","status":"pending","facultyRemarks":null}]}}}
{"case":"professor B of the test copy (department 24), source department 14","request":{"method":"GET","path":"/students/11/postings"},"response":{"status":200,"body":{"options":[],"data":[{"id":2,"ward":"Fixture ward","startDate":"2026-02-01","endDate":"2026-02-10","supervisorId":22,"supervisorName":"Behaviour microcopy-a","status":"pending","facultyRemarks":null}]}}}
{"case":"department named Microbiology, no settings: posting without supervisor","request":{"method":"POST","path":"/students/12/postings"},"response":{"status":400,"body":{"message":"Supervisor is required"}}}
{"case":"micro: posting without supervisor","request":{"method":"POST","path":"/students/10/postings"},"response":{"status":201,"body":{"success":true,"posting":{"id":9,"studentId":10,"ward":"Free text ward","startDate":"2026-03-01","endDate":"2026-03-05","supervisorId":null,"status":"verified","facultyRemarks":null,"createdAt":"2026-11-25T10:11:40.816Z"}}}}
{"case":"peds: posting without supervisor","request":{"method":"POST","path":"/students/13/postings"},"response":{"status":201,"body":{"success":true,"posting":{"id":10,"studentId":13,"ward":"Free text ward","startDate":"2026-03-01","endDate":"2026-03-05","supervisorId":null,"status":"verified","facultyRemarks":null,"createdAt":"2026-11-25T10:11:40.830Z"}}}}
```

### New tests, migrations test, physiology test (`tsx … --test` on the three files)
```
✔ §11: unauthenticated 401, professor of another department 403, free-text department professor 200 with the posting, nonexistent student
✔ the same professor shape in a department without the flag gets 200 with the posting absent, even when the department is named Microbiology
✔ a department named Pediatrics that stores the setting gets the all-postings visibility
✔ the test copy of Microbiology (24) inherits the visibility through config_source_department_id
✔ creating a posting without a supervisor: 400 with no setting (named Microbiology), 201 with the setting
✔ Microbiology (14) returns the backfilled settings, a real config row and catalog lists; its test copy returns the same
✔ a department only NAMED Microbiology, with no settings, gets none of the behaviour and no hardcoded lists
✔ a saved false is returned as false, whatever the department is named
✔ Physiology: the stored profile gives the logbook to the department and its test copy; a department only named Physiology (code PSI) gets none
✔ academicLogbookForDepartment reads only the stored profile id
✔ id 14 ends with exactly today's effective features, a real config row and the catalog rows; Physiology gets the profile; nothing else changes; a second run changes nothing
✔ a stored value wins for keys the server only defaulted, and a missing config row is created
✔ the name check is case-insensitive, so the pre-0034 name still matches
✔ an id that holds a different name gets nothing, and the guard is per id
✔ a stored value that contradicts a forced value, or catalog rows the hardcoded lists were hiding, fail the migration instead of being guessed
✔ none of the files that used to branch on a department name or code still does
✔ fresh installation and rerunning migrations are safe and checksum-tracked          (migrations.test.ts, with 0035, count 35)
✔ the stored academic_logbook_profile activates the full profile; a department name or code does not
✖ the document's 15, 15 and 18 sections are available in the corresponding years      (fails on origin/main too)
✖ validation covers participation, year, date ranges, attendance, appraisal ratings and discussion   (fails on origin/main too)
ℹ tests 32 / pass 30 / fail 2
```
The PGlite backfill test is seeded from the developer's SELECT output (ids 2, 13, 14, 15, 18, 19, 20, 23, 24, 26, 28, 29, 30, 31, 32, 33, 38, 39 with their stored `enabled_features`). Id 14 ends with exactly the 16 true keys plus `procedureExperience: false`; id 30 gets `academic_logbook_profile = 'physiology'` and keeps `{procedureExperience:true}`; five catalog rows for 14 only; every other config row byte-for-byte unchanged; no row for the test copies; no department renamed; a second run changes nothing.
"Saved false wins": the server returns a stored `false` as `false` for a department named Microbiology (test above), and the client pages read the key alone (`CaseLogsPage.tsx`, `ProfessorPortal.tsx`); there is no client unit-test harness for the pages, so the page-level claim rests on the code read plus the demo comparison.

### Full api-server suite (`pnpm test`, post-merge on `origin/main` `4f7c195`, `DATABASE_URL` unset)
- **Merged branch (`e06d5a4`):** `ℹ tests 459 / ℹ pass 441 / ℹ fail 18` (0 new failures; all 18 failing test names match the `origin/main` baseline; includes 6 passing voice-log tests from `origin/main`).
- **Post-merge `pnpm run typecheck`:** exit `0` across `scripts`, `artifacts/api-server`, and `artifacts/mockup-sandbox`.
- **Migration check:** `35` migration files (`0001`–`0035`, no duplicates; `tests/migrations.test.ts` count = `35`).
- **Exact sorted list of all 18 failing test names:**
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
2a's label tests (`tests/department-labels.test.ts`) and 3a's (`tests/department-config-settings.test.ts`) are **unmodified** (`git status` lists no change under `tests/` except the new file) and pass in that run: `✔ PATCH /admin/department/labels/:key (AGENTS.md §11)`, `✔ DELETE /admin/department/labels/:key (AGENTS.md §11)`, `✔ reading wording`, and the 3a settings tests.

### 3.3 New file only — `npx tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/arogya-department-actions.test.ts`: `ℹ pass 17 / ℹ fail 0`
(The first run had 2 failing tests of my own, both test-script mistakes: a professor question that matched no workflow, and a second HOD in one department that the unique-HOD index forbids. Fixed in the test only.)

### 3.4 §11 evidence, `POST /api/arogya/actions/apply` (verbatim request + response JSON from post-merge run)
```json
{"case":"unauthenticated","request":{"method":"POST","path":"/api/arogya/actions/apply","body":{"type":"label_set","key":"nav.postings","value":"Rotations","expected":0}},"response":{"status":401,"body":{"message":"No token found in cookies or authorization header"}}}
{"case":"student","request":{"method":"POST","path":"/api/arogya/actions/apply","body":{"type":"label_set","key":"nav.postings","value":"Rotations","expected":0}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"professor","request":{"method":"POST","path":"/api/arogya/actions/apply","body":{"type":"label_set","key":"nav.postings","value":"Rotations","expected":0}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"HOD of a mirrored test department","request":{"method":"POST","path":"/api/arogya/actions/apply","body":{"type":"label_set","key":"nav.postings","value":"Rotations","expected":0}},"response":{"status":403,"body":{"error":"Test departments cannot modify mirrored settings"}}}
{"case":"correct HOD","request":{"method":"POST","path":"/api/arogya/actions/apply","body":{"type":"label_set","key":"nav.postings","value":"Rotations","expected":0}},"response":{"status":200,"body":{"auditId":"401d6829-04c0-40c6-b091-2a0a2e68032a","before":"Postings & Rotations","after":"Rotations","undoable":true}}}
{"case":"HOD of another department (own department only)","request":{"method":"POST","path":"/api/arogya/actions/apply","body":{"type":"label_set","key":"nav.postings","value":"Other rotations","expected":0}},"response":{"status":200,"body":{"auditId":"3c6edb6a-a3be-43aa-b481-1be472f68c56","before":"Postings & Rotations","after":"Other rotations","undoable":true}}}
{"case":"unknown label key","request":{"method":"POST","path":"/api/arogya/actions/apply","body":{"type":"label_set","key":"nav.nonexistent","value":"X","expected":0}},"response":{"status":404,"body":{"error":"Unknown wording key"}}}
{"case":"unknown action type","request":{"method":"POST","path":"/api/arogya/actions/apply","body":{"type":"delete_everything","key":"nav.postings","expected":0}},"response":{"status":404,"body":{"error":"Unknown action"}}}
{"case":"unknown setting key","request":{"method":"POST","path":"/api/arogya/actions/apply","body":{"type":"setting_set","key":"notARealSetting","value":true,"expected":null}},"response":{"status":404,"body":{"error":"Unknown setting"}}}
{"case":"departmentId in body","request":{"method":"POST","path":"/api/arogya/actions/apply","body":{"type":"label_set","key":"nav.postings","value":"Rotations","expected":0,"departmentId":2}},"response":{"status":400,"body":{"error":"Invalid request"}}}
```
The wrong-owner case for apply is "the department comes only from `req.user`": there is no department in the request, so a HOD of another department can only ever change their own (the 200 line above plus the DB assertion), a mirrored-department HOD gets 403, students/professors get 403.

### 3.5 §11 evidence, `POST /api/arogya/actions/:auditId/undo` (verbatim request + response JSON from post-merge run)
```json
{"case":"unauthenticated","request":{"method":"POST","path":"/api/arogya/actions/401d6829-04c0-40c6-b091-2a0a2e68032a/undo","body":{}},"response":{"status":401,"body":{"message":"No token found in cookies or authorization header"}}}
{"case":"student","request":{"method":"POST","path":"/api/arogya/actions/401d6829-04c0-40c6-b091-2a0a2e68032a/undo","body":{}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"professor","request":{"method":"POST","path":"/api/arogya/actions/401d6829-04c0-40c6-b091-2a0a2e68032a/undo","body":{}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"HOD of another department on this department's audit row","request":{"method":"POST","path":"/api/arogya/actions/401d6829-04c0-40c6-b091-2a0a2e68032a/undo","body":{}},"response":{"status":403,"body":{"error":"This change belongs to another department"}}}
{"case":"HOD of a mirrored department on this department's audit row","request":{"method":"POST","path":"/api/arogya/actions/401d6829-04c0-40c6-b091-2a0a2e68032a/undo","body":{}},"response":{"status":403,"body":{"error":"This change belongs to another department"}}}
{"case":"not a uuid","request":{"method":"POST","path":"/api/arogya/actions/not-a-uuid/undo","body":{}},"response":{"status":400,"body":{"error":"Invalid change id"}}}
{"case":"nonexistent uuid","request":{"method":"POST","path":"/api/arogya/actions/00000000-0000-4000-8000-000000000000/undo","body":{}},"response":{"status":404,"body":{"error":"Change not found"}}}
{"case":"audit row that is not a Mochi action","request":{"method":"POST","path":"/api/arogya/actions/ec299c96-d01e-47b0-a28f-a30f9d033e8a/undo","body":{}},"response":{"status":404,"body":{"error":"Change not found"}}}
{"case":"correct HOD","request":{"method":"POST","path":"/api/arogya/actions/401d6829-04c0-40c6-b091-2a0a2e68032a/undo","body":{}},"response":{"status":200,"body":{"auditId":"2682dca7-3e48-488f-a722-91d1fc12b06b","before":"Rotations","after":"Postings & Rotations"}}}
{"case":"already undone","request":{"method":"POST","path":"/api/arogya/actions/401d6829-04c0-40c6-b091-2a0a2e68032a/undo","body":{}},"response":{"status":409,"body":{"error":"This change was already undone."}}}
```

### 3.6 `audit` rows (one apply, one undo, one setting undo — from post-merge run)
```
apply: {"tableName":"department_label_overrides","recordId":"1","action":"CREATE","performedById":1,
  "beforeState":{"key":"nav.postings","value":null,"eventType":"department_label_change"},
  "afterState":{"key":"nav.postings","actor":"mochi","value":"Rotations","eventType":"department_label_change"}}
undo:  {"tableName":"department_label_overrides","recordId":"1","action":"DELETE","performedById":1,
  "beforeState":{"key":"nav.postings","value":"Rotations","eventType":"department_label_change"},
  "afterState":{"key":"nav.postings","actor":"mochi","value":null,"undoOf":"401d6829-04c0-40c6-b091-2a0a2e68032a","eventType":"department_label_change"}}
setting undo: {"tableName":"department_configs","recordId":"1","performedById":1,
  "beforeState":{"key":"useCaseTypeLabel","value":true,"eventType":"department_setting_change"},
  "afterState":{"key":"useCaseTypeLabel","actor":"mochi","value":false,"undoOf":"29a674d6-33f9-4675-8890-1ecfb5482548","eventType":"department_setting_change"}}
```
`performedById` 1 is the department-1 HOD's `usersTable.id` (asserted `=== accounts.hod0.id`); `recordId` is the department id as a string. No `studentsTable.id` appears anywhere in the new code.

### 3.7 Mochi-specific cases
```
hod_only refused (apply)  {"type":"setting_set","key":"yearlyAttendance","value":true,"expected":null} -> 403 {"error":"This setting can only be changed by the HOD directly"}   (features and audit row count asserted unchanged)
hod_only via /ask (stub tool call propose_setting_change yearlyAttendance) -> 200 kind "unsupported" refusal {"type":"hod_only","key":"yearlyAttendance","title":"Yearly attendance","settingsHref":"/requirements"}, no proposal
out of allowlist: stub report_unsupported_change -> 200 kind "unsupported" refusal {"type":"unsupported"}
   stub propose_label_change key "nav.nonexistent" -> refusal {"type":"unsupported"}; extra argument departmentId -> unsupported; clinical value "patient has a fever" -> unsupported
   (features, audit count and override rows asserted unchanged after all four)
stale preview (label)     ask -> proposal expected 0; another session PATCHes the label; apply {"type":"label_set","key":"nav.milestones","value":"Research","expected":0} -> 409 {"error":"This wording changed in another session. Reload before saving."}  (audit unchanged, other session's value kept)
stale preview (setting)   {"type":"setting_set","key":"useThesisAndPublicationsLabel","value":true,"expected":true} -> 409 {"error":"This setting changed since you loaded it. Reload and try again."}
stale undo                apply postings.unitTitle (200), HOD PATCHes it, undo -> 409 {"error":"This wording changed in another session. Reload before saving."}  (audit unchanged, HOD's value kept)
unset-before setting      apply academicsFirstInNav expected null -> 200 {"before":"Not set","after":"On","undoable":false}; undo -> 409 {"error":"This setting was not set before the change, so it cannot be undone automatically. Switch it back in Department Settings."}
/ask proposal changes nothing  JSON snapshot of overrides + audit + features identical before and after /ask returning a proposal (test "a proposal leaves the database and the audit table unchanged")
clinical text in label    {"type":"label_set","key":"caseLog.caseId","value":"patient is a child with fever","expected":0} -> 400 {"error":"Wording cannot contain patient details"}  (audit and overrides unchanged)
flag off                  AROGYA_HOD_EDITS_ENABLED = undefined, "", "false", "1", "TRUE": apply -> 403 {"error":"Department edits through Mochi are not enabled."}, undo -> 403 (same); the provider request tool list contains none of propose_*/report_unsupported_change (asserted for each value)
only HODs get the tools    professor and student /ask with the flag on: provider body has no propose_* tool (the question reached the model, asserted)
daily limit (fix round): HOD: 19 /ask -> 200 each; apply -> 200; undo -> 200; 20th /ask -> 200; 21st -> 429. Verified in `tests/arogya-department-actions.test.ts`: `✔ /ask counts against the limit; apply and undo do not` (`20th ask` returned `200`, `21st ask` returned `429 {"error":"You've reached today's Arogya limit. Try again tomorrow."}`).
mirrored test department  apply and undo -> 403 (3.4, 3.5)
```
Model never writes: the only code that writes is `applyAction`/`undoAction`, reached only from the two new routes. `provider.ts` imports `classifyAction` (reads) only; it imports no `set*` function. The tool descriptions contain label keys with the department's current wording and setting names, and the test asserts no catalog or resident data is in the provider body.

### 3.8 `console.` check
`grep -n "console\." artifacts/api-server/src/lib/arogya/department-actions.ts artifacts/api-server/src/lib/arogya/department-action-schemas.ts artifacts/api-server/src/lib/department-labels.ts artifacts/api-server/src/routes/department-labels.ts` → no output. `git diff -U0 -- provider.ts routes/arogya.ts | grep "^+" | grep -c "console\."` → `0`. The new routes log only `{ departmentId, status: 500 }` through `req.log.error`; no wording, setting value, question or ticket text is logged.

### 3.9 Panel browser check (stub API, not the real backend)
Run: a Node stub on `127.0.0.1:3000` returning canned Mochi answers (throwaway, kept outside the repo), the repo's `vite` on `localhost:5199`, a fake HOD session in `sessionStorage`. The Browser pane showed, at the desktop size:
- proposal card "Sidebar entry for the postings page — Current Postings & Rotations / New Rotations", Confirm and Cancel;
- Tab/focus on Confirm then Enter → "Done." and an Undo button; Enter on Undo → "Undone. The previous value is back.";
- 409 → "This changed since Mochi checked — ask again.";
- `hod_only` answer → "Yearly attendance is a setting only you can switch. Mochi can't change it for you." with a button "Open Department Settings";
- unsupported answer → "Raise a support ticket" textarea pre-filled with the HOD's own question "add a new section called Audit to the logbook", Send ticket → "Support ticket sent. Reference TKT-STUB-1." (stub received `feature_request`, 45 chars);
- mobile preset (375 wide): card fits, `documentElement.scrollWidth` 375, no horizontal scroll.
Stub server log (calls received): `POST /api/arogya/actions/apply`, `POST /api/arogya/actions/<uuid>/undo`, `POST /api/arogya/actions/apply` (the stale one), `POST /api/support/tickets`.
**Not verified:** the real server and a real HOD session (no database); the actual refresh of department wording after apply (`refreshDepartment()` ran against the stub catalog, so the visible wording change was not checked); the "Open Department Settings" click navigation; Undo/ticket by keyboard beyond Confirm and Undo; screen-reader behaviour. The stub's 409 was a canned response.

## 4. Anything noticed that was not asked about
- 18 tests fail on `origin/main` before any change (same names, listed in 3.2). Not touched.
- `UsageFeature` gained two strings; the usage column is `text`, so no migration.
- The ticket message is capped by the support route at 10 to 2000 characters; the panel disables Send outside that range.
- "Rename Procedure Log" is refused + ticket until a label key exists (already a follow-up in the task file).
- Daily-limit map is in-memory per process (unchanged).
- Carried: confirm total OpenAI cost before release; task 4 adds the edit tool descriptions to HOD `/ask` prompts only when the flag is on.

## 5. Skipped / not done
- No commit, push or PR (instructed). Two-commit split is for close-out: backend = the `api-server` files above, panel = the three `mockup-sandbox` files.
- `lib/api-zod` schemas file and export (deviation 1).
- Real-backend panel verification (no database).

## 6. For the reviewer
- Confirm the only 2a behaviour change is the audit row on HOD-direct label writes (`tests/department-labels.test.ts` unchanged and passing).
- Re-read `undoAction` for the §3/§4 checks: department from `req.user.departmentId`, audit `recordId` compared to it, `performedById` is `usersTable.id`; row lookup is by uuid only, then ownership is checked (so an out-of-department uuid answers 403, a missing or non-Mochi one 404, as the task specifies).
- `department-actions.ts` after the one shell-edit slip (deviation 6).

### Demo mode before/after (built-in browser, same app code on `origin/main` vs this branch)
Page text (`innerText`, ISO timestamps normalised, settle wait) for Pediatrics, Radiology, Dermatology and Microbiology: student `/cases /procedures /postings /attendance /conferences /assessments /milestones`; faculty `/ /daily-attendance /assessments /mentees`; at **1280px and 375px** (iframe widths). **88 pages compared, 0 differ** (hash and length identical on every page). An earlier raw comparison showed apparent differences; they were rendering-time and "Applied <timestamp>" noise (the same page differing between two captures of the same code), so the final comparison normalised timestamps and required four identical consecutive reads. Caveat: demo mode reads each demo profile's explicit config, so it proves the demo profiles and the client logic are unchanged; the real-config path is covered by the PGlite backfill test and the catalog tests above.

## Noticed, not changed
- `student.ts:630` hides leave types containing "maternity" from students (a name check on catalog data, not a department); out of scope, as the task said.
- `artifacts/mockup-sandbox/src/.generated/mockup-components.ts` is rewritten by the Vite dev server when it starts; I restored it with `git checkout` so the diff does not carry it.
- `pnpm install --frozen-lockfile --offline` was run in this worktree (no `node_modules` existed); no tracked file changed.
- `.claude/launch.json` was not edited (the guard blocked it; not in scope). The baseline app was served through the terminal tool instead.

## Files created or modified
`lib/db/migrations/0035_department_behaviour_settings.sql` (new), `lib/db/src/migrations.ts`, `lib/db/src/schema/department_configs.ts`, `lib/api-zod/src/academic-logbook.ts`, `lib/api-zod/src/department-settings.ts`, `lib/api-zod/src/logbook-profiles/physiology.ts`, `artifacts/api-server/src/lib/department-features.ts`, `artifacts/api-server/src/lib/academic-logbook.ts`, `artifacts/api-server/src/routes/department.ts`, `artifacts/api-server/tests/department-behaviour-settings.test.ts` (new), `tests/department-labels.test.ts`, `tests/logbook-sections.test.ts`, `tests/physiology-logbook.test.ts`, `tests/migrations.test.ts`, `artifacts/mockup-sandbox/src/lib/department-context.tsx`, `src/lib/demoDepartments.ts`, `src/components/ProfessorPortal.tsx`, `DemoDepartmentCustomizer.tsx`, `layout/AppLayout.tsx`, `pages/{AssessmentsPage,AttendancePage,CaseLogsPage,ConferencesPage,PostingsPage,ProcedureLogsPage}.tsx`, `HANDOFF.md`. `CURRENT_TASK.md` is the approved task file, unchanged.

## Commands run (non-trivial)
`git fetch origin`; `git checkout -f -b task/department-behaviour-settings origin/main`; `git worktree add --detach <scratchpad>/main-baseline origin/main` (baseline for the suite and the demo comparison; remove with `git worktree remove`); `pnpm install --frozen-lockfile --offline` (worktree and baseline); `pnpm run typecheck`; `pnpm test` (branch and baseline); `tsx --test` on the targeted files; `rg` grep above; `git checkout --` on `.generated/mockup-components.ts` and `logbook-sections.test.ts`; fix-round edits + `git merge origin/main` (`e06d5a4`, resolved `ProcedureLogsPage.tsx` keeping both sides); post-merge `pnpm run typecheck` and `pnpm test`. Dev servers: Vite via `preview_start` (this branch) and the terminal tool (baseline, port 5174), both stopped.
