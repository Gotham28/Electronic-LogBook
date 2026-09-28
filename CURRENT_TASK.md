# Current Task — Developer feedback round: wording, HOD setup, mobile (10 items)

## Feature
Ten items of developer feedback from using the live site, split into three stacked
branches so each diff holds one theme (§9):

| Part | Branch | Items |
|---|---|---|
| 1. Wording and targets | `claude/tender-noether-cd7xh9` (base `main` at `c526992`) | 1, 2, 7 (+ hardcoded "101") |
| 2. HOD setup and progress | `claude/tender-noether-cd7xh9-hod-setup` (base: part 1) | 6, 8, 9 (+ conference-level IDs) |
| 3. Mobile layout | `claude/tender-noether-cd7xh9-mobile` (base: part 2) | 3, 4, 5, 10 |

The items, as given:
1. "Clinical works" → "Clinical work".
2. Student dashboard says "Case discussions"; it should say academic activities.
3. Recent entries on the student dashboard cannot be swiped on a phone.
4. A long posting name ("Conventional X-ray…") runs out of its box; fix everywhere.
5. The whole system is not tuned for phones (font size, spacing).
6. Student progress shows case categories and procedures for Radiology; it should show
   clinical work and academic activities, and a new department must not hit this again.
7. HOD requirements says "Not tracked" for academic activities; explain and change it.
8. Clinical work needs HOD-set minimums (0 = optional), like case and procedure targets.
9. HOD requirements: "Add new log option" first, existing ones under "Existing log options".
10. "View logbook" is cramped on a phone.

## Plan reference
No MASTER_PLAN.md exists for this project (AGENTS.md §14.7). Unplanned: feedback from the
developer's own use of the Radiology pilot on a phone.

## Developer decisions (recorded, not assumed)
- §14.1 overridden for this task: code written directly in this Claude Code cloud session.
- §9: three branches by theme, as above (developer chose "3 PRs by theme").
- Item 8: per-category minimums only, using the existing `department_catalog.required`
  column. No schema change, no migration (§6 not triggered).
- Items 3, 5, 10: wide tables become stacked cards on phones; laptop layout unchanged.
- §14.5 halt, answered: the server may add read-only clinical work counts to
  `/progress`, the HOD roster and completion % ("Counts + completion %"). Ownership checks
  on those routes are not changed.
- Item 10 covers both the faculty/HOD "View Logbook" pop-up and the student print page.
- The dashboard's hardcoded "combined target is 101" (§5, §7) is replaced by the
  department's real procedure total, in part 1.
- The HOD form's hardcoded department IDs 15/25 for "Conference Level" (§5) are replaced
  by the department's `conferenceLevels` setting, in part 2.
- §6 not overridden: the agent never connects to a database (tests use in-process PGlite).

## Review tier
Part 1: Sonnet (§15.2). Part 2: Opus (§15.2): new queries read `clinical_work_logs`, a
clinical table (§3). Part 3: Sonnet.

## Changes — part 1
- Item 1: user-facing "Clinical works" → "Clinical work" (sidebar, tabs, page title, empty
  states, print section, HOD page, two API error messages, `/dashboard` category name).
- Item 2: dashboard card "Case discussions" → "Academic activities" (also the `/dashboard`
  API category name and the login page preview). "Keep logging your cases and procedures"
  and the empty-state text no longer name cases and procedures.
- Item 7: "Not tracked" meant the department total was empty. `applyDepartmentTemplate`
  (used to set up Radiology) and `provisionDepartment` inserted targets without summing
  them, so the total stayed empty. Both now recompute the totals. The HOD page shows
  "No minimum set yet" with a one-line explanation when a total is empty or 0; the
  faculty badge "Not tracked" reads "No targets set".
- Dashboard "Procedure shortfall" card: shows the department's real total, hidden when none.
- Tests: `department-template.test.ts` (totals set on apply, untouched on dry run),
  `auto-provision.test.ts` (procedure total set on provisioning).

## Manual (developer does)
- [ ] Review and merge each branch in order (1, then 2, then 3), by hand.
- [ ] Radiology's saved academic total stays empty until the HOD saves any target (or the
      template is re-applied with the new code). No command is needed otherwise.
