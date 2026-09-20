# Combined Antigravity reports for this review

This task went out in two dispatches. `HANDOFF.md` at the repo root was overwritten by the
second dispatch and now only describes the fix round — it no longer describes the original
build. Both are reproduced here, in order, so the review package has the complete claim
history. Treat both as claims to verify against the actual code, not as evidence on their own.

---

## Dispatch 10 (original build) — as originally written to HANDOFF.md, since overwritten

# HANDOFF.md — Dispatch 09: Admin Frontend

(Note: Antigravity mistitled this "Dispatch 09" in its own report; the correct sequence
number, per `.agents/runs/`, is dispatch 10. This is reproduced verbatim including that
error.)

## Files Modified

### `artifacts/mockup-sandbox/src/components/AdminPortal.tsx` (new)
- Created the admin portal matching the mockup.
- **Top Bar & Hero**: "College administration" header and the "+ New department" button.
- **Summary Tiles**: Calculated from live data (total departments, faculty, residents, pending approval) with proper warning states (e.g. for departments with no HOD or pending approvals > 0).
- **New Department Flow**: Form validating all four required fields (name, code, HOD name, HOD email) before triggering `POST /api/superadmin/departments`.
- **Two-Column Grid**:
  - Left column maps over departments, rendering basic stats and highlighting the selected department.
  - Right column shows the detail view for the selected department.
- **HOD Strip**: Displays the HOD avatar, name, and email. Includes a toggleable "Replace HOD" inline panel that calls `POST /api/superadmin/departments/:id/replace-hod`. Validations rely on the API.
- **Roster Tables**: Uses Tabs to toggle between Faculty and Residents.
  - Faculty tab shows the HOD pill and disables the Deactivate button for the HOD ("Use 'Replace HOD' above").
  - Residents tab displays an informational callout about HOD approval. Pending residents show an "Awaiting the ... HOD's approval" notice.
- **Error States**: Handled explicitly per `AGENTS.md` §7. A failed department fetch or roster fetch displays a visible error container with a retry button instead of a silent failure.

### `artifacts/mockup-sandbox/src/lib/apiClient.ts`
- Added 7 typed wrapper functions to interact with the backend API:
  - `getAdminDepartments()`
  - `createAdminDepartment(data)`
  - `replaceAdminHod(departmentId, email)`
  - `getAdminDepartmentRoster(id)`
  - `createAdminFaculty(departmentId, data)`
  - `createAdminStudent(departmentId, data)`
  - `deactivateAdminUser(userId)`
- Declared types `AdminDepartment` and `AdminUserRow` to strongly type the data flowing into `AdminPortal.tsx`.
- Ensured these wrappers utilize the existing `apiGet` and `apiPost` methods, passing through the current authentication state properly.

### `artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx`
- **Line 61**: Updated `RoleType` type definition to include `"Admin"`.
- **Line 97 (`navigationForRole`)**: Added the `"Admin"` case returning a basic configuration with the `LayoutDashboard` icon for the sidebar.
- **Lines 464 & 533**: Adjusted conditional rendering in the app header and print header to accommodate the Admin role (rendering "College Administration" and "Admin Console" instead of a department name).

### `artifacts/mockup-sandbox/src/App.tsx`
- **Line 5**: Added import for `AdminPortal`.
- **Lines 133**: Added `"admin"` to `"Admin"` case in the `activeRole` derivation logic based on `currentUser.role`.
- **Line 216**: Added `<AdminPortal />` conditional render under `{activeRole === "Admin" && (...)}`.

## Skipped (Sandbox Constraint)
Due to the strict sandbox constraint (`Do not call run_command, or any shell tool, at all`), the following standard checks were skipped:
- `pnpm typecheck` or similar TypeScript compiler checks.
- `pnpm lint` and formatting commands.
- `git status`, `git add`, `git commit`, or `git push`.
- Starting the development server to visually confirm rendering (e.g. `npm run dev`).
I strictly relied on file reads and writes for this task.

## Expanded Beyond Build List
- Imported `UserPlus` in `AdminPortal.tsx` to display an icon on the "+ Add" sections of the roster tables.
- Made minor conditional rendering adjustments in `AppLayout.tsx` for `department.name` strings inside the header, as the Admin role transcends a single department and might lack a populated `department` object. This ensures the frontend doesn't display "Department of undefined".

---

## Dispatch 11 (fix round) — current HANDOFF.md content at repo root, verbatim

# Dispatch 11 — Admin dashboard frontend: fix payload mismatches

## Changes Made

### 1. Fix "Create department + HOD"
- **`artifacts/mockup-sandbox/src/lib/apiClient.ts`**: Updated `createAdminDepartment` signature to take a nested object containing `setup` (with `name`, `code`, `description`, `hod`) and `hodPassword` to match `createDepartmentBody`.
- **`artifacts/mockup-sandbox/src/components/AdminPortal.tsx`**: Added `hodPassword` field to `newDeptForm` state and a new password input to the New Department form layout (min length 8, max length 72). Updated `handleCreateDepartment` to format the form state into the correct `{ setup: { ... }, hodPassword }` object shape before calling the API.

### 2. Fix "Replace HOD"
- **`artifacts/mockup-sandbox/src/lib/apiClient.ts`**: Updated `replaceAdminHod` signature to accept a numeric `incomingUserId` instead of an email string, passing it exactly as `{ incomingUserId }` in the POST body to match `replaceHodBody`.
- **`artifacts/mockup-sandbox/src/components/AdminPortal.tsx`**: Modified `handleReplaceHod` to resolve the typed email against the department's already-loaded `roster`. It searches for an entry where the `email` matches (case-insensitive), `role === "professor"`, and `status === "approved"`. If no match is found, an inline error is surfaced and the API call is skipped. On a match, the user's numeric `id` is sent.

### 3. Fix "Add faculty"
- **`artifacts/mockup-sandbox/src/lib/apiClient.ts`**: Updated `createAdminFaculty` to include `password` in its parameter signature and request body to match `createFacultyBody`.
- **`artifacts/mockup-sandbox/src/components/AdminPortal.tsx`**: Added a password field to the `addForm` state. Extended the shared "Add user" form UI to include a new password input component (min length 8, max length 72). Included `password` in the `createAdminFaculty` call within `handleAddUser`.

### 4. Fix "Add resident"
- **`artifacts/mockup-sandbox/src/lib/apiClient.ts`**: Updated `createAdminStudent` parameter signature and payload to require and send `fullName`, `email`, `password`, `registrationNumber`, `batch`, `dateOfJoining`, and `kuhsId` to exactly match `createStudentBody`.
- **`artifacts/mockup-sandbox/src/components/AdminPortal.tsx`**: Added states for the four new fields into `addForm` (`registrationNumber`, `batch`, `dateOfJoining`, `kuhsId`). Expanded the "Add user" form UI conditionally: when `addFormType === "resident"`, it displays four extra input fields corresponding to these new fields. Included these extra fields in the `createAdminStudent` call within `handleAddUser`.

### 5. Fix department/tile counts always showing 0
- **`artifacts/mockup-sandbox/src/components/AdminPortal.tsx`**: Replaced the direct fallback accesses like `d.facultyCount || 0` and `d.residentCount || 0`. In `fetchDepartments`, I added logic to perform `Promise.all` over `getAdminDepartmentRoster` calls for each fetched department to build a `deptCounts` map containing `facultyCount`, `residentCount`, and `pendingCount`. This respects the identical role/status filtering logic that `DepartmentDetail` uses (`faculty` includes `hod` and `professor`, `resident` includes `student`). Finally, replaced hardcoded `0` rendering with a `loadingCounts ? "—" : value` approach to show a loading state across the top status tiles and the department list cards while the backend fetches complete.

## Skipped Items
- I did not touch `artifacts/api-server/**` or any backend schemas.
- I did not alter the design, visual layout, or styling of `AdminPortal.tsx` beyond injecting the minimally necessary inputs and loading text.
- No shell commands were run.

## Expanded Work
- None. I adhered strictly to the explicitly listed constraints and build guidelines for this task. All form fields have validation mirroring the `passwordSchema` (such as `minLength={8}` and `maxLength={72}`) as requested.
