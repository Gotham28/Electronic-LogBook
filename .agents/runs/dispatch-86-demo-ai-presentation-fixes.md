# Antigravity dispatch 86 — Demo auto-movie: fixes to dispatch 85

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-01,
working branch `feat/demo-auto-movie` (already checked out, from `main` at `fca9553`), with dispatches 83-85
uncommitted in the working tree. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

Skip the `AGENTS.md` §1 pull-before-task ritual; Claude Code already did it. Every fact you need is in this
prompt or in a file you can view.

## Read first
- `AGENTS.md` (repository root) — §5, §7, §9.
- `HANDOFF.md` (repository root) — `## Dispatch 85`. You append a section.
- The files named in Build below.

Claude Code ran `pnpm --filter @workspace/mockup-sandbox typecheck` and read the diff of dispatch 85. It found the problems below. Fix exactly these and **nothing else**. The most important rule for this dispatch: **real (non-demo) behaviour and DOM must stay exactly as they were on `main`.**

## Build
- [ ] **1. `artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx` — undo two collateral edits (not asked for).** Dispatch 85 only had to add three `data-tour` attributes here. It also (a) deleted the line `{/* Tab 1: Sequential Fast Review Queue */}` that sat directly above `<TabsContent value="review-queue" ...>` (about line 448), and (b) changed a class on the `<CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />` icon (about line 451) to `text-emerald-50`. Restore both exactly: put the comment line back above `<TabsContent value="review-queue" ...>` with the same indentation it had, and change `text-emerald-50` back to `text-emerald-500` on that icon. Keep the three anchors (`data-tour="review-queue"`, `"review-first-item"`, `"review-approve"`). Then view every other changed line in the file and confirm there is no other change besides those three attributes.
- [ ] **2. `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx` — wrong and extra anchors.** The brief asked for exactly one anchor in this file, `data-tour="hod-requirements"`, on the root element of the tab. Dispatch 85 instead put `data-tour="hod-config"` on the root `<div className="space-y-6">` (about line 209) and added a stray `data-tour="hod-save-config"` attribute line (about line 475). Rename the first to `data-tour="hod-requirements"`, and **delete** the `data-tour="hod-save-config"` line entirely (leaving the surrounding JSX exactly as it was before dispatch 85).
- [ ] **3. `artifacts/mockup-sandbox/src/components/HODPortal.tsx` — extra anchors.** The brief asked for exactly one anchor in this file, `data-tour="hod-overview"`. Dispatch 85 added two more. **Delete** the attribute `data-tour="hod-metrics"` (about line 442) and the attribute `data-tour="hod-student-list"` (about line 453), restoring those two lines to exactly what they were (`<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">` and `<Card>`). Keep `data-tour="hod-overview"` (about line 337). Change nothing else in this file (`AGENTS.md` §7: no fetch, error or fallback changes).
- [ ] **4. `artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx`.**
  - **(a) TypeScript error.** `tsc` reports `src/components/arogya/ArogyaPanel.tsx(52,19): error TS7030: Not all code paths return a value.` It is the `React.useEffect` that plays the demo "pop" sound and starts the 1200 ms reset timer for `characterState` (about lines 52-64): one branch returns a cleanup function and the other returns nothing. Make every path return: add `return undefined;` at the end of that effect, after the `if (!isTypingResponse) { ... }` block. Do not change anything else in that effect.
  - **(b) Non-demo DOM must be identical to `main`.** In the message list, dispatch 85 wrapped the tips `<ol>` and the text `<p>` in new `<div className="flex flex-col gap-2">` wrappers, which changes the real-mode DOM. Replace **both** new wrapper `<div className="flex flex-col gap-2">…</div>` elements with React fragments (`<>…</>`) so that, when `isDemoMode()` is false, the rendered DOM is exactly the original: the `<ol className="list-decimal space-y-2 pl-4">` alone for tips, and the `<p className={...}>` alone for text. The `Sample AI output` label stays, rendered only when `isDemoMode()`; give it the class `mt-2` in addition to the classes it has, so it keeps a gap from the text above it now that the flex wrapper is gone. The text of the label must stay exactly `Sample AI output`.
  - **(c) Clean up the typing timers.** In the demo-command effect (about lines 166-203) the `ask` command types the question with a chain of `setTimeout` calls that are never cancelled. Keep the pending timeout id(s) in a variable that the effect's cleanup function clears (`window.clearTimeout`), and make the typing loop stop if the effect has been cleaned up, so nothing runs after unmount or after the effect re-subscribes. Behaviour while mounted stays the same (about 30 ms per character, then submit through the same `handleAsk` path).
- [ ] **5. `artifacts/mockup-sandbox/src/components/QuarterlyAppraisalSection.tsx` — respect reduced motion.** The two calls `useDemoTypedValue(facultyRemarksTarget, isDemoMode())` and `useDemoTypedValue(remediationTarget, isDemoMode())` ignore the reduced-motion setting, so the draft would still animate for a visitor who asked for no motion. Import `useDemoMotionEnabled` from `@/components/DemoMotion`, call it once at the top level of the component (hooks must not be called conditionally): `const demoMotionEnabled = useDemoMotionEnabled();`, and pass `isDemoMode() && demoMotionEnabled` as the second argument in both calls. With motion off, `useDemoTypedValue` already returns the full text at once, and the existing effects that copy the revealed text into the form fields keep working. Change nothing else in this file.
- [ ] **6. `HANDOFF.md` — append** a `## Dispatch 86 (fixes to dispatch 85)` section with each fix, file and line numbers. Also add one line at the end of the existing `## Dispatch 85` section saying it was corrected by dispatch 86 (the Dispatch 85 anchor table listed `hod-config`, `hod-save-config`, `hod-metrics` and `hod-student-list`, which are removed or renamed here; the anchor table you leave behind must match the code). State plainly that you ran no commands (no shell access).

## Do NOT touch
- Everything not named in Build. In particular: `artifacts/mockup-sandbox/src/components/demo-movie/*`, `lib/demoData.ts`, `lib/demoSession.ts`, `lib/apiClient.ts`, `LoginPage.tsx`, `AppLayout.tsx`, `App.tsx`, `DemoBanner.tsx`, `Dashboard.tsx`, `CaseLogsPage.tsx`.
- Anything under `artifacts/api-server/`, `lib/db/`, any `.env*` file, `package.json` or a lockfile.
- No reformatting, renaming, comment edits or tidying of anything you were not told to change. Dispatch 85's collateral edit in `ProfessorPortal.tsx` is exactly the kind of change that must not happen again: edit only the lines named above.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- If a line number here does not match the file, say so in `HANDOFF.md` and use the real one.
- Any change that looks necessary outside the files named in Build.
- Any value you would otherwise guess or invent.

## Report
`HANDOFF.md` is the report (Build item 6). A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)`. Substitution recorded: `Claude Sonnet 4.6 (Thinking)` is quota-blocked (429 `RESOURCE_EXHAUSTED`, reset about 18h from 17:29 UTC on 2026-10-01), so per the standing rule this runs on Gemini directly. A lower-tier model writes this change, so `code-review` runs the full lens set and Claude Code re-verifies the diffs itself.
