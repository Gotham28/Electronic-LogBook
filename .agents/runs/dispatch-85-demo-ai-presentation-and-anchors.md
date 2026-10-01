# Antigravity dispatch 85 — Demo auto-movie: AI presentation (typed reveal, sample label, demo commands) and data-tour anchors

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-01,
working branch `feat/demo-auto-movie` (already checked out, from `main` at `fca9553`), with dispatches 83 and 84
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
- `AGENTS.md` (repository root) — §5, §7, §8, §9.
- `CURRENT_TASK.md` (repository root) — `## Feature`, `## Facts established during planning`, `## Execution-session findings and developer rulings`, `## Progress log`, `## Scene script`, `## Files/areas in scope`, `## Explicitly out of scope`, `## Do NOT touch`.
- `HANDOFF.md` (repository root) — `## Dispatch 83` and `## Dispatch 84`. You append a section.
- `artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx` — the whole file (about 305 lines). Its request handlers are `handleAsk`, `handleProgressCoach` and `handleDepartmentReport`.
- `artifacts/mockup-sandbox/src/components/QuarterlyAppraisalSection.tsx` — the whole file (about 351 lines). `handleDraftWithArogya` is near line 138.
- `artifacts/mockup-sandbox/src/components/DemoMotion.tsx` — `useDemoMotionEnabled` and friends. `artifacts/mockup-sandbox/src/lib/session.ts` — `isDemoMode()`. Read-only.
- The pages that need anchors: `artifacts/mockup-sandbox/src/components/Dashboard.tsx`, `components/pages/CaseLogsPage.tsx`, `components/ProfessorPortal.tsx`, `components/HODPortal.tsx`, `components/DepartmentSettings.tsx` (the HOD Requirements tab).
- Existing code uses `data-tour-id` attributes for `GuidedTour.tsx` (in `AppLayout.tsx`). That is a different feature. **Do not touch `GuidedTour.tsx`, and do not edit or reuse any `data-tour-id` attribute.** The new attributes in this dispatch are named `data-tour` (no `-id`).

## Context in one paragraph
The demo is getting an automatic animated walkthrough (the "movie"), built in a later dispatch. It needs: (1) AI answers in demo mode to appear as if typed or streamed, labelled as sample output; (2) a way for the movie to drive the Arogya panel and the appraisal draft from outside; (3) stable `data-tour` anchors on the elements it will spotlight. This dispatch builds those three things. It does **not** build the movie itself, and it does not touch `AppLayout.tsx`, `App.tsx` or `DemoBanner.tsx`.

## The hard rule for this dispatch
**Real (non-demo) behaviour must stay byte-for-byte unchanged.** Every new behaviour is gated on `isDemoMode()` from `@/lib/session`. Write each change so that, when `isDemoMode()` is false, the existing JSX, state transitions, request calls and error handling run exactly as they do today (for example `isDemoMode() ? <new demo rendering/> : <the existing JSX, untouched>`, or an effect that returns immediately when not in demo mode). The new `data-tour` attributes are plain attributes and are allowed in all modes.

## Build
- [ ] **1. New file `artifacts/mockup-sandbox/src/components/demo-movie/movieBridge.ts`.** A tiny, dependency-free module that lets the movie send commands to components through `window` custom events:
  - `export const ARO_DEMO_COMMAND_EVENT = "arogya-demo-command";`
  - `export type AroDemoCommand = { type: "ask"; question: string } | { type: "progress-coach" } | { type: "department-report"; reportType: "report" | "falling_behind" } | { type: "appraisal-prefill-and-draft" };`
  - `export function sendAroDemoCommand(command: AroDemoCommand): void` — dispatches a `CustomEvent(ARO_DEMO_COMMAND_EVENT, { detail: command })` on `window`.
  - No other exports. No `console.*`.
- [ ] **2. New file `artifacts/mockup-sandbox/src/components/demo-movie/DemoTypedText.tsx`.** A small React component `DemoTypedText({ text, onDone, className })` that reveals `text` progressively (word by word, about 35 ms per word, using `setTimeout`/`requestAnimationFrame` cleaned up on unmount) and calls `onDone` once when finished. When `useDemoMotionEnabled()` (see `DemoMotion.tsx`) says motion is off (reduced motion), it renders the full text immediately and calls `onDone` right away. It must keep the final text readable by screen readers (the full text exposed via `aria-label` or a visually hidden copy, with the animated copy `aria-hidden`). Also export a hook `useDemoTypedValue(text, enabled)` returning the revealed string and a `done` boolean, if you need it for the appraisal textarea (item 4); keep both small.
- [ ] **3. `ArogyaPanel.tsx` — demo-only presentation and commands.**
  - **Typed reveal.** In demo mode, an Arogya text reply and the coach tips are revealed with `DemoTypedText` instead of appearing at once. Keep the character in its `"talking"` state while the reveal runs and let it return to whatever state it returns to today once the reveal is done (read how the panel resets `characterState` today and keep that rule; in demo mode, do not leave it stuck in `"talking"`).
  - **Label.** In demo mode only, show a small, quiet label reading exactly `Sample AI output` under each Arogya reply or tips block (not under error messages and not under the user's own messages).
  - **Commands.** In demo mode only, add an effect that listens for `ARO_DEMO_COMMAND_EVENT` on `window` and removes the listener on cleanup:
    - `ask`: types `command.question` into the question input one character at a time (about 30 ms per character; instantly if motion is off), then submits it through the **same** `handleAsk` path a user would use (do not duplicate the request logic).
    - `progress-coach`: calls the same code path as the progress-coach button.
    - `department-report`: calls the same path as the department-report buttons, with `command.reportType`.
    - It ignores commands that do not apply to the current role (for example `department-report` when the panel is showing a role that has no report buttons) without throwing.
    - It must not touch anything when `isDemoMode()` is false (the effect returns immediately).
  - **Anchors** (plain attributes): `data-tour="arogya-launcher"` on the button that opens the panel, `data-tour="arogya-panel"` on the panel's content root, `data-tour="arogya-input"` on the question input (or its form), `data-tour="arogya-messages"` on the message list, `data-tour="arogya-coach"` on the progress-coach button and `data-tour="arogya-report"` on the department-report button (if a role shows two report buttons, put it on the first, `report`). Put an anchor only on an element that already exists; if one of these does not exist, skip it and say so in `HANDOFF.md`.
- [ ] **4. `QuarterlyAppraisalSection.tsx` — demo-only presentation and command.**
  - The existing `handleDraftWithArogya` requires every field (student, quarter, year, date, publication status and all 10 scores) before it will draft. For the movie, add, **in demo mode only**, a listener for `ARO_DEMO_COMMAND_EVENT` with `appraisal-prefill-and-draft`: it fills the form with sample values using the form's own setters, then runs the same draft path (`handleDraftWithArogya`). Choose values only from what the form already allows: the first student in its own student list, the quarter and year the form already defaults to or offers, today's date, the first allowed publication-status option, and a mid-range score for each of the 10 scores taken from the form's own allowed score range. Do not invent options. List the exact values you chose, and where they came from, in `HANDOFF.md`. If the form has no student list loaded yet when the command arrives, wait for it (poll briefly, at most about 3 seconds) and then give up quietly.
  - **Typed reveal.** In demo mode, when the draft result arrives, reveal `facultyRemarks` and `remediationSuggestions` into their fields progressively (use `DemoTypedText`'s hook, or an equivalent small piece of state) instead of setting them at once. The fields must end up holding the full text as normal editable values. In non-demo mode, `setFacultyRemarks(result.facultyRemarks ?? "")` and `setRemediationSuggestions(...)` stay exactly as today.
  - **Label.** In demo mode only, show the label `Sample AI output` next to the draft result area (once a draft has been produced).
  - **Anchors:** `data-tour="appraisal-draft"` on the "Draft with Arogya" button, `data-tour="appraisal-remarks"` on the faculty-remarks field (or its wrapper).
- [ ] **5. Anchors only (attributes only, no other change) in:**
  - `Dashboard.tsx`: `data-tour="dashboard-progress"` on the block that shows the resident's progress counters/percentages.
  - `components/pages/CaseLogsPage.tsx`: `data-tour="caselog-add"` on the button or control that starts a new case entry, and `data-tour="caselog-list"` on the list or table of case logs.
  - `ProfessorPortal.tsx`: `data-tour="review-queue"` on the review queue list, `data-tour="review-first-item"` on the first queue row, and `data-tour="review-approve"` on the approve action of that first row (if the approve control is inside a dialog or a different component, put the attribute where it is and tell me in `HANDOFF.md`). If the review queue and the appraisal section live in different components or routes, record **each route** in `HANDOFF.md` (the movie needs the faculty route for the queue and the route where `QuarterlyAppraisalSection` is shown).
  - `HODPortal.tsx`: `data-tour="hod-overview"` on the department overview stats region. **Attributes only. Do not change any fetch, error state, fallback or number rendering in this file** (`AGENTS.md` §7; this file has regressed on that before).
  - `DepartmentSettings.tsx` (the HOD Requirements tab): `data-tour="hod-requirements"` on the root element of the tab. Attribute only.
  - For each anchor, make sure it is on an element that exists in demo mode for the right role. If an element is not rendered in some state, keep it where it is and note the condition in `HANDOFF.md`.
- [ ] **6. `HANDOFF.md` — append** a `## Dispatch 85` section: per file, what changed with line numbers; the full anchor table (anchor name, file, line, which route/role shows it); the exact sample values chosen in item 4 and where each came from; the route of every page that carries an anchor; how the typed reveal and character state interact; anything skipped, expanded, or noticed. State plainly that you ran no commands (no shell access).

## Do NOT touch
- `artifacts/mockup-sandbox/src/lib/apiClient.ts`, `artifacts/mockup-sandbox/src/lib/demoData.ts`, `lib/demoSession.ts`, `lib/demoDepartments.ts`, `lib/session.ts`.
- `AppLayout.tsx`, `App.tsx`, `DemoBanner.tsx`, `MobileBottomNav.tsx`, `GuidedTour.tsx`, `LegalDisclaimerModal.tsx`, `LoginPage.tsx`.
- Any `data-tour-id` attribute.
- In `HODPortal.tsx` and `DepartmentSettings.tsx`: everything except the single attribute named above.
- Any request path, request body, error message, validation rule, or state transition of the **non-demo** code in `ArogyaPanel.tsx` and `QuarterlyAppraisalSection.tsx`.
- Anything under `artifacts/api-server/`, `lib/db/`, any `.env*` file, `package.json` or a lockfile. No new dependency (`framer-motion` is already installed if you want it, but plain React is enough).
- Reformatting, renaming or tidying anything you were not told to change.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any change that would alter non-demo behaviour of any file.
- Any text that would need clinical, diagnostic or MCI/NMC requirement wording, or any number not in the demo data. Never invent it (`AGENTS.md` §7).
- Any need to edit a file outside the allowed list (`ArogyaPanel.tsx`, `QuarterlyAppraisalSection.tsx`, `Dashboard.tsx`, `CaseLogsPage.tsx`, `ProfessorPortal.tsx`, `HODPortal.tsx`, `DepartmentSettings.tsx`, the two new `demo-movie/` files, `HANDOFF.md`).
- Any new dependency, env file edit, server route or `apiClient.ts` change.
- Any value you would otherwise guess or invent. If an item in Build cannot be done as written, do the rest, and say exactly which item and why in `HANDOFF.md`.

## Report
`HANDOFF.md` is the report (Build item 6). A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)`. Substitution recorded: `Claude Sonnet 4.6 (Thinking)` is quota-blocked (429 `RESOURCE_EXHAUSTED`, reset about 18h from 17:29 UTC on 2026-10-01), so per the standing rule this runs on Gemini directly. A lower-tier model writes this change, so `code-review` runs the full lens set and Claude Code re-verifies the diffs itself.
