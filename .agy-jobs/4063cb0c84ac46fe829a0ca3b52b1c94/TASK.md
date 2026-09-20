# Antigravity dispatch 43 — Fix HODPortal.tsx pending-approvals fallback-to-zero bug

## Guard
This prompt is for the project at Electronic-LogBook (Gotham28/Electronic-LogBook), task file `CURRENT_TASK.md` (repo root — this repo keeps `CURRENT_TASK.md` and `AGENTS.md` at the repo root, not under `.agents/`) dated 2026-09-18. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Read first
- `AGENTS.md` (repo root) — §3 Ownership before data, §4 the two ID systems, §7 No fabricated content/data, §9 One feature per task
- `CURRENT_TASK.md` (repo root) — the confirmed scope

## Build
- [ ] In `artifacts/mockup-sandbox/src/components/HODPortal.tsx`, change the "Awaiting approval" `SummaryCard` (currently at line 456: `<SummaryCard label="Awaiting approval" value={pendingStudents.length} />`) so that when `studentsError` is set (non-null), it shows a visible error indicator instead of silently rendering the count. Mirror the visual language already used for `studentsError` at this same file's lines 649-651 (`<p className="p-6 text-center text-sm text-red-500 font-medium">{studentsError}</p>`) and for `rosterError`/`analyticsError` elsewhere in this same file — do not invent a new visual style or new error copy; reuse the existing tone (e.g. "Could not load pending students" at line 156).

## Do NOT touch
- Any route or query in `artifacts/api-server` — this is a frontend-only display fix; the underlying `/api/admin/students/pending` endpoint and its authorization are correct and out of scope.
- Any ownership/authorization logic, clinical tables, or the two ID systems (AGENTS.md §3/§4) — not implicated by this change and must stay that way.
- The `roster`/`rosterError`/`leavesError`/`analyticsError` code paths in the same file — working correctly today; do not refactor them while touching this file, even if the pattern looks reusable.
- The initial-mount render race in the roster tab, a "server is waking up" notice for slow requests, and moving the in-memory rate-limit counters to a persistent store — all three are separate, already-identified follow-up items, explicitly not part of this task.
- Any other fetch/card in HODPortal.tsx not named under Build above.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler).
- Anything not named under Build above.

## Hard stops — stop and report, do not decide
- Any change to a route or query touching the clinical tables, or to anything resolving ownership server-side (AGENTS.md §3).
- Any place `studentsTable.id` and `usersTable.id` could be conflated (AGENTS.md §4).
- Any schema change, migration, or backfill (AGENTS.md §6).
- Anything that puts patient text or leave reasons near a log, error, or audit trail (AGENTS.md §8).
- Any secret, credential, or `.env` value (AGENTS.md §10, §13).
- The task turning out to be more than one feature (AGENTS.md §9).
- Any value you would otherwise guess or invent — including exactly how to phrase the error message; reuse existing copy/tone from this file (e.g. "Could not load pending students" at line 156) rather than inventing new wording.

## Report
Write `HANDOFF.md` at the repo root:
- What changed, per file, and why
- Anything you skipped, and why
- Anything you expanded beyond the Build list, and why

Do not attempt to run a typecheck, linter, or any other command — that verification happens
outside this dispatch, in Claude Code, after you finish. A claim without file:line evidence
is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
Claude Sonnet 4.6 (Thinking)


## Files you may touch
- artifacts/mockup-sandbox/src/components/HODPortal.tsx
- HANDOFF.md