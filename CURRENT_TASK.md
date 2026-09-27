# Current Task — Radiology logbook, session auto-renew, Pediatrics thesis split

## Feature
Three developer requests, delivered on one branch (`claude/admiring-mayer-k2jev1`) at the developer's explicit choice:
1. Radiology logbook: no Case Logs / Procedure Logs; a new "Clinical Works" log (category, HOD-defined sub-type, date, age, sex, case number, faculty review); Radiology academic activities; a read-only three-year posting schedule.
2. Test accounts opened with the admin Impersonate button no longer expire after 20 minutes while in use (auto-renew, 8-hour cap; normal sessions 7-day cap).
3. Pediatrics shows Thesis and Certifications as separate pages (existing `splitThesisAndCertifications` flag).

## Plan reference
No MASTER_PLAN.md exists for this project (AGENTS.md §14.7). Unplanned: direct developer request for the Radiology onboarding plus two follow-ups.

## Developer decisions that override AGENTS.md (recorded, not assumed)
- §14.1: code written directly in a Claude Code cloud session, not dispatched to Antigravity (no Antigravity available there).
- §9: one branch/PR for all three items. Commits are split per item for review.
- §14.5 halt raised mid-task: `academic_logs.faculty_grade` was read by the code but created by no migration. Developer approved adding `0017_academic_faculty_grade.sql` (ADD COLUMN IF NOT EXISTS).

## Review tier
Opus (§15.2): new clinical table, ownership checks, migrations 0017–0020, auth changes.

## Commits
- `b145d10` feat(auth): renew active sessions instead of forcing re-login
- `00ea388` fix(db): add missing academic_logs.faculty_grade migration
- `c033b82` feat(clinical-works): add Clinical Works log behind a department flag
- `d2a4ab7` feat(postings): show a department's year-wise posting schedule
- `f8d8ef5` feat(radiology): Clinical Works UI, hide flags and a department template script
- `ae52d12` fix(web): polish found while testing the Radiology flow in a browser

## Manual (developer does)
- [ ] Review the diff (evidence for §11 is in `tests/clinical-works.test.ts` diagnostics).
- [ ] Merge when ready — never automated.
- [ ] Back up, then apply migrations 0017–0020 with `pnpm db:migrate` (agent never connects to a database, §6).
- [ ] Dry run, then apply, the Radiology template:
      `pnpm --filter @workspace/api-server db:apply-department-template --department-id <radiology id> --expect-name "<exact name>" --template radiology` then add `--apply`.
- [ ] Same for Pediatrics: `--department-id <peds id> --expect-name "<exact name>" --set splitThesisAndCertifications=true` then `--apply`.
- [ ] Radiology HOD adds sub-types in Department Settings → Training catalog → "Clinical work sub-type".

## Blocked on developer input
- None.
