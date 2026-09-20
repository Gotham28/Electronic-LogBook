# Antigravity dispatch 53 (retry) — faculty progress tab, frontend (Task 2 of 2)

## Guard
This prompt is for the project at Electronic-LogBook, task file `CURRENT_TASK.md` at the
repo root, on branch `feature/faculty-progress-breakdown`. If this is not that repo, stop,
say which repo this is, and wait.

## Sandbox constraint — READ THIS FIRST, BEFORE ANYTHING ELSE
This is a retry of a job that failed on its very first turn: it called
`git status && git log --oneline -5` as an orientation step, that call was denied by the
sandbox, and it gave up on the entire task without writing anything.

Do NOT call `run_command`, or any shell tool, at all, for any reason — not even once, not
even a single read-only command like `git status` or `git log`, not even as your very first
action. There is no orientation step that requires a shell command here. Do not attempt to
"pull before every task" or run any git command — that ritual does not apply inside this
sandbox and attempting it is exactly what caused the previous attempt to fail immediately.

If you are tempted to run any shell command, don't — use file-reading tools instead (view a
file, list a directory, search file contents) to get your bearings. A denied shell call is
not something to work around and continue past: this sandbox does not recover cleanly from
one, so avoid triggering the denial in the first place rather than handling it after the
fact. Do the entire task using only file-reading and file-editing tools, starting with the
"Read first" list below.

## Read first
- `CURRENT_TASK.md` — the confirmed scope, in full, especially the exact response shape
  under "What Task 1 actually shipped"
- `artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx` — the whole file, especially
  the Logbook Inspector `<Dialog>` (around lines 611-748) and the `menteeLogs` fetch effect
  (around lines 142-160)
- `artifacts/mockup-sandbox/src/components/pages/CaseLogsPage.tsx` — the "Progress by
  category" block (around lines 270-309) as the reference pattern for the join, zero-target
  handling, colors, and "Show all N" toggle
- `artifacts/mockup-sandbox/src/lib/department-context.tsx` — `useDepartment()`'s shape
- `artifacts/mockup-sandbox/src/components/ui/chart.tsx` — the shadcn recharts wrapper to use
- `artifacts/api-server/src/lib/validation.ts` — `completionPercent()`, for the
  zero-vs-not-tracked convention already established elsewhere in this app

## Build
Follow `## What to build` in `CURRENT_TASK.md` exactly, its five numbered sections:
- [ ] 1. Fetch `/api/students/:studentId/progress` alongside the existing `/logs` fetch, in
      the same effect, same loading flag.
- [ ] 2. Join counts to targets client-side via `useDepartment()`, following
      `CaseLogsPage.tsx`'s pattern exactly (zero-target handling, uncatalogued-item handling,
      month-period handling — all specified in `CURRENT_TASK.md`, do not deviate).
- [ ] 3. Build the three chart sections (case categories, procedures with competency
      breakdown, academics) using the existing `chart.tsx` wrapper and `recharts`, as a new
      "Progress" tab that is the first tab and the new `defaultValue`.
- [ ] 4. Click-through from a bar to the matching log tab, filtered, with the count-mismatch
      disclosure line for a professor caller (never for an HOD).
- [ ] 5. Error and empty states as specified — no chart of zeros on fetch failure.

## Do NOT touch
- `artifacts/api-server/**` — no backend changes.
- `HODPortal.tsx`, `Dashboard.tsx`, `CaseLogsPage.tsx`, `ProcedureLogsPage.tsx`,
  `AcademicLogsPage.tsx` — read-only reference, no edits.
- Any file under `artifacts/mockup-sandbox/src/components/ui/`.
- `package.json` — no new dependency. `recharts` is already installed.
- Any conferences-related data or UI.
- The "Evaluation Queue" or "Assessments" tabs, or the mentee roster table outside the
  dialog.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).
- Anything not named under Build above.

## Hard stops — stop and report, do not decide
- Any value you would otherwise guess or invent — including a fabricated zero-target bar, a
  dropped uncatalogued item, or a pro-rated month target. All three are explicitly forbidden
  in `CURRENT_TASK.md`.
- If the `/progress` response shape, the `menteeLogs` fetch effect, or `useDepartment()`'s
  shape do not match what `CURRENT_TASK.md` describes, stop and report the discrepancy
  rather than guessing which version is correct.
- Any change to a route or query touching case_logs, procedure_logs, academic_logs, or any
  other clinical table — this is a frontend-only task.

## Report
Write `HANDOFF.md` at the repo root (append a new top-level section, do not remove the
existing sections from dispatches 51/52):
- What changed, per file, and why
- The exact diff
- Anything you skipped, and why (including any step you could not do because it would have
  required a shell command)
- Anything you expanded beyond the Build list, and why
- Confirmation, read directly from the file, that no file outside `ProfessorPortal.tsx` was
  touched, no new dependency was added, and no conferences reference exists anywhere in the
  diff

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`. Do not run any test.

## Model
Claude Sonnet 4.6 (Thinking)

## Files you may touch
- artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx
- HANDOFF.md