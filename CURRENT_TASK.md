# Current Task — Fix the mirror-test-department review findings

## Feature
Make the entire "Department requirements" card in DepartmentSettings.tsx view-only for the HOD — remove the remaining editable fields (Program duration, Casual leave allowance, Academic leave allowance) and the "Save requirements" form, alongside the three fields PR #49 already made read-only.

## Plan reference
No MASTER_PLAN.md exists for this project (AGENTS.md §14.7). Unplanned: direct developer follow-up on the still-open PR #49. STATUS.md: does not exist in this repo.

## MASTER_PLAN.md update
- [ ] None — this project has no MASTER_PLAN.md; nothing to append.

## Files/areas in scope
- `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx` — merge `computedFields` (line 11-15) and `editableFields` (line 17-21) into a single read-only field list; remove the `<form>`/`onSubmit`/"Save requirements" `<Button>` (lines 208-209, 215) and the now-unused `config`/`setConfig` state (line 93); render all six fields using the existing read-only `<p>` display pattern (currently lines 210-211).

## Explicitly out of scope
- The backend route `POST /api/admin/department/config` (`artifacts/api-server/src/routes/admin.ts`) — stays exactly as is. The developer explicitly said "not sure" where/whether these three fields should be editable elsewhere later (e.g. a future superadmin screen); that's deferred to its own task. Removing or changing the backend capability is not part of this task.
- Any other card in this file (Add procedure type, Training Catalog) — untouched.
- The three already-computed fields' logic (`requiredCases`/`requiredProcedures`/`requiredAcademic`) — from PR #49, unaffected by this change beyond being merged into the same rendering list.

## Do NOT touch
- `artifacts/api-server/src/routes/admin.ts`, `validation.ts`, `department-requirements.ts` — no backend changes at all in this task.
- Any other component or file.

## Execution route
- B — Claude Code loop
- Why: this is a UI component change removing user-facing functionality (a save/edit path) entirely; verifying nothing is left broken (orphaned imports, unused state, a submit button with nothing to submit) benefits from a reviewed diff rather than just a diff + exit code.

## Manual (developer does)
- [ ] Approve this CURRENT_TASK.md before dispatch.
- [ ] Review the diff.
- [ ] Merge PR #49 (which this will be added to) when ready — never automated.

## Agent (does on its own, once scope is confirmed)
- [ ] Merge the two field-label arrays into one; remove the form/submit button and the now-dead `config` state; render all six fields read-only.
- [ ] Confirm no unused imports/state remain (e.g. `apiPost` may still be used elsewhere in this file for other forms — check before removing the import).
- [ ] Report the exact diff.

## Blocked on developer input
- None.

## Order
### Steps inside this task
1. Merge field lists, remove form/state, render all six read-only.
2. Report diff; hand off for review.

### Where this task sits
- Before this: PR #49 (already committed on this same branch, unmerged).
- After this: nothing queued. Will be added as a second commit to the same branch/PR rather than a new PR.

## Verification required before this is considered done
- [ ] Frontend typecheck (`tsc -p tsconfig.json --noEmit` in `artifacts/mockup-sandbox`) — no new errors, no unused-import/unused-variable errors.
- [ ] Diff read and confirmed: no `<form>`/`<Input>`/submit button remains anywhere in the "Department requirements" card; all six fields render via the same read-only pattern; no other card in the file is touched.

## Flags (AGENTS.md rule triggers)
- §9 One feature per task — confirmed; backend/superadmin-edit-path question explicitly deferred, not bundled in.
- No §3/§4/§6/§7/§8/§10/§13 trigger — pure frontend UI simplification, no data-fabrication risk (removing an edit path, not adding a fallback value).

## Suggested review tier (set at scoping time)
- Sonnet 5, low-to-medium effort — small UI simplification, no Opus trigger.

## Suggested Antigravity model
- Claude Sonnet 4.6 (Thinking) — per standing routing preference for this repo.
