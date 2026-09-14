# Antigravity dispatch 11 — Admin dashboard frontend: fix payload mismatches

## Guard
This prompt is for the project at `Electronic-LogBook` (Arogya Electronic LogBook), task file
`CURRENT_TASK.md` at the repo root. If this is not that repo, stop, say which repo this is,
and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Context
The previous dispatch built `AdminPortal.tsx` and wired it up, and it typechecks and builds
cleanly. But its request payloads were never checked against the actual backend Zod schemas
in `artifacts/api-server/src/routes/superadmin.ts`, and four of the five write actions on
this page do not match what the backend requires — every one of them will fail with a 400 as
currently written. This dispatch fixes exactly those mismatches. It is not a re-scope; do not
change anything else about the page's layout, visual design, or behavior beyond what is
listed below.

## Read first
- `artifacts/api-server/src/routes/superadmin.ts` — the actual backend request/response
  contracts. Read every Zod schema in this file (`createDepartmentBody` line 57,
  `replaceHodBody` line 93, `createFacultyBody` line 191, `createStudentBody` line 235) and
  match your payloads to them exactly. All four are `.strict()` — an extra or missing field
  is a 400, not a warning.
- `artifacts/api-server/src/lib/validation.ts` — `passwordSchema`, `nameSchema`, `emailSchema`
  definitions, so any new password/text inputs you add follow the same validation the backend
  already enforces (so a valid-looking form input isn't rejected server-side anyway).
- `artifacts/mockup-sandbox/src/lib/apiClient.ts` — the current (incorrect) request shapes.
- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx` — the current forms and handlers.

## Build

### 1. Fix "Create department + HOD"
- `apiClient.ts`'s `createAdminDepartment` currently POSTs `{name, code, hodFullName,
  hodEmail}` flat. The backend's `createDepartmentBody` (superadmin.ts:57) requires:
  `{ setup: { name, code, description?, hod: { fullName, email } }, hodPassword }`.
- Add an "HOD initial password" input to the New Department form in `AdminPortal.tsx`
  (`newDeptForm` state and its JSX block), following `passwordSchema`'s rules.
- Update `createAdminDepartment`'s signature/body construction in `apiClient.ts` to build and
  send the nested shape above, with the new password field as `hodPassword`.

### 2. Fix "Replace HOD"
- The backend's `replaceHodBody` (superadmin.ts:93) requires `{ incomingUserId: number }` —
  not an email. The current code sends `{ email }`, which will always 400.
- `DepartmentDetail` in `AdminPortal.tsx` already holds the department's `roster` (fetched via
  `getAdminDepartmentRoster`). When the "Confirm swap" form is submitted, resolve the typed
  email against that already-loaded roster — find the entry where `email` matches
  (case-insensitive) and `role === "professor"` and `status === "approved"`. If no match is
  found, show an inline error (e.g. "No approved faculty in this department matches that
  email") and do not call the API. If a match is found, call `replaceAdminHod` with that
  entry's `id` as `incomingUserId`.
- Update `replaceAdminHod`'s signature in `apiClient.ts` to take a numeric `incomingUserId`
  and send `{ incomingUserId }` as the body — not an email string.

### 3. Fix "Add faculty"
- The backend's `createFacultyBody` (superadmin.ts:191) requires `fullName`, `email`, AND
  `password`. The current Add-user form only collects `fullName` and `email`.
- Add a password input to the Add-user form, shown for both faculty and resident (both
  backend schemas require it), following `passwordSchema`'s rules.
- Update `createAdminFaculty` in `apiClient.ts` and its call site to include `password`.

### 4. Fix "Add resident"
- The backend's `createStudentBody` (superadmin.ts:235) requires `fullName`, `email`,
  `password`, `registrationNumber`, `batch`, `dateOfJoining` (a `YYYY-MM-DD` string), and
  `kuhsId` — six fields total, not two.
- Extend the Add-user form: when `addFormType === "resident"`, show additional inputs for
  `registrationNumber`, `batch`, `dateOfJoining` (a date input, submitted as `YYYY-MM-DD`),
  and `kuhsId`, alongside the shared `fullName`/`email`/`password` fields. These extra fields
  must not appear when adding faculty.
- Update `createAdminStudent` in `apiClient.ts` and its call site to send all six fields
  matching `createStudentBody` exactly.

### 5. Fix department/tile counts always showing 0
- `GET /api/superadmin/departments` (superadmin.ts:25) does not return `facultyCount`,
  `residentCount`, or `pendingCount` — it only returns `{id, name, code, description, hod}`.
  Do NOT modify the backend to add these fields; this is a frontend-only task.
- `AdminPortal.tsx` currently reads `d.facultyCount || 0` etc., which means these values are
  always 0 — not because there's no data, but because the field was never populated. Remove
  this fallback-masking pattern (per `AGENTS.md` §7 — a fallback number that looks like a real
  answer is exactly what that rule forbids).
- Compute these counts on the frontend instead: after fetching the department list, fetch
  each department's roster (`getAdminDepartmentRoster`) and derive counts using the same
  definitions `DepartmentDetail` already uses — faculty = `role === "professor" || role ===
  "hod"`, residents = `role === "student"`, pending = residents with `status === "pending"`.
  While these per-department roster fetches are still in flight, show a loading state for the
  affected tiles/counts (e.g. a skeleton or "—"), not a bare `0` that looks like a real value.

## Do NOT touch
- `artifacts/api-server/**` — the entire backend. No route or schema changes, even though
  fixing item 5 might seem easier with a backend change. It is not in scope.
- `HODPortal.tsx`, `ProfessorPortal.tsx`, `DepartmentSettings.tsx`, `Dashboard.tsx`,
  `LoginPage.tsx` — do not touch.
- `.env` / `.env.example`.
- Anything about `AdminPortal.tsx`'s layout, visual design, or behavior not named in the
  Build section above — this is a targeted fix, not a redesign.
- Any shell command whatsoever.

## Hard stops — stop and report, do not decide
- Any change to `artifacts/api-server/**`.
- Any place the frontend could send `studentsTable.id` instead of `usersTable.id`, or vice
  versa, in any of these fixes.
- Any value you would otherwise guess or invent — if a backend schema requires a field whose
  exact validation rule is unclear from `lib/validation.ts`, report it rather than guessing.

## Report
Overwrite `HANDOFF.md` at the repo root (title it "Dispatch 11 — Admin dashboard frontend:
fix payload mismatches", not a prior dispatch's number):
- What changed, per file, and why — for each of the 5 fixes, confirm the exact payload shape
  now sent matches the backend schema field-for-field.
- Anything you skipped, and why (including anything blocked by the sandbox constraint).
- Anything you expanded beyond this Build list, and why.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.
