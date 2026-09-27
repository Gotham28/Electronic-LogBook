# Current Task — Full code review and bug fixes

## Feature
Review the whole codebase (API server, web app, database schema and migrations,
scripts and tooling), find bugs, and fix them. Branch: `claude/modest-newton-by533o`,
started from `main` at `d9e53fd`.

## Plan reference
No MASTER_PLAN.md exists for this project (AGENTS.md §14.7). Unplanned: direct
developer request for a full review with fixes.

## Developer decisions that override AGENTS.md (recorded, not assumed)
Asked at the start of the session; the developer chose each of these.
- §14.1: code written directly in a Claude Code cloud session, not dispatched to
  Antigravity (no Antigravity available there).
- §9: one branch for all fixes, one commit per bug so each can be reviewed or
  reverted on its own.
- §14.5: a bug in an ownership check or a clinical-table route is fixed, not halted
  on — but flagged in the commit and in this file, and proved with the four §11
  cases in a test.
- §6 is not overridden: no schema change was needed; the agent never connected to a
  database (tests use in-process PGlite only).
- §14.2 is not overridden: no pull request until the developer decides.

## Review tier
Opus (§15.2): the review covers ownership resolution, the clinical tables and the
two ID systems.

## Commits
Each commit message says what was wrong, what changed, and how it was proved.
FLAGGED = touches a §14.5 area (clinical tables / what a user may edit or delete).
- `35be5e1` fix(security): posting edit route no longer returns error text and stack traces
- `2362349` fix(logging): ids and status codes only at four sites that logged whole errors
- `11b66d3` fix(security): escape user-supplied values in HTML emails
- `14eda41` fix(leave): count leave allowances in the year the leave starts
- `6a8c1ba` fix(counts): deleted case/procedure logs left out of dashboard and analytics (SEC-18)
- `cea0b51` fix(analytics): approved residents only in HOD analytics (SEC-22)
- `95a9735` fix(delete): conferences, awards, certifications in delete cascades — FLAGGED
- `2222ad3` fix(postings): Dermatology residents can edit auto-verified postings; reviewed ones locked — FLAGGED
- `294c3cb` fix(admin): procedure group names no longer rejected as "Invalid record ID"
- `b2ccec1` fix(certifications): 404, not 500, for a malformed certification id
- `d2ed5f5` test(migrations): legacy-adoption test brought up to date with 0008 and 0011
- `c863282` fix(web): faculty "logs pending your review" notification now appears
- `655f5f8` fix(web): error, not "none found", when a resident's records fail to load (§7)
- `a53b4ee` fix(review-queue): case logs no longer titled "null — …"
- `d2ba8e2` chore(security): delete phase0 scripts (hardcoded password) and drop.mjs (SEC-13)
- `8e5ad2b` chore(tooling): post-merge hook no longer calls `db push`

## Manual (developer does)
- [ ] Review each commit, especially the two FLAGGED ones.
- [ ] Check production for an account `aravind@elogbook.com` (created by the deleted
      phase0 scripts with password `password123`, if they were ever run there). If it
      exists, deactivate or delete it. The agent may not connect to check (§6).
- [ ] Review and merge the PR by hand — never automated. (Developer asked for the PR to
      be opened after the review.)

## Developer decisions after the review
- PR: open one PR for the branch (not merged by the agent).
- §5 Dermatology ids: switch to feature flags, as a separate task, once the developer has
  confirmed the live Dermatology config has `freeTextProcedures` and `freeTextPostingUnit`
  set. Not done in this branch.
- Test-department logins (`test.hod@<department>.test`, password `TEST-<id>`): kept as is,
  by the developer's choice.
- No separate review-report page.

## Blocked on developer input
- §5: Dermatology behaviour is keyed on department ids 15 and 25 in
  `artifacts/api-server/src/routes/student.ts` (5 places), `routes/professor.ts:178`,
  `mockup-sandbox/src/components/ProfessorPortal.tsx` (2 places) and
  `components/layout/AppLayout.tsx:136`. Waiting on the developer to confirm the flags on
  the live Dermatology config (read-only check, run by the developer, never the agent).
- Professor hard delete removes residents' records the professor supervised (logs,
  postings, conferences…), as the original hard-delete spec asked. Worth re-confirming.
