# Handoff: Fix infinite refetch loop in AppLayout's student notification effect

## Changes Made
- Fixed the dependency array of the student notification `useEffect` in `artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx` (lines 206-263).
- **Before:** `}, [activeRole, currentUser]);`
- **After:** `}, [activeRole, currentUser?.studentProfileId]);`

## Verification
- Confirmed that `getCurrentUser()` creates a new object reference on every call, leading to an infinite loop when used in a dependency array.
- The modified `useEffect` body only relies on `currentUser.studentProfileId` (e.g., at line 207, 212, 213, 221, 245), so depending on `currentUser?.studentProfileId` is correct and stable.
- The adjacent effect at line 195 already correctly uses `[activeRole, currentUser?.studentProfileId]` (line 203) and was left untouched.
- The lower adjacent effect at line 266 already correctly uses `[activeRole, currentUser?.id]` (line 310) and was left untouched.
- **I confirm that no other files were touched.** `ProfessorPortal.tsx` and all other files were left untouched. Only `AppLayout.tsx` and `HANDOFF.md` were created/modified. No shell commands were run.
