# Antigravity dispatch 20 — Add HOD-direct student creation

## Guard
This prompt is for the project `Electronic-LogBook` (Gotham28/Electronic-LogBook), task file
`CURRENT_TASK.md` at the repo root, dated 2026-09-16. If this is not that repo, stop, say
which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Read first
- `AGENTS.md` — §3 ownership, §4 the two ID systems, §5 no hardcoded department behaviour,
  §9 one feature per task, §10 secrets, §14.5 halt conditions, §15 review tiers, §16 rule map
  (this file's own section numbers are non-standard — trust §16 over any other project's
  conventions)
- `CURRENT_TASK.md` — the confirmed scope for this task

## Build
- [ ] Add `POST /students` to `artifacts/api-server/src/routes/admin.ts`. Mirror the existing
  `POST /professors` handler in the same file (search for `router.post("/professors"`):
  validate `{ fullName, email, password, registrationNumber, batch, dateOfJoining, kuhsId }`
  reusing `nameSchema`/`emailSchema`/`passwordSchema`/`dateSchema` from `../lib/validation.js`
  (same validators `registrationBody` in `artifacts/api-server/src/routes/auth.ts` already
  uses for `/register`). Reject if the email already exists (mirror the `/professors` check).
  Hash the password with `bcrypt.hash(password, 12)`. Insert in a single `db.transaction`,
  mirroring the `usersTable` → `studentsTable` link in `auth.ts`'s `/register` handler exactly
  (search for `router.post("/register"`) — a `usersTable` row with `role: "student"`,
  `status: "approved"`, `departmentId: req.user!.departmentId!`; then a `studentsTable` row
  with `userId` set to the new user's id (never confuse this with `studentsTable.id` — see
  AGENTS.md §4/§16), `registrationNumber`, `batch`, `dateOfJoining`, `kuhsId`, and `specialty`
  set to the HOD's own department name (same as `/register` resolves it). Do NOT create any
  `paymentsTable` row — admin-created students intentionally have no payment record at all.
  Send the welcome email via `sendAccountCreatedEmail` using the same try/catch-and-continue
  pattern as `/professors` (an email failure must never fail account creation). On any error,
  log only `{ departmentId, status: 500 }` via `req.log.error` — never the raw error object
  (see the existing comment above the `/professors` catch block explaining why: a failed
  insert's error can carry the bound `passwordHash`). Return `201` with the created student's
  `id`, `fullName`, `email`, `departmentId` (mirror the `/professors` response shape).
- [ ] In `artifacts/api-server/src/lib/mailer.ts`, widen `sendAccountCreatedEmail`'s `role`
  parameter type from `"hod" | "professor"` to `"hod" | "professor" | "student"`, and give
  `"student"` its own `roleDisplay` value (e.g. `"Student"`) instead of letting it fall into
  the existing `"Faculty"` branch.
- [ ] In `artifacts/mockup-sandbox/src/components/HODPortal.tsx` (confirmed to be the real HOD
  dashboard despite the folder name), add an "Add Student" form. Mirror the existing
  "Add Faculty" card (search for `Add Faculty`) and its submit handler (search for
  `/api/admin/professors` — the handler that calls `apiPost` against that path): a
  same-shaped form calling `apiPost("/api/admin/students", {...})` with the extra
  registration fields (`registrationNumber`, `batch`, `dateOfJoining`, `kuhsId`) alongside
  `fullName`/`email`/`password`, the same toast success/error handling as the faculty form,
  and refresh whatever the faculty-add success path already refreshes (roster/pending list)
  afterward so the new student shows up immediately as "approved" with no page reload needed.
- [ ] Add tests for the new endpoint alongside the existing admin/professor test coverage in
  `artifacts/api-server/tests/` (find the existing professor-creation test and mirror its
  structure): happy path (201, student created with `status: "approved"`, no payment row),
  duplicate email (400/409 matching whatever `/professors` returns for a duplicate), and
  unauthenticated/wrong-role rejection (401/403) consistent with the router's existing
  `requireAuth, requireRole(["hod"]), requireDepartment` middleware.

## Do NOT touch
- `artifacts/api-server/src/routes/auth.ts` (the `/register` flow) — read it as a pattern
  reference only, do not modify it.
- `artifacts/api-server/src/routes/payments.ts`, `artifacts/api-server/src/routes/payments-webhook.ts`
- `artifacts/api-server/src/routes/superadmin.ts`
- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx`
- Any schema file under `lib/db/`
- `artifacts/api-server/src/routes/admin.ts`'s existing `/students/:id/approve` handler and
  the payment gate inside it — leave that logic exactly as-is
- Any file not named under Build above
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler)

## Hard stops — stop and report, do not decide
- Any change to a route or query touching the clinical tables (case_logs, procedure_logs,
  academic_logs, leave_records, postings, research, assessments, attendance), or to anything
  resolving ownership server-side (AGENTS.md §3)
- Any place `studentsTable.id` and `usersTable.id` could be conflated (§4) — if you are
  unsure which one a value refers to, stop and report rather than guessing
- Any schema change, migration, or backfill (§6)
- Any department-specific behaviour that is not generically scoped to
  `req.user!.departmentId!` (§5) — this must work for any department, not just Dermatology
- Anything that puts patient text or leave reasons near a log, error, or audit trail (§8)
- Any secret, credential, or `.env` value beyond the password field already specified above
  (§10, §13)
- Any value you would otherwise guess or invent — if a field, status value, or response shape
  isn't already established by an existing pattern named above, stop and report instead of
  inventing one

## Report
Write `HANDOFF.md` at the repo root:
- What changed, per file, and why
- Anything you skipped, and why (including any step you could not do because it would have
  required a shell command)
- Anything you expanded beyond the Build list, and why

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/src/routes/admin.ts
- artifacts/api-server/src/lib/mailer.ts
- artifacts/mockup-sandbox/src/components/HODPortal.tsx
- artifacts/api-server/tests
- HANDOFF.md