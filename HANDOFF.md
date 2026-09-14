# Dispatch 12 — Admin dashboard frontend: fix Critical review findings

## What changed, per file, and why

- `artifacts/mockup-sandbox/src/App.tsx`
  - Added a new early-return branch for the admin case based on `currentUser?.role === "admin"`.
  - The admin case now directly renders `<AdminPortal onSignOut={...} />` along with `<Toaster position="top-right" richColors />` so that notifications still work outside `AppLayout`.
  - Built the `onSignOut` handler to match `AppLayout`'s existing logout behavior by calling `POST /api/auth/logout`, clearing the session, and updating the authentication state.
  - Removed "admin" from the `activeRole` derivation logic and removed the conditional rendering of `<AdminPortal />` inside `AppLayout`.
  - **Confirming explicitly:** Admin no longer renders through `DepartmentProvider` or `AppLayout` and is now a standalone route, which avoids the null department crash.

- `artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx`
  - Reverted `export type RoleType` to only include `"Student" | "Faculty" | "HOD"`.
  - Removed the `if (role === "Admin")` branch in `navigationForRole()`.
  - Reverted the header title ternary `activeRole === "Admin" ? "College Administration" : ...` back to `Department of {department.name}`.
  - Reverted the print header and eyebrow ternaries.
  - **Confirming explicitly:** `AppLayout.tsx`'s three admin-specific changes were fully reverted, and Admin code is completely isolated from this file.

- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx`
  - Added an `onSignOut?: () => void` prop to the `AdminPortal` component signature.
  - Rendered a "Sign out" button in the Topbar next to the "New department" button to allow admins to log out.
  - Created a `failedDepts` Set to track which department roster fetches actually failed during `fetchDepartments()`.
  - Updated the aggregate stats tiles (Faculty, Residents, and Pending) to show `*Partial data` when `hasFailedCounts` is true.
  - Updated the per-department rows in the list to display an explicit "Data unavailable" state with a warning icon/tooltip when that specific department's roster fetch failed, ensuring no silent `0` is shown on failure.

## Skipped

- None. All requested fixes were applied exactly as specified.

## Expanded beyond Build list

- None. Only the requested changes for fixing the two Critical bugs were made.
