# Antigravity dispatch 40 — Fix backfill-test-departments review findings

workdir: D:\Electronic-LogBook-main
branch: feature/mirror-test-department
model: Gemini 3.1 Pro (High)

allowed_paths:
- artifacts/mockup-sandbox/src/components/AdminPortal.tsx
- artifacts/api-server/src/routes/superadmin.ts

## Guard
This prompt is for "Electronic-LogBook" (Arogya platform, Pediatrics pilot), fixing two
review findings from the just-shipped "backfill mirror test departments for existing
departments" task (dispatch 39). If this is not that repo, stop, say which repo this is, and
wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead. A denied shell call is not something to work around and continue
past. Do the entire task using only file-reading and file-editing tools.

The branch `feature/mirror-test-department` is already checked out for you. Do not check
out, create, or switch any branch. Do not run `git` at all.

## Read first
- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx` — lines 12-24 (the import block
  from `@/lib/apiClient`) and line ~554 (`handleDeactivate`, which calls
  `deactivateAdminUser(userId)`).
- `artifacts/api-server/src/routes/superadmin.ts` — the `POST
  /departments/backfill-test-departments` route (search for that string), specifically its
  per-department `catch (error: any) { failed.push({ departmentId: dept.id, message:
  error.message || "Failed to provision mirror" }); }` block.

## Fix 1 — restore the missing import (build-breaking)
`AdminPortal.tsx`'s import block from `@/lib/apiClient` (lines 12-24) is missing
`deactivateAdminUser`, which was dropped when `impersonateAdminUser` and
`backfillTestDepartments` were added in an earlier dispatch. `handleDeactivate` still calls
`deactivateAdminUser(userId)` as a bare identifier (line ~554), which currently fails
TypeScript compilation with `TS2304: Cannot find name 'deactivateAdminUser'` — confirmed by
running `tsc -p tsconfig.json --noEmit` outside your sandbox. This breaks the "Deactivate"
button in both the Faculty and Residents tabs.

Add `deactivateAdminUser` back into the import list from `@/lib/apiClient`. It is still
exported, unchanged, from `apiClient.ts` — this is purely restoring the dropped import line,
nothing else in the import block changes.

## Fix 2 — stop leaking raw driver error text to the admin-facing response
In `superadmin.ts`'s `POST /departments/backfill-test-departments` route, the per-department
catch block currently does `message: error.message || "Failed to provision mirror"`. Since
`provisionMirrorForRealDepartment` inserts a department row with a deterministic `code`
(`TEST-${departmentId}`), a rare failure here (e.g. two concurrent backfill calls racing on
the same department, or a pre-existing row occupying that code) surfaces the raw Postgres
error text (e.g. `duplicate key value violates unique constraint "departments_code_unique"`)
directly into the JSON response the admin's browser receives and toasts.

Change this to a fixed, generic message string that does not include `error.message` —
e.g. `"Failed to provision test department"` — matching this file's existing convention of
never returning raw driver/error text to the client (see the route's own outer catch, which
already returns a generic `"Internal server error"` rather than `error.message`). Keep the
`departmentId` in the `failed` entry; only the `message` field changes.

Do not add any new logging beyond what already exists in this route — this fix only changes
what the two-line message string is built from, nothing else about the route's structure,
response shape, or control flow.

## Do NOT touch
- Anything in `AdminPortal.tsx` other than adding the one missing import identifier.
- Anything in `superadmin.ts` other than the one `message:` line inside the backfill route's
  per-department catch block.
- Any other file.
- `artifacts/api-server/tests/` — no test changes needed for this fix; the existing test
  `one department's provisioning failure does not prevent others from being provisioned`
  (`tests/backfill-test-departments.test.ts`) only asserts `typeof badFailure.message ===
  "string"`, which remains true with a generic string.
- Any shell command whatsoever, including `pnpm test`, `git`, or any other command.

## Hard stops — stop and report, do not decide
- Any schema change, migration, or database-connecting command.
- Anything that puts patient text or leave reasons near a log, error, or audit trail.
- Any secret, credential, or `.env` value.
- Any change beyond the two fixes named above.

## Report
Append a new section to `HANDOFF.md` at the repo root (keep everything above it):
- Confirm the import was restored, with file:line.
- Confirm the generic message replaces `error.message`, with file:line, quoting the exact new
  line.
- State you did not run `pnpm test` or `tsc` (sandbox constraint) — Claude Code verifies both
  after this dispatch returns.

Do not open a pull request. Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/mockup-sandbox/src/components/AdminPortal.tsx
- artifacts/api-server/src/routes/superadmin.ts