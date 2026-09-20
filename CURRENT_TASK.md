# Current Task

## Feature
Add a "Progress" tab to the faculty Logbook Inspector dialog, showing
interactive per-item bar charts (verified vs. pending vs. remaining, against
the department's own Training Catalog targets) for a student's case
categories, procedures, and academic activities, with click-through to the
existing entry tables. This is Task 2 of 2 (frontend); Task 1 (the backend
endpoint) is merged/on `main` as of this task — see
[PR #51](https://github.com/Gotham28/Electronic-LogBook/pull/51).

## Plan reference
No MASTER_PLAN.md exists for this project (AGENTS.md §14.7). Unplanned: direct
developer request (same request as Task 1). Full design plan on file at
`C:\Users\aravi\.claude\plans\right-now-the-facult-staged-papert.md`, approved
by the developer. STATUS.md does not exist in this repo.

## MASTER_PLAN.md update
- [ ] None — this project has no MASTER_PLAN.md; nothing to append.

## What Task 1 actually shipped (read this before anything else)
`GET /api/students/:studentId/progress` (added in
`artifacts/api-server/src/routes/student.ts`, PR #51) returns exactly:

```json
{
  "caseCategories": [{ "value": "string or null", "verified": 0, "pending": 0 }],
  "procedures": [
    {
      "group": "string", "name": "string", "verified": 0, "pending": 0,
      "byCompetency": [{ "level": "string", "verified": 0, "pending": 0 }]
    }
  ],
  "academics": [{ "value": "string", "verified": 0, "pending": 0 }]
}
```

No targets, no percentages — counts only. `value: null` in `caseCategories`
means logs predating a migration that added the category column; render it as
"Uncategorised". This is the exact, final response shape — do not assume a
different one.

## Files/areas in scope
- `artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx` — the Logbook
  Inspector `<Dialog>` (currently lines 611-748: `<Dialog
  open={!!selectedMentee}...>` through its closing `</DialogContent>`).

## What to build

### 1. Fetch the new endpoint
The existing effect that loads `menteeLogs` (around lines 142-160,
`fetchLogs` calling `apiGet(/api/students/${selectedMentee.id}/logs)`) already
runs whenever `selectedMentee` changes and sets `menteeLogsLoading`. Extend
this same effect (do not add a second effect or a second loading flag) to also
`apiGet(/api/students/${selectedMentee.id}/progress)` in parallel
(`Promise.all`), storing the result in a new `menteeProgress` state variable
declared next to `menteeLogs` (line 78). On fetch failure, the existing
`catch` already shows `toast.error("Failed to load student logs")` — extend
that message or add a second toast so a progress-fetch failure is not silent,
and make sure the Progress tab shows a visible error state (see Error and
empty states below), never a chart of zeros.

### 2. Join counts to targets client-side
`useDepartment()` (already imported, line 59) exposes `caseCategories[]`,
`procedures[]`, `academics[]`, each `{ id, name, value, required, period }`
(see `artifacts/mockup-sandbox/src/lib/department-context.tsx`). Join by
`value` for case categories and academics, and by `group`+`name` for
procedures. This is the same join
`artifacts/mockup-sandbox/src/components/pages/CaseLogsPage.tsx` already does
for the student-facing "Progress by category" section (around lines 270-305)
— read that block as the reference pattern for the join and the
already-established zero-target handling, colors, and "Show all N" toggle,
including its exact classes (`rounded-xl border`, `bg-emerald-50/60` when
done, `bg-teal-500`/`bg-emerald-500` bar fill, `text-slate-500` "Show all"
button).

A catalog item with `required === 0` is the codebase's existing convention
for "not tracked" — do not render a bar for it, matching
`completionPercent()` in `artifacts/api-server/src/lib/validation.ts`
(`values.filter(v => v[1] > 0)`) and the "Not configured"/"Not tracked" text
already used elsewhere in this same file (lines 464-471, 626-634) for the
overall-completion block. Do not invent a different zero-vs-not-tracked
convention.

`period: "month"` catalog rows are excluded from the department's rolled-up
totals server-side and no month-based logic exists anywhere in this app.
Render those rows' `required` targets as-is (a flat total, same as every
other item) — do not add pro-rating.

An item present in the progress response's `caseCategories`/`academics` but
absent from `useDepartment()`'s catalog (a logged category that was later
deleted from the Training Catalog) still has real verified/pending counts
that must not be dropped — render it as its own bar with no target line and a
"Not in current catalog" label, rather than hiding it. This is the same
principle as the endpoint's own `null`-category handling: real counts are
never discarded.

### 3. The charts
`recharts@^2.15.4` is installed. The shadcn wrapper
`artifacts/mockup-sandbox/src/components/ui/chart.tsx` exports exactly
`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartLegend`,
`ChartLegendContent`, `ChartStyle`, and the `ChartConfig` type — use these,
do not add a new charting dependency and do not hand-roll SVG bars.

Add "Progress" as the first `<TabsTrigger>` in the existing `<Tabs
defaultValue="case-logs">` (line 636), before "Clinical Case Logs", and change
`defaultValue` to `"progress"`. Widen `<DialogContent>` from
`sm:max-w-[700px]` (line 612) to roughly `sm:max-w-[900px]`; keep `max-h-[85vh]
overflow-y-auto`.

Three sections inside the new tab, one per log family (case categories,
procedures, academics):
- A horizontal bar chart (`<BarChart layout="vertical">`) — category and
  procedure names are long; horizontal bars stay readable and scale to many
  rows.
- Each bar is stacked: verified (solid) + pending (a lighter segment of the
  same hue) on a neutral track running to the target. The gap is remaining.
- A fully verified item (verified ≥ required) flips to emerald, matching
  `CaseLogsPage.tsx`'s existing convention.
- `ChartTooltipContent` shows verified / pending / remaining / target. For a
  procedure bar, also list the `byCompetency` split from the response.
- Procedures are grouped under their `group` heading.
- Lists longer than 8 collapse behind a "Show all N" toggle, matching
  `CaseLogsPage.tsx`'s exact pattern (lines 302-309).
- Above the three sections, three summary tiles (cases / procedures /
  academic), using the existing `.metric-value` / `.metric-label` utility
  classes from `artifacts/mockup-sandbox/src/index.css` (around lines
  241-248) — do not invent new utility classes.

Use the existing teal/emerald palette and `.layer-1`/`.layer-2`/`.layer-3`
elevation utilities already in `index.css`. No new colors. Confirm the chart
renders correctly in both light and dark — `ChartStyle` themes through CSS
variables already.

### 4. Click-through
Clicking a bar switches the dialog's active tab to the matching log tab
("Clinical Case Logs" / "Procedure Logs" / "Academic Activity") and filters
that tab's existing table to the clicked category/procedure/activity. Add a
visible "Filtered by X — clear" control above the filtered table.

**State the count mismatch, do not hide it.** For a `professor` caller, the
new `/progress` endpoint's counts are department-wide (see the comment in
`student.ts` above the route), but `menteeLogs` (from the existing `/logs`
endpoint) is still supervisor-scoped for a professor caller — a real,
intentional difference between the two endpoints. When the filtered table
shows fewer rows than the bar's count, render a line such as "Showing 3
entries you supervised, of 12 logged." For an `hod` caller the two always
match (neither endpoint scopes by supervisor for an HOD), so this line must
not appear for an HOD.

### 5. Error and empty states
- `/progress` fetch failure → a visible error state with a retry action,
  never a chart of zeros or an empty-looking chart with no explanation. This
  is the specific regression `AGENTS.md` §7 calls out by name for
  `HODPortal.tsx` — do not repeat it here.
- Student with no logs at all → use the `Empty` component
  (`@/components/ui/empty`, already used in
  `artifacts/mockup-sandbox/src/components/pages/AssessmentsPage.tsx`), not
  an empty chart frame.
- Department with no Training Catalog items configured for a family (e.g. no
  case categories at all) → say so in that section, do not render zero-target
  bars.

## Explicitly out of scope
- Any conferences data. `conferenceLogs` exists on the `/logs` response and
  `conferencesTable` exists in the schema, but it carries no `required`
  target anywhere and does not belong in a progress-bar view. Do not add a
  conferences section or tab.
- Any change to the "Evaluation Queue" or "Assessments" tabs, or to the
  mentee roster table (lines ~419-479) outside the dialog.
- Any backend change. `/:studentId/progress` and `/:studentId/logs` are
  final as shipped; read-only reference.
- Any change to `HODPortal.tsx`'s own summary cards or roster ring — this
  task only touches the shared `ProfessorPortal.tsx` component, which
  `HODPortal.tsx` already embeds three times via the existing `embedded`
  prop. The Progress tab will appear in the HOD view automatically through
  that embedding; no separate HOD-specific work is in scope.

## Do NOT touch
- `artifacts/api-server/**` — no backend changes at all in this task.
- `HODPortal.tsx`, `Dashboard.tsx`, `CaseLogsPage.tsx`,
  `ProcedureLogsPage.tsx`, `AcademicLogsPage.tsx` — read-only reference for
  patterns, no edits. (`CaseLogsPage.tsx`'s "Progress by category" block is
  the pattern to follow, not a file to modify.)
- Any file under `artifacts/mockup-sandbox/src/components/ui/` — use the
  existing primitives, do not modify them.
- Any dependency in `package.json` — `recharts` is already installed; add no
  new package.

## Execution route
- B — Claude Code loop
- Why: this is a significant UI addition (new tab, charts, click-through
  filtering, a cross-endpoint count-mismatch disclosure) with real judgment
  calls (zero-target handling, error/empty states, HOD-vs-professor
  behavior) — not mechanical enough for route C.

## Manual (developer does)
- [ ] Approve this CURRENT_TASK.md before dispatch.
- [ ] Review the diff.
- [ ] Visually verify the Progress tab (screenshots requested below) before
      merge — this task's own frontend typecheck cannot confirm the charts
      render correctly or that the color/spacing conventions were followed.
- [ ] Merge PR #51 (this lands as a second commit on it) when ready — never
      automated.

## Agent (does on its own, once scope is confirmed)
- [ ] Build the Progress tab exactly as specified above.
- [ ] Report the exact diff, and confirm no file outside
      `ProfessorPortal.tsx` was touched.

## Blocked on developer input
- None.

## Order
### Steps inside this task
1. Add the Progress tab, charts, join logic, click-through, and error/empty
   states to `ProfessorPortal.tsx`.
2. Report diff; hand off for review.

### Where this task sits
- Before this: Task 1 (backend endpoint), PR #51, reviewed and pushed to
  `feature/faculty-progress-breakdown`.
- This task's commit lands on the same branch/PR, as a second commit —
  matching how PR #49 was built (an earlier commit, then a reviewed follow-up
  commit on the same open PR).
- After this: nothing queued.

## Verification required before this is considered done
- [ ] Frontend typecheck (`pnpm --filter @workspace/mockup-sandbox run
      typecheck` — i.e. `tsc -p tsconfig.json --noEmit` in
      `artifacts/mockup-sandbox`) — no new errors.
- [ ] Diff read and confirmed: only `ProfessorPortal.tsx` touched; the
      Progress tab, join logic, click-through, and error/empty states all
      present as specified; no conferences reference added; no new
      dependency added.
- [ ] Screenshots captured (via the preview browser, once this session
      resumes after dispatch) of: the Progress tab as a professor, as an
      HOD (through `HODPortal.tsx`'s embedding), a click-through filtered
      list showing the count-mismatch line, the error state, and the empty
      state.

## Flags (AGENTS.md rule triggers)
- §9 One feature per task — confirmed; this is purely the frontend half of
  the feature Task 1 already scoped separately.
- §7 No fabricated data — explicitly instructed: no invented zero-target
  bars, no silently dropped uncatalogued items, no pro-rated month targets,
  visible error states only.
- No §3/§4/§6/§8/§10/§13 trigger — this task reads two existing endpoints and
  renders their data; it does not add or change any backend route, query, or
  ownership check. The count-mismatch disclosure (§4) is a UI honesty
  requirement, not a new authorization decision.

## Suggested review tier (set at scoping time)
- **Sonnet, medium effort.** UI-only, no route or query change, no §15.2
  Opus trigger. Ordinary feature work at Sonnet tier per §15.3.

## Suggested Antigravity model
- Claude Sonnet 4.6 (Thinking).

---

## Review findings to fix (dispatch 54)

`code-review` (Sonnet, medium effort, 8 finder angles, verified) found four
correctness bugs and one confirmed spec deviation. All five must be fixed
before this is accepted. Two lower-severity cleanup findings (duplicated
join logic, unmemoized O(n×m) joins) are **not** being fixed in this
dispatch — see "Reviewed, not being fixed" below.

### Must fix — correctness bugs

**1. `required === 0` catalog items silently drop a student's real logged
progress.** In all three join blocks (`caseBarItems` ~line 1077,
`procBarItems` ~line 1125, `acadBarItems` ~line 1178), an item with
`required === 0` is skipped by the catalog-ordered loop (correct — it's
"not tracked"), but the "uncatalogued items" fallback loop right after it
checks `alreadyIncluded`/`deptProcMap.has(...)` against the **full** catalog
array, not the `required > 0` subset. A progress item whose catalog entry
has `required === 0` therefore registers as "already included" and is
**never added by either loop** — its real verified/pending counts vanish
from the bars entirely, even though the three summary tiles above (built
straight from the raw `/progress` response) still count them, so the tiles
and the bar list visibly disagree.

**Fix:** in each of the three "uncatalogued items" fallback loops, check
`alreadyIncluded`/`has(...)` against a catalog list **filtered to
`required > 0`** (or equivalently, only compare against catalog entries
that were actually pushed as bars), not the unfiltered full catalog array.
An item with `required === 0` that has real logged progress must still
appear as an "uncatalogued" bar (no target line), exactly like an item
whose catalog entry was deleted entirely.

**2. Procedure click-through filter ignores `procedureGroup`.** The row
filter at (currently) lines 855 and 876 matches only
`log.procedureName === (logFilter as any).name`, dropping the `group`
check even though `LogFilter` already carries `group` and the
count-mismatch banner's `progressCount` correctly matches on both
`group` and `name`. The same procedure name can exist under two different
groups (confirmed: `admin.ts` filters by both `procedureName` AND
`procedureGroup` together elsewhere in this codebase).

**Fix:** add the `procedureGroup` check to both places the row filter is
applied (the `filteredCount` calculation and the actual table row filter),
matching the same two-field match the banner's `progressCount` already
uses.

**3. `Promise.all([/logs, /progress])` couples an unrelated failure.** If
`/progress` rejects while `/logs` succeeds (or vice versa), the shared
`catch` means **neither** `setMenteeLogs` nor `setMenteeProgress` runs —
the three previously-independent log tables (Clinical Case Logs, Procedure
Logs, Academic Activity) now go stale or blank on a `/progress`-only
failure, which they never depended on before this diff. The toast text
also misleadingly implies the logs themselves failed.

**Fix:** fetch `/logs` and `/progress` as two independent operations (e.g.
`Promise.allSettled`, or two separate `try`/`catch` blocks) so a failure in
one does not clear or block state that the other successfully loaded. Each
surface (`menteeLogs` vs. `menteeProgress`/`menteeProgressError`) should
reflect only its own fetch's outcome.

**4. Retry button has no staleness guard.** The original effect (~lines
112-151) uses a `mounted` flag, set false on cleanup, specifically so a
slow fetch can't write stale data after `selectedMentee` changes. The
Retry button's inline `onClick` (~lines 210-225) duplicates the same
`Promise.all` fetch but omits this guard entirely.

**Fix:** either have the Retry button call the same fetch function the
effect uses (so it inherits the same closure-scoped guard), or give the
Retry handler its own equivalent staleness check tied to the mentee whose
dialog was open when Retry was clicked.

### Must fix — spec deviation

**5. Replace the hand-rolled CSS `ProgressBar` with `recharts` via the
existing `chart.tsx` wrapper, as originally specified.** The delivered
code uses CSS `<div>` bars with a native `title`-attribute tooltip instead
of `ChartContainer`/`ChartTooltip`/`ChartTooltipContent` and
`<BarChart layout="vertical">`. This was self-flagged in `HANDOFF.md` as a
deviation, and confirmed by review as a genuine spec violation with a real
functional gap, not just a style shortcut: case-category and academic bars
currently have **no tooltip at all**, and the spec-required
verified/pending/remaining/target figures are not shown anywhere for any
bar type except partially inline in the row label. The developer's
original request specifically asked for "a very interactive bar graph kind
of way" that should "look and feel real nice" — this is a product
requirement, not a nice-to-have.

**Fix:** rebuild `ProgressBar` (and its three call sites) using
`ChartContainer` + `<BarChart layout="vertical">` (one bar chart per
section, each row = one catalog item, a stacked series for
verified/pending against the `required` domain) and `ChartTooltipContent`
showing verified / pending / remaining / target — plus the `byCompetency`
breakdown for procedure bars. Keep the existing "fully verified → emerald"
color convention and the "Show all N" collapse behavior exactly as they
are; only the bar-rendering mechanism changes. If a variable-row-count
`BarChart` genuinely cannot be made to work cleanly within the dialog's
layout, stop and report the specific rendering obstacle rather than
reverting to CSS divs again.

### Reviewed, not being fixed

- **Three near-identical ~130-line catalog-join blocks** (case/procedure/
  academic) with no shared helper — real duplication, already drifting
  slightly, but a refactor risks touching the same logic the four bug
  fixes above are landing in. Leave as three separate blocks for this
  dispatch; a future cleanup task can extract a shared
  `joinCatalogWithProgress()` helper.
- **O(n×m) nested-loop joins with no `useMemo`** — real inefficiency, not
  urgent at realistic catalog sizes (dozens of items, not thousands). Not
  worth the added risk of touching the same code twice in one dispatch.

## Files/areas in scope for dispatch 54
- `artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx` only — the
  five items above. Nothing else in this file beyond what each fix
  requires.

## Do NOT touch (dispatch 54)
- Everything already listed under `## Do NOT touch` above, unchanged.
- The two "Reviewed, not being fixed" items — do not refactor the join
  blocks into a shared helper, and do not add `useMemo` as a drive-by
  change in this dispatch.
- Any file outside `ProfessorPortal.tsx`.

## Verification required (dispatch 54)
- [ ] Diff read and confirmed: all five items fixed as specified, nothing
      else changed.
- [ ] Frontend typecheck — no new errors.
- [ ] Re-verify finding 1 by reading the fixed fallback-loop condition
      directly; re-verify finding 2 by reading the fixed filter predicate
      directly.
