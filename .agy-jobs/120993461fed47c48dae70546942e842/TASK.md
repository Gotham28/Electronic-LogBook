# Antigravity dispatch 82 — HOD Requirements layout: HANDOFF.md update only

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo `Gotham28/Electronic-LogBook`), working branch `feat/hod-requirements-layout`. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

Two previous jobs stopped because the agent ran a PowerShell `Select-String` to look up a line number. Every line number you need is written in the instruction file below. To confirm one, view the file with the file viewer. Never a shell command.

## Your instructions
The complete, authoritative prompt is the file `.agents/runs/dispatch-82-hod-requirements-layout-round2-handoff.md` at the repository root. View it first, in full, and follow it exactly: `## Read first`, `## Build` (six edits), `## Do NOT touch`, `## Hard stops` and `## Report` all bind you as if written here. Summary only:

- Edit ONLY `HANDOFF.md`. Never edit `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx` (its code edits are finished and verified).
- Edits: class (c) heading; Commands run; five `Delete {name}` aria-label bullets under class (a); a "Dispatch 81 (code-review round 2)" section for M1 and M2; shift every other line cite as the file describes; Verification section note.
- No shell command whatsoever. Do not run `git commit` or `git push`. Do not open a pull request.

## Files you may touch
- HANDOFF.md