# Antigravity dispatch 22 — Auto-fill defaults for Add Student form

job_id: c39a9b6d133c44e4ac490c495fb7dc35
workdir: D:\Electronic-LogBook-main
branch: feature/hod-direct-student-creation (additional commit onto open PR #32)
model: Gemini 3.1 Pro (High)
allowed_paths:
- artifacts/mockup-sandbox/src/components/HODPortal.tsx
- HANDOFF.md

Follow-up to PR #32. Developer hit a 400 submitting the Add Student form with
registrationNumber/batch/dateOfJoining/kuhsId left blank (intending a quick test account)
and asked for auto-filled defaults instead of typing values every time. Chose: frontend
pre-fills generated defaults, still editable; backend validation unchanged.

## Guard
This prompt is for the project `Electronic-LogBook` (Gotham28/Electronic-LogBook), branch
`feature/hod-direct-student-creation`, task file `CURRENT_TASK.md` at the repo root, dated
2026-09-16. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Context
This branch already has an "Add Student" form in `artifacts/mockup-sandbox/src/components/HODPortal.tsx`
(search for `studentForm`). Its state currently starts fully blank:
`React.useState({ fullName: "", email: "", password: "", registrationNumber: "", batch: "",
dateOfJoining: "", kuhsId: "" })`, and `handleCreateStudent`'s success path resets it back to
the same all-blank shape. The developer tried submitting the form for a quick test account,
left the last four fields blank, and hit a 400 because the backend requires them. They want
those four fields pre-filled with generated placeholder defaults when the form opens, so a
test account can be submitted as-is, while still being editable for a real student.

## Build
- [ ] In `artifacts/mockup-sandbox/src/components/HODPortal.tsx`, add a helper function
  `generateDefaultStudentForm()` (a plain function in this file, not exported, placed near
  the top of the component or just above it) that returns:
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
  under any circumstance, they are login credentials/identity fields.
- [ ] Replace the `studentForm` state's initializer (currently the all-blank object literal)
  with `React.useState(generateDefaultStudentForm())` (or `React.useState(() =>
  generateDefaultStudentForm())` — either is fine, use whichever fits the file's existing
  style for other `useState` calls).
- [ ] Replace the all-blank reset inside `handleCreateStudent`'s success path (search for
  `setStudentForm({ fullName: "", email: "", password: ""` — it currently resets every field
  to `""`) with `setStudentForm(generateDefaultStudentForm())`, so the form is ready for
  another quick test account immediately after a successful create, without needing a page
  reload. Since `registrationNumber` and `kuhsId` both use `Date.now()`, the reset call will
  naturally produce different values than the initial mount did (more time will have passed).

## Do NOT touch
- `artifacts/api-server/src/routes/admin.ts` — the backend's required-field validation for
  `POST /students` stays exactly as-is. These four fields remain required on the server;
  this change only affects the frontend's starting values.
- `artifacts/api-server/src/lib/mailer.ts`
- `artifacts/api-server/tests/access.test.ts`
- Any schema file under `lib/db/`
- The existing "Add Faculty" form or any other form in `HODPortal.tsx`
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
