# Antigravity dispatch 94 — Demo auto-movie: fixes found by the Playwright run after dispatch 93

job_id: 860eb00198d648fdb625b2e4b1498aa8
workdir: D:\Electronic-LogBook-main
branch: feat/demo-auto-movie
model: Gemini 3.1 Pro (High). `Claude Sonnet 4.6 (Thinking)` was quota-blocked on 2026-10-02 (429, "Resets in 16h0m15s"), so per the standing rule this runs on Gemini directly.
allowed_paths:
- artifacts/mockup-sandbox/src/components/demo-movie/DemoMovie.tsx
- artifacts/mockup-sandbox/src/components/demo-movie/MovieControls.tsx
- artifacts/mockup-sandbox/src/components/CookieConsentBanner.tsx
- artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx
- HANDOFF.md

Why: Claude Code ran the full desktop movie in a real browser (Playwright, 1440×900) after dispatch 93. Typecheck and build pass; five behaviours do not. Evidence is in `CURRENT_TASK.md` `## Execution session 2` and `.agents/runs/shots/r2-desktop-coach.png`.

---

# Antigravity dispatch 94 — Demo auto-movie: five defects from the browser run

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-02,
working branch `feat/demo-auto-movie` (already checked out, from `main` at `fca9553`), with dispatches 83-93
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

You cannot run the TypeScript compiler or a browser. Claude Code runs `typecheck`, `build` and the browser run
after you finish. So before you finish, re-open every file you edited and confirm that **every identifier you used
is imported or declared** in that file and that no import is left unused.

## Read first
- `AGENTS.md` (repository root) — §7, §8, §9, §11, §12.
- `CURRENT_TASK.md` (repository root) — `## Execution session 2 (2026-10-02)` and `## Review round 1`.
- `HANDOFF.md` (repository root) — `## Final state`, `### Review round 1 fixes (dispatch 92)`, `## Dispatch 93`.
- `artifacts/mockup-sandbox/src/lib/demoSession.ts` — exports `DEMO_SESSION_CHANGED_EVENT`, `DEMO_MOVIE_CHANGED_EVENT`, `DEMO_MOVIE_REPLAY_EVENT`, `isDemoMovieActive`, `clearDemoMovie`, `setDemoMovieActive`, `requestDemoMovieReplay`.
- Every file named under Build, opened in full. Also open, read-only, `components/demo-movie/EndCard.tsx`, `components/demo-movie/scenes.ts`, and `components/layout/DemoBanner.tsx` (the banner that sits at the top of the page content).

## Build
Frontend only. All paths are under `artifacts/mockup-sandbox/src/`. Verify each finding against the code before acting; if one is wrong, say so in `HANDOFF.md` with technical reasoning instead of implementing it.

- [ ] **A. `components/demo-movie/DemoMovie.tsx` — the end card never appears (a race).** Measured: after scene 9 ended, `[data-testid="demo-movie-root"]` was absent and the movie never reached `data-phase="ended"`. Cause: `handleChanged` returns early only when `phaseRef.current === "ended"`, but `phaseRef.current` is assigned during render. At the end of the last scene (in the engine effect) and in `handleSkip`, the code calls `setPhase("ended")` and then `clearDemoMovie()`, which dispatches `DEMO_MOVIE_CHANGED_EVENT` **synchronously**, while `phaseRef.current` is still `"playing"`. So `handleChanged` runs `setIsActive(false)` and the component returns `null`. Fix: assign `phaseRef.current = "ended"` immediately before `setPhase("ended")` in both places (end of the movie and `handleSkip`), so the guard is true when the event fires. Required behaviour afterwards: when the last scene finishes, the end card shows (`data-phase="ended"`, Replay and Explore buttons present) and the session-storage flag `elogbook-demo-movie` is cleared; Skip behaves the same. Do not regress the existing behaviour: Explore hides the card (`setIsActive(false)` in `onExplore`), end-card Replay and banner "Replay demo" restart the movie.
- [ ] **B. `components/CookieConsentBanner.tsx` — still blocked under the movie.** Measured during scene 1: the banner's computed `z-index` was `50` (not `110`) and `elementFromPoint` at the "Reject All" button did not return that button. Cause: `isDemoMode()` is evaluated once per render, and the banner is mounted and rendered on the login page, before the demo session starts, so it never re-renders. Fix: make the demo z-order react to the session. In the component, subscribe (in an effect, with cleanup) to `DEMO_SESSION_CHANGED_EVENT` and `DEMO_MOVIE_CHANGED_EVENT` from `@/lib/demoSession` and re-render on each (a small state bump), so `isDemoMode()` is re-read after the demo session starts. Add `data-testid="cookie-consent-banner"` on the banner's root `div`. Real-mode behaviour, wording, buttons and `z-50` stay exactly as they are; only the demo-mode class changes.
- [ ] **C. `components/demo-movie/DemoMovie.tsx` — caption must sit above the cookie banner.** Once B lifts the banner above the movie layer, it will cover the lower part of the caption (at 1440×900 the caption is y 785-852 and the banner starts at y 798). While `[data-testid="cookie-consent-banner"]` is in the DOM, raise the caption's bottom offset to the banner's height plus 16 px (desktop and mobile; on mobile use the larger of that and the existing `calc(76px + env(safe-area-inset-bottom))`), and recompute it when the banner is dismissed or resized (a `ResizeObserver` on the banner element, or a re-read in the engine's existing interval). The caption and the end card must not overlap the banner's bounding box at 1440×900 or 375×812. With no banner in the DOM the caption keeps its current position.
- [ ] **D. `components/demo-movie/DemoMovie.tsx` — Tab does not reach Skip.** Measured in scene 2: after one Tab the dialog closed, but `document.activeElement` was a `BUTTON` (the dialog's trigger, because the dialog restores focus to it after the `setTimeout(..., 0)` you used), and after a second Tab an `INPUT`. Fix, in the same Tab handler (keep its `isActive && !blocked && phase === "playing"` gate): after dispatching the Escape and calling `preventDefault()`, wait until no `[role="dialog"]` outside `[data-testid="demo-movie-root"]` remains (poll with `requestAnimationFrame`, give up after about 600 ms), then focus `[data-testid="demo-movie-skip"]`, and re-assert the focus once about 150 ms later if `document.activeElement` is no longer the Skip button. Cancel those timers if the effect cleans up. Required result: one Tab press in scene 2 leaves keyboard focus on the Skip button within 700 ms. When no dialog is open the handler still does nothing.
- [ ] **E. `components/demo-movie/MovieControls.tsx` — the desktop pill overlaps the banner.** Measured at 1440×900: the pill (x 497-928, y 16-82, top centre) overlaps the DemoBanner text in scenes 3, 4 and 9, and the banner's role dropdown by about 3 px, and the app header band (x 289-1393, y 17-58) in every scene. Move it, on `sm:` and up only, to the bottom-left of the viewport, inside the sidebar's empty lower area: for example `sm:inset-auto sm:left-4 sm:bottom-40 sm:top-auto sm:translate-x-0` with the inner card `sm:w-[260px]` (the Skip button stays beside it). Keep the phone placement (below `sm:`) exactly as it is. It must not overlap the caption (bottom centre), the Arogya launcher and panel (right), the app header or the DemoBanner. Keep the "Demo — sample data" line, the three chapter bars and their labels visible and readable at 260 px.
- [ ] **F. `components/arogya/ArogyaPanel.tsx` — Coach tips are out of view.** Measured at 5.5 s into scene 4 (screenshot `.agents/runs/shots/r2-desktop-coach.png`): only the first line of the first coach tip is visible at the bottom edge of the panel, because nothing scrolls the panel's scroll container (the `overflow-y-auto` div that wraps the messages, near line 279) as messages arrive and the typed text grows. Add a **demo-mode, movie-only** behaviour: while `isDemoMode() && isDemoMovieActive()`, whenever the content of `[data-tour="arogya-messages"]` grows (a `ResizeObserver` on that element, created in an effect and disconnected on cleanup), scroll that scroll container to its bottom (`scrollTop = scrollHeight`, smooth only if `prefers-reduced-motion` is not set). Real mode and demo free play must not change. Required result: about 6 s into scene 4, the last coach tip is inside the container's visible area.
- [ ] **G. `HANDOFF.md`.** Add `## Dispatch 94` directly above `## Dispatch 93`, in the same style: what changed per file and why, anything skipped, anything expanded, and that you ran no commands. Correct only the lines in `### Review round 1 fixes (dispatch 92)` and `## Dispatch 92`/`## Dispatch 93` that are now untrue (the controls placement, the movie-flag lifecycle and end card, the cookie banner, the Tab-to-Skip behaviour). Do not edit `## Verification evidence`, `## Known limitations and follow-ups`, or any `## Dispatch NN` for NN below 92.

## Do NOT touch
- Every file not named under Build. In particular `EndCard.tsx`, `scenes.ts`, `LoginPage.tsx`, `DemoBanner.tsx`, `AppLayout.tsx`, `App.tsx`, `demoSession.ts`, `demoData.ts`, `QuarterlyAppraisalSection.tsx`, `.env.example`.
- `artifacts/mockup-sandbox/src/lib/apiClient.ts`, anything under `artifacts/api-server/` or `lib/db/`, `package.json` and lockfiles, `.env` and `.env.local`. No new dependencies.
- Fetch, error and fallback logic in `HODPortal.tsx`.
- Real-mode (non-demo) behaviour of any component, including `CookieConsentBanner.tsx` (only its demo-mode class and one `data-testid` change) and `ArogyaPanel.tsx` (item F is demo and movie only).
- The "Minor findings deliberately not fixed" list in `CURRENT_TASK.md` `## Review round 1`. Report anything else you notice instead of fixing it.
- Reformatting, renaming, comment edits or tidying of anything you were not told to change.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any change that would alter real-mode (non-demo) behaviour of a component, or any change to `apiClient.ts` or `api-server/`.
- Any new dependency, any env or secret value (`AGENTS.md` §10), any database or migration step.
- Any caption or canned AI text that would need clinical, diagnostic or MCI/NMC requirement wording (`AGENTS.md` §7).
- Any logging of patient text or leave reasons (`AGENTS.md` §8).
- A finding you cannot fix without editing a file outside the allowed list in this prompt.
- Any value you would otherwise guess or invent.

## Report
`HANDOFF.md` is the report (item G). It must also list every file modified with paths, anything you pushed back on with the reason, anything noticed and left alone, and that you ran no commands. A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)`. Substitution recorded: `Claude Sonnet 4.6 (Thinking)` is quota-blocked (429 `RESOURCE_EXHAUSTED`, resets in about 16h from 2026-10-02). A lower-tier model writes this change, so `code-review` runs the full lens set and Claude Code re-verifies the diffs and re-runs the browser checks itself.
