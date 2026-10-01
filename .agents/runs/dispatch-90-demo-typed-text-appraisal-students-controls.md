# Antigravity dispatch 90 — Demo auto-movie: typed-text bug, appraisal student list for the demo, controls layout

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-01,
working branch `feat/demo-auto-movie` (already checked out, from `main` at `fca9553`), with dispatches 83-89
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
- `AGENTS.md` (repository root) — §5, §7, §8, §9.
- `HANDOFF.md` (repository root) — you append a section.
- `artifacts/mockup-sandbox/src/components/demo-movie/DemoTypedText.tsx` — the whole file (about 62 lines).
- `artifacts/mockup-sandbox/src/lib/demoData.ts` — the whole file. `handleDemoRequest` has a `GET` block whose last line is a safe fallback `return [];`.
- `artifacts/mockup-sandbox/src/components/QuarterlyAppraisalSection.tsx` — read-only. See `loadStudents` (about line 118: `apiGet("/api/appraisals/students")`, result must be an array), `loadAppraisals` (about line 138: `apiGet(\`/api/appraisals/students/${id}\`)`), and the student type and fields the component reads from each student (search for the `students` state type, `student.id`, `student.name`, `student.registrationNumber`).
- `artifacts/mockup-sandbox/src/lib/quarterly-appraisal.ts` — read-only, for the student and appraisal types.
- `artifacts/mockup-sandbox/src/components/demo-movie/MovieControls.tsx` — the whole file.

## What Claude Code found by running the movie in a real browser
1. **Typed text shows a wrong word and "undefined" (visible bug).** In `useDemoTypedValue`, `revealNextWord` calls `setRevealedText((prev) => prev ? prev + " " + words[currentIndex] : words[currentIndex])` and then `currentIndex++`. React runs the updater function later, after `currentIndex` has already been incremented, so each step appends the *next* word, one word is skipped, and the last step appends `undefined`. Seen on screen: "…Keep up the good work! undefined", "The currently has 3 active residents…" (the word "department" is missing), "1. You at 77% overall completion…" (the word "are" is missing).
2. **The "Draft with Arogya" scene cannot work in the demo.** `QuarterlyAppraisalSection` loads its student list from `GET /api/appraisals/students`. The demo has no handler for that path, so `handleDemoRequest` returns the fallback `[]`, and the section shows "No approved students are currently assigned to you for appraisal." instead of the form. The form, and with it the `appraisal-draft` and `appraisal-remarks` anchors, never exist, so the Faculty appraisal scene (one of the four AI highlights) has nothing to show.
3. **The movie's progress bar covers content.** It is a centred, 800 px wide pill at the top of the screen. It covers the title of the new-case dialog and the tab row of the review page.

## Build
- [ ] **1. `DemoTypedText.tsx` — fix the reveal.** Rewrite the reveal so the displayed text is derived from an index that is captured before it can change. For example, keep `words = text.split(" ")` and a local `count` and call `setRevealedText(words.slice(0, count).join(" "))` with the new count, then increment the counter in the next scheduled step. The revealed string after the last step must equal the original `text` exactly (same spacing; compare `words.join(" ")` with `text`). Keep the exports (`useDemoTypedValue`, `DemoTypedText`), the signatures, the ~35 ms per word pace, the reduced-motion behaviour (the full text immediately), the `done` flag, the cleanup of the timeout and animation frame, and the screen-reader copy. Nothing else changes.
- [ ] **2. `demoData.ts` — demo handlers for the appraisal student list.** In the `GET` block of `handleDemoRequest`, before the final fallback, add:
  - `GET` of a path that ends with `/api/appraisals/students` (exact, no id): return an array of the students the appraisal form can pick, built from the active department's `demoData.students`, including only approved students if the data has a status (the demo seed marks them `approved`). Each item has exactly the fields `QuarterlyAppraisalSection` reads from a student (at least `id`, `name`, `registrationNumber`; check the component's type and use the same property names). Use the same name and registration-number source the rest of the demo data uses (for a student object, `student.fullName ?? student.name` and `student.registrationNumber`).
  - `GET` of `/api/appraisals/students/<id>`: return `[]` (no earlier appraisals), in whatever top-level shape `loadAppraisals` expects (if it expects an array, return `[]`).
  - Make sure these new matches cannot be caught by any earlier branch and do not catch any other path: match them with anchored regular expressions (for example `/\/api\/appraisals\/students$/` and `/\/api\/appraisals\/students\/\d+$/`) and place them where no earlier `path.includes(...)` check (for example the `/roster`, `/config`, `/analytics` ones) can swallow them first; if one could, put the new branches above it.
  - Do **not** add a handler for saving an appraisal, and do not change any existing branch. Do not hardcode a department or a student name. No `console.*`, no logging (`AGENTS.md` §8).
- [ ] **3. `MovieControls.tsx` — layout.** (a) On screens from the `sm` breakpoint up, place the control group at the **top left** of the screen (`left-4 top-3`) instead of centred, as one row: the dark pill (chapter bars and labels, about 360 px wide) followed by the Skip button, so Skip sits right next to the progress. Below `sm`, the group spans the full width with 16 px gutters (pill takes the remaining width, Skip keeps its 44 px touch target) and respects `env(safe-area-inset-top)`. (b) Add one small line at the top of the pill, reading exactly `Demo — sample data` (10-11 px, white at about 80 % opacity), so the sample-data notice stays visible while the movie covers the page banner. No other new copy. Keep `data-testid="demo-movie-skip"`, the accessible name `Skip demo`, the chapter share logic, the fill logic and the `pointer-events-auto` on the group.
- [ ] **4. `HANDOFF.md` — append** a `## Dispatch 90` section: each change with file and line numbers; for item 2 the exact shape returned and which demo-data fields feed it; anything skipped, expanded or noticed. State plainly that you ran no commands (no shell access).

## Do NOT touch
- Every file except `demo-movie/DemoTypedText.tsx`, `lib/demoData.ts`, `demo-movie/MovieControls.tsx` and `HANDOFF.md`. In particular `QuarterlyAppraisalSection.tsx`, `ArogyaPanel.tsx`, `DemoMovie.tsx`, `scenes.ts`, `EndCard.tsx`, `lib/demoDepartments.ts`, `lib/demoSession.ts`, `lib/apiClient.ts`.
- Any existing branch of `handleDemoRequest` and any existing export of `demoData.ts` (including `DEMO_MOVIE_ASK_QUESTION`).
- Anything under `artifacts/api-server/`, `lib/db/`, any `.env*` file, `package.json` or a lockfile. No new dependency.
- Reformatting, renaming, comment edits or tidying of anything you were not told to change. Previous Gemini runs on this task made collateral edits; edit only what this prompt names.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any wording or number that is not in the demo data, or that would need clinical or regulatory wording (`AGENTS.md` §7). Never invent it.
- Any patient text, UHID, complaint, diagnosis or leave reason in anything you add (`AGENTS.md` §8). The student list has only an id, a name and a registration number.
- Any need to edit another file, or to change real (non-demo) behaviour.
- Any value you would otherwise guess or invent.

## Report
`HANDOFF.md` is the report (Build item 4). A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)`. Substitution recorded: `Claude Sonnet 4.6 (Thinking)` was quota-blocked (429 `RESOURCE_EXHAUSTED`) on 2026-10-01 with a reset about 18h42m later, so per the standing rule this runs on Gemini directly. A lower-tier model writes this change, so `code-review` runs the full lens set and Claude Code re-verifies the diffs itself.
