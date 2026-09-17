# Handoff: Superadmin Resident Auto-Approve Fix

## Overview
This dispatch changes the superadmin-created resident flow to automatically approve students upon creation, avoiding the broken state where they are stuck pending due to missing payment records.

## Changes by File

### `artifacts/api-server/src/routes/superadmin.ts`
- Updated the `POST /departments/:id/students` route to insert the user row with `status: "approved"` instead of `"pending"`.
- Updated the success response message to `"Student account created and approved"`.
- Updated the inline comment above the route to explain that the student is immediately active.

### `artifacts/mockup-sandbox/src/components/AdminPortal.tsx`
- In `handleAddUser`, updated the toast message for student creation to `"Resident account created and approved"` to match the new backend behavior.

### `artifacts/api-server/tests/superadmin.test.ts`
- Renamed the test from `"admin can create student in any department (pending status)"` to `"admin can create student in any department (auto-approved)"`.
- Updated the test assertion to expect `assert.equal(user.status, "approved")` rather than `"pending"`.
- Updated the inline comment block describing the test.
