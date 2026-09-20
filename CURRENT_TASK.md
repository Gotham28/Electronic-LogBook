# Current Task — Fix the mirror-test-department review findings

## Closed — 2026-09-21

Dispatch 56 implemented the `## Agent` bucket below. A four-lens `code-review` (Opus tier)
returned **reject**: one Critical finding (the new `isTest` hard-delete guard's own test
never called the real, shipped `deleteDepartmentCascade` function — it reimplemented the
guard's logic inline and asserted against its own copy) plus five Major and four Minor
findings. The developer chose to fix the Critical finding only, then open the PR; the rest
is deliberately deferred, not silently dropped.

- **Fixed and verified:** dispatch 57 exported `deleteDepartmentCascade` and rewrote the
  test to call it directly against an ordinary real department; dispatch 58 fixed a
  follow-on assertion bug in that same rewrite (Drizzle nests the CHECK-constraint error on
  `err.cause`, not `err.message`). `cd artifacts/api-server && pnpm test` — 136/136 passing,
  freshly run after both fixes.
- **PR:** opened from branch `fix/mirror-test-department-review-findings` against `main`
  (not `origin/main` at the time this branch was cut — see note below).
- **Deferred to a follow-up task, not fixed here** (documented in full in the PR
  description and in the review transcript this session ran):
  1. The 12-table delete/conflict-check list matches the old `checkTable` calls exactly
     (as asked), but that list itself is missing `certifications`, `conferences`, and
     `payments` — all three FK to students/users and can still trip the same 409/FK-error
     class this task was meant to close.
  2. The mirror-delete's user-side deletion isn't scoped to the mirror department (deletes
     by user-id membership anywhere) — not reachable today, undocumented, untested.
  3. `competencyLevel`/`facultyVerifiedLevel` fixture values are still hardcoded literals
     in `department-provisioning.ts`, unlike `category`/`procedureGroup`/`procedureName`.
  4. Fixture row count is now variable (0–2) instead of the fixed 2+2 the `## Follow-up
     after merge` check below expects, and the "skip and report" half of the original
     Agent item was only half-implemented (skip, no report).
  5. Four Minor findings (test 1 only spot-checks 6 of 12 tables; a few `HANDOFF.md`
     line-number/transaction-timing inaccuracies; `.agents/runs/` isn't gitignored;
     the new 403 handler's message field is inconsistent with the 409 handler's).
- **Branch note:** this branch was cut from this task's own commit, not from `origin/main`,
  because `main` had already moved on and modified the exact same three in-scope files
  (`superadmin.ts`, `department-provisioning.ts`, `AdminPortal.tsx`) for unrelated work.
  Rebasing risked a merge conflict Claude Code cannot resolve itself (that would be writing
  code). The PR may show merge conflicts against current `main` for the developer or a
  follow-up dispatch to resolve.

When scoping the follow-up task for the deferred items above, this file will be overwritten
— use the list above plus the PR description as the source, since this section will not
survive that overwrite.

## Plan reference

Unplanned. Remediation of findings from the `code-review` of commit `5545e26`
(branch `feature/admin-fixes-and-test-data`), which returned 3 Critical and 11 Major findings.
This repo has no MASTER_PLAN.md (§14.7).

## Route

**B** — Claude Code drives Antigravity, halts per §14.5, reviews at the end.

## Review tier

**Opus** — set here, at scoping time, per §15.1. §15.2 fires twice: the clinical tables (§3),
and ownership-adjacent deletion logic. Not to be lowered later (§15.4).

## Scope decision — recorded deviation

§9 is one feature per diff. These are three concerns and would normally be three tasks;
bundling was itself a Major finding against `5545e26`. The developer has explicitly chosen to
take them as **one task**. Recorded here so end-of-task review treats it as an accepted
deviation with sign-off rather than a repeat violation.

## Files/areas in scope

- `artifacts/api-server/src/routes/superadmin.ts`
- `artifacts/api-server/src/lib/department-provisioning.ts`
- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx`
- `artifacts/api-server/tests/`

## Do NOT touch

- Any migration or schema file; anything under `lib/db/`
- `.env`, in any form
- `artifacts/api-server/src/routes/auth.ts`
- `artifacts/api-server/src/routes/admin.ts`
- `HODPortal.tsx`, `AppLayout.tsx`
- `AdminPortal.tsx` lines 307 and 888 — both still correct for self-registered students
- Any shell command whatsoever
- Anything not named under `## Agent` below

## Agent

- [x] `superadmin.ts` — extend the `isMirror` branch of `deleteDepartmentCascade` (currently
      lines 294–297, deleting only `caseLogsTable`/`procedureLogsTable` by `studentId`) to
      delete from all 12 tables the conflict check counts at lines 273–284, matching the same
      student-side and user-side field sets the `checkTable` closure (lines 257–271) uses.
      Derive the delete list from that closure's call list so the two cannot diverge.
      `auditTable.performedById` is NOT NULL with an FK to `usersTable.id`, so audit rows must
      be deleted before the user delete at line 315.
- [x] `superadmin.ts` — add `eq(departmentsTable.isTest, true)` to the mirror lookup at lines
      341–342 and select `isTest` alongside `id`.
- [x] `superadmin.ts` — inside `deleteDepartmentCascade`, when `isMirror` is true, re-read the
      target department's `isTest` from `tx` and throw if false. Follow the existing inline
      pattern at `superadmin.ts:571,574` (the impersonation gate); do not invent a new one.
      (Fixed correctly in dispatch 56; its covering test was wrong and is what dispatches
      57/58 fixed — see `## Closed` above.)
- [x] `department-provisioning.ts` — the fixture inserts at lines 132–188 must draw
      `category` / `procedureGroup` / `procedureName` from the **source** department's own
      `department_catalog` and `procedure_types` rows, read inside the same transaction, via
      the `configSourceDepartmentId` link. No hardcoded taxonomy literals. If the source
      department has no catalog rows, skip the fixture inserts and report it — do not invent
      values. (Skip implemented; the "report it" half was not — see `## Closed` above.)
- [x] `department-provisioning.ts` — replace invented clinical wording and patient identifiers
      with text that cannot be mistaken for a real record (`TEST-` prefixed identifiers;
      diagnosis text that self-identifies as test data). Respect the NOT NULL sets in
      `lib/db/src/schema/logs.ts:6-56`. No schema change.
- [x] `AdminPortal.tsx` — rewrite line 866 ("**Approval stays with the HOD.** … this console
      never approves a resident directly"), which is false: `superadmin.ts:483` inserts
      `status: "approved"`. Make it agree with line 245.
- [x] `AdminPortal.tsx` — line 245 claims faculty bypass the payment gate; that gate
      (`auth.ts:173`) only ever applied to students. Tighten the wording.
- [x] `tests/` — add coverage: a mirror carrying rows in each of the 12 tables deletes cleanly
      via its real parent; a non-mirror department with clinical data still 409s and deletes
      nothing; fixture rows are created, land only in a mirror, and carry catalog-derived
      taxonomy; a department with `configSourceDepartmentId` set but `isTest = false` is
      refused rather than hard-deleted. (The last case's own test was the Critical finding;
      fixed in dispatches 57/58.)

## Manual

- Running the two SQL queries against the live database (see `## Blocked` below). No agent may
  connect to a database, including read-only (§6).

## Blocked on developer input

- [x] **CLEARED 2026-09-20.** `HANDOFF.md:23` claims a temporary script backfilled dummy data
      into existing test departments. That script is untracked and cannot have run through
      committed code (`department-provisioning.ts:82` returns `{created: false}` for existing
      mirrors). Developer ran the verification query against the live database: 14 `case_logs`
      rows returned, all in `is_test = true` mirror departments (ids 19–25), inserted in a
      single 3-second window at `2026-09-20 10:45:04`–`10:45:07`. The matching `procedure_logs`
      query returned 7 rows (ids 8–14), also all in `is_test = true` mirrors, same time window.
      **No fabricated clinical row sits in a real department.**

### Established fact — the script and the committed code are not equivalent

The `procedure_logs` result returned **only `ID-003` / Venipuncture — one row per mirror, no
`ID-004` / ABG Sampling anywhere**, though the query covered both. The committed code at
`department-provisioning.ts:162-188` inserts two procedure logs per mirror, and `case_logs`
correctly shows two per department. So the untracked backfill script wrote 2 case logs + 1
procedure log per mirror, where the repo's own code writes 2 + 2.

This is evidence, not inference: whatever ran against the database was not the committed code.
It does not change the fix, but it closes the question of whether the script could be treated
as equivalent to reviewed code. It also gives the post-merge re-provision step a concrete
check — see below.

## Follow-up after merge (developer action, not dispatchable)

- [ ] The 21 existing fixture rows (14 `case_logs` + 7 `procedure_logs`) are not changed by
      this task — the code fix only governs what is created next. After the fix lands, delete
      and re-provision the 7 mirror departments through the API to regenerate them with
      catalog-derived, clearly-synthetic content. This also exercises the delete-cascade fix on
      real data. No hand-written SQL.
- [ ] Verification for that step: each re-provisioned mirror should end up with **2 case logs
      and 2 procedure logs**. The current 2-and-1 split is the fingerprint of the untracked
      script; 2-and-2 confirms the committed code is what produced them.

## Verification required

Run by Claude Code after the dispatch returns — the dispatched agent is barred from shell
commands and must not attempt these.

1. `cd artifacts/api-server && pnpm test` — baseline 132/132 on `5545e26`, freshly confirmed.
   New tests raise the count; no existing test may regress.
2. `git diff` on every file claimed, and confirm the touched-file list matches
   `## Files/areas in scope` exactly. An undisclosed file was a Major finding last round.
3. The 12-table delete list matches the `checkTable` calls at `superadmin.ts:273-284` one for
   one — no table counted but not deleted.
4. No literal clinical taxonomy remains in `department-provisioning.ts`; no fixture string
   could pass as a real diagnosis.
5. `AdminPortal.tsx:245` and `:866` agree; `:307` and `:888` untouched.

## Flags — halt conditions most likely to fire (§14.5)

- Any schema change, migration, or backfill
- Any command connecting to a database
- Any change to ownership resolution beyond the `isTest` assertion named above
- Any value that would otherwise be guessed or invented — notably what to do when the source
  department has no catalog rows: skip and report, do not decide

## Suggested Antigravity model

`Claude Opus 4.6 (Thinking)` — per the Opus tier above.

## Order

1. Developer clears the `## Blocked` item.
2. Dispatch the `## Agent` bucket as one Antigravity prompt.
3. Claude Code runs `## Verification required`.
4. `code-review` — four lenses, seven-section report.
5. Developer decides.
6. `close-task` — commit, push, PR.
