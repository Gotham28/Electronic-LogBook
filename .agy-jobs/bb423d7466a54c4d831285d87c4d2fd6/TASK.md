# Antigravity dispatch 44 — Fix HODPortal.tsx transient studentsError reset on unrelated retry

## Guard
This prompt is for the project at Electronic-LogBook (Gotham28/Electronic-LogBook), task file `CURRENT_TASK.md` (repo root, not `.agents/`) dated 2026-09-19. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint — read this before reading AGENTS.md
AGENTS.md §1 tells a *human developer* to run a git pull-and-status ritual before starting
work. That instruction is not for you. You do not have shell access in this sandbox, and
attempting it will be denied and will end this task with zero progress, exactly as it has
on the last two attempts at this exact task. Do not call `run_command`, or any shell tool,
at all, for any reason, at any point in this task — not `git status`, not the AGENTS.md §1
pull ritual, nothing. If you are tempted to run one, don't; use file-reading tools instead
(view a file, list a directory, search file contents). Do the entire task using only
file-reading and file-editing tools. The developer (not you) already confirmed the repo is
up to date before this dispatch was sent — that step is done and is not part of your task.

## Read first
- `CURRENT_TASK.md` (repo root) — the confirmed scope
- `AGENTS.md` (repo root) §7 and §9 only, for context on why this fix matters — skip §1, it is a human-only instruction and does not apply to you, per the sandbox constraint above

## Build
- [ ] In `artifacts/mockup-sandbox/src/components/HODPortal.tsx`, inside the `fetchData` function: remove the line `setStudentsError(null);` from the eager reset block at the top of the function (currently alongside `setError(null); setAnalyticsError(null); setLeavesError(null);`). Add `setStudentsError(null);` instead immediately after the line `setPendingStudents(students);` succeeds, inside the existing `try` block for the pending-students fetch. Do not change the existing `catch` block that sets `setStudentsError("Could not load pending students")` — leave it exactly as is. Do not touch `setAnalyticsError(null);` or `setLeavesError(null);` in the eager reset block — those stay exactly where they are.

## Do NOT touch
- `setAnalyticsError(null);` and `setLeavesError(null);` in `fetchData`'s reset block — leave both in place, unchanged.
- The "Try again" buttons anywhere in this file.
- The roster tab, `fetchRoster`, `rosterError`, or anything related to the roster's loading/render timing.
- The `SummaryCard` component and its `error` prop (already correct from a prior merged fix) — do not modify it further.
- Any route or query in `artifacts/api-server`.
- Any ownership/authorization logic, clinical tables, or the two ID systems.
- Anything not named under Build above.

## Hard stops — stop and report, do not decide
- Any change to a route or query touching the clinical tables, or to anything resolving ownership server-side (AGENTS.md §3).
- Any place `studentsTable.id` and `usersTable.id` could be conflated (AGENTS.md §4).
- Any schema change, migration, or backfill (AGENTS.md §6).
- Anything that puts patient text or leave reasons near a log, error, or audit trail (AGENTS.md §8).
- Any secret, credential, or `.env` value (AGENTS.md §10, §13).
- The task turning out to be more than one feature (AGENTS.md §9).
- Any value you would otherwise guess or invent.

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