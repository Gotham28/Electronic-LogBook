# Antigravity dispatch 28 — Auto-fill defaults for superadmin's Add Resident form

## Guard
This prompt is for the project `Electronic-LogBook` (Gotham28/Electronic-LogBook), branch
`fix/superadmin-add-resident-form-defaults`, task file `CURRENT_TASK.md` at the repo root,
dated 2026-09-16. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. That pull-before-task step is Claude Code's
own job, already done before this dispatch was sent — it is not yours to repeat, and it does
not conflict with this constraint. Do the entire task using only file-reading and
file-editing tools.

## Context
`artifacts/mockup-sandbox/src/components/AdminPortal.tsx` has an "add resident" form (state:
`addForm`, search for it) shared with an "add faculty" mode via an `addFormType` toggle. It
currently starts fully blank: `useState({ fullName: "", email: "", password: "",
registrationNumber: "", batch: "", dateOfJoining: "", kuhsId: "" })`, and `handleAddUser`'s
success path resets it back to the same all-blank shape (search for `setAddForm({ fullName:
"", email: "", password: ""`). This form hits `POST /api/superadmin/departments/:id/students`,
which requires `registrationNumber`/`batch`/`dateOfJoining`/`kuhsId` when `addFormType ===
"resident"`, and submitting with those blank produces a 400. The developer wants the same
auto-fill-defaults treatment already shipped for a *different*, separate form in
`HODPortal.tsx` (PR #33, already merged) applied here too.

## Build
- [ ] In `artifacts/mockup-sandbox/src/components/AdminPortal.tsx`, add a helper function
  `generateDefaultResidentForm()` (mirror the existing `generateDefaultStudentForm()` in
  `artifacts/mockup-sandbox/src/components/HODPortal.tsx` exactly — read that file for the
  precedent pattern before writing this) that returns:
  ```
  {
    fullName: "",
    email: "",
    password: "",
    registrationNumber: `TEST-${Date.now()}`,
    batch: `${new Date().getFullYear()}`,
    dateOfJoining: new Date().toISOString().slice(0, 10),
    kuhsId: `TEST-KUHS-${Date.now()}`,
  }
  ```
  `fullName`, `email`, and `password` MUST stay exactly `""` — do not auto-fill these three
  under any circumstance, they are login credentials/identity fields. This applies to BOTH
  the `faculty` and `resident` add-modes that share this same `addForm` state — the
  auto-filled fields (registrationNumber/batch/dateOfJoining/kuhsId) are simply unused and
  harmless when `addFormType === "faculty"`, since that mode's submit path never reads them.
- [ ] Replace the `addForm` state's initializer (currently the all-blank object literal) with
  `React.useState(generateDefaultResidentForm())` (or the lazy-initializer form
  `React.useState(() => generateDefaultResidentForm())` — match whichever style this file's
  other `useState` calls already use).
- [ ] Replace the all-blank reset inside `handleAddUser`'s success path (search for
  `setAddForm({ fullName: "", email: "", password: ""` — it currently resets every field to
  `""`) with `setAddForm(generateDefaultResidentForm())`, so the form is ready for another
  quick resident submission immediately after a successful create, without needing a page
  reload.
- [ ] Do not change anything else — not the `faculty`/`resident` mode toggle logic, not the
  client-side validation check at the top of `handleAddUser` (`if (!addForm.registrationNumber
  || !addForm.batch || !addForm.dateOfJoining || !addForm.kuhsId)`), not any other form or
  section of this file.

## Do NOT touch
- `artifacts/api-server/src/routes/superadmin.ts` — the backend's required-field validation
  stays exactly as-is; this change only affects the frontend's starting values.
- `artifacts/mockup-sandbox/src/components/HODPortal.tsx` — already fixed in a prior PR, not
  touched again here.
- `artifacts/api-server/src/routes/admin.ts`
- Any schema file under `lib/db/`
- Any other form/section in `AdminPortal.tsx` (department management, HOD replacement,
  hard-delete UI, etc.)
- Any file not named under Build above
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler)

## Hard stops — stop and report, do not decide
- If making `fullName`, `email`, or `password` auto-filled seems necessary to satisfy the
  task, stop and report instead — this is explicitly forbidden, not an oversight
- Any value you would otherwise guess or invent beyond the four placeholder formats given
  exactly above

## Report
Overwrite `HANDOFF.md` at the repo root with what changed and why, per file. Do not open a
pull request. Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/mockup-sandbox/src/components/AdminPortal.tsx
- HANDOFF.md