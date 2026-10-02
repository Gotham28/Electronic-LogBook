# Antigravity dispatch 91 — Demo auto-movie: mobile caption inset, and the final HANDOFF.md summary

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated 2026-10-01,
working branch `feat/demo-auto-movie` (already checked out, from `main` at `fca9553`), with dispatches 83-90
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
- `AGENTS.md` (repository root) — §7, §9, §11, §12 (what a report must contain).
- `CURRENT_TASK.md` (repository root) — `## Feature`, `## Developer decisions`, `## Execution-session findings and developer rulings`, `## Flags`.
- `.agents/runs/evidence-demo-auto-movie.md` — the evidence Claude Code collected by running the code. **Read-only. Copy from it; do not invent or reword numbers.**
- `HANDOFF.md` (repository root) — the whole file. It currently holds one section per dispatch (`## Dispatch 83` … `## Dispatch 90`). You add a new section near the top.
- `artifacts/mockup-sandbox/src/components/demo-movie/DemoMovie.tsx` — the caption element near the end of the file (the `motion.div` with `role="status"`).

## Build
- [ ] **1. `DemoMovie.tsx` — keep the caption off the Arogya launcher on phones.** On a 375 px screen the caption (`left-2 right-2 bottom-[calc(76px+env(safe-area-inset-bottom))]`) is 344 px wide and covers the floating Arogya launcher button (it sits at about x 287-343, y 679-735). In that one `className` string, change `right-2` to `right-[80px]` and add `sm:right-auto` after it (the `sm:` classes that already centre the caption on larger screens stay as they are; check that `sm:right-auto` is not already there). Nothing else in this file changes.
- [ ] **2. `HANDOFF.md` — add a final summary section.** Insert it directly under the title block (`# Handoff Report: Demo auto-movie`, `Base commit`, `Working branch`) and **above** `## Dispatch 83`. **Do not edit any text inside the existing `## Dispatch NN` sections.** The new content:
  - `## Final state` — a short summary paragraph (what the feature is: one Show demo button replaces the three portal buttons and the PIN gate; an automatic ~90 s movie across Resident, Faculty and HOD with the four Arogya AI features; end card with Replay and Explore; frontend and demo mode only) and a table of every file created or modified with a one-line purpose each. The file list is in `.agents/runs/evidence-demo-auto-movie.md` (the diff stat and the new-files list). Add the files that dispatch 91 touches. Add one line stating that the scene script is in `components/demo-movie/scenes.ts` (nine scenes, about 88 s of scene time).
  - `## Rules and flags (AGENTS.md)` — a short list: §9 two features in one task, by the developer's decision on 2026-10-01; §7 no clinical or regulatory wording, canned AI text is built from demo counts and percentages only, `HODPortal.tsx` has one attribute added and no fetch, error or fallback change; §8 nothing logged; §10 no env file touched and `VITE_DEMO_*_PIN` usage removed from code only; §3/§4 not triggered (client-only demo, no server or ownership change); scope amendments approved by the developer: the `App.tsx` listener, and the demo mock for `GET /api/appraisals/students` (needed so the appraisal form renders in the demo; found during the browser run). Say that the code was written by `Gemini 3.1 Pro (High)` because `Claude Sonnet 4.6 (Thinking)` was quota-blocked, and that Claude Code re-verified every dispatch.
  - `## Verification evidence` — copy the sections "Static checks", "Browser runs" and "Defects found by these runs…" from `.agents/runs/evidence-demo-auto-movie.md` **verbatim** (same commands, same outputs, same numbers). State at the top that the evidence was collected by Claude Code, not by Antigravity.
  - `## Known limitations and follow-ups` — copy the list "Things Claude Code noticed and did not fix" from the same file, verbatim, and add: the Manual checklist items in `CURRENT_TASK.md` are still the developer's (a real phone, a projector-sized screen, removing `VITE_DEMO_FACULTY_PIN` / `VITE_DEMO_HOD_PIN` from the hosting environment by hand).
  - `## Dispatch history` — a heading placed directly above `## Dispatch 83`, with one sentence under it: "Per-dispatch notes follow, as written by each dispatch. Where the final code differs from an earlier note, the Final state section above is correct; the later dispatch sections record the corrections."
  - State plainly under `## Verification evidence` that Antigravity ran no commands (no shell access).
- [ ] **3. Do not add** anything not described above, and do not shorten or re-order the existing dispatch sections.

## Do NOT touch
- Every file except `artifacts/mockup-sandbox/src/components/demo-movie/DemoMovie.tsx` (one class string) and `HANDOFF.md` (insert only). In particular `.agents/runs/evidence-demo-auto-movie.md` (read-only) and every other source file.
- Any text inside the existing `## Dispatch NN` sections of `HANDOFF.md`.
- Anything under `artifacts/api-server/`, `lib/db/`, any `.env*` file, `package.json` or a lockfile. No new dependency.
- Reformatting, renaming, comment edits or tidying of anything you were not told to change.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any number, command output or claim you cannot find in the evidence file or the repository. Leave it out rather than write it (`AGENTS.md` §7, §11).
- Any need to edit another file.
- Any value you would otherwise guess or invent.

## Report
`HANDOFF.md` is the report. A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)`. Substitution recorded: `Claude Sonnet 4.6 (Thinking)` was quota-blocked (429 `RESOURCE_EXHAUSTED`) on 2026-10-01 with a reset about 18h42m later, so per the standing rule this runs on Gemini directly. A lower-tier model writes this change, so `code-review` runs the full lens set and Claude Code re-verifies the diffs itself.


## Files you may touch
- HANDOFF.md
- artifacts/mockup-sandbox/src/components/demo-movie/DemoMovie.tsx