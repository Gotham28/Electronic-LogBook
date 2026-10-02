# Antigravity dispatch 93 — Demo auto-movie: fixes to dispatch 92

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-02,
working branch `feat/demo-auto-movie` (already checked out, from `main` at `fca9553`), with dispatches 83-92
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

You cannot run the TypeScript compiler. Claude Code runs `typecheck` after you finish, and dispatch 92 failed it.
So before you finish, re-open every file you edited and confirm that **every identifier you used is imported or
declared** in that file, and that no import is left unused.

## Read first
- `AGENTS.md` (repository root) — §7, §8, §9, §11, §12.
- `CURRENT_TASK.md` (repository root) — `## Review round 1`, `### Dispatch 92 brief`. Dispatch 92 was meant to do that brief; this dispatch corrects what it got wrong.
- `HANDOFF.md` (repository root) — `## Final state`, `### Review round 1 fixes (dispatch 92)` and `## Dispatch 92`.
- `artifacts/mockup-sandbox/src/lib/demoSession.ts` — exports `DEMO_MOVIE_CHANGED_EVENT` (value `"arogya-demo-movie-changed"`), `DEMO_MOVIE_REPLAY_EVENT`, `isDemoMovieActive`, `clearDemoMovie`, `setDemoMovieActive`, `requestDemoMovieReplay`.
- Every file named under Build, opened in full before you change it. Also open `components/demo-movie/EndCard.tsx` and `components/demo-movie/MovieControls.tsx` (read-only context; you do not edit them).

## Build
Frontend only. All paths below are under `artifacts/mockup-sandbox/src/`. Verify each finding against the code before acting; if one is wrong, say so in `HANDOFF.md` with technical reasoning instead of implementing it.

- [ ] **1. `components/CookieConsentBanner.tsx` — missing import (TS2304).** Line 34 calls `isDemoMode()` but the file never imports it. Add `import { isDemoMode } from "@/lib/session";`. Change nothing else in this file. Real-mode behaviour and wording stay as they are.
- [ ] **2. `components/arogya/ArogyaPanel.tsx` and `components/QuarterlyAppraisalSection.tsx` — the Skip-cancel listener never fires.** Both files do `window.addEventListener('DEMO_MOVIE_CHANGED_EVENT', ...)` with that **string literal**. The event the app actually dispatches is `"arogya-demo-movie-changed"` (the exported constant `DEMO_MOVIE_CHANGED_EVENT`), so nothing is ever cancelled on Skip. Fix both:
  - Import `DEMO_MOVIE_CHANGED_EVENT` and `isDemoMovieActive` **statically** from `@/lib/demoSession` and use the constant in `addEventListener` and `removeEventListener`. Remove the dynamic `import('@/lib/demoSession')` from the handler (the module is already a normal import elsewhere; the dynamic import is unnecessary).
  - The handler runs `cancelRun()` (ArogyaPanel) / cancels the in-flight run (QuarterlyAppraisalSection) only when `isDemoMovieActive()` is false.
  - `QuarterlyAppraisalSection.tsx`: `cancelled` is a single `let` inside the effect. Once the handler sets it to `true`, every later `appraisal-prefill-and-draft` command silently does nothing for the life of the component, including after a Replay. Make cancellation **per run**: give each command its own run id (for example a `let runId = 0` that each command copies and the cancel handler increments) so a cancel stops only the run that was in flight and the next command starts normally. The cleanup on unmount must still stop everything and clear `pollTimeout` and `clickTimeout`.
  - `ArogyaPanel.tsx`: after `cancelRun()`, a later `ask` command must still start normally (`isCommandRunning` is reset by `cancelRun`; keep that).
- [ ] **3. `components/demo-movie/DemoMovie.tsx` — the Tab handler (lines ~82-94) is not gated.** It runs whenever `phase === "playing"`, and `phase` starts as `"playing"` even when no movie is running (`isActive` false) or while the legal disclaimer is blocking. In demo free play that makes **every Tab press close any open dialog** (a visitor cannot Tab between the fields of a form dialog), and it fires an Escape at the disclaimer. Fix:
  - Register the handler only while `isActive && !blocked && phase === "playing"` (add them to the effect's dependency list and the condition).
  - When the handler fires and a `[role="dialog"]` that is **not** inside `[data-testid="demo-movie-root"]` is open: close it (the existing synthetic Escape is fine), `preventDefault()` the Tab, and move focus to the Skip button (`[data-testid="demo-movie-skip"]`) after a short tick (`setTimeout(..., 0)` or `requestAnimationFrame`) so the dialog's focus restore does not take focus back. When no such dialog is open, do not intercept the Tab at all, so the browser Tab order reaches Skip normally.
  - Goal to keep: during scene 2 (case form dialog open), pressing Tab once or twice leaves keyboard focus on the Skip button.
- [ ] **4. `components/demo-movie/DemoMovie.tsx` — Explore may leave the end card on screen.** Dispatch 92 added `if (phaseRef.current === "ended") return;` to `handleChanged` so the `clearDemoMovie()` at the end of the movie does not hide the end card. But `EndCard`'s Explore button also calls `clearDemoMovie()` and relies on that same event to set `isActive` false, which the guard now swallows, so the end card is never removed. Fix, without removing the guard:
  - The `onExplore` callback passed to `<EndCard>` must itself hide the card: set `isActive` to `false` there (keep the existing `navigate(...)` and `setArogyaOpen(false)`).
  - `handleReplay` must set `isActive` back to `true` (when `isDemoMode()`), so "Replay demo" from `DemoBanner` after Explore restarts the movie. It already resets the phase, scene index, elapsed time and fired beats.
  - End-card Replay, Skip → end card, and the end-of-movie end card must keep working as today.
- [ ] **5. `lib/demoData.ts` — use the existing helper (only if it is safe).** The review PATCH branch (around line 272) reads `window.sessionStorage.getItem("elogbook-demo-movie") !== "true"`. Replace it with `!isDemoMovieActive()` imported from `./demoSession`. `demoSession.ts` imports `./demoDepartments` and `./session` only, so no import cycle with `demoData.ts` should result; confirm that by opening those files, and if a cycle would result, leave the raw key and say so in `HANDOFF.md`. Change nothing else in `demoData.ts`.
- [ ] **6. `HANDOFF.md`.**
  - Correct `### Review round 1 fixes (dispatch 92)` and `## Dispatch 92` where they now say something untrue: the `CookieConsentBanner.tsx` import was missing, the cancel listeners used a wrong event name, the Tab handler was ungated, and Explore could leave the end card up. Edit only those two sections, and only the lines that are wrong.
  - Add `## Dispatch 93` directly above `## Dispatch 92`, in the same style: what changed per file and why, anything skipped, anything expanded, and that you ran no commands. State that `typecheck` exited 2 after dispatch 92 and that Claude Code re-runs it after this dispatch.
  - Do not edit `## Verification evidence`, `## Known limitations and follow-ups`, or any `## Dispatch NN` section for NN below 92.

## Do NOT touch
- Every file not named under Build. In particular `MovieControls.tsx`, `EndCard.tsx`, `scenes.ts`, `LoginPage.tsx`, `DemoBanner.tsx`, `AppLayout.tsx`, `App.tsx`, `demoSession.ts`, `.env.example`.
- `artifacts/mockup-sandbox/src/lib/apiClient.ts`, anything under `artifacts/api-server/` or `lib/db/`, `package.json` and lockfiles, `.env` and `.env.local`. No new dependencies.
- Fetch, error and fallback logic in `HODPortal.tsx`.
- Real-mode (non-demo) behaviour of any component, including `CookieConsentBanner.tsx` (item 1 is an import only), the review queue in `ProfessorPortal.tsx`, `ArogyaPanel.tsx` and `QuarterlyAppraisalSection.tsx`. Every change stays guarded by demo mode or the movie flag.
- The "Minor findings deliberately not fixed" list in `CURRENT_TASK.md` `## Review round 1`. Also leave alone: the scene's own `action` re-firing if the engine effect restarts, and the untracked `setTimeout(..., 10)` in the appraisal draft handler. Report anything else you notice instead of fixing it.
- Reformatting, renaming, comment edits or tidying of anything you were not told to change.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any change that would alter real-mode (non-demo) behaviour of a component, or any change to `apiClient.ts` or `api-server/`.
- Any new dependency, any env or secret value (`AGENTS.md` §10), any database or migration step.
- Any canned AI text or caption that would need clinical, diagnostic or MCI/NMC requirement wording (`AGENTS.md` §7).
- Any logging of patient text or leave reasons (`AGENTS.md` §8).
- A finding you cannot fix without editing a file outside the allowed list in this prompt.
- Any value you would otherwise guess or invent.

## Report
`HANDOFF.md` is the report (item 6). It must also list every file modified with paths, anything you pushed back on with the reason, anything noticed and left alone, and that you ran no commands. A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)`. Substitution recorded: `Claude Sonnet 4.6 (Thinking)` is quota-blocked (429 `RESOURCE_EXHAUSTED`, resets in about 16h from 2026-10-02). A lower-tier model writes this change, so `code-review` runs the full lens set and Claude Code re-verifies the diffs itself.


## Files you may touch
- artifacts/mockup-sandbox/src/components/CookieConsentBanner.tsx
- artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx
- artifacts/mockup-sandbox/src/components/QuarterlyAppraisalSection.tsx
- artifacts/mockup-sandbox/src/components/demo-movie/DemoMovie.tsx
- artifacts/mockup-sandbox/src/lib/demoData.ts
- HANDOFF.md