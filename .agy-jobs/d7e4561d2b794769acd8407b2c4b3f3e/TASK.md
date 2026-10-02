# Antigravity dispatch 95 — Demo auto-movie: Coach auto-scroll, instant and retried

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-02,
working branch `feat/demo-auto-movie` (already checked out, from `main` at `fca9553`), with dispatches 83-94
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
- `HANDOFF.md` (repository root) — `## Dispatch 94` (item F is what you are correcting).
- `artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx` — opened in full. The effect to change is the one guarded by `if (!open || !isDemoMode() || !isDemoMovieActive()) return undefined;` that creates a `ResizeObserver` on `[data-tour="arogya-messages"]` (about lines 168-195).

## Build
Frontend only. Path is under `artifacts/mockup-sandbox/src/`. Verify the finding against the code before acting; if it is wrong, say so in `HANDOFF.md` with technical reasoning instead of implementing it.

- [ ] **F2. `components/arogya/ArogyaPanel.tsx` — the demo auto-scroll is unreliable.** Two causes, both in that one effect:
  1. It calls `scrollContainer.scrollTo({ top: scrollHeight, behavior: reducedMotion ? "auto" : "smooth" })` on every resize. The message text grows many times a second while it types, so each call restarts a smooth scroll and the container lags behind the growing text. Always use an instant scroll (`behavior: "auto"`, or set `scrollContainer.scrollTop = scrollContainer.scrollHeight`) and drop the reduced-motion branch.
  2. The observer is created once, 100 ms after the panel opens (`window.setTimeout(initObserver, 100)`), and gives up if `[data-tour="arogya-messages"]` is not yet in the DOM. On a phone-sized screen the popover content can mount later than that, so no observer is ever attached. Replace the single timer with a short retry: poll every 100 ms (a `window.setInterval`), up to about 3 seconds, until both `[data-tour="arogya-messages"]` and its `.overflow-y-auto` ancestor exist, then create the observer once and stop polling. Clear the interval and disconnect the observer in the effect's cleanup.
  Keep the existing guard (`open`, `isDemoMode()`, `isDemoMovieActive()`), so real mode and demo free play stay unchanged. Change nothing else in the file.
  Required result (Claude Code will check it): at 6 s and at 7.2 s into scene 4, at 1440×900 and at 375×812, the container is scrolled to the bottom and the last coach tip and its "Sample AI output" label are inside the container's visible area.
- [ ] **G2. `HANDOFF.md`.** Add `## Dispatch 95` directly above `## Dispatch 94`, in the same style: what changed and why, anything skipped, anything expanded, and that you ran no commands. In `## Dispatch 94` and in `### Review round 1 fixes (dispatch 92)` / `## Final state`, correct only the lines that describe the Coach auto-scroll (smooth scrolling, the one-shot 100 ms attach). Do not edit `## Verification evidence`, `## Known limitations and follow-ups`, or any other section.

## Do NOT touch
- Every file not named under Build. In particular `DemoMovie.tsx`, `MovieControls.tsx`, `CookieConsentBanner.tsx`, `scenes.ts`, `QuarterlyAppraisalSection.tsx`, `.env.example`.
- `artifacts/mockup-sandbox/src/lib/apiClient.ts`, anything under `artifacts/api-server/` or `lib/db/`, `package.json` and lockfiles, `.env` and `.env.local`. No new dependencies.
- Real-mode (non-demo) behaviour of `ArogyaPanel.tsx`, and every other effect, handler and markup in that file.
- Reformatting, renaming, comment edits or tidying of anything you were not told to change. Report anything else you notice instead of fixing it.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any change that would alter real-mode (non-demo) behaviour, or any change to `apiClient.ts` or `api-server/`.
- Any new dependency, any env or secret value (`AGENTS.md` §10), any database or migration step.
- Any value you would otherwise guess or invent.

## Report
`HANDOFF.md` is the report (item G2). It must also list every file modified with paths, anything you pushed back on with the reason, anything noticed and left alone, and that you ran no commands. A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)`. Substitution recorded: `Claude Sonnet 4.6 (Thinking)` is quota-blocked (429 `RESOURCE_EXHAUSTED`, resets in about 16h from 2026-10-02). A lower-tier model writes this change, so `code-review` runs the full lens set and Claude Code re-verifies the diff and re-runs the browser checks itself.


## Files you may touch
- artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx
- HANDOFF.md