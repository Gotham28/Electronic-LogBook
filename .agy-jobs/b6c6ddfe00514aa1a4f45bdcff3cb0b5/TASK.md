# Antigravity dispatch 92 — Demo auto-movie: code-review round 1 fixes

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-02,
working branch `feat/demo-auto-movie` (already checked out, from `main` at `fca9553`), with dispatches 83-91
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
- `AGENTS.md` (repository root) — §7, §8, §9, §11, §12 (what a report must contain).
- `CURRENT_TASK.md` (repository root) — `## Feature`, `## Execution-session findings and developer rulings`, `## Review round 1`, and `### Dispatch 92 brief`. The Build list below is that brief, restated.
- `HANDOFF.md` (repository root) — the whole file. It has a `## Final state` section above the per-dispatch sections.
- Every source file named under Build, opened in full before you change it:
  - `artifacts/mockup-sandbox/src/components/LoginPage.tsx`
  - `artifacts/mockup-sandbox/src/components/demo-movie/DemoMovie.tsx`, `MovieControls.tsx`, `EndCard.tsx`, `scenes.ts`
  - `artifacts/mockup-sandbox/src/lib/demoSession.ts`
  - `artifacts/mockup-sandbox/src/lib/demoData.ts` (the review-queue / approve handling)
  - `artifacts/mockup-sandbox/src/components/layout/DemoBanner.tsx` and `AppLayout.tsx`
  - `artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx`
  - `artifacts/mockup-sandbox/src/components/QuarterlyAppraisalSection.tsx`
  - `artifacts/mockup-sandbox/src/components/CookieConsentBanner.tsx`
  - `artifacts/mockup-sandbox/src/App.tsx`
  - `.env.example`

## Build
Route B, frontend only. Verify each finding against the codebase before acting on it. If one is wrong for this
codebase, push back with technical reasoning in `HANDOFF.md` rather than implementing it. Do not agree
performatively. Fix it and show the code. Line numbers below are from before this dispatch; confirm them in the file.

- [ ] **1. One-click entry.** In `LoginPage.tsx`, the demo button on the first picker screen (the "Explore the Demo" card, `LoginPage.tsx:221`, which today calls `setMode("demo")` and opens the intermediate demo screen at `:237`) starts the movie immediately: `unlockDemoAudio()`, then `startDemoSession("student")`, then set the movie flag, then route in. Remove the intermediate "Guided tour" demo screen. Do not change the real login, forgot-password or payment flows. Remove any import, state or `mode` value that becomes unused.
- [ ] **2. Controls overlap (desktop).** Move or inset the `MovieControls` pill and Skip so they cover neither the app header or logo nor the `DemoBanner` role dropdown at 1440×900. Keep the dispatch-91 mobile placement.
- [ ] **3. Replay-safe review scene.** Scene 05 must not leave the demo data without `review-first-item` on a later replay. Either restore the approved item when the movie ends or replays, or make the approve beat visual-only in movie mode. No real-mode review code change.
- [ ] **4. Movie flag lifecycle.** Call `clearDemoMovie()` when the end card is reached and on Skip, so a reload or "Reset demo" does not replay the movie. Replay must still work. Replay from `DemoBanner` on `/print` (`App.tsx:342` renders `DemoBanner` outside the `AppLayout` routes) must not leave a pending flag: either hide Replay there or navigate to an `AppLayout` route first.
- [ ] **5. Cancel in-flight work on Skip or unmount.**
  - `ArogyaPanel.tsx:166-203`: track and clear every timeout in the demo command chain, and ignore a duplicate command while one is running.
  - `QuarterlyAppraisalSection.tsx:76-109`: cancel the polling loop and click timeout on unmount, and remove the unused `remarksDone` and `remediationDone`.
- [ ] **6. No double beats.** In `DemoMovie.tsx` around line 173, a scene's beats must not re-fire when its effect restarts mid-scene. Track the fired beats per scene index.
- [ ] **7. Cookie banner.** The movie caption and end card must not cover or block `CookieConsentBanner` (`CookieConsentBanner.tsx:34`, a `fixed bottom-0 z-50` bar). Either lift the banner's z-order above the movie overlay in demo mode only, or offset the caption and end card while the banner is visible. No change to the banner's real-mode behaviour or wording.
- [ ] **8. Keyboard reach.** Skip must be reachable by keyboard during scene 2. Close the dialog before the next beat, or open it without a focus trap in movie mode.
- [ ] **9. Demo appraisal typing.** Cancel the typed reveal when the visitor types, so `QuarterlyAppraisalSection.tsx:60-67` stops overwriting their input. In demo mode a second draft retypes even when the text is identical (`:48-110`).
- [ ] **10. `.env.example`.** Delete the two `VITE_DEMO_*_PIN` lines at 31-32 (`VITE_DEMO_FACULTY_PIN=` and `VITE_DEMO_HOD_PIN=`). Change nothing else in that file, including the comment line above them (line 30); mention that orphaned comment in `HANDOFF.md` as a follow-up instead of editing it.
- [ ] **11. `HANDOFF.md` Final state.** Inside the existing `## Final state` section, add a subsection `### Review round 1 fixes (dispatch 92)` that lists each of items 1-10 with the file and line you changed (or, for any item you pushed back on, the technical reason), and add the line `Review tier: Sonnet (no §15 Opus trigger)`. Do not edit any text inside the existing `## Dispatch NN` sections, and do not edit `## Verification evidence` (Claude Code re-collects that evidence by running the code after this dispatch). Add a `## Dispatch 92` section above `## Dispatch 91` in the per-dispatch part, in the same style as the others: what changed per file and why, anything skipped, anything expanded.

## Do NOT touch
- `artifacts/mockup-sandbox/src/lib/apiClient.ts`. The demo interception stays exactly as is.
- Anything under `artifacts/api-server/` or `lib/db/`.
- `package.json` and lockfiles. No new dependencies.
- `.env` and `.env.local`. In `.env.example`, change only lines 31-32 (developer ruling 2026-10-02).
- Fetch, error and fallback logic in `HODPortal.tsx`.
- Real-mode (non-demo) behaviour of any component, including `CookieConsentBanner.tsx`, the review queue code in `ProfessorPortal.tsx`, `ArogyaPanel.tsx` and `QuarterlyAppraisalSection.tsx`. Every change in those files is guarded by demo mode or the movie flag.
- `LegalDisclaimerModal.tsx`, `GuidedTour.tsx` and its `data-tour-id` anchors.
- The real login, forgot-password and payment flows in `LoginPage.tsx`.
- The "Minor findings deliberately not fixed" list in `CURRENT_TASK.md` `## Review round 1`. Do not fix, restyle or "improve" any of them.
- Reformatting, renaming, comment edits or tidying of anything you were not told to change.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any change that would alter real-mode (non-demo) behaviour of a component, or any change to `apiClient.ts` or `api-server/`.
- Any new dependency, any env or secret value (`AGENTS.md` §10), any database or migration step.
- Any canned AI text or caption that would need clinical, diagnostic or MCI/NMC requirement wording (`AGENTS.md` §7). Do not invent any.
- Any change to fetch, error or fallback logic in `HODPortal.tsx`.
- Any logging of patient text or leave reasons (`AGENTS.md` §8).
- A finding you cannot fix without editing a file outside `artifacts/mockup-sandbox/src`, `.env.example` or `HANDOFF.md`.
- Any value you would otherwise guess or invent.

## Report
`HANDOFF.md` is the report (item 11). It must also say:
- every file created or modified, with paths;
- anything you pushed back on, with the technical reasoning;
- anything noticed that was not asked about, listed and left alone;
- that you ran no commands (no shell access), and that typecheck, build and the Playwright runs are Claude Code's, run after this dispatch.

A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)`. Substitution recorded: `Claude Sonnet 4.6 (Thinking)` was quota-blocked (429 `RESOURCE_EXHAUSTED`, resets in about 16h) on 2026-10-02, so per the standing rule this runs on Gemini. A lower-tier model writes this change, so `code-review` runs the full lens set and Claude Code re-verifies the diffs itself.


## Files you may touch
- artifacts/mockup-sandbox/src
- .env.example
- HANDOFF.md