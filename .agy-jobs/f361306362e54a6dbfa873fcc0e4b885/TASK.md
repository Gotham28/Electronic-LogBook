# Antigravity dispatch 89 — Demo auto-movie: fixes to the engine (stall, legal-disclaimer deadlock, end card clicks)

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-01,
working branch `feat/demo-auto-movie` (already checked out, from `main` at `fca9553`), with dispatches 83-88
uncommitted in the working tree. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

**To read any file, use only the file viewer tool (`view_file`).** `type`, `cat`, `more`, `Get-Content`, `Select-String`
and `grep` are shell commands and will be denied. Open every file with the viewer.

Skip the `AGENTS.md` §1 pull-before-task ritual; Claude Code already did it. Every fact you need is in this
prompt or in a file you can view.

## Read first
- `AGENTS.md` (repository root) — §5, §7, §9.
- `CURRENT_TASK.md` (repository root) — `## Feature`, `## Execution-session findings and developer rulings`, `## Progress log`, `## Scene script`.
- `HANDOFF.md` (repository root) — `## Dispatch 87`. You append a section.
- `artifacts/mockup-sandbox/src/components/demo-movie/DemoMovie.tsx`, `scenes.ts`, `MovieControls.tsx`, `EndCard.tsx` — the whole of each (you rewrite or edit all four).
- `artifacts/mockup-sandbox/src/lib/demoSession.ts` and `components/layout/AppLayout.tsx` (how `<DemoMovie />` is mounted: props `activeRole`, `navigate={setLocation}`, `blocked={disclaimerBlocksNotice}`, `arogyaOpen`, `setArogyaOpen`) — read-only.

## What Claude Code found by running the movie in a real browser (Chrome, 1440×900)
These are facts, not guesses. Each one is a defect you must fix.
1. **Stall (blocking).** The movie freezes. After a scene's `navigate(route)` the engine does `return; // wait for next render`, but the effect's dependency list does not change when the location changes, so the effect never runs again and the scene never starts. Reloading on `/cases` and playing: scene 1 sat at `scene-01-dashboard` for 22 s with no spotlight and no progress (it should last 7 s). Earlier it advanced from scene 1 to scene 2 only by luck (some dependency changed), then froze in scene 2. The same pattern exists for the role switch (`startDemoSession` then `return`). **The effect must never depend on being re-run by something else.**
2. **Deadlock with the legal disclaimer (blocking).** On a Resident's first visit the legal disclaimer is open. While `blocked` is true the engine does not advance, but the component still renders its full-screen input-blocking layer, caption and controls, and that layer sits above the disclaimer's "I Accept and Agree" button (`document.elementFromPoint` on the button returns the blocking layer; a normal Playwright click on the button timed out). The visitor can never accept, so the movie never starts. **While `blocked` is true the movie must render nothing at all.**
3. **End card is not clickable.** The movie root is `pointer-events-none` and `EndCard`'s backdrop does not set `pointer-events-auto`, so the Replay and Explore buttons inherit `pointer-events: none`.
4. **Scene 2's dialog close is wrong.** The `openThenCloseDialog` action schedules a `setTimeout` of 3 s that is never cancelled and fires at 9 s, after the scene (8 s) has ended. The case form that the `clickTarget` beat opens is never closed in time. And the spotlight stays on the Log button behind the form's own backdrop.
5. **`openArogya` toggles.** The beat that clicks `arogya-launcher` opens the panel if it is closed but closes it if it is open (the launcher is a toggle).
6. **Controls are unreadable on light pages.** The chapter labels are white text with only a drop shadow, directly over the app header.

## Build
- [ ] **1. Rewrite the control flow of `DemoMovie.tsx`** (keep the props, the `createPortal` into `document.body`, the test hooks `data-testid="demo-movie-root"`, `data-phase`, `data-scene-id`, the spotlight look, the caption, `MovieControls`, `EndCard`, `DEMO_MOVIE_CHANGED_EVENT` / `DEMO_MOVIE_REPLAY_EVENT` handling, and the Skip behaviour).
  - **(a) Render nothing while blocked.** After every hook has run, `if (!isActive || blocked) return null;` (hooks must not be skipped by an early return placed above them). While blocked, no layer, caption, spotlight or control exists in the DOM.
  - **(b) Inputs through refs.** Keep `activeRole`, `navigate`, `setArogyaOpen` and `reduceMotion` in refs that are updated on every render (`const activeRoleRef = React.useRef(activeRole); activeRoleRef.current = activeRole;` and so on). The per-scene effect reads them from the refs.
  - **(c) One scene effect with a single poll loop.** Its dependency list is exactly `[isActive, blocked, phase, sceneIndex, runToken]` (`runToken` is a number state that the replay event increments, so a replay restarts even when the movie is already at scene 0). No function, role, location or motion value is in the list. Inside it, one `setInterval` of about 50 ms (cleared in the cleanup) drives an explicit stage machine, so the effect never needs to be re-run to make progress:
    1. `role` stage: if `activeRoleRef.current` is not the role the scene needs (`student`→`Student`, `faculty`→`Faculty`, `hod`→`HOD`), call `setArogyaOpenRef.current(false)` and `startDemoSession(scene.role, { skipLoginSummary: true })` **once**, then wait in this stage until the ref matches, for at most 3000 ms; then continue regardless.
    2. `route` stage: if `window.location.pathname` is not the scene's route (treat `/dashboard` as equal to `/`), call `navigateRef.current(scene.route)` **once**, then wait until the pathname matches, for at most 3000 ms; then continue regardless.
    3. `target` stage: if the scene has a `target`, wait until `[data-tour="…"]` exists with a non-zero size, for at most 3500 ms; then continue regardless (the spotlight is simply skipped when the target is missing).
    4. `play` stage: record `clockStart` when this stage begins. Every tick: `elapsed = now - clockStart`; update the elapsed state at most about every 100 ms; run each beat exactly once when `elapsed >= beat.atMs` (track fired beats in a local `Set`); work out the current spotlight target (the last beat whose `atMs <= elapsed` and which has a `target` or `selector`, else the scene's `target`); measure the element's rectangle and call `setTargetRect` only when the rectangle changed by more than 0.5 px (so the component does not re-render 60 times a second for nothing); `scrollIntoView({ block: "center" })` once each time the target element changes; when `elapsed >= scene.durationMs`, advance to the next scene or to the `ended` phase, exactly once.
    - Whatever happens in stages 1-3, the scene must reach stage 4 within about 10 s, and stage 4 always ends. **The movie never stalls.**
    - Every timer, interval, `requestAnimationFrame` and listener the effect creates is tracked and cleared in the cleanup, and a `cancelled` flag stops late callbacks. Safe under React StrictMode (the effect runs twice in dev; the second run must start cleanly, and the first run's `startDemoSession`/`navigate` calls must not leave it in a bad state).
  - **(d) Actions.** `openArogya` calls `setArogyaOpenRef.current(true)` (it never clicks the launcher; the launcher is only a spotlight target). `closeArogya` calls `setArogyaOpenRef.current(false)`. New action `pressEscape` dispatches a `keydown` Escape (`key: "Escape"`, `bubbles: true`) on `document` immediately (no timers). `clickTarget` clicks the element of the beat's `target`. `ask`, `progressCoach`, `departmentReport`, `appraisalDraft` use `sendAroDemoCommand` as now. Delete the `openThenCloseDialog` action and its `setTimeout`.
  - **(e) Raw selectors.** A beat may carry `selector` (a CSS selector string) instead of `target`; the spotlight resolves it with `document.querySelector`. Use it only for the dialog in scene 2.
  - **(f) Skip** goes to the `ended` phase, closes the panel and presses Escape (as now), and also clears any beat-driven state. **Replay** (event) resets `sceneIndex` to 0, `elapsed` to 0, `targetRect` to null, `phase` to `"playing"` and increments `runToken`.
  - No `console.*`. No network. No new dependency.
- [ ] **2. `scenes.ts`.** (a) Replace `"openThenCloseDialog"` in the `SceneAction` union with `"pressEscape"`. (b) Add an optional `selector?: string` to the beat type. (c) Scene 2 (`scene-02-caselog`) beats become: `{ atMs: 3000, action: "clickTarget", target: "caselog-add" }`, `{ atMs: 3800, selector: '[role="dialog"]' }`, `{ atMs: 6500, action: "pressEscape", target: "caselog-list" }` (so the spotlight sits on the new-case form while it is open, and returns to the case list after it closes). (d) In scenes 3 and 9, the `openArogya` beats keep `target: "arogya-launcher"` (spotlight only; the action no longer clicks it). Change nothing else: ids, captions, durations and the other beats stay as they are.
- [ ] **3. `MovieControls.tsx`.** Put the chapter bar and its labels inside one dark translucent pill (`rounded-2xl bg-slate-900/75 px-3 py-2 backdrop-blur-md`, max width as now) so the white labels and the white progress fill are readable over any page. Keep the Skip button, its `data-testid`, its accessible name and its 44 px touch target. Nothing else changes.
- [ ] **4. `EndCard.tsx`.** Add `pointer-events-auto` to the backdrop `<div>` (the one with `fixed inset-0 z-[100] ...`) so the buttons receive clicks. Nothing else changes.
- [ ] **5. `HANDOFF.md` — append** a `## Dispatch 89 (engine fixes)` section: each fix with file and line numbers, the final stage machine in a few lines, and the final scene-2 beat table. State plainly that you ran no commands (no shell access).

## Do NOT touch
- Every file except `demo-movie/DemoMovie.tsx`, `demo-movie/scenes.ts`, `demo-movie/MovieControls.tsx`, `demo-movie/EndCard.tsx` and `HANDOFF.md`. In particular `lib/demoSession.ts`, `AppLayout.tsx`, `App.tsx`, `DemoBanner.tsx`, `ArogyaPanel.tsx`, `QuarterlyAppraisalSection.tsx`, `LegalDisclaimerModal.tsx`, `lib/apiClient.ts`, `lib/demoData.ts`, `movieBridge.ts`, `DemoTypedText.tsx`.
- Scene ids, captions, durations and roles/routes in `scenes.ts`; the end-card heading and button text; the spotlight and caption styling.
- Anything under `artifacts/api-server/`, `lib/db/`, any `.env*` file, `package.json` or a lockfile. No new dependency.
- Reformatting, renaming, comment edits or tidying of anything you were not told to change. Previous Gemini runs on this task made collateral edits; edit only what this prompt names.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any change that would alter non-demo behaviour.
- Any new visible copy beyond what exists today (`AGENTS.md` §7).
- Any need to edit another file.
- Any value you would otherwise guess or invent.

## Report
`HANDOFF.md` is the report (Build item 5). A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)`. Substitution recorded: `Claude Sonnet 4.6 (Thinking)` is quota-blocked (429 `RESOURCE_EXHAUSTED`, reset about 18h from 17:29 UTC on 2026-10-01), so per the standing rule this runs on Gemini directly. A lower-tier model writes this change, so `code-review` runs the full lens set and Claude Code re-verifies the diffs itself.


## Files you may touch
- HANDOFF.md
- artifacts/mockup-sandbox/src/components/demo-movie/DemoMovie.tsx
- artifacts/mockup-sandbox/src/components/demo-movie/scenes.ts
- artifacts/mockup-sandbox/src/components/demo-movie/MovieControls.tsx
- artifacts/mockup-sandbox/src/components/demo-movie/EndCard.tsx