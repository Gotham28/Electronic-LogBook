# Antigravity dispatch 54 — fix review findings on faculty progress tab

Dispatched directly via `agy_start_edit`, job id `f6b6366ab02d4a8589cd0317b46acdbd`,
model `Claude Sonnet 4.6 (Thinking)`, workdir `D:\Electronic-LogBook-main`, branch
`feature/faculty-progress-breakdown`. Follow-up to dispatch 53, fixing 4 correctness
findings and 1 confirmed spec deviation from the code-review pass (medium effort, 8
finder angles, all verified).

## Guard
This prompt is for the project at Electronic-LogBook, task file `CURRENT_TASK.md` at the
repo root, section `## Review findings to fix (dispatch 54)`, on branch
`feature/faculty-progress-breakdown`. If this is not that repo, stop, say which repo this
is, and wait.

## Sandbox constraint — READ THIS FIRST, BEFORE ANYTHING ELSE
Do NOT call `run_command`, or any shell tool, at all, for any reason — not even once, not
even a single read-only command like `git status` or `git log`, not even as your very first
action. There is no orientation step that requires a shell command here. Do not attempt to
"pull before every task" or run any git command — that ritual does not apply inside this
sandbox.

If you are tempted to run any shell command, don't — use file-reading tools instead. Do the
entire task using only file-reading and file-editing tools, starting with the "Read first"
list below.

## Read first
- `CURRENT_TASK.md` — specifically the `## Review findings to fix (dispatch 54)` section at
  the bottom, in full
- `artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx` — the whole "Training
  Progress" tab added in the previous dispatch: the fetch effect (~lines 112-225), the three
  catalog-join blocks (~lines 1065-1225), the `FilterBanner` and row-filter logic (~lines
  790-950), and the `ProgressBar` component (~lines 1394-1479)
- `artifacts/mockup-sandbox/src/components/ui/chart.tsx` — the shadcn recharts wrapper for
  fix item 5
- `artifacts/mockup-sandbox/src/components/pages/CaseLogsPage.tsx` — for the existing
  "fully verified → emerald" color convention and "Show all N" pattern to preserve

## Build
Follow the five numbered items under `## Review findings to fix (dispatch 54)` in
`CURRENT_TASK.md` exactly:
- [ ] 1. Fix the `required === 0` exclusion bug in all three catalog-join blocks (case
      categories, procedures, academics) so real logged progress is never dropped.
- [ ] 2. Add the `procedureGroup` check to the procedure click-through filter (both the
      `filteredCount` calculation and the table row filter).
- [ ] 3. Decouple the `/logs` and `/progress` fetches so a failure in one does not blank or
      stale state that the other successfully loaded.
- [ ] 4. Give the Retry button's inline fetch the same staleness guard the original effect
      uses.
- [ ] 5. Replace the hand-rolled CSS `ProgressBar` with `recharts` via `chart.tsx`
      (`ChartContainer`, `<BarChart layout="vertical">`, `ChartTooltipContent` showing
      verified/pending/remaining/target, plus the `byCompetency` breakdown for procedures),
      preserving the existing color convention and "Show all N" behavior.

## Do NOT touch
- The two "Reviewed, not being fixed" items in `CURRENT_TASK.md` — do not refactor the
  three join blocks into a shared helper, and do not add `useMemo` as a drive-by change.
- Any file other than `artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx`.
- Anything in this file beyond what the five fix items require — no unrelated refactoring.
- `package.json` — `recharts` is already installed, add no new dependency.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).

## Hard stops — stop and report, do not decide
- If item 5's `BarChart layout="vertical"` genuinely cannot be made to render correctly for
  a variable number of rows within the dialog's layout, stop and report the specific
  obstacle rather than reverting to CSS divs again.
- If any of the five items' current code does not match what `CURRENT_TASK.md` describes,
  stop and report the discrepancy rather than guessing.
- Any value you would otherwise guess or invent.

## Report
Update `HANDOFF.md` at the repo root (append a new top-level section, do not remove any
existing section):
- The exact diff for each of the five fixes
- Confirmation, read directly from the file, that each fix matches its specification
- Anything you could not complete and why (including anything blocked by the sandbox
  constraint)

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`. Do not run any test.

## Model
Claude Sonnet 4.6 (Thinking)
