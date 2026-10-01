# Antigravity dispatch 87 — Demo auto-movie: engine, scenes, controls, end card, AppLayout mount, App.tsx listener

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-01,
working branch `feat/demo-auto-movie` (already checked out, from `main` at `fca9553`), with dispatches 83-86
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
- `CURRENT_TASK.md` (repository root) — `## Feature`, `## Developer decisions`, `## Execution-session findings and developer rulings`, `## Progress log`, `## Scene script`, `## Explicitly out of scope`, `## Do NOT touch`. The `## Progress log` lists the 16 `data-tour` anchors that exist and the facts below.
- `HANDOFF.md` (repository root) — the `## Dispatch 83` to `## Dispatch 86` sections. You append a section.
- `artifacts/mockup-sandbox/src/lib/demoSession.ts` (dispatch 83), `components/demo-movie/movieBridge.ts` and `components/demo-movie/DemoTypedText.tsx` (dispatch 85).
- `artifacts/mockup-sandbox/src/components/DemoMotion.tsx` (`useDemoMotionEnabled`, `DemoCount`, `DemoProgress`), `lib/demoSounds.ts` (`playDemoSound`, and which sound names exist), `lib/session.ts` (`isDemoMode`, `getCurrentUser`). Read-only.
- `artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx` — the whole file. Note: `activeRole` is a prop (`"Student" | "Faculty" | "HOD"`), `const [location, setLocation] = useLocation()` (wouter), `const [arogyaOpen, setArogyaOpen] = React.useState(false)` (line ~237), `disclaimerBlocksNotice` state (line ~238), `<ArogyaPanel ... />` (line ~750), `<MobileBottomNav ... />` (line ~747), `const demoMode = isDemoMode()`.
- `artifacts/mockup-sandbox/src/App.tsx` — lines 186-230 (the `currentUser` state and the effect that listens for `DEMO_DEPARTMENT_CHANGED_EVENT`).
- `artifacts/mockup-sandbox/src/components/layout/MobileBottomNav.tsx` — read-only, to learn its height so captions sit above it.

## Facts you need (already established, do not re-derive)
- **Routing.** The app uses `wouter`. In `AppLayout`, `setLocation(path)` navigates. **Student** pages: `/` (Dashboard, anchor `dashboard-progress`), `/cases` (Case Logs, anchors `caselog-add` and `caselog-list`). **Faculty** has no route table: `ProfessorPortal` picks its tab from the location. `/` is the review queue (anchors `review-queue`, `review-first-item`, `review-approve`); `/assessments` shows the quarterly appraisal section (anchors `appraisal-draft`, `appraisal-remarks`). **HOD** is the same: `/roster` is the HOD dashboard (anchor `hod-overview`, which sits in a header shown on every HOD tab), `/requirements` is the Requirements tab (anchor `hod-requirements`).
- **Arogya panel anchors** (exist only while the panel is open, and some only for one role): `arogya-launcher` (the floating button, always), `arogya-panel`, `arogya-input`, `arogya-messages`, `arogya-coach` (Student only), `arogya-report` (HOD only). `AppLayout` owns the open state (`arogyaOpen` / `setArogyaOpen`).
- **Commands to components.** `sendAroDemoCommand(...)` from `demo-movie/movieBridge.ts` accepts `{ type: "ask", question }`, `{ type: "progress-coach" }`, `{ type: "department-report", reportType: "report" | "falling_behind" }` and `{ type: "appraisal-prefill-and-draft" }`. The question text to use is `DEMO_MOVIE_ASK_QUESTION`, exported from `lib/demoData.ts`. Commands only work while the target component is mounted and (for the panel) open.
- **Role changes without a reload.** `startDemoSession(role)` writes the session and dispatches `DEMO_SESSION_CHANGED_EVENT`. `App.tsx` does not listen for it yet (you add that below), then `activeRole` updates, and `AppLayout` re-renders with the new role. `AppLayout` is **not** remounted on a role change.
- **Login-summary toast.** `startDemoSession` sets `elogbook-login-summary-pending`, which makes `AppLayout` show an info toast once. A role switch inside the movie must not cause that toast.
- **Legal disclaimer.** A Resident sees a blocking legal modal on first visit. **Developer ruling: the movie waits for the visitor to accept it.** `AppLayout` already holds that state as `disclaimerBlocksNotice`.
- Demo mode has no network: every request is answered in the browser (`lib/apiClient.ts` → `lib/demoData.ts`). The movie itself must make no network request.
- `framer-motion` is installed and may be used. No other new dependency.

## Build
- [ ] **1. `artifacts/mockup-sandbox/src/lib/demoSession.ts` — additions only (keep every existing export and behaviour).**
  - Give `startDemoSession` an optional second parameter `options?: { skipLoginSummary?: boolean }`. When `skipLoginSummary` is true, do **not** write `elogbook-login-summary-pending` (and remove it if present). With no options the function behaves exactly as today.
  - `export const DEMO_MOVIE_CHANGED_EVENT = "arogya-demo-movie-changed";` `setDemoMovieActive()` and `clearDemoMovie()` dispatch it on `window` after their storage write (the dispatch is outside the try/catch so it still fires when storage is unavailable).
  - `export const DEMO_MOVIE_REPLAY_EVENT = "arogya-demo-movie-replay";` and `export function requestDemoMovieReplay(): void` — calls `setDemoMovieActive()` then dispatches the replay event on `window`.
  - `export function demoPortalHome(role: DemoRole): string` — `"/"` for `student` and `faculty`, `"/roster"` for `hod`.
  - No `console.*`.
- [ ] **2. New `artifacts/mockup-sandbox/src/components/demo-movie/scenes.ts`** — the script as typed data, plus helpers.
  - Types: `DemoChapter = "resident" | "faculty" | "hod"`; `SceneAction = "none" | "openArogya" | "closeArogya" | "ask" | "progressCoach" | "departmentReport" | "appraisalDraft" | "clickTarget" | "openThenCloseDialog"` (add or rename if you need a different action vocabulary, but keep it a closed union); `DemoScene = { id: string; chapter: DemoChapter; role: DemoRole; route: string; target?: string; caption: string; action: SceneAction; durationMs: number; beats?: { atMs: number; action?: SceneAction; target?: string; clickTarget?: string }[] }`. The fields `chapter`, `role`, `route`, `target`, `caption`, `action` and `durationMs` are required by the task; `beats` is optional and lets one scene run a sequence (for example open the panel at 0 ms, type the question at 1500 ms, move the spotlight to the answer at 4000 ms).
  - Export `DEMO_SCENES: DemoScene[]` with these nine scenes, in order (durations are targets; total about 88 s; tune so the sum is between 80 000 and 100 000 ms):
    1. `resident`, role `student`, route `/`, target `dashboard-progress`, caption "Your training progress, always current", about 7 s.
    2. `resident`, `student`, `/cases`, target `caselog-add`, caption "Log a clinical case in moments", about 8 s. Beat: after about 3 s, click `caselog-add` to open the new-case form, leave it open about 3 s, then close it with an Escape key event on `document`. **Never fill in or submit anything.** If clicking the button does not open something safe to close, fall back to spotlight only and say so in `HANDOFF.md`.
    3. `resident`, `student`, `/` (so the dashboard is behind the panel), caption "Ask Arogya about your progress", about 12 s. Beats: open the panel (target `arogya-launcher`, then `arogya-panel`), then `ask` with `DEMO_MOVIE_ASK_QUESTION`, and the spotlight moves to `arogya-messages` while the answer types in. The panel stays open into scene 4.
    4. `resident`, `student`, `/`, target `arogya-coach`, caption "Coaching from your own numbers", about 8 s. Beat: `progressCoach` after about 1.5 s; at the end of the scene close the panel.
    5. `faculty`, role `faculty`, route `/`, target `review-first-item`, caption "Faculty review and approve logs from one queue", about 12 s. Beat: after about 5 s, spotlight `review-approve` and click it (demo data only). If approving needs a confirmation dialog or a field, do not invent input: spotlight only, and say so in `HANDOFF.md`.
    6. `faculty`, `faculty`, `/assessments`, target `appraisal-draft`, caption "Arogya drafts appraisal remarks in seconds", about 13 s. Beat: `appraisalDraft` after about 1.5 s; spotlight moves to `appraisal-remarks` while the text types in.
    7. `hod`, role `hod`, route `/roster`, target `hod-overview`, caption "The Head of Department sees the whole department", about 8 s.
    8. `hod`, `hod`, `/requirements`, target `hod-requirements`, caption "Training requirements, set up per department", about 8 s.
    9. `hod`, `hod`, `/roster`, caption "Arogya builds a department report on request", about 12 s. Beats: open the panel (`arogya-launcher`, then `arogya-panel`), `departmentReport` with `reportType: "report"` after about 2 s, spotlight `arogya-report` then `arogya-messages`; close the panel at the end.
  - **Captions are product copy only.** No clinical, regulatory, MCI/NMC or outcome claims, no statistic (`AGENTS.md` §7). Use exactly the captions above.
  - Export helpers: `CHAPTERS` (the three chapters with labels "Resident", "Faculty", "HOD") and a function that returns each chapter's share of the total duration, for the progress bar.
- [ ] **3. New `artifacts/mockup-sandbox/src/components/demo-movie/DemoMovie.tsx`** — the timer-driven engine. Props: `{ activeRole: "Student" | "Faculty" | "HOD"; navigate: (path: string) => void; blocked: boolean; arogyaOpen: boolean; setArogyaOpen: (open: boolean) => void }`.
  - **Visibility.** Render nothing unless `isDemoMode()` and the movie flag (`isDemoMovieActive()`) are both true. Re-read the flag when `DEMO_MOVIE_CHANGED_EVENT` fires. `DEMO_MOVIE_REPLAY_EVENT` restarts from scene 0 (also from the end card). Render through `createPortal` into `document.body` so stacking is predictable.
  - **Phases.** `"playing"` and `"ended"` (the end card). While `blocked` is true (the legal disclaimer is showing) the movie does not start or advance; it starts once `blocked` becomes false.
  - **Per scene:** (1) if `scene.role` differs from the current role, close the panel, call `startDemoSession(scene.role, { skipLoginSummary: true })` and wait (poll) until the `activeRole` prop matches (give up after about 3 s and carry on); (2) `navigate(scene.route)` if the location differs; (3) wait up to about 3.5 s for the `[data-tour="…"]` element to exist and have a non-zero size; (4) the scene clock (`durationMs`) starts then; (5) spotlight the target; (6) run the scene's action and beats at their offsets; (7) show the caption; (8) after `durationMs` go to the next scene, or to the end card after the last one. **If a target is missing, show the caption without a spotlight and still advance. The movie never stalls.**
  - **Spotlight.** A fixed full-screen layer with `pointer-events: none` that dims everything except a rounded cut-out around the target (a transparent rounded rectangle with a very large `box-shadow` spread works, animated with `framer-motion` between targets). Scroll the target into view (`scrollIntoView` with `block: "center"`), re-measure on scroll and resize, and re-measure when the target element changes (the Arogya panel's elements appear and disappear). When motion is off (`useDemoMotionEnabled()` false), use no sliding: the rectangle jumps and fades only.
  - **Caption.** An animated caption card (fade and small rise; fade only when motion is off) with `role="status"` and `aria-live="polite"`. Desktop: bottom centre with comfortable margin. Mobile (below 640 px): above the `MobileBottomNav`, using a bottom offset that clears it plus `env(safe-area-inset-bottom)`, full width minus 16 px side gutters. It must never sit under the bottom nav or off screen at 375 px width.
  - **Input blocking.** While `"playing"`, put a transparent full-screen layer under the controls that swallows pointer events, so a visitor cannot disturb the movie. Programmatic clicks (`element.click()`) are unaffected by it.
  - **Timers.** Every timeout, interval, `requestAnimationFrame` and listener is cleaned up when the scene changes, on Exit, on restart and on unmount. It must be safe under React StrictMode (effects run twice) and must never advance twice for one scene. Use a run token or equivalent so a stale callback does nothing.
  - **Sound.** Use `playDemoSound` with a sound name that already exists in `lib/demoSounds.ts`, lightly (for example one soft sound on scene change). No new sound assets.
  - **Exit.** Exit/Skip goes straight to the end card (never leaves the visitor stuck): close the panel, press Escape to close any open dialog, clear timers.
  - **Test hooks.** On the movie's root element set `data-testid="demo-movie-root"`, `data-phase` (`playing` or `ended`) and `data-scene-id` (the current scene id). No patient or personal data anywhere in the movie.
  - No `console.*`. No `fetch`, no `apiGet/apiPost`. No `/api/` string.
- [ ] **4. New `artifacts/mockup-sandbox/src/components/demo-movie/MovieControls.tsx`.** Always visible while playing: (a) an Exit/Skip button (accessible name "Skip demo", `data-testid="demo-movie-skip"`), top right, at least 44 px touch target; (b) a progress bar with three labelled chapters (Resident · Faculty · HOD) whose widths follow each chapter's share of the total duration and whose fill advances smoothly with elapsed time (use the scene clock; with motion off it may step per scene). It fits at 375 px wide. **No pause control and no sound toggle.** Place it clear of the app's own header controls as best you can, and keep it above the input-blocking layer.
- [ ] **5. New `artifacts/mockup-sandbox/src/components/demo-movie/EndCard.tsx`.** A centred card over a dimmed backdrop. Heading exactly "That was Arogya in about 90 seconds", one short supporting line of plain product copy with no claim (for example "Replay it, or explore the demo yourself."), and two buttons: **Replay** (`data-testid="demo-movie-replay"`) restarts from scene 0 (the first scene's role is Resident; `startDemoSession("student", { skipLoginSummary: true })` if the current role differs, and navigate to `/`), and **Explore the demo yourself** (`data-testid="demo-movie-explore"`) calls `clearDemoMovie()`, makes sure the role is Resident (`startDemoSession("student", { skipLoginSummary: true })` if it is not), navigates to `demoPortalHome("student")`, closes the panel and removes the movie from the screen, leaving the app in normal free play. Focus moves to the first button when the card opens; Tab stays inside the card; fade in (no slide when motion is off).
- [ ] **6. `artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx` — mount only.** Import `DemoMovie`. Render `{demoMode && <DemoMovie activeRole={activeRole} navigate={setLocation} blocked={disclaimerBlocksNotice} arogyaOpen={arogyaOpen} setArogyaOpen={setArogyaOpen} />}` once, directly after the `<ArogyaPanel ... />` element (match the real prop types; `setLocation` takes a string). Also give `<ArogyaPanel>` the prop `key={demoMode ? activeRole : undefined}` so the panel's conversation resets when the demo role changes (in real mode `key` is `undefined`, so nothing changes). Nothing else in this file changes.
- [ ] **7. `artifacts/mockup-sandbox/src/App.tsx` — the approved scope amendment, and nothing else.** Import `DEMO_SESSION_CHANGED_EVENT` from `@/lib/demoSession` and, in the existing effect at lines ~206-210 that already registers `syncCurrentUser` for `DEMO_DEPARTMENT_CHANGED_EVENT`, also register and clean up the same `syncCurrentUser` for `DEMO_SESSION_CHANGED_EVENT`. Do not add a `key`, a route, or anything else to this file.
- [ ] **8. `HANDOFF.md` — append** a `## Dispatch 87` section: per file, what changed with line numbers; the final scene table (id, role, route, target, action, durationMs) with the total duration; how each action is implemented (especially `clickTarget`, the Escape close, and what you did when a click needed more than a click); anything skipped, expanded or noticed; known risks (for example anything you could not make robust without running the app). State plainly that you ran no commands (no shell access), so typecheck and the in-browser run are done by Claude Code afterwards.

## Do NOT touch
- `artifacts/mockup-sandbox/src/lib/apiClient.ts`, `lib/demoData.ts`, `lib/demoDepartments.ts`, `lib/session.ts`, `lib/demoSounds.ts`.
- `components/arogya/ArogyaPanel.tsx`, `QuarterlyAppraisalSection.tsx`, `HODPortal.tsx`, `ProfessorPortal.tsx`, `DepartmentSettings.tsx`, `Dashboard.tsx`, `CaseLogsPage.tsx`, `LoginPage.tsx`, `GuidedTour.tsx`, `LegalDisclaimerModal.tsx`, `MobileBottomNav.tsx`, `DemoBanner.tsx` (the role switcher and Replay link come in the next dispatch), `DemoMotion.tsx`, `demo-movie/movieBridge.ts`, `demo-movie/DemoTypedText.tsx`.
- In `AppLayout.tsx`: everything except the import, the one `<DemoMovie />` element and the one `key` prop. In `App.tsx`: everything except the import and the listener registration.
- Any `data-tour-id` attribute and `GuidedTour` behaviour.
- Anything under `artifacts/api-server/`, `lib/db/`, any `.env*` file, `package.json` or a lockfile. No new dependency.
- Reformatting, renaming, comment edits or tidying of anything you were not told to change. Previous Gemini runs on this task made collateral edits (a deleted comment, a changed colour class); edit only the lines this prompt names.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any change that would alter non-demo behaviour of any file. Everything new is gated on `isDemoMode()`.
- Any caption, end-card text or other copy that would need clinical, diagnostic or MCI/NMC requirement wording, or a number that is not in the demo data. Never invent it (`AGENTS.md` §7).
- Any need to edit a file outside the allowed list: `demo-movie/scenes.ts`, `DemoMovie.tsx`, `MovieControls.tsx`, `EndCard.tsx`, `lib/demoSession.ts`, `AppLayout.tsx`, `App.tsx`, `HANDOFF.md`.
- Any new dependency, env file edit, server route, or `apiClient.ts` change.
- Any value you would otherwise guess or invent. If a Build item cannot be done as written, do the rest and say exactly which item and why in `HANDOFF.md`.

## Report
`HANDOFF.md` is the report (Build item 8). A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)`. Substitution recorded: `Claude Sonnet 4.6 (Thinking)` is quota-blocked (429 `RESOURCE_EXHAUSTED`, reset about 18h from 17:29 UTC on 2026-10-01), so per the standing rule this runs on Gemini directly. A lower-tier model writes this change, so `code-review` runs the full lens set and Claude Code re-verifies the diffs itself.
