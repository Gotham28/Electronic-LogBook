# Antigravity dispatch 88 — Demo auto-movie: DemoBanner role switcher and "Replay demo" link

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-01,
working branch `feat/demo-auto-movie` (already checked out, from `main` at `fca9553`), with dispatches 83-87
uncommitted in the working tree. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

**To read any file, use only the file viewer tool (`view_file`).** `type`, `cat`, `more`, `Get-Content`, `Select-String`
and `grep` are shell commands and will be denied. The first attempt at this dispatch ended after 69 seconds because the
agent ran `type …\demoSession.ts` to read a file; no file was changed. Do not repeat that: open every file with the viewer.

Skip the `AGENTS.md` §1 pull-before-task ritual; Claude Code already did it. Every fact you need is in this
prompt or in a file you can view.

## Read first
- `AGENTS.md` (repository root) — §5, §7, §9.
- `CURRENT_TASK.md` (repository root) — the bullet for `components/layout/DemoBanner.tsx` under `## Files/areas in scope`, and `## Do NOT touch`.
- `artifacts/mockup-sandbox/src/components/layout/DemoBanner.tsx` — the whole file (about 114 lines). It is the demo banner at the top of every page in demo mode. It already holds a department switcher (a native `<select>`), a "Reset demo" button and a sound mute button, laid out as a two-column grid on mobile and a wrapping flex row from `sm`.
- `artifacts/mockup-sandbox/src/lib/demoSession.ts` — exports `startDemoSession(role, options?)`, `DemoRole`, `DEMO_SESSION_CHANGED_EVENT`, `requestDemoMovieReplay()` and `demoPortalHome(role)`. Read-only.
- `artifacts/mockup-sandbox/src/lib/session.ts` (`getCurrentUser`, `isDemoMode`) and `lib/demoSounds.ts` (`playDemoSound`). Read-only.
- `artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx` — read-only, only to see how `DemoBanner` is rendered (it takes no props) and that `wouter`'s `useLocation` is the router.

## Context
The demo now plays an automatic walkthrough (the "movie"). After it ends, or when the visitor leaves it, they explore freely. In free play the banner must let them switch between the Resident, Faculty and HOD views, and replay the movie.

## Build
- [ ] **1. `DemoBanner.tsx` — add a role switcher.**
  - A native `<select>` (same look and size conventions as the existing department `<select>`: `h-11`, same border and text classes, so the touch target is at least 44 px) labelled for screen readers "Demo role", with three options: `Resident`, `Faculty`, `HOD`. Its value reflects the current signed-in demo user: `getCurrentUser()?.role` of `"student"` is Resident, `"professor"` is Faculty, `"hod"` is HOD. Keep the displayed value in sync when the role changes by any means (re-read it when `DEMO_SESSION_CHANGED_EVENT` fires on `window`, and clean the listener up).
  - On change: `playDemoSound("click")`, call `startDemoSession(role, { skipLoginSummary: true })` with the matching `DemoRole` (`"student"`, `"faculty"`, `"hod"`), then navigate to that portal's home with `setLocation(demoPortalHome(role))` using `useLocation` from `wouter` (`const [, setLocation] = useLocation();`). No page reload.
- [ ] **2. `DemoBanner.tsx` — add a "Replay demo" button.** A button in the same style as the existing "Reset demo" button (outline, `h-11`, small text, an icon from `lucide-react` such as `Play`), text `Replay demo`, `type="button"`. On click: `playDemoSound("click")` then `requestDemoMovieReplay()`. Nothing else.
- [ ] **3. Layout.** Fit the two new controls into the existing layout without breaking it. At 375 px wide there must be no horizontal overflow and every control keeps a touch target of at least 44 px; wrap the controls onto an extra row if needed. From the `sm` breakpoint up they may sit in the existing wrapping row. Keep the existing explanatory sentence ("Demo — sample data. Nothing here is a real patient or resident."), the department switcher, "Reset demo" and the sound toggle exactly as they are in behaviour and wording. If you must change a grid or order class to make room, change only what is needed.
- [ ] **4. Real mode.** `DemoBanner` already returns `null` when `isDemoMode()` is false. Keep that as it is, and make sure the new hooks (`useLocation`, any new `useState` / `useEffect`) are called **before** the early `return null` so the rules of hooks hold (the existing code already calls its hooks before the `isDemoMode()` check; follow that).
- [ ] **5. `HANDOFF.md` — append** a `## Dispatch 88` section: what changed in `DemoBanner.tsx` with line numbers, how the layout behaves at 375 px, anything skipped, expanded or noticed. State plainly that you ran no commands (no shell access).

## Do NOT touch
- Every file except `artifacts/mockup-sandbox/src/components/layout/DemoBanner.tsx` and `HANDOFF.md`. In particular `lib/demoSession.ts`, `AppLayout.tsx`, `App.tsx`, `demo-movie/*`, `lib/apiClient.ts`, `lib/demoData.ts`, `lib/demoDepartments.ts`, `lib/session.ts`, `lib/demoSounds.ts`.
- The existing behaviour of the department switcher, "Reset demo", and the sound toggle, and the exported constant `DEMO_TOUR_SEEN_STORAGE_PREFIX`.
- Anything under `artifacts/api-server/`, `lib/db/`, any `.env*` file, `package.json` or a lockfile. No new dependency.
- Reformatting, renaming, comment edits or tidying of anything you were not told to change. Previous Gemini runs on this task made collateral edits (a deleted comment, a changed colour class); edit only what this prompt names.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any change that would alter non-demo behaviour.
- Any new copy that would need clinical, diagnostic or regulatory wording (`AGENTS.md` §7). The only new visible copy is "Resident", "Faculty", "HOD", "Demo role" (screen-reader label) and "Replay demo".
- Any need to edit another file.
- Any value you would otherwise guess or invent.

## Report
`HANDOFF.md` is the report (Build item 5). A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)`. Substitution recorded: `Claude Sonnet 4.6 (Thinking)` is quota-blocked (429 `RESOURCE_EXHAUSTED`, reset about 18h from 17:29 UTC on 2026-10-01), so per the standing rule this runs on Gemini directly. A lower-tier model writes this change, so `code-review` runs the full lens set and Claude Code re-verifies the diffs itself.
