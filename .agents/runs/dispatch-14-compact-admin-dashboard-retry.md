# Antigravity dispatch 14 — compact admin dashboard layout (retry of dispatch 13)

## Guard
This prompt is for the project `Electronic-LogBook-main`, task file `CURRENT_TASK.md`
at the repo root (Item 1 of that file), dated 2026-09-14. If this is not that repo,
stop, say which repo this is, and wait.

## Sandbox constraint — overrides AGENTS.md §1 for this dispatch only
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents).

`AGENTS.md` §1 tells every agent task to begin with `git status` / `git pull` / `git log`.
**Do not follow that instruction in this dispatch.** The developer's own session already
completed that pull-before-task step before this prompt was sent, and your execution
environment has no shell access at all — attempting any of those commands will be denied
and you will have nothing left to fall back on. Skip §1 entirely and start directly at
"Build" below using only file-reading and file-editing tools. This is not a suggestion to
prefer file tools; it is the only way to complete this task, since a denied shell call ends
the task with zero progress instead of recovering.

## Read first
- `AGENTS.md` §3 (ownership), §7 (no fabricated data), §9 (one feature per diff) — skip §1,
  it does not apply to this dispatch (see Sandbox constraint above)
- `CURRENT_TASK.md` — the confirmed scope (this dispatch covers Item 1 only)

## Build
- [ ] `artifacts/mockup-sandbox/src/components/AdminPortal.tsx` — reduce heading/body font
  sizes and tighten padding/margin/gap on: the four top stat cards (Departments / Faculty /
  Residents / Awaiting HOD approval), the department list cards (~lines 335-367), and the
  `DepartmentDetail` panel (~line 394 onward), so more content is visible on screen without
  scrolling at normal browser zoom. This is a visual density pass on existing Tailwind
  classes only.

## Do NOT touch
- Any file other than `artifacts/mockup-sandbox/src/components/AdminPortal.tsx`
- No new components, no layout restructuring (e.g. do not change the grid/flex structure
  that determines what is a card vs. a panel — only its sizing/spacing/type-scale classes)
- No behavior change: no new props, no new state, no changed event handlers, no changed
  data fetching
- Any shell command whatsoever, including anything AGENTS.md §1 describes (restates the
  Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any change to a code path enforcing the §3/§4 ownership boundary
- Any migration, backfill, deploy, or other irreversible step
- Any value you would otherwise guess or invent
- If achieving a meaningfully more compact layout seems to require touching a shared
  layout/theme file outside `AdminPortal.tsx`, stop and report that instead of touching it

## Report
Write `HANDOFF.md` at the repo root:
- What changed, per section (stat cards / department cards / detail panel), with a short
  before/after description of the class changes (e.g. font-size and padding/gap values)
- Anything you skipped, and why (including any step you could not do because it would have
  required a shell command)
- Anything you expanded beyond the Build list, and why

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.

## Model
Claude Sonnet 4.6 (Thinking) — per this task's review tier (ordinary UI work, non-clinical,
no ownership or schema change).
