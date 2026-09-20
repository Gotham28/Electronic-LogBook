# Antigravity dispatch 49 — Make Department Requirements card fully view-only

## Guard
This prompt is for the project at Electronic-LogBook (Gotham28/Electronic-LogBook), task file `CURRENT_TASK.md` (repo root). This is a direct follow-up on the still-open PR #49, same branch. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, for any reason, at any point. Do not open,
read, or reference `AGENTS.md` — it does not apply to you. Do not run typecheck or any
other command yourself — that verification happens outside this dispatch, in Claude Code.
Use only file-reading and file-editing tools, only on the one file named below.

## Read first
- `artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx` — the whole file

## Context
This file's "Department requirements" card currently has three read-only computed fields (`requiredCases`/`requiredProcedures`/`requiredAcademic`, rendered via a `computedFields` array) and three still-editable fields (`programDurationMonths`/`casualLeaveAllowance`/`academicLeaveAllowance`, rendered via an `editableFields` array inside a `<form>` with a "Save requirements" submit button that POSTs to `/api/admin/department/config`). The developer wants the whole card to become view-only — no editing of any of the six fields through this screen at all. The backend route itself is untouched and out of scope; only the frontend's editing UI goes away.

`apiPost` is used elsewhere in this same file (the "Add procedure type" and "Training Catalog" forms) — do not remove that import.

## Build
- [ ] Merge the `computedFields` and `editableFields` arrays (currently near the top of the file) into a single array covering all six fields, each with its label (keep the existing "(computed)" suffix only on the three fields that already had it — `requiredCases`/`requiredProcedures`/`requiredAcademic`; the other three keep their plain existing labels, e.g. "Program duration (months)").
- [ ] In the "Department requirements" `<Card>`, remove the `<form>` element, its `onSubmit` handler, and the "Save requirements" `<Button>`. Render all six fields using the exact same read-only pattern already used for the three computed fields (a `<Label>` plus a `<p className="flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">` showing the current value from `data.config`).
- [ ] Remove the now-unused `config`/`setConfig` React state (it was only ever used by the removed form's inputs and submit handler).
- [ ] Do not remove the `apiPost` import — it's still used by other forms in this same file.
- [ ] Do not touch any other `<Card>` in this file (Add procedure type, Training Catalog) or any other file.

## Do NOT touch
- `artifacts/api-server/src/routes/admin.ts`, `validation.ts`, `department-requirements.ts` — no backend changes.
- Any other component in this file.
- Anything not named under Build above.

## Hard stops
- Any backend/API change of any kind.
- Any value you would otherwise guess or invent.

## Report
Write `HANDOFF.md` at the repo root (overwrite the previous one — superseded):
- The exact diff.
- Confirm `apiPost` import is still present and still used elsewhere in the file.

Do not run typecheck or any command. Do not open a pull request. Do not run `git commit`
or `git push`.

## Model
Claude Sonnet 4.6 (Thinking)


## Files you may touch
- artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx
- HANDOFF.md