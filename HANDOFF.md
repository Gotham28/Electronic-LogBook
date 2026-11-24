# HANDOFF — Task 3a: change one department setting at a time (after fix round 1)

Branch `claude/department-config-single-setting-fddc7f`, worked from `5b5e16e` (PR #163). Nothing committed, no PR, no push. Executor: Sonnet direct (this session wrote the code). No database was connected to: tests run on in-process PGlite only. No migration, no schema edit (0035 unused). No secret value appears in this file.

Suggested review model: Opus / high effort (AGENTS.md §15.2: ownership and department boundary §3, two ID systems §4). Unratcheted: no independent Antigravity tier exists for this task (§15.4).

## What changed (whole task, after fix round 1)

| File | Change |
|---|---|
| `lib/api-zod/src/department-settings.ts` (new) | `DEPARTMENT_SETTING_TIERS` (27 keys, 4 `mochi`, 23 `hod_only`), `departmentSettingKeySchema` (`z.enum`), `DEPARTMENT_SETTING_VALUE_TYPES`, per-key value schemas (all `z.boolean()`), `departmentSettingUpdateSchema` (`{ value, expectedValue: boolean \| null }`, `.strict()`). |
| `lib/api-zod/src/index.ts` | One line, directly under `export * from "./procedure-log-fields.js";`. |
| `artifacts/api-server/src/lib/department-settings.ts` (new) | `getDepartmentSettings(departmentId)` and `setDepartmentSetting({ departmentId, userId, key, value, expectedValue, actor })`. Order inside the setter: key allowlist (400) → tier check (403 for `actor !== "hod"` on any key whose tier is not `mochi`, before any DB access; fails closed, see Fix round 1) → value type (400) → department lookup and mirror check (403) → `db.transaction`: `SELECT … FOR UPDATE` on the config row, compare stored value with `expectedValue` (409), no-op returns without audit, otherwise write plus one `audit` row in the same transaction. Missing row: insert `{ [key]: value }` only with `onConflictDoNothing()`; an empty result (concurrent insert won the unique `department_id`) returns 409. Reads the raw stored value, never `getDepartmentFeatures` (comment at the read site). |
| `artifacts/api-server/src/routes/department-config-settings.ts` (new) | `router.use(requireAuth, requireRole(["hod"]), requireDepartment)`, `GET /` and `PATCH /:key` (`validate(departmentSettingUpdateSchema)`). Actor is hard-coded `"hod"`. Department comes only from `req.user.departmentId`; `userId` is `req.user.id` (`usersTable.id`). Logs department id and status code only. |
| `artifacts/api-server/src/routes/index.ts` | Exactly two lines: the import directly under `import logbookSectionsRouter …`, the mount directly under the logbook-sections mount and before `router.use("/admin", adminRouter)`. |
| `artifacts/api-server/tests/department-config-settings.test.ts` (new) | 9 tests, PGlite pattern of `logbook-sections.test.ts`. Prints each request/response as JSON. |

## Fix round 1 (review verdict: accept with fixes; developer said "Yes, send back" on 2026-11-23)

Only these three files were edited this round: `artifacts/api-server/tests/department-config-settings.test.ts`, `artifacts/api-server/src/lib/department-settings.ts` (one line), and this `HANDOFF.md`. Each finding was checked against the code first; all were valid and implemented.

1. **Other-department isolation test.** Before: HOD B wrote `academicsFirstInNav: true`, the value department A already held, and only that one key on A was checked, so a write that leaked into A could not be seen. Now: A holds `true`; HOD B (its own correct `expectedValue: null`) writes `false`. The test deep-equals A's entire `enabledFeatures` row before and after HOD B's call (`assert.deepEqual(await features(departmentIds[0]), departmentABefore)`), asserts B's response is `before: null, after: false`, and asserts B's row is `{ awards: true, academicsFirstInNav: false }`. The later assertion in the "rejects a body departmentId…" test was updated from `academicsFirstInNav: true` to `false` to match.
2. **Audit `performedById` test.** hod0's `users.id` is 1 and so is the first `students.id`, so the old check could not catch an ID mix-up. Now the audit test creates a department of its own (with a seeded config row, so the action is still `UPDATE`) and a HOD for it, created late (users.id 19 in this run). It asserts that this id is greater than every `students.id` and is not in the list of student ids (setup guard), then asserts `row.performedById === lateHod.id`, `!== accounts.hod0.id`, and not a `students.id`. **Deviation from the suggested wording:** I did not add a second HOD to department A, because the database allows one approved HOD per department (`users_one_approved_hod_per_department`; my first attempt failed with that constraint, nothing else changed). The no-op PATCH in that test also runs as the late HOD. Not mutation-tested: I did not temporarily change the route to record a `studentsTable.id` to watch this test fail; the guarantee is by construction (late id is above every student id).
3. **Tier gate** (`department-settings.ts:66`). `actor !== "hod" && DEPARTMENT_SETTING_TIERS[key] === "hod_only"` is now `actor !== "hod" && DEPARTMENT_SETTING_TIERS[key] !== "mochi"`. A key with a missing or new tier now blocks a non-HOD actor instead of letting it through. The 23-key `hod_only` loop test still passes; the `mochi`-tier key still works for `actor: "mochi"`.
4. **This file.** Per-file failure count fixed (11 `clinical-works`, not 10); the hand-annotated diff stat replaced with raw output below; the verification item 12 statement and the line-77 claim corrected; all pasted output below is from this round's runs.

### Verification item 12 ("only six paths") is not literally met

The six in-scope paths are the four new files (`lib/api-zod/src/department-settings.ts`, `lib/department-settings.ts`, `routes/department-config-settings.ts`, the test file) and the two edited index files (`routes/index.ts`, `lib/api-zod/src/index.ts`). The working tree also changes `CURRENT_TASK.md` (the approved plan, edited by the planning session, not by me) and `HANDOFF.md` (required by the task). So the diff against `5b5e16e` touches eight paths, not six. Nothing else was edited.

## Deviations and things you should decide (not acted on)

1. **`hideQuarterlyAppraisal` IS read from `enabledFeatures`.** The plan says it is "a local variable in `ProfessorPortal.tsx:151`, not a key". It is a local variable, but `ProfessorPortal.tsx:152` initialises it from `config?.enabledFeatures?.hideQuarterlyAppraisal`, so a stored key of that name has an effect (hides the quarterly appraisal section). I left it off the allowlist as instructed, so it returns `400`. If it should be settable it would be `hod_only` (it hides a record section). I did not add it. Whether any department stores it, I could not check (no database access). Still a separate developer decision.
2. **Mochi-tier greps found no tier change needed.** The four `mochi` keys are used only for labels and nav order (`AppLayout.tsx:194,211,249,252`, `CaseLogsPage.tsx:337-339,485,560`, `MilestonesPage.tsx:32`, `ThesisPage.tsx:29`, `arogya/knowledge/index.ts:38`). None touches record creation, editing, verification or visibility. No key was reclassified.
3. **Stored vs effective value for `useThesisAndMandatoryCertificationsLabel`.** `department-features.ts:19`, `routes/department.ts:70` and `department-context.tsx:46` default it to `true` for microbiology when unset. The new GET reports the stored value (`null` = unset), so for such a department the GET shows `null` while the effective label is on. This follows the plan's stored-value decision. Task 2b/4 should show effective values to the HOD.
4. **Existing-failure baseline.** `pnpm test` fails 18 tests; the same 18 fail on a clean `5b5e16e` (details below). Not caused by this task, not touched.
5. **`HANDOFF.md` overwritten.** The repo's tracked `HANDOFF.md` was the previous task's (credential removal). I replaced it, as the task requires.
6. **`CURRENT_TASK.md` shows as modified.** That edit is the approved plan from the planning session, not mine.
7. **Local `origin/main` moved.** During this round `origin/main` advanced from `5b5e16e` to `41c2131` (PR #164, Mochi adoption). The branch is still on `5b5e16e`, so the literal `git diff --stat origin/main` now lists 33 files, including the reverse of PR #164. That is not caused by this task. The raw stat below is against `5b5e16e`, the baseline the task was planned on.
8. Extra, in my own test file only: HOD of department B also patches the same key (to show department scoping); not a scope change.

## Commands run in this round (in full)

- `git rev-parse --abbrev-ref HEAD`, `git status --short`, `git rev-parse --short HEAD` (confirm branch and uncommitted files), `git rev-parse HEAD origin/main`, `git log --oneline -3 origin/main`/`HEAD`, `git diff --stat …`, `wc -l`, `grep` on the pasted outputs
- `pnpm exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 tests/department-config-settings.test.ts` (twice: the first run failed on the HOD-uniqueness constraint described in Fix round 1, item 2; the second passed, and the output below is from it)
- `pnpm test` (from `artifacts/api-server`): full suite
- `pnpm run typecheck` (repo root)
- `pnpm exec tsc -p tests/tsconfig.json --noEmit` in `artifacts/api-server`, filtered to my files: no match (the 54 other lines are pre-existing)
- `git archive origin/main | tar -x -C <scratchpad>/baseline` (at that time `origin/main` was still `5b5e16e`, confirmed because `src/lib/arogya/weekly-digest.ts` from PR #164 is absent in it), `pnpm install --frozen-lockfile --ignore-scripts` there, and the four failing test files run there
- A `sed -i` command was blocked by the guard hook (nothing written); I used Edit instead. No hook or settings file was edited. A second `git archive 5b5e16e` copy was started and stopped because the first baseline was already correct; it is in the scratchpad only.

No `git add`, `commit`, `push`, `reset`, `stash`, `checkout`, `pull`, `drizzle-kit`, `psql`, `src/migrate.ts` or any other database command. The index was not touched this round.

## Verification (pasted from this round's runs)

### New test file: `tests/department-config-settings.test.ts`

```
✔ PATCH §11 cases: 401, wrong role 403, HOD 200 with other keys and other department untouched, unknown key 400 (10754.9289ms)
✔ PATCH rejects a body departmentId, unknown fields and non-boolean values with 400 (159.0916ms)
✔ GET §11 cases: 401, wrong role 403, HOD 200 returns only the caller's department values (113.2419ms)
✔ a stale expectedValue returns 409 and leaves the stored value unchanged (104.1592ms)
✔ a change through the old whole-object POST makes a PATCH with the previous expectedValue return 409 (70.7253ms)
✔ a successful PATCH writes exactly one audit row, and a no-op PATCH writes none (42.7741ms)
✔ a mirrored test department returns 403 on PATCH and reads its source department's values on GET (93.3371ms)
✔ a missing config row is inserted with exactly { [key]: value } and audited as CREATE (143.479ms)
✔ the service rejects every hod_only key for actor mochi with 403 before any write (43.0879ms)
ℹ tests 9   ℹ pass 9   ℹ fail 0   (exit=0)
```

### §11 four cases on `PATCH /api/admin/department/config/settings/:key` (each request and response)

Setup: department A (HOD `hod0`) starts with `{ procedureExperience: true, hideCaseLogs: false }`; department B (HOD `hod1`) starts with `{ awards: true }`.

1. Unauthenticated → 401
```
{"case":"PATCH unauthenticated","request":{"method":"PATCH","path":"/api/admin/department/config/settings/academicsFirstInNav","body":{"value":true,"expectedValue":null}},"response":{"status":401,"body":{"message":"No token found in cookies or authorization header"}}}
```
2. Wrong role → 403 (professor, then student). The test also asserts department A's row was unchanged afterwards.
```
{"case":"PATCH professor (wrong role)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/academicsFirstInNav","body":{"value":true,"expectedValue":null}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"PATCH student (wrong role)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/academicsFirstInNav","body":{"value":true,"expectedValue":null}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
```
3. HOD of department A → 200 (the correct owner). The test asserts department A is now `{ procedureExperience: true, hideCaseLogs: false, academicsFirstInNav: true }` and department B's row is deep-equal to its value before the call.
```
{"case":"PATCH HOD of department A","request":{"method":"PATCH","path":"/api/admin/department/config/settings/academicsFirstInNav","body":{"value":true,"expectedValue":null}},"response":{"status":200,"body":{"key":"academicsFirstInNav","before":null,"after":true,"auditId":"fc45bf56-b7fe-4120-93df-b3acb097e9a0"}}}
```
   Department isolation (strengthened in fix round 1). HOD B writes `false` for the same key that department A holds as `true`, with B's own `expectedValue: null`:
```
{"case":"PATCH HOD of department B, same key, different value","request":{"method":"PATCH","path":"/api/admin/department/config/settings/academicsFirstInNav","body":{"value":false,"expectedValue":null}},"response":{"status":200,"body":{"key":"academicsFirstInNav","before":null,"after":false,"auditId":"eed5329e-dd89-4d0f-a281-e49f46bf0409"}}}
```
   What the test asserts after this call (this replaces the previous, weaker claim that only one key on A was checked): department A's **entire** `enabledFeatures` row is deep-equal to its value captured before HOD B's call (`{ procedureExperience: true, hideCaseLogs: false, academicsFirstInNav: true }`), and department B's row is `{ awards: true, academicsFirstInNav: false }`. The differing value (`false` vs A's `true`) means a write that leaked into A would change A's row and fail the deep-equal.
4. Nonexistent key → 400
```
{"case":"PATCH nonexistent key","request":{"method":"PATCH","path":"/api/admin/department/config/settings/notAKey","body":{"value":true,"expectedValue":null}},"response":{"status":400,"body":{"message":"Unknown setting"}}}
```
   (Nonexistent row: the PATCH route acts on the caller's own department only, so "nonexistent row" is covered by the unknown key above and by the missing config row case further down.)
5. Body `departmentId` and other malformed bodies → 400 (strict)
```
{"case":"body departmentId","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":true,"expectedValue":null,"departmentId":2}},"response":{"status":400,"body":{"message":": Unrecognized key(s) in object: 'departmentId'"}}}
{"case":"unknown field","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":true,"expectedValue":null,"extra":1}},"response":{"status":400,"body":{"message":": Unrecognized key(s) in object: 'extra'"}}}
{"case":"string value","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":"yes","expectedValue":null}},"response":{"status":400,"body":{"message":"value: Expected boolean, received string"}}}
{"case":"missing expectedValue","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":true}},"response":{"status":400,"body":{"message":"expectedValue: Required"}}}
{"case":"numeric expectedValue","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":true,"expectedValue":1}},"response":{"status":400,"body":{"message":"expectedValue: Expected boolean, received number"}}}
```

### `GET /api/admin/department/config/settings`: 401, 403, 200 and department scoping
```
{"case":"GET unauthenticated","request":{"method":"GET","path":"/api/admin/department/config/settings"},"response":{"status":401,"body":{"message":"No token found in cookies or authorization header"}}}
{"case":"GET professor (wrong role)","request":{"method":"GET","path":"/api/admin/department/config/settings"},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"GET student (wrong role)","request":{"method":"GET","path":"/api/admin/department/config/settings"},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"GET HOD of department A (values that differ from B)","request":{"method":"GET","path":"/api/admin/department/config/settings"},"response":{"status":200,"body":[{"key":"academicsFirstInNav","tier":"mochi","valueType":"boolean","value":true},{"key":"procedureExperience","tier":"hod_only","valueType":"boolean","value":true},{"key":"hideCaseLogs","tier":"hod_only","valueType":"boolean","value":false}]}}
```
The 200 line above prints only the non-null rows. The test asserts the list has every allowlisted key in order, `hideCaseLogs` is `false` for A and `null` for B, `awards` is `null` for A and `true` for B, and `keepExistingFlag` is not listed.

### Stale `expectedValue` → 409, value unchanged
```
{"case":"PATCH stale expectedValue","request":{"method":"PATCH","path":"/api/admin/department/config/settings/hideCaseLogs","body":{"value":true,"expectedValue":true}},"response":{"status":409,"body":{"message":"This setting changed since you loaded it. Reload and try again."}}}
{"case":"PATCH expectedValue null but a value is stored","request":{"method":"PATCH","path":"/api/admin/department/config/settings/hideCaseLogs","body":{"value":true,"expectedValue":null}},"response":{"status":409,"body":{"message":"This setting changed since you loaded it. Reload and try again."}}}
```
Test asserts the stored `hideCaseLogs` is still `false` after both.

### Old whole-object POST, then a PATCH with the previous `expectedValue` → 409
```
{"case":"old POST /admin/department/config","request":{"method":"POST","path":"/api/admin/department/config","body":{"enabledFeatures":{"hideCaseLogs":false,"academicsFirstInNav":true,"procedureExperience":true,"useCaseTypeLabel":true}}},"response":{"status":200,"body":{"id":1,"departmentId":1,"requiredCases":7,"requiredProcedures":11,"requiredAcademic":3,"enabledFeatures":{"hideCaseLogs":false,"useCaseTypeLabel":true,"academicsFirstInNav":true,"procedureExperience":true},"procedureLogFields":null,"createdAt":"2026-11-24T10:12:37.668Z"}}}
{"case":"PATCH carrying the previous expectedValue (null)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":false,"expectedValue":null}},"response":{"status":409,"body":{"message":"This setting changed since you loaded it. Reload and try again."}}}
{"case":"PATCH with the refreshed expectedValue","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":false,"expectedValue":true}},"response":{"status":200,"body":{"key":"useCaseTypeLabel","before":true,"after":false,"auditId":"41025df4-cea2-42c6-99ac-307eeac801bb"}}}
```
Test asserts the rejected PATCH wrote no audit row.

### One audit row with the planned shape, and a no-op writes none (strengthened in fix round 1)
The caller is a HOD created late, for a department of its own (department id 4 here). Its `users.id` is 19, above every `students.id`, so a `studentsTable.id` mix-up could not produce 19.
```
{"case":"PATCH for audit check (late-created HOD, own department)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useThesisAndPublicationsLabel","body":{"value":true,"expectedValue":null}},"response":{"status":200,"body":{"key":"useThesisAndPublicationsLabel","before":null,"after":true,"auditId":"d18571cd-34a0-4b1a-9787-c097a2039b82"}}}
{"case":"audit row for the successful PATCH","row":{"id":"d18571cd-34a0-4b1a-9787-c097a2039b82","tableName":"department_configs","recordId":"4","action":"UPDATE","performedById":19,"beforeState":{"key":"useThesisAndPublicationsLabel","value":null,"eventType":"department_setting_change"},"afterState":{"key":"useThesisAndPublicationsLabel","actor":"hod","value":true,"eventType":"department_setting_change"},"timestamp":"<omitted>"}}
{"case":"PATCH no-op (value equals stored value)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useThesisAndPublicationsLabel","body":{"value":true,"expectedValue":true}},"response":{"status":200,"body":{"key":"useThesisAndPublicationsLabel","before":true,"after":true,"auditId":null}}}
```
Test asserts: the audit row count grew by exactly 1; `performedById === lateHod.id` (19), `!== accounts.hod0.id` (1), and is not in the list of `students.id`; the setup guard `lateHod.id > max(students.id)`; and the count is unchanged after the no-op.

### Mirrored test department → 403
```
{"case":"PATCH mirrored test department","request":{"method":"PATCH","path":"/api/admin/department/config/settings/awards","body":{"value":true,"expectedValue":null}},"response":{"status":403,"body":{"message":"Test departments cannot modify mirrored settings"}}}
```
Test asserts the source department's row, the mirror's (non-)row and the audit count are unchanged, and that GET for the mirror HOD reads the source department's values.

### Missing config row → `{ [key]: value }` only, audit `CREATE`
```
{"case":"PATCH missing row with a non-null expectedValue","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":true,"expectedValue":false}},"response":{"status":409,"body":{"message":"This setting changed since you loaded it. Reload and try again."}}}
{"case":"PATCH missing config row","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":true,"expectedValue":null}},"response":{"status":200,"body":{"key":"useCaseTypeLabel","before":null,"after":true,"auditId":"6e83a3b9-8e69-4d9e-9680-c38797ffd65b"}}}
{"case":"PATCH the same row again","request":{"method":"PATCH","path":"/api/admin/department/config/settings/useCaseTypeLabel","body":{"value":false,"expectedValue":true}},"response":{"status":200,"body":{"key":"useCaseTypeLabel","before":true,"after":false,"auditId":"73542d94-9052-494b-9985-4227ac33de77"}}}
```
Test asserts the stored row is deep-equal to `{ useCaseTypeLabel: true }` (no `procedureExperience`), the audit `action` is `CREATE` with the new HOD's `users.id`, and the next PATCH on that row audits as `UPDATE`.

Not tested: the concurrent-insert race (`onConflictDoNothing` returning no row → 409). It is a code path reviewed by reading, not exercised.

### Service with `actor: "mochi"` (tier gate now `!== "mochi"`)
```
{"case":"service actor=mochi on hod_only key freeTextPostingUnit","result":"DepartmentSettingError status 403"}
```
The test loops over all 23 `hod_only` keys (403 each), asserts department 3's stored features and audit count are unchanged, then shows a `mochi`-tier key works for `actor: "mochi"` and records `actor: "mochi"` in `afterState`. A key outside the allowlist (`keepExistingFlag`) returns 400 from the service.

### Typecheck (`pnpm run typecheck`, repo root)
```
$ pnpm run typecheck:libs && pnpm -r --filter "./artifacts/**" --filter "./scripts" --if-present run typecheck
$ tsc --build
Scope: 3 of 8 workspace projects
artifacts/mockup-sandbox typecheck$ tsc -p tsconfig.json --noEmit
scripts typecheck$ tsc -p tsconfig.json --noEmit
artifacts/api-server typecheck$ tsc -p tsconfig.json --noEmit
scripts typecheck: Done
artifacts/api-server typecheck: Done
artifacts/mockup-sandbox typecheck: Done
exit=0
```
`pnpm exec tsc -p tests/tsconfig.json --noEmit` (55 lines of pre-existing output) has no line mentioning `department-config-settings` or `department-settings`.

### Full suite (`pnpm test`, from `artifacts/api-server`): FAILS, same 18 failures as clean `5b5e16e`
```
ℹ tests 398
ℹ pass 380
ℹ fail 18
exit=1
```
Failing tests by file: **11** in `clinical-works.test.ts`, **4** in `department-template.test.ts`, **2** in `physiology-logbook.test.ts`, **1** in `surgery-procedure-fields.test.ts` (11 + 4 + 2 + 1 = 18). I exported `5b5e16e` to a scratch folder and ran those four files there:
```
ℹ tests 56
ℹ pass 38
ℹ fail 18
exit=1
```
The sorted lists of failing test names from both runs (the `✖` lines with timings stripped) were compared with `diff`; it printed `IDENTICAL-FAILURE-SETS`. The 18 names (the list also holds the `✖ failing tests:` header line, which is not a test):
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
None of the nine `department-config-settings` tests is in it. The failures are pre-existing and out of scope (the Surgery SQL fixture fails on `departments.college_id` NOT NULL); they should be a separate task.

### `git diff --stat` and `git status --short` (raw)

`git diff --stat 5b5e16e23127dcf06e8f77a9253e04529023497b` (the baseline; tracked files only, new files do not appear in a diff):
```
 CURRENT_TASK.md                          | 288 ++++++++++++++++---------------
 HANDOFF.md                               | 264 ++++++++++++++++++++--------
 artifacts/api-server/src/routes/index.ts |   2 +
 lib/api-zod/src/index.ts                 |   1 +
 4 files changed, 342 insertions(+), 213 deletions(-)
```
`git status --short`:
```
 M CURRENT_TASK.md
 M HANDOFF.md
 M artifacts/api-server/src/routes/index.ts
 M lib/api-zod/src/index.ts
?? artifacts/api-server/src/lib/department-settings.ts
?? artifacts/api-server/src/routes/department-config-settings.ts
?? artifacts/api-server/tests/department-config-settings.test.ts
?? lib/api-zod/src/department-settings.ts
```
Line counts of the four untracked files (`wc -l`): 111, 35, 222, 55. The two modified source files carry only these lines (`git diff 5b5e16e` filtered to added lines): `import departmentConfigSettingsRouter from "./department-config-settings.js";`, `router.use("/admin/department/config/settings", departmentConfigSettingsRouter);`, and `export * from "./department-settings.js";`. Note: the literal `git diff --stat origin/main` is not usable now because local `origin/main` moved to `41c2131` (see Deviation 7).

## Rule notes

- §3/§4: department comes only from `req.user.departmentId` (middleware `requireDepartment` fails closed with 403); `performedById` is `req.user.id` (`usersTable.id`); no `studentsTable.id` is used anywhere. The audit test now distinguishes the two ID systems (late-created HOD).
- §5: no department-specific branching; the allowlist is department-agnostic.
- §6: no schema, migration or database command.
- §8: the audit payload holds setting keys, booleans, the actor and an event type only. The route logs the department id and status code only.
- §9: one feature. Round 1 edited three files only.
- Known gap carried from the plan: `hard-delete-user.ts` deletes `audit` rows by `performedById`, so a hard-deleted HOD's setting history is lost. Noted for task 4.
- Stale `AGENTS.md`: §14 still routes decisions through Claude Chat and Antigravity-only execution. Follow-up only; not edited.

## Next step

Hand back to `code-review` (Opus, four lenses) for the re-review. Close-out only after the developer accepts.
