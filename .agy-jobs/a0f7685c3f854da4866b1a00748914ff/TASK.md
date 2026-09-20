# Antigravity dispatch 29 — Auto-approve students created via the superadmin console

## Guard
This prompt is for the project `Electronic-LogBook` (Gotham28/Electronic-LogBook), branch
`fix/superadmin-resident-auto-approve`, task file `CURRENT_TASK.md` at the repo root, dated
2026-09-16. If this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. That pull-before-task step is Claude Code's
own job, already done before this dispatch was sent — it is not yours to repeat, and it does
not conflict with this constraint. Do the entire task using only file-reading and
file-editing tools.

## Context
`superadmin.ts`'s `POST /departments/:id/students` creates a student with `status:
"pending"`, intending them to enter the department HOD's approval queue. But
`admin.ts`'s `POST /students/:id/approve` (untouched by this task, do not open it beyond
reading for context if needed) hard-requires a `paymentsTable` row with `status: "paid"`
before it will approve anyone, and this creation route never creates one. Every student
created via this superadmin route is therefore permanently stuck pending — the developer
confirmed hitting exactly this: `402 "This student has not completed payment and cannot be
approved yet"`.

Fix: make this route create students pre-approved instead, mirroring the already-shipped
HOD-direct student creation feature (`admin.ts`'s `POST /students`, which also creates
`status: "approved"` students with no payment row at all).

## Build
- [ ] In `artifacts/api-server/src/routes/superadmin.ts`'s `POST /departments/:id/students`
  (search `router.post("/departments/:id/students"`), change the `usersTable` insert's
  `status: "pending"` to `status: "approved"`.
- [ ] Update the success response message. It's currently
  `"Student account created (pending HOD approval)"` — change it to something accurate for
  immediate approval, e.g. `"Student account created and approved"` (exact wording your
  call, just don't claim a pending state that no longer exists).
- [ ] Update the comment directly above the route
  (`// Status is "pending" so the student enters the department's HOD approval queue.`) to
  describe the new behavior instead.
- [ ] In `artifacts/mockup-sandbox/src/components/AdminPortal.tsx`'s `handleAddUser`
  (search for `"Resident account created (pending HOD approval)"`), update that toast
  message to match — no longer claiming a pending state.
- [ ] In `artifacts/api-server/tests/superadmin.test.ts`, find the test named
  `"admin can create student in any department (pending status)"` (search for it). Update
  its assertion `assert.equal(user.status, "pending")` to `assert.equal(user.status,
  "approved")`, and rename the test to reflect the new behavior (e.g. `"admin can create
  student in any department (auto-approved)"`). Do not change anything else in that test —
  the request body, the department-id assertion, and the student-profile-row assertion all
  stay as they are.

## Do NOT touch
- `artifacts/api-server/src/routes/admin.ts` — read-only reference if needed, do not modify
  the approve endpoint or the HOD-direct student creation route
- `artifacts/api-server/src/routes/auth.ts` — the self-registration flow is unaffected and
  must stay exactly as-is
- `artifacts/mockup-sandbox/src/components/HODPortal.tsx`
- Any schema file under `lib/db/`
- Any other route or test in `superadmin.ts` / `superadmin.test.ts` beyond the one route and
  one test named above
- Any file not named under Build above

## Hard stops — stop and report, do not decide
- If fixing this seems to require touching `admin.ts`'s approve endpoint or the payments
  gate itself, stop and report rather than deciding to change scope — the fix is entirely on
  the creation side (skip the pending/payment path), not the approval side

## Report
Overwrite `HANDOFF.md` at the repo root with what changed and why, per file. Do not open a
pull request. Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/src/routes/superadmin.ts
- artifacts/mockup-sandbox/src/components/AdminPortal.tsx
- artifacts/api-server/tests/superadmin.test.ts
- HANDOFF.md