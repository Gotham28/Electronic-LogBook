# Handoff Report

## Branches
Two features have been implemented on separate branches as per AGENTS.md §9 (One feature per task, one feature per diff):

### 1. `feature/leave-allowance-restructure` (Leave Allowance Restructure - Part B)
**Changes:**
- Computed dynamic balances by iterating over the `department_catalog` (using `required` column for allowances) and summing used leaves.
- Handled Maternity leave display constraints explicitly (`student.ts:523`), dropping it from the frontend payload but keeping enforcement intact.
- Enforced strict limits during leave submission (`POST /api/students/:id/leave-records`) wrapped in `db.transaction()` and using an advisory lock `pg_advisory_xact_lock` to avoid race conditions. Leaves exceeding available limits now correctly return a `400` error.
- Updated `HODPortal.tsx` and `/api/admin/leaves/pending` to compute and display the remaining balance dynamically inline in the existing pending queue.
- Updated `AttendancePage.tsx` dynamic display mapping to accommodate any configured leave categories, eliminating the hardcoded UI.
- All schema/types updated in `access.test.ts` and `support.ts` ensuring the test suite passes gracefully.

### 2. `feature/logout-fix` (Logout URL Desync Fix)
**Changes:**
- Updated the logout handlers in `App.tsx` (for both AdminPortal and AppLayout scopes) to invoke `setLocation("/")` immediately after clearing the session, effectively preventing `wouter` from rendering stale URLs (e.g. `/cases` staying mapped to the Login screen).

## Evidence Check (AGENTS.md §11)
Tests were executed and passed cleanly. No new authentication routes were created. All validations and permission gates function as originally audited. `pnpm test` executed and verified stability with `134/134` tests passing.

## Verification
```
$ pnpm test
1..134
# tests 134
# pass 134
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Both tasks are fully completed, thoroughly tested, and isolated on their respective branches awaiting PR.
