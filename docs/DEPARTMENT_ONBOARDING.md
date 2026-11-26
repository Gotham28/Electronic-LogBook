# Department Onboarding Guide

Operational reference for onboarding a new postgraduate department in the Arogya Electronic LogBook, verifying its mirror test department, and activating optional specialty workspaces such as Psychiatry.

> **Safety rules (`AGENTS.md`)**: Agents may never run `drizzle-kit push`, `drizzle-kit migrate`, `psql`, or any other database-connecting command — including read-only queries — against any database (`AGENTS.md §6`). The only exception is `src/migrate.ts` (`AGENTS.md §6.1`) when all four test-database conditions hold (dedicated test `DATABASE_URL`, host verified and printed before every connecting command, migrations run only via `src/migrate.ts`, and no hand-written DDL outside existing migration files). Template CLI runs and ad-hoc database commands are developer-only. Never commit or document real user credentials, `.env` values, or patient/leave-reason text (`AGENTS.md §§8, 10, 13`).

---

## 1. Entry Points Overview

| Area | Primary UI / CLI | API / Library Entry Points |
|---|---|---|
| Superadmin console | [`AdminPortal.tsx`](../artifacts/mockup-sandbox/src/components/AdminPortal.tsx) | [`apiClient.ts`](../artifacts/mockup-sandbox/src/lib/apiClient.ts), [`superadmin.ts`](../artifacts/api-server/src/routes/superadmin.ts) (`/api/superadmin/*`) |
| Department provisioning | `New department` in [`AdminPortal.tsx`](../artifacts/mockup-sandbox/src/components/AdminPortal.tsx) | `provisionDepartment` & `provisionMirrorForRealDepartment` in [`department-provisioning.ts`](../artifacts/api-server/src/lib/department-provisioning.ts); CLI [`provision-department.ts`](../artifacts/api-server/src/provision-department.ts) |
| Department templates | Developer CLI [`apply-department-template.ts`](../artifacts/api-server/scripts/apply-department-template.ts) | `applyDepartmentTemplate` in [`department-template.ts`](../artifacts/api-server/src/lib/department-template.ts); sample [`radiology.json`](../artifacts/api-server/scripts/department-templates/radiology.json) |
| HOD runtime settings | [`DepartmentSettings.tsx`](../artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx), [`PsychiatrySettings.tsx`](../artifacts/mockup-sandbox/src/components/PsychiatrySettings.tsx) | [`admin.ts`](../artifacts/api-server/src/routes/admin.ts), [`department-config-settings.ts`](../artifacts/api-server/src/routes/department-config-settings.ts), [`department.ts`](../artifacts/api-server/src/routes/department.ts) |
| Mirror resolution | — | `resolveConfigDepartmentId` in [`department-config-source.ts`](../artifacts/api-server/src/lib/department-config-source.ts) |
| Psychiatry workspace | [`PsychiatryWorkspace.tsx`](../artifacts/mockup-sandbox/src/components/pages/PsychiatryWorkspace.tsx), [`PsychiatryShortCasesPage.tsx`](../artifacts/mockup-sandbox/src/components/pages/PsychiatryShortCasesPage.tsx) | [`psychiatry.ts`](../artifacts/api-server/src/routes/psychiatry.ts) (`/api/psychiatry/*`), [`App.tsx`](../artifacts/mockup-sandbox/src/App.tsx) |

---

## 2. College Scope and Superadmin Access

All department administration routes in [`superadmin.ts`](../artifacts/api-server/src/routes/superadmin.ts) require an authenticated `"admin"` account (`requireAuth`, `requireRole(["admin"])`) and are mounted under `/api/superadmin` in [`routes/index.ts`](../artifacts/api-server/src/routes/index.ts).

1. **Select or create a college**:
   - In [`AdminPortal.tsx`](../artifacts/mockup-sandbox/src/components/AdminPortal.tsx), select the target college from the top bar (`GET /api/superadmin/colleges`) or create one via `New college` (`POST /api/superadmin/colleges`).
   - Toggle `Allow public registration` (`acceptingRegistrations`) and update college details in **College settings** (`PATCH /api/superadmin/colleges/:collegeId`). Public registration (`GET /api/departments`) only lists real departments (`isTest = false`) that have an active HOD and belong to a college with `acceptingRegistrations = true`.
2. **Server-side college guard**:
   - Every department and user action in [`superadmin.ts`](../artifacts/api-server/src/routes/superadmin.ts) resolves `req.adminCollegeId` from `collegeId` (`adminCollegePath` in [`apiClient.ts`](../artifacts/mockup-sandbox/src/lib/apiClient.ts) attaches `collegeId` from `sessionStorage["admin.selectedCollegeId"]`).
   - `router.param("id")` and `router.param("userId")` verify the target department or user belongs to `req.adminCollegeId` and return `403` on cross-college mismatch or `404` when absent.

---

## 3. Creating a Real Department and Setting Up the Real HOD

### Via Superadmin UI (preferred)
1. Click **New department** in [`AdminPortal.tsx`](../artifacts/mockup-sandbox/src/components/AdminPortal.tsx), which submits `POST /api/superadmin/departments` (`createAdminDepartment`).
2. Supply:
   - `collegeId` (must match the selected college).
   - `name` and `code` (`code` is unique within the college via `departments_college_code_unique` on `(college_id, code)` in [`users.ts`](../lib/db/src/schema/users.ts)).
   - Optional `copyFromDepartmentId` (see §5 below).
   - Initial **HOD** (`hod.fullName`, `hod.email`).
3. `provisionDepartment` ([`department-provisioning.ts`](../artifacts/api-server/src/lib/department-provisioning.ts)) runs in a staged sequence:
   - **Initial transaction (`db.transaction`)**: inserts the real department (`isTest = false`), copies settings, catalog, procedures, posting schedule, and logbook sections if `copyFromDepartmentId` is set, enforces at most one approved HOD per department (`users_one_approved_hod_per_department` in [`users.ts`](../lib/db/src/schema/users.ts)), creates the approved `"hod"` user with a hashed generated initial password, creates/updates `department_configs`, and inserts supplied procedures and catalog rows plus default `competency_level` and `leave_type` rows. This transaction commits before the follow-up steps below.
   - **Outside that transaction**:
     - Recomputes `department_configs` totals (`recomputeProcedureRequirement`, `recomputeCatalogRequirements`) when configuring manually.
     - Calls `provisionMirrorForRealDepartment` in its own separate transaction (`try/catch`). If mirror provisioning fails, the real department and HOD remain committed without a mirror; follow up with **Provision test departments** (`POST /api/superadmin/departments/backfill-test-departments`) in [`AdminPortal.tsx`](../artifacts/mockup-sandbox/src/components/AdminPortal.tsx).
     - Calls `sendAccountCreatedEmail` (`try/catch`, never logging the HOD's email or password). If email delivery fails (`emailAccepted = false`), the real department and HOD remain committed and [`AdminPortal.tsx`](../artifacts/mockup-sandbox/src/components/AdminPortal.tsx) displays a warning so the HOD can use **Forgot password** if needed.

### Replacing the HOD later
- Open the department in [`AdminPortal.tsx`](../artifacts/mockup-sandbox/src/components/AdminPortal.tsx) and use **Replace HOD** (`POST /api/superadmin/departments/:id/replace-hod`).
- The incoming user must already be an `"approved"` `"professor"` in that same department. The swap runs in one transaction, demotes the outgoing HOD to `"professor"`, promotes the incoming professor to `"hod"`, and bumps `sessionVersion` on both.

### Via developer CLI (manual setup JSON)
- When provisioning with explicit `config`, `procedures`, and `catalog` JSON outside the UI, the developer runs [`provision-department.ts`](../artifacts/api-server/src/provision-department.ts) (`pnpm --dir artifacts/api-server run db:provision-department`) with `DEPARTMENT_SETUP_FILE` and `HOD_INITIAL_PASSWORD` set in the environment.

---

## 4. Approved Templates and Catalog Inputs

Department behavior is driven strictly by database configuration (`department_configs`, `procedure_types`, `department_catalog`, `department_posting_schedule`, `department_logbook_sections`, and `department_label_overrides`) — never by hardcoded department IDs or names (`AGENTS.md §5`).

1. **Creation-time inputs (`setupSchema`)**:
   - `config.enabledFeatures`: boolean feature flags (with `procedureExperience: true` defaulted when creating manually).
   - `procedures`: array of `{ name, group, required }`.
   - `catalog`: array of `{ kind, name, value, required, period }` across `posting`, `academic`, `case_category`, `competency_level`, and `leave_type`.
2. **Applying an approved template (`apply-department-template.ts`, developer-only)**:
   - Schema and logic live in [`department-template.ts`](../artifacts/api-server/src/lib/department-template.ts) (`departmentTemplateSchema`, `applyDepartmentTemplate`), with tracked templates under `artifacts/api-server/scripts/department-templates/` (for example [`radiology.json`](../artifacts/api-server/scripts/department-templates/radiology.json)).
   - Templates can supply `features`, `catalog` (`posting`, `academic`, `case_category`, `clinical_work_category`, `clinical_work_subtype` with `parentValue`, `competency_level`, and `organ_system_option`), and `postingSchedule` (`trainingYear`, `posting`, `months`).
   - **Both dry-run and `--apply` are developer-only commands** (never run by an agent under `AGENTS.md §6`): even the dry run requires `DATABASE_URL`, connects to the target database, and executes the feature-flag merge, catalog inserts, and posting-schedule writes inside `db.transaction` before rolling the transaction back (`DryRun` sentinel) and skipping `recomputeCatalogRequirements`.
   - The **developer** runs a **dry run** first (default without `--apply`) against the **real** department ID and exact name (without `--`, because [`apply-department-template.ts`](../artifacts/api-server/scripts/apply-department-template.ts) uses strict `parseArgs` with positionals disallowed):
     ```powershell
     pnpm --dir artifacts/api-server run db:apply-department-template --department-id <id> --expect-name "<Exact Name>" --template <name>
     ```
   - After verifying the dry-run diff, the **developer** re-runs the same command with `--apply` added (`--set flag=true|false` can also toggle individual flags). With `--apply`, `applyDepartmentTemplate` commits those writes, runs `recomputeCatalogRequirements`, and refuses mirror departments (`configSourceDepartmentId !== null`).
3. **Ongoing HOD configuration**:
   - The real HOD manages procedure targets, catalog options, custom case/procedure fields, logbook sections, wording labels, and feature toggles in [`DepartmentSettings.tsx`](../artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx) (`/api/admin/department/*`).

---

## 5. Copies vs. Mirrors

| Mechanism | Purpose | Source Scope | Sync Behavior |
|---|---|---|---|
| **Copy** (`copyFromDepartmentId`) | Seed a **new real department** from an existing real department at creation time | Any real department (`isTest = false`) across any college via `GET /api/superadmin/configuration-sources` | **One-time copy** of `department_configs`, `department_catalog`, `procedure_types`, `department_posting_schedule`, and `department_logbook_sections`. Accounts and clinical records are **never** copied. Future edits in either department are independent. |
| **Mirror** (`isTest = true`, `configSourceDepartmentId`) | Isolated **sandbox / QA department** paired with one real department | Same college only (`departments_mirror_same_college_fk` in [`users.ts`](../lib/db/src/schema/users.ts)), one hop only | **Live inheritance** via `resolveConfigDepartmentId` ([`department-config-source.ts`](../artifacts/api-server/src/lib/department-config-source.ts)). Mirrors read config, catalog, schedules, logbook sections, and wording from the real department and block mirrored settings writes with `403`. |

- **Backfilling missing mirrors**: If a real department in the selected college lacks a mirror, click **Provision test departments** in [`AdminPortal.tsx`](../artifacts/mockup-sandbox/src/components/AdminPortal.tsx) (`POST /api/superadmin/departments/backfill-test-departments`). Existing mirrors are skipped idempotently.

---

## 6. Test Roles, Mirror Roster, and Repair

### Auto-provisioned test accounts
When `provisionMirrorForRealDepartment` creates a mirror (`code = TEST-<realDepartmentId>`):
- It creates three approved `.test` accounts scoped to the mirror department (`safeName` derived from college code and real department ID):
  1. `Test HOD` (`role = "hod"`, canonical email `test.hod@<safeName>.test`)
  2. `Test Professor` (`role = "professor"`, canonical email `test.prof@<safeName>.test`)
  3. `Test Student` (`role = "student"`, canonical email `test.student@<safeName>.test`, plus a `students` row and, independently, up to 2 synthetic fixture case logs if the source department has `case_category` rows and up to 2 synthetic fixture procedure logs if it has `procedure_types` rows)
- The default password for those three canonical accounts equals the mirror department code (`mirror.code`, displayed in the **Test accounts** tab of [`AdminPortal.tsx`](../artifacts/mockup-sandbox/src/components/AdminPortal.tsx)). Never store or repeat literal credentials in documentation or logs.

### Managing and repairing the test roster
Open the department in [`AdminPortal.tsx`](../artifacts/mockup-sandbox/src/components/AdminPortal.tsx) and switch to the **Test accounts** tab:
- **Impersonate**: Click **Log in as** (`POST /api/superadmin/users/:id/impersonate`) on any approved test HOD, professor, or student to open an isolated impersonation session in a new tab.
- **Add custom test residents**: Click **+ Add** on the **Test accounts** tab (`POST /api/superadmin/departments/:mirrorId/students`) with either `Automatic` or `Approve by HOD` mode.
- **Deactivate / Reactivate / Delete**: Soft-deactivate (`POST /api/superadmin/users/:id/deactivate`), reactivate (`POST /api/superadmin/users/:id/reactivate`), or hard-delete (`DELETE /api/superadmin/users/:id/hard`) test professors and residents.
- **Restore missing test faculty**: If a loaded mirror roster has no user with `role = "professor"`, the panel displays **Restore test faculty** (`POST /api/superadmin/departments/:id/restore-test-faculty` -> `restoreMirrorTestFaculty`).
  - Repairs only the linked mirror in the same college.
  - Creates an approved default `"Test Professor"` only when zero faculty rows exist in that mirror.
  - Preserves existing active and deactivated (`rejected`) faculty (`already_present`), serializes against concurrent inserts via a `FOR UPDATE` lock on the mirror department row with a post-lock roster re-read and unique-email fallback (`onConflictDoNothing`), and fails closed with `409` on an email collision (with a non-professor account in the same test department or an account in another department) or ambiguous duplicate mirror links without modifying other departments.
- **Explicit credential reset**: Clicking **Reset default passwords** (`POST /api/superadmin/departments/:id/reset-test-credentials`) atomically resets passwords only for the exact canonical accounts (`test.hod@…`, `test.prof@…`, `test.student@…`) present in that mirror. Custom-email test accounts keep their own logins and passwords, and browsing/listing departments never triggers a reset.

---

## 7. Psychiatry Activation

1. **Migration prerequisite**: Before deploying code that queries Psychiatry tables, the developer applies `lib/db/migrations/0037_psychiatry_workspace.sql` via `pnpm --dir artifacts/api-server run db:migrate` (`src/migrate.ts`).
2. **Department activation**:
   - Sign in as the **real** department's HOD (mirrors are read-only for configuration).
   - Open **Department Settings → Psychiatry workspace → Enable Psychiatry workspace** ([`PsychiatrySettings.tsx`](../artifacts/mockup-sandbox/src/components/PsychiatrySettings.tsx)), which reads the current `psychiatryWorkspace` setting, verifies it matches the expected toggle value, and sends `PATCH /api/admin/department/config/settings/psychiatryWorkspace` with `{ value, expectedValue }`.
   - The setting is off by default; once enabled on the real department, the linked mirror inherits `enabledFeatures.psychiatryWorkspace = true` automatically via `resolveConfigDepartmentId`.

---

## 8. Separate Short-Case and Standalone Psychiatry Review Paths

When `psychiatryWorkspace` is enabled for a resident's department (non-demo session), [`App.tsx`](../artifacts/mockup-sandbox/src/App.tsx) routes `/`, `/dashboard`, and `/psychiatry/*` to [`PsychiatryWorkspace.tsx`](../artifacts/mockup-sandbox/src/components/pages/PsychiatryWorkspace.tsx), while standard deep links (`/cases`, `/procedures`, `/print`, etc.) remain reachable.

| Path | Storage & API | Review Queue & Reports |
|---|---|---|
| **Short cases** (`/psychiatry/short-cases`, [`PsychiatryShortCasesPage.tsx`](../artifacts/mockup-sandbox/src/components/pages/PsychiatryShortCasesPage.tsx)) | Uses the existing `case_logs` pipeline with WHO ICD-11 Chapter 06 diagnosis metadata (`psychiatryDiagnosisCode`, setting, tags, activities, referral) | Reviewed in the standard faculty **Sequential Review Queue** ([`ProfessorPortal.tsx`](../artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx)) and HOD **Review Queue** (`/review-queue`). Standard HOD aggregates ([`HODPortal.tsx`](../artifacts/mockup-sandbox/src/components/HODPortal.tsx)) and `/print` (`PrintableLogbook`) continue reading their existing sources. |
| **Standalone Psychiatry records** (`/psychiatry/*`, [`PsychiatryWorkspace.tsx`](../artifacts/mockup-sandbox/src/components/pages/PsychiatryWorkspace.tsx)) | Stored in `psychiatry_entries` and `psychiatry_attendees` via [`psychiatry.ts`](../artifacts/api-server/src/routes/psychiatry.ts) (`/api/psychiatry/entries`, `/api/psychiatry/reviews`, `/api/psychiatry/sessions/*`) | Reviewed by assigned faculty or department HOD on **`/psychiatry/reviews`** (`PsychiatryReviewPage` in [`PsychiatryWorkspace.tsx`](../artifacts/mockup-sandbox/src/components/pages/PsychiatryWorkspace.tsx)). Resident summary prints from **`/psychiatry/summary`**. |

---

## 9. Verification Checks and Real Test Commands

### Automated checks (in-process PGlite — `DATABASE_URL` unset)
Run from repository root (use `pnpm.cmd` on Windows PowerShell if needed):

```powershell
# Typecheck all workspace libraries and apps
pnpm run typecheck

# Full workspace build
pnpm run build

# Focused PGlite suites for provisioning, backfill, test-account management, mirror isolation, and Psychiatry
pnpm --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test --test-concurrency=1 --test-reporter=dot tests/auto-provision.test.ts tests/backfill-test-departments.test.ts tests/admin-test-account-management.test.ts tests/mirror-department.test.ts tests/psychiatry-workspace.test.ts

# Real SQL migrations against in-process PGlite
pnpm --dir artifacts/api-server exec tsx --tsconfig tests/tsconfig.json --test tests/migrations.test.ts

# Full API server test suite (uses PGlite; ensure DATABASE_URL is unset)
pnpm --dir artifacts/api-server test
```

### Role-by-role verification checklist (in the mirror test department)
1. **Superadmin check (`AdminPortal.tsx`)**:
   - Select the college and new department, open **Test accounts**, confirm browsing does not alter test passwords, verify **Restore test faculty** appears only when the mirror roster lacks a professor, and verify custom test accounts remain clearly separated from canonical default credentials.
2. **Resident check (`Test Student`)**:
   - Impersonate or sign in as `Test Student` in the mirror.
   - Verify department catalog/procedures/leave types inherit from the real department (`GET /api/departments/:departmentId/catalog`).
   - If Psychiatry is enabled, submit both a `/psychiatry/short-cases` entry (with WHO ICD-11 Chapter 06 diagnosis) and a standalone `/psychiatry/*` entry (for example OPD or long case), and confirm `/psychiatry/summary` renders.
3. **Professor check (`Test Professor`)**:
   - Impersonate or sign in as `Test Professor` in the mirror.
   - Verify assigned standard case/procedure logs (including Psychiatry short cases) appear in the standard Sequential Review Queue (`ProfessorPortal.tsx`), and standalone Psychiatry entries assigned to that professor appear under `/psychiatry/reviews`.
4. **HOD check (`Test HOD` vs. real HOD)**:
   - In the **real** department as the real HOD, confirm settings edits (including **Psychiatry workspace** toggle) save and propagate to the mirror.
   - In the **mirror** as `Test HOD`, confirm mirrored settings cannot be modified (`403`), mirror analytics show only mirror students, and mirror review actions stay isolated from the real department.
