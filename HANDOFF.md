# HANDOFF — Task 3b: Residents' menu order

Branch `task/department-page-order`, created from `origin/main` `fde56c6` (includes 2a, 2b, 3a, and Task 4). **Nothing is committed, pushed, or opened as a PR.**
`CURRENT_TASK.md` sha256 preserved byte-for-byte: `0C400A6C95EA38833FEAC2A1C196268B48A602A9E7A2E6D616788AB2A3AC6CD8`.

**No command connected to a database.** `DATABASE_URL` remained unset; all tests ran against in-process PGlite. No migration was written (`0037` stays unused; `lib/db/**` untouched). `pnpm install --frozen-lockfile --offline` was run to create `node_modules`.

## Scope widening (developer-approved 2026-11-25)
- **`artifacts/api-server/src/lib/arogya/department-actions.ts` (Option A, approved by developer):**
  - Imported `DEPARTMENT_SETTING_VALUE_TYPES` from `@workspace/api-zod` and filtered `ALL_SETTING_KEYS` / `MOCHI_SETTING_KEYS` to boolean-valued settings (`DEPARTMENT_SETTING_VALUE_TYPES[key] === "boolean"`).
  - In `classifyAction()` (`setting_set`), non-boolean keys return `{ kind: "unsupported" }`.
  - In `applyAction()` (`setting_set`), non-boolean keys throw `DepartmentActionError(400, "This setting cannot be changed as a boolean")` before calling `setDepartmentSetting()`.
  - Narrowed `stored`, `change.before`, and `change.after` in `buildProposal`, `applyAction`, and `undoAction` to `boolean | null` so `onOff(...)` typechecks with zero `any` casts.
- **Additional fix-round polish:**
  - `NavOrderSettings.tsx`: Passes `department.department` (7th arg) to `navigationForRole(...)` and checks the boolean returned by `await refresh()` (showing an alert if `false`).
  - `AppLayout.tsx`: Computes `hasCustomStudentOrder` so `hasCustomOrder` is `true` only when `studentNavOrder` matches at least one current non-Dashboard item in `navigationItems`.

## What changed (in-scope files only)
- `lib/api-zod/src/department-settings.ts`: Added `studentNavOrder: "mochi"`, `DepartmentSettingValueType = "boolean" | "path_list"`, `DepartmentSettingValue = boolean | string[]`, `studentNavOrderSchema` (max 30 unique paths, max 64 chars, `^\/[a-z0-9/-]*$`), per-key `DEPARTMENT_SETTING_VALUE_TYPES` / `departmentSettingValueSchemas`, and `departmentSettingUpdateSchemaFor(key)`.
- `artifacts/api-server/src/lib/department-settings.ts`: Added `readStoredValue` (supports `"boolean"` and `"path_list"`, returns `null` on wrong type), structural equality (`JSON.stringify`) for 409 and no-op checks, and `DepartmentSettingValue` types.
- `artifacts/api-server/src/routes/department-config-settings.ts`: Validated `PATCH /:key` per key using `departmentSettingKeySchema` + `departmentSettingUpdateSchemaFor(key)`. Auth/scope (`requireAuth`, `requireRole(["hod"])`, `requireDepartment`, `req.user.departmentId`) unchanged.
- `artifacts/api-server/tests/department-config-settings.test.ts`: Updated line 96 to check `DEPARTMENT_SETTING_VALUE_TYPES[row.key]` and added full `studentNavOrder` test suite (200 set, 200 no-op without audit row, 409 stale `expectedValue`, 400 invalid cases, 200 `[]`, 401/403/mirror 403, `actor: "mochi"`).
- `artifacts/mockup-sandbox/src/lib/academic-navigation.ts`: Added `readStudentNavOrder`, `applyNavOrder` (Dashboard `/` always first, listed items next, unlisted items in default relative order, unknown paths ignored), and `hasCustomOrder` parameter on `mobileNavigationItems`.
- `artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx`: Exported `navigationForRole`, applied `applyNavOrder` to Student `navigationItems`, and passed `hasCustomOrder` to `MobileBottomNav`.
- `artifacts/mockup-sandbox/src/components/layout/MobileBottomNav.tsx`: Accepted `hasCustomOrder` and passed it to `mobileNavigationItems`.
- `artifacts/mockup-sandbox/src/components/NavOrderSettings.tsx` (new): "Residents' menu order" HOD panel with pinned Dashboard, Move up/down `aria-label` buttons, Save order, Reset to default (`[]`), 409 conflict reload/message, visible error states, `refresh()` on save, and `readOnlyConfig` support.
- `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx`: Added `"menu-order"` section entry and `<NavOrderSettings />` render branch.
- `artifacts/mockup-sandbox/tests/academic-navigation.test.ts`: Added unit tests for `applyNavOrder`, `readStudentNavOrder`, and `mobileNavigationItems(..., true/false)`.

## Verification

### Typecheck — `pnpm run typecheck` (repo root), exit `0`
```
Scope: 3 of 8 workspace projects
scripts typecheck: Done
artifacts/api-server typecheck: Done
artifacts/mockup-sandbox typecheck: Done
```

### Targeted `department-config-settings.test.ts` + `arogya-department-actions.test.ts` — 27/27 passed (0 failures)
```json
{"case":"studentNavOrder unauthenticated","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":["/academics","/cases","/postings"],"expectedValue":null}},"response":{"status":401,"body":{"message":"No token found in cookies or authorization header"}}}
{"case":"studentNavOrder student","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":["/academics","/cases","/postings"],"expectedValue":null}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"studentNavOrder professor","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":["/academics","/cases","/postings"],"expectedValue":null}},"response":{"status":403,"body":{"message":"Forbidden: Insufficient role permissions"}}}
{"case":"studentNavOrder mirror HOD","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":["/academics","/cases","/postings"],"expectedValue":null}},"response":{"status":403,"body":{"message":"Test departments cannot modify mirrored settings"}}}
{"case":"studentNavOrder set","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":["/academics","/cases","/postings"],"expectedValue":null}},"response":{"status":200,"body":{"key":"studentNavOrder","before":null,"after":["/academics","/cases","/postings"],"auditId":"641e0b27-d7a6-4404-9dd2-886c1214e9f1"}}}
{"case":"studentNavOrder no-op","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":["/academics","/cases","/postings"],"expectedValue":["/academics","/cases","/postings"]}},"response":{"status":200,"body":{"key":"studentNavOrder","before":["/academics","/cases","/postings"],"after":["/academics","/cases","/postings"],"auditId":null}}}
{"case":"studentNavOrder stale 409","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":["/cases"],"expectedValue":["/postings"]}},"response":{"status":409,"body":{"message":"This setting changed since you loaded it. Reload and try again."}}}
{"case":"studentNavOrder invalid (not an array)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":"/cases","expectedValue":["/academics","/cases","/postings"]}},"response":{"status":400,"body":{"message":"Expected array, received string"}}}
{"case":"studentNavOrder invalid (non-string item)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":[123],"expectedValue":["/academics","/cases","/postings"]}},"response":{"status":400,"body":{"message":"Expected string, received number"}}}
{"case":"studentNavOrder invalid (duplicates)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":["/cases","/cases"],"expectedValue":["/academics","/cases","/postings"]}},"response":{"status":400,"body":{"message":"Menu paths must be unique"}}}
{"case":"studentNavOrder invalid (more than 30 items)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":["/p0","/p1","/p2","/p3","/p4","/p5","/p6","/p7","/p8","/p9","/p10","/p11","/p12","/p13","/p14","/p15","/p16","/p17","/p18","/p19","/p20","/p21","/p22","/p23","/p24","/p25","/p26","/p27","/p28","/p29","/p30"],"expectedValue":["/academics","/cases","/postings"]}},"response":{"status":400,"body":{"message":"At most 30 menu paths are allowed"}}}
{"case":"studentNavOrder invalid (missing leading slash)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":["cases"],"expectedValue":["/academics","/cases","/postings"]}},"response":{"status":400,"body":{"message":"Menu paths must start with / and use lowercase letters, digits, - or /"}}}
{"case":"studentNavOrder invalid (longer than 64 chars)","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":["/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],"expectedValue":["/academics","/cases","/postings"]}},"response":{"status":400,"body":{"message":"String must contain at most 64 character(s)"}}}
{"case":"studentNavOrder reset []","request":{"method":"PATCH","path":"/api/admin/department/config/settings/studentNavOrder","body":{"value":[],"expectedValue":["/academics","/cases","/postings"]}},"response":{"status":200,"body":{"key":"studentNavOrder","before":["/academics","/cases","/postings"],"after":[],"auditId":"9d7e67e5-5463-4ad9-9927-86c7cd7a127f"}}}
```

### `academic-navigation.test.ts` — 7/8 passed
- New test `✔ student menu ordering keeps Dashboard first, drops unknown paths, appends unlisted items, and updates phone slots` passed.
- 1 pre-existing failure (`year restrictions remain the existing 15/15/18 sections, partitioned by category`, `16 !== 15`) matches `origin/main`.

### Full `pnpm test` (`artifacts/api-server`, `DATABASE_URL` unset)
- `ℹ tests 477 / ℹ pass 459 / ℹ fail 18` — exact 18 pre-existing baseline failures on `origin/main` (0 new failures):
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

### Browser verification
- Not run in this headless pass (recorded as unverified here).
