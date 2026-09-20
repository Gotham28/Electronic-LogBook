# Antigravity dispatch 55 — finish the recharts ProgressSection component (continuation of 54, item 5)

## Guard
This prompt is for the project at Electronic-LogBook, task file `CURRENT_TASK.md` at the
repo root, on branch `feature/faculty-progress-breakdown`. If this is not that repo, stop,
say which repo this is, and wait.

## Context — this is a continuation, the file is currently broken
Dispatch 54 was fixing 5 items in `artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx`
and ran out of quota partway through item 5. Verified against the current file:
- Items 1-4 (the four correctness bug fixes) are ALL already correctly applied. Do not
  touch them, do not re-verify them, they are done.
- Item 5 (replace hand-rolled CSS bars with recharts) is INCOMPLETE: the imports for
  `ChartContainer`/`ChartTooltip`/`ChartTooltipContent`/`BarChart`/`Bar`/`XAxis`/`YAxis`/
  `Cell`/`Tooltip` were added, and a new component called `ProgressSection` is referenced
  at three call sites (inside `ProgressTabContent`, in the Case Categories, Procedures, and
  Academic Activities sections) — but `ProgressSection` was never actually defined anywhere
  in the file. This is why the file currently fails typecheck with
  `Cannot find name 'ProgressSection'`. The old CSS-based `ProgressBar` function still
  exists (further down in the file) but is now unused dead code (nothing calls it anymore).

## Sandbox constraint — READ THIS FIRST, BEFORE ANYTHING ELSE
Do NOT call `run_command`, or any shell tool, at all, for any reason — not even once, not
even a single read-only command like `git status` or `git log`. There is no orientation step
that requires a shell command here. Use file-reading tools only.

## Read first
- `artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx` — read the whole file. Pay
  close attention to:
  - The `CaseBarItem`, `ProcBarItem`, `AcadBarItem` type definitions (each has
    `key: string`, `label: string`, `verified: number`, `pending: number`,
    `required: number | null`, `inCatalog: boolean`, `done: boolean`; `ProcBarItem` also has
    `group: string` and `byCompetency: { level: string; verified: number; pending: number }[]`)
  - The three `<ProgressSection items={...} onItemClick={(item) => onBarClick({...})} />`
    call sites — these define the exact props `ProgressSection` must accept:
    `items` (an array of `CaseBarItem[]` / `ProcBarItem[]` / `AcadBarItem[]` — the component
    needs to work for all three, so type it generically or as a union) and
    `onItemClick: (item) => void`
  - The now-unused `ProgressBar` function (CSS-div version) — read it for the exact color
    convention to preserve: `done ? "#10b981" : "#0d9488"` (emerald-500/teal-600) for
    verified, `done ? "#6ee7b7" : "#99f6e4"` (emerald-300/teal-200) for pending; a fully
    verified item (`done && required !== null`) gets `border-emerald-200 bg-emerald-50/60`
  - `artifacts/mockup-sandbox/src/components/ui/chart.tsx` — the `ChartContainer`,
    `ChartTooltip`, `ChartTooltipContent`, `ChartConfig` exports already imported
- `artifacts/mockup-sandbox/src/components/pages/CaseLogsPage.tsx` — for the "fully
  verified → emerald" convention and the "Show all N" collapse pattern already used
  elsewhere (both already preserved correctly by items 1-4's surrounding code, just listed
  here for style reference)

## Build
- [ ] Define `ProgressSection`, a new component in this same file, that renders one
      `recharts` `<BarChart layout="vertical">` containing one horizontal bar per item in
      its `items` prop. Each bar is stacked: a verified segment (solid teal/emerald,
      matching the color convention above) plus a pending segment (the lighter shade),
      running to `item.required` when not null, or to `item.verified + item.pending` when
      `item.required` is null (an uncatalogued item — render it with no target line/domain
      marker, matching what the old `ProgressBar`'s `trackTotal` fallback did). The Y axis
      shows `item.label`. Wrap it in `ChartContainer` with an appropriate `ChartConfig`
      mapping verified/pending to their colors. Use `ChartTooltipContent` (or a custom
      tooltip via `ChartTooltip`'s `content` prop) to show verified / pending / remaining
      (`required !== null ? Math.max(required - verified - pending, 0) : null`) / target
      (`item.required`) for every bar — and additionally the `byCompetency` breakdown when
      the item is a `ProcBarItem` (has a `byCompetency` array). Clicking a bar calls
      `onItemClick(item)`. A fully-verified item (`item.done && item.required !== null`)
      should visually read as complete (e.g. the verified segment in emerald rather than
      teal, matching the old component's convention).
- [ ] Remove the now-dead `ProgressBar` function entirely, once `ProgressSection` replaces
      its role at all three call sites.
- [ ] Confirm the file typechecks: no more `Cannot find name 'ProgressSection'`, no orphaned
      references to the removed `ProgressBar`.

## Do NOT touch
- Items 1-4's code (the fetch effect, the Retry handler, the `procedureGroup` filter checks,
  the `required > 0` catalog-join fix) — already correct, do not modify.
- Any file other than `artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx`.
- `package.json` — `recharts` is already installed and already imported in this file.
- Any shell command whatsoever.
- Anything beyond defining `ProgressSection` and removing the dead `ProgressBar`.

## Hard stops — stop and report, do not decide
- If `<BarChart layout="vertical">` genuinely cannot render correctly for a variable number
  of rows within this dialog's layout (height clipping, unreadable at many rows), stop and
  report the specific rendering obstacle rather than silently reverting to CSS divs.
- Any value you would otherwise guess or invent.

## Report
Update `HANDOFF.md` at the repo root (append a new top-level section, do not remove any
existing section):
- The exact diff (the new `ProgressSection` definition, removal of `ProgressBar`)
- Confirmation the file now typechecks cleanly (read the relevant lines back to prove no
  dangling references remain)

Do not open a pull request. Do not run `git commit` or `git push`. Do not run any test.

## Model
Gemini 3.1 Pro (High)

## Files you may touch
- artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx
- HANDOFF.md