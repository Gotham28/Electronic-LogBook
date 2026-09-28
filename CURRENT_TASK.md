# Current Task — Follow-ups: department settings, counts, a log line, admin margin; phone bottom bar

## Feature
Two follow-up tasks from the developer feedback round (PRs #84–#86), done in one session:

| Part | Branch | What |
|---|---|---|
| A. Four fixes (one task, developer's choice) | `claude/tender-noether-cd7xh9-followups` (base `b7d345e`) | Dermatology's hardcoded department ids → settings; deleted entries in completion counts; HOD email in a log line; admin portal laptop margin |
| B. Phone bottom navigation bar | `claude/tender-noether-cd7xh9-bottom-nav` (base: part A) | A bottom bar on phones for the main pages |

Both PRs target `main`. Merge #87 first (it carries parts 2 and 3 of the feedback round, which
never reached `main`: #85 and #86 merged into their stacked base branches), then A, then B.

## Plan reference
No MASTER_PLAN.md exists for this project (AGENTS.md §14.7). Unplanned: issues found while
working on #84–#86, and a mobile pattern the developer asked for.

## Developer decisions (recorded, not assumed)
- §14.1 overridden for this task: code written directly in this Claude Code cloud session.
- New branch names instead of reusing `claude/tender-noether-cd7xh9`: its PR merged, and
  restarting it from `main` would need a force-push, which §2 forbids.
- Dermatology's ids 15/25 are replaced by settings Dermatology already has on
  (`freeTextProcedures`, `freeTextPostingUnit`, `academicActivityExtras`) plus one new
  setting, `academicsFirstInNav`, for its sidebar order.
- §3 / §14.5, answered: whether faculty see every posting of a student (not only ones they
  supervise) now follows `freeTextPostingUnit`, the same rule Dermatology has today.
- §14.5, answered: completion counts leave out deleted case and procedure entries and count
  only the department's own students.
- §6 not overridden: the agent never connects to a database (tests use in-process PGlite).

## Review tier
Opus (§15.2): posting visibility is an ownership rule (§3), and the count queries read
clinical tables.

## Changes — part A
- Department settings (§5). Every `departmentId === 15 || 25` check is gone:
  - `student.ts` postings list, create and edit → `freeTextPostingUnit`: faculty see every
    posting; a posting needs no catalog ward or supervisor; without a supervisor it is
    verified and stays editable.
  - `student.ts` procedure create and edit → `freeTextProcedures`: typed-in procedure names.
  - `professor.ts` review queue detail line, and the faculty review card's procedure
    diagnosis/sex → `freeTextProcedures`. The review card's academic extras →
    `academicActivityExtras`.
  - `AppLayout.tsx` Dermatology sidebar order → new `academicsFirstInNav` setting.
    `scripts/seed-derm-config.ts` now sets it.
- Completion counts: the HOD roster (`admin.ts`), review queue (`professor.ts`) and analytics
  (`department.ts`) leave out deleted case and procedure entries. The roster and review
  queue now count only the department's students instead of every student.
- `department-provisioning.ts`: a failed HOD welcome email is logged with the department id,
  not the HOD's email address.
- `AdminPortal.tsx`: a laptop margin and max width, as in the other portals.
- Tests: `derm-posting-edit.test.ts` now uses the setting on an ordinary department and
  shows department id 15 without the setting follows the normal rules; new posting
  visibility and free-text procedure tests; new `completion-counts.test.ts`; a log line
  test in `auto-provision.test.ts`.

### Evidence (§11): GET /api/students/:id/postings, from `derm-posting-edit.test.ts`
- unauthenticated → 401
- faculty of another department → 403
- faculty, setting on → 200, including postings with no supervisor
- nonexistent student id → 403 (studentAccess answers 403 for any id outside the caller's
  scope, by design, so ids cannot be probed)
- without the setting, a professor sees only postings they supervise (asserted).

## Changes — part B (front end only)
- New `components/layout/MobileBottomNav.tsx`, rendered by `AppLayout.tsx`: under 640px, a
  bar with up to four of the role's main pages plus "More" (opens the full menu). Slots come
  from the sidebar's own list, so they follow department settings: Radiology students get
  Home / Clinical / Academics / Postings; Pediatrics students Home / Cases / Procedures /
  Academics; faculty Queue / Students / Assessments; HOD Home / Students / Reviews /
  Requirements. Hidden from 640px up and in print. Pages get bottom room on phones.
- Picking a page from the phone menu now closes the menu. Before, it stayed open over the
  page.
- Checked at 390px on 26 screens (no content past the screen edge), "More" opens the menu and
  a pick closes it; laptop screenshots are pixel-identical to part A.

## Manual (developer does)
- [ ] Before merging part A, confirm Dermatology's live config has `freeTextPostingUnit`,
      `freeTextProcedures` and `academicActivityExtras` on. `scripts/seed-derm-config.ts`
      sets them, so they are on if that script ran. Otherwise its residents lose free-text
      postings and procedures.
- [ ] Set `academicsFirstInNav` on for Dermatology, or its sidebar uses the standard order.
      Re-running `scripts/seed-derm-config.ts` sets it (it only adds rows and switches settings on). Or, by hand, against
      the live database:
      `UPDATE department_configs SET enabled_features = enabled_features || '{"academicsFirstInNav": true}'::jsonb WHERE department_id = 15;`
- [ ] Merge #87, then part A, then part B, by hand.
