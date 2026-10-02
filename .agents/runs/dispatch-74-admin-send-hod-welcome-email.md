# Antigravity dispatch 74 — Admin "Send HOD email" button (reset HOD password + welcome email)

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root (there is no
`.agents/CURRENT_TASK.md` and no `.agents/AGENTS.md`; `AGENTS.md` is also at the repository root),
dated 2026-09-30, base commit `4f5c26d`, working branch `feat/admin-send-hod-welcome-email`
(already cut and checked out; you cannot run git to confirm this). If this is not that repo,
stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

This means you cannot run `pnpm test`, `pnpm typecheck` or `git diff`. Claude Code runs all of
those after you return. Write the code so it will pass them, and say in `HANDOFF.md` which
checks you could not run.

## Read first
- `AGENTS.md` (repo root) — §3, §4, §5, §7, §8, §9, §10, §11, §14.5. §16 is a rule map; §10 in
  that file is Secrets.
- `CURRENT_TASK.md` (repo root) — especially `## Files/areas in scope`, `## Explicitly out of
  scope`, `## Do NOT touch`, `## Agent` and `## Flags`. The `## Agent` bucket is restated under
  Build below; where they differ, stop and report rather than choosing.
- `artifacts/api-server/src/routes/superadmin.ts` — read the whole `replace-hod` route (starts
  near line 191) and its neighbours. The new route copies its style, its `req.log` usage, and its
  step-2 HOD query.
- `artifacts/api-server/src/routes/auth.ts` — read only; the `sessionVersion` bump pattern is
  near line 277.
- `artifacts/api-server/src/lib/mailer.ts` — read only. `sendAccountCreatedEmail` is reused
  exactly as it is.
- `artifacts/api-server/tests/superadmin.test.ts` — read in full before editing (existing `call`
  helper, the 403 route list near line 38, the `replace-hod` tests near lines 226–266).
- `artifacts/api-server/tests/support.ts` — read only. `mail`, `simulateFailure`, `accounts`,
  `departmentIds`, `password`, `request` are defined here.
- `artifacts/mockup-sandbox/src/lib/apiClient.ts` — read only, then edit as below. `apiPost` and
  `replaceAdminHod` (near line 163) are here.
- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx` — read the HOD strip (near lines
  694–737), `handleReplaceHod` (near line 521), the state declarations (near line 459) and the
  `useEffect` (near line 479) before editing.

## Build

### Backend — `artifacts/api-server/src/routes/superadmin.ts`
- [ ] Add `POST /departments/:id/hod/welcome-email` (full path `/api/superadmin/departments/:id/hod/welcome-email`), placed directly after the `replace-hod` route. Body: `z.object({ password: passwordSchema }).strict()`, through `validate(...)`. The router-level `requireAuth, requireRole(["admin"])` and the `:id` param guard already apply; add no other middleware.
- [ ] In this order:
  1. Select the department's `id`, `name`, `isTest`. Missing → `404 { message: "Department not found" }`.
  2. `isTest` true → `400 { message: "Welcome emails are not sent for test departments" }`.
  3. Select the current HOD's `id`, `fullName`, `email` from `usersTable` where `departmentId` = the department, `role = "hod"`, `status = "approved"`, `limit(1)` — the same query as `replace-hod` step 2. None → `404 { message: "No active HOD found in this department" }`. The request carries no user id; the HOD is resolved from the database only.
  4. `bcrypt.hash(password, 12)`, then update that user: `passwordHash`, and `sessionVersion: sql\`${usersTable.sessionVersion} + 1\`` (the pattern at `auth.ts:277`). The `where` matches the user id **and** `role = "hod"` **and** `status = "approved"`.
  5. `await sendAccountCreatedEmail(hod.email, hod.fullName, password, "hod", dept.name)` inside its own try/catch.
  6. Email throws → `502 { message: "The HOD's password was reset, but the welcome email could not be sent. Try again." }`.
  7. Success → `200 { message: "HOD password reset and welcome email sent" }`.
  8. Any other error → `500 { message: "Internal server error" }`, same as the neighbouring routes.
- [ ] Logging, with `req.log` as the neighbouring routes do: `departmentId`, the HOD's user id, the admin's `req.user!.id`, and the status code. **Never** the password, the email address, the name, or an error object (§8, §10).

### Frontend — `artifacts/mockup-sandbox`
- [ ] `src/lib/apiClient.ts`: `sendAdminHodWelcomeEmail(departmentId: number, password: string)` → `apiPost(\`/api/superadmin/departments/${departmentId}/hod/welcome-email\`, { password })`. Place it beside `replaceAdminHod`.
- [ ] `src/components/AdminPortal.tsx`, in the button group at line 694: a `variant="outline"` button labelled `Send HOD email`, placed after "Replace HOD" and before "Delete", rendered only when `department.hod?.id` is set. It toggles an inline panel.
- [ ] The panel sits below the Replace-HOD panel inside the same `Card` and copies that panel's structure and classes:
  - Text: `Set a new password for the HOD and email it to them with their login details. Their current password will stop working and they will be signed out.`
  - One field, label `New password for the HOD`, copying the attributes of the existing password input at line 892 (`type="password"`, `placeholder="At least 8 characters"`, `required`, `minLength={8}`, `maxLength={72}`).
  - Buttons: `Cancel` and a submit button `Reset password and send email` (`Sending...` while the request runs, disabled meanwhile).
  - Inline error block in the panel showing the server's message, plus `toast.error` with the same message — same as `handleReplaceHod`.
  - On success: `toast.success("Password reset and welcome email sent")`, clear the field, close the panel.
- [ ] Close the panel and clear its error and field in the existing `useEffect` at line 479.
- [ ] No optimistic state and no fallback text: if the call fails, the panel stays open and shows the error (§7).

### Tests — `artifacts/api-server/tests/superadmin.test.ts`
- [ ] Add `["/superadmin/departments/" + departmentIds[0] + "/hod/welcome-email", "POST"]` to the route list in the existing 403 test (line 38).
- [ ] **Do not reset the password of a shared fixture account** (`hod0` and the rest). The route bumps `sessionVersion`, which would invalidate the token other tests in the file use. For every test that reaches a `200` or `502`, create a fresh department inside the test through `POST /superadmin/departments` and target that one.
- [ ] §11 cases — **four separately named tests**, each title stating the method, path and expected status, so each shows as its own line in the run output:
  1. no token → `401`
  2. HOD, professor and student tokens → `403`
  3. admin, fresh department → `200`
  4. admin, department id `999999` → `404`
- [ ] After the `200`: `POST /auth/login` with the new password succeeds; with the original password returns `401`; a token obtained by logging in before the reset gets `401` on `GET /auth/me` afterwards.
- [ ] Password that fails `passwordSchema` → `400`.
- [ ] Test (mirror) department id → `400`. The fresh department's `mirrorDepartmentId` from the create response is available for this.
- [ ] Department with no approved HOD → `404`, **only if** an existing fixture or an existing test helper provides one. If it would need a new helper or a direct table write beyond what the file already does, skip it and say so in `HANDOFF.md`.
- [ ] `simulateFailure.enabled = true` → `502`; then login with the new password still succeeds. Reset `simulateFailure.enabled = false` in a `finally`.

### Handoff
- [ ] `HANDOFF.md` (repo root) — overwrite the existing file (it belongs to a previous task and is untracked) with this task's handoff, per `## Report` below.

## Do NOT touch
- `artifacts/api-server/src/lib/mailer.ts` — `sendAccountCreatedEmail` is reused exactly as it is. No new template, no wording change.
- `artifacts/api-server/src/lib/department-provisioning.ts`.
- `artifacts/api-server/tests/support.ts` — use the existing mail stub and `simulateFailure`; do not change them.
- Any other route in `superadmin.ts`, `admin.ts` or `auth.ts`. The `replace-hod` route itself is unchanged; no email is added to it.
- `lib/db/` — no schema change, no migration (§6).
- `.env`, and any stash (§1, §10).
- No reformatting, renaming or tidying of lines outside the change (§9).
- Out of scope, each its own task (§9), do not fix and do not touch: emailing the demoted HOD; the silent welcome-email failure on department creation (`lib/department-provisioning.ts:73-78`); stopping plaintext passwords in email; a guard in `mailer.ts` for unset `RESEND_API_KEY` / `EMAIL_FROM`.
- The untracked files `.agents/runs/dispatch-71-resend-mailer-clean-failure.md`, `.agents/runs/dispatch-72-resend-mailer-review-fixes.md`, `.agents/runs/dispatch-73-arogya-panel-api-client.md`, `.agents/runs/dispatch-74-admin-send-hod-welcome-email.md`, `.agy-jobs/` and `CURRENT_TASK.md`.
- `AGENTS.md`, anything else under `.agents/`, `pnpm-lock.yaml`, `package.json` files, and all git stashes.
- The UI strings and API messages under Build are fixed. Do not reword them and do not add any (§7).
- git in any form.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any need to edit a file not named under Build, or any change to `mailer.ts`, `test/support.ts` or `lib/db/`.
- Any place `studentsTable` would appear in the change (§4) — only `usersTable.id` is involved. The HOD is resolved from the department id and role in the database; never from a client-supplied user id.
- Any secret, credential or `.env` value (§10): do not read, print or write any key. A *new* credential question arising mid-task (beyond the password handling already specified here) is a stop.
- Anything that puts the password, an email address, a name or an error object near a `console.*` call, a log call, or an error payload (§8). Log ids and status codes only.
- Any migration, backfill, deploy, or other irreversible step.
- The change growing past the four source files named under Build (`superadmin.ts`, `superadmin.test.ts`, `apiClient.ts`, `AdminPortal.tsx`), or turning out to be more than one feature (§9).
- A mismatch between this prompt and `CURRENT_TASK.md`, or between either and what the code actually does (for example a line number that does not point where stated) — report it, do not pick one silently.
- Any value you would otherwise guess or invent — in particular a fallback or placeholder in the UI: a failed call shows the visible error state, never invented text (§7).

## Verification (file reads only)
After editing, re-read the changed files and confirm, citing line numbers in `HANDOFF.md`:
- the new route sits directly after `replace-hod`, has exactly `validate(z.object({ password: passwordSchema }).strict())` as its only added middleware, and the eight steps run in the stated order;
- every `req.log` call in the new route carries only ids and status codes — none carries the password, email, name or an error object;
- `studentsTable` does not appear in the new route;
- `sendAdminHodWelcomeEmail` calls `apiPost` with the path and body given under Build;
- the button renders only when `department.hod?.id` is set, and sits after "Replace HOD" and before "Delete";
- the four §11 tests have four distinct titles, each naming method, path and expected status;
- no test resets the password of `hod0` or any other shared fixture account;
- `simulateFailure.enabled = false` is reset in a `finally`.

## Report
Write `HANDOFF.md` at the repo root (overwrite):
- The base commit (`4f5c26d`) and branch (`feat/admin-send-hod-welcome-email`), stated as given in this prompt — you cannot run git to confirm them.
- What changed, per file, with `file:line` for every claim, and why
- Whether the "no approved HOD → 404" test was written or skipped, and why
- Anything you skipped, and why (including every check you could not run because it needs a shell: `pnpm test` in `artifacts/api-server`, typecheck of `artifacts/api-server` and `artifacts/mockup-sandbox`, `git diff --stat main...feat/admin-send-hod-welcome-email`). List each as NOT RUN by this dispatch; do not write "passes" for any of them.
- Anything you expanded beyond the Build list, and why
- Anything you noticed that was not asked about (list only; do not fix)
- Anything that contradicts `CURRENT_TASK.md` or `AGENTS.md`

A claim without `file:line` evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Claude Sonnet 4.6 (Thinking)`; if quota-blocked, `Gemini 3.1 Pro (High)` under the standing fallback. Never Opus.
