# Antigravity dispatch 38 — Admin "log in as" a test account

## Guard
This prompt is for "Electronic-LogBook" (Arogya platform, Pediatrics pilot), task file
`CURRENT_TASK.md` at the repo root, feature "admin log in as a test account" (Task C). If
this is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`, and not `pnpm test`. If you are tempted to
run one, don't; use file-reading tools instead (view a file, list a directory, search file
contents). A denied shell call is not something to work around and continue past — some
environments do not recover cleanly from one and simply stop the task instead of falling
back. Do the entire task using only file-reading and file-editing tools. Write tests as
files; do not attempt to run them — Claude Code runs `pnpm test` after this dispatch returns
and reports the real result.

The branch `feature/mirror-test-department` is already checked out for you. Do not check
out, create, or switch any branch. Do not run `git` at all.

## Read first
- `AGENTS.md` — all sections; §16 is a rule-map table (cited section numbers below already
  resolve through it)
- `CURRENT_TASK.md` — the confirmed scope in full
- `artifacts/api-server/src/routes/superadmin.ts` in full — the router you're extending.
  Note its existing patterns: router-level `requireAuth, requireRole(["admin"])` with no
  department-scoping middleware (a deliberate design — every route does its own inline
  per-request check instead); `router.param("id", ...)` already validates numeric `:id`
  params; the existing `POST /users/:id/deactivate` route (structurally closest to what
  you're building) and `DELETE /departments/:id`'s `deleteDepartmentCascade` helper (an
  example of this file's existing code style, not something to touch).
- `artifacts/api-server/src/routes/auth.ts` — read `sessionProfile` (lines 131-137),
  `POST /login` (lines 139-179, especially how it builds and signs its JWT and its response
  shape at line 178), and the per-IP/per-account rate-limiting `Map`s (lines 16-44) as the
  exact pattern to follow for this task's own rate limit.
- `artifacts/api-server/src/middlewares/auth.ts` in full — confirm `requireAuth` (lines
  23-70) only ever reads `.id`, `.sessionVersion`, `.scope` off the decoded JWT payload, and
  the `AuthUser` interface (lines 8-13). This confirms an extra `impersonatedBy` claim on
  the minted token is inert to it — no change needed in this file, and you are not
  permitted to change it regardless.
- `artifacts/mockup-sandbox/src/components/AdminPortal.tsx` — `DepartmentDetail()`, the
  Faculty/Residents roster tables and their existing per-row "Deactivate" button, and the
  department-list/detail data flow (what shape `AdminDepartment` currently has, and where
  the department list is fetched).
- `artifacts/mockup-sandbox/src/lib/apiClient.ts` — existing API wrapper functions' style
  (naming, error handling) and the current `AdminDepartment` type.
- `artifacts/mockup-sandbox/src/lib/session.ts` and `artifacts/mockup-sandbox/src/App.tsx` —
  how a normal login currently saves its token/session and how role-based routing works, so
  the one-time-token pickup you add reuses the exact same mechanism.
- `artifacts/api-server/tests/superadmin.test.ts` — style reference (bare `test()` + its
  `call()` helper) for the new test file, since you're extending the same router.

## Build
- [ ] Backend: the new `POST /users/:id/impersonate` route and the `GET /departments`
      select-field addition, exactly as designed in `CURRENT_TASK.md`'s
      `## Files/areas in scope`, item 1 (parts a-h) and item 2. In full, so nothing is
      re-derived from memory:
  1. New route `POST /users/:id/impersonate` in `superadmin.ts`, parallel in structure to
     the existing `POST /users/:id/deactivate`, reusing the router's existing `:id` param
     validator. Inline authorization (no new middleware):
     a. Load target `{id, role, status, departmentId, sessionVersion}` — 404 if missing.
     b. Load target's department `{isTest}` — 403 unless `isTest === true`. This is the
        entire safety boundary: no real department's account can ever be impersonated.
     c. 403 if `target.role` is not one of `["hod", "professor", "student"]`.
     d. 403 if `target.status !== "approved"`.
     e. Mint `jwt.sign({ id: target.id, sessionVersion: target.sessionVersion,
        impersonatedBy: req.user!.id }, JWT_SECRET, { algorithm: "HS256", expiresIn: "20m" })`
        — `sessionVersion` read fresh in step (a), never cached.
     f. Response shape matches `POST /auth/login`'s exactly — reuse `auth.ts`'s existing
        local `sessionProfile(id)` function (`auth.ts:131-137`) by adding the `export`
        keyword to it (one-line change, no behavior change — everything else in that
        function stays identical) and importing it into `superadmin.ts`.
     g. Log one line at mint time: ids, role, department id, status — no other detail.
        Match this file's existing structured-log idiom exactly (see other routes in this
        file for the `req.log.info({...}, "...")` shape).
     h. Rate limit: a small bounded in-process `Map` keyed on the calling admin's own user
        id (`req.user!.id`), scoped to this one route — follow the exact existing idiom in
        `auth.ts`'s per-IP/per-account login throttling (bounded map, periodic cleanup of
        expired entries, 429 + `Retry-After` header on limit). Do not add an
        `express-rate-limit` dependency; this repo has none.
  2. `GET /departments`'s existing `db.select({...})` — add `isTest` and
     `configSourceDepartmentId` to the selected fields (currently only
     `{id, name, code, description}`). No other change to that route.
- [ ] Frontend:
  - `apiClient.ts` — add an `impersonateAdminUser(userId)` wrapper calling the new route;
    add `isTest`/`configSourceDepartmentId` to the `AdminDepartment` type.
  - `AdminPortal.tsx` — in `DepartmentDetail()`, add a "Log in as" action next to the
    existing per-row "Deactivate" button in the Faculty/Residents roster tables, shown only
    when the selected department has `isTest === true`. On click: call
    `impersonateAdminUser`, then open the result in a new browser tab (`window.open`)
    carrying the token via a one-time URL param — never overwrite the admin's own
    tab/session.
  - `App.tsx` — read that one-time URL param once on startup (if present), save it exactly
    the way a normal login already does (reuse the existing session-save call path), then
    strip the param from the URL via `history.replaceState`. No other change to this file's
    existing role-based routing.
- [ ] Tests, new file in `artifacts/api-server/tests/`, `node:test` style matching
      `tests/superadmin.test.ts` — the full AGENTS.md §11 four-case evidence matrix plus the
      two safety-property tests, exactly as listed in `CURRENT_TASK.md`'s
      `## Verification required` section: unauthenticated → 401; authenticated non-admin →
      403; admin targeting a user in a REAL (non-`isTest`) department → 403 (must never
      succeed — this is the single most important test in the file); admin targeting a user
      in an `isTest` department → 200, and the returned token round-tripped through a real
      `GET /api/auth/me` call returns that user's own profile; admin targeting a nonexistent
      user id → 404; token `exp` reflects the 20-minute window; an impersonation token is
      invalidated the moment the target's `sessionVersion` changes (e.g. after deactivating
      the target, the old token stops working).
- [ ] `pnpm test` in `artifacts/api-server` — do not run it yourself (sandbox constraint);
      write only. Claude Code runs it after this dispatch returns.

## Do NOT touch
- Any query selecting rows from `users`, `students`, `assignments`, `case_logs`,
  `procedure_logs`, `academic_logs`, `leave_records`, `postings`, `research`,
  `assessments`, `attendance_logs`, `leave_applications`, `thesis_milestones`, `appraisals`.
  This task mints a session token and adds one UI button — it must never touch a clinical or
  log table in any way.
- Every existing `routes/superadmin.ts` route except the two named changes (the new
  `POST /users/:id/impersonate` route, and `GET /departments`'s select-field addition).
  `POST /departments`, `POST /departments/:id/replace-hod`, `GET /departments/:id/roster`,
  `POST /departments/:id/faculty`, `POST /departments/:id/students`,
  `POST /users/:id/deactivate`, `DELETE /departments/:id` (including its
  `deleteDepartmentCascade` helper) are all unchanged.
- `artifacts/api-server/src/middlewares/auth.ts` (`requireAuth`, `requireRole`,
  `requireDepartment`, the `AuthUser` interface) — read-only reference, do not edit.
- `artifacts/api-server/src/routes/auth.ts` — the ONLY change permitted here is adding the
  `export` keyword to the existing `sessionProfile` function (line 131). Nothing else in
  this file changes — not the login route, not the rate-limiting maps, not any other
  function or route.
- `artifacts/api-server/src/lib/department-provisioning.ts`,
  `artifacts/api-server/src/lib/department-config-source.ts` — already correct, shipped,
  reviewed. Read-only reference, do not edit.
- Any migration file, `lib/db/src/migrations.ts`, `lib/db/src/schema/users.ts` — no schema
  change; this task needs no new column or table.
- Any `artifacts/mockup-sandbox` file other than `apiClient.ts`, `AdminPortal.tsx`,
  `App.tsx`.
- Any branch other than `feature/mirror-test-department`.
- `.env`, `TASK_LOG.md`, `STATUS.md`, `CURRENT_TASK.md` (read-only — do not edit it).
- `artifacts/api-server/tests/superadmin.test.ts`, `tests/auto-provision.test.ts`,
  `tests/delete-cascade.test.ts`, `tests/mirror-department.test.ts` — do not modify any of
  these; add a new test file instead.
- Any file not named in `## Build` or `allowed_paths` above.
- Any shell command whatsoever, including `pnpm test`, `pnpm install`, `drizzle-kit
  generate/push/migrate`, `psql`, or `git` of any kind.

## Hard stops — stop and report, do not decide
- Any place `studentsTable.id` and `usersTable.id` could be conflated.
- Any schema change, migration, or backfill.
- Anything that puts patient text or leave reasons near a log, error, or audit trail.
- Any secret, credential, or `.env` value.
- The task turning out to be more than described here.
- Any change to a code path enforcing ownership/authorization outside the exact scope named
  above (§3/§4) — if you find yourself wanting to touch `requireAuth`, `requireRole`, or any
  other route's authorization logic to make this work, stop instead of doing it.
- Any value you would otherwise guess or invent — if the exact rate-limit numbers, the exact
  URL-param name for the token handoff, or any other unspecified detail is ambiguous, pick
  the most conservative, closest-to-existing-pattern choice and say so in `HANDOFF.md`,
  rather than inventing something novel.

## Report
Write `HANDOFF.md` at the repo root (append a new section; keep everything above it):
- Every file created or modified, with paths.
- The exact authorization check sequence in the new route, confirming step order matches
  the design (existence → isTest → role → status → mint).
- Confirmation `requireAuth`/`middlewares/auth.ts` were not modified, and why the
  `impersonatedBy` claim is safe to add without touching that file (cite the exact lines you
  read that prove it).
- Every test added, with the file and what it asserts — explicitly state you did not run
  them (sandbox constraint) and that pass/fail is unverified until Claude Code runs
  `pnpm test`.
- Anything you skipped, and why (including anything you could not do because it would have
  required a shell command).
- Anything you expanded beyond the Build list, and why.
- Anything that contradicts `CURRENT_TASK.md` or `AGENTS.md`.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/src/routes/superadmin.ts
- artifacts/api-server/src/routes/auth.ts
- artifacts/mockup-sandbox/src/lib/apiClient.ts
- artifacts/mockup-sandbox/src/components/AdminPortal.tsx
- artifacts/mockup-sandbox/src/App.tsx
- artifacts/api-server/tests/