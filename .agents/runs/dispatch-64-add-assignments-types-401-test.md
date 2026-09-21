# Antigravity dispatch 64 — add the missing §11 evidence case for the new assignments.ts guard

## Guard
This prompt is for the project at Electronic-LogBook (Arogya Electronic LogBook), task file
`CURRENT_TASK.md` (repo root) dated 2026-09-21. If this is not that repo, stop, say which
repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Context — why this dispatch exists
`code-review` on this task's diff found that the new 403 authorization guard on
`POST /assignments/types` (added in an earlier dispatch, `artifacts/api-server/src/routes/assignments.ts`,
around line 24-28) only demonstrates 2 of the 4 cases `AGENTS.md` §11's evidence standard
requires for an authorization change: wrong-owner→403 and correct-owner→201 are both
already tested. Missing: an explicit unauthenticated→401 test for this specific route and
method (401 is already tested for **GET** on the same route, but not **POST**). The
developer reviewed this finding and approved dispatching exactly this one test.

## Read first
- `artifacts/api-server/tests/access.test.ts` lines 21-23 — the existing pattern for an
  unauthenticated request to this same route (`/assignments/types`), currently only via the
  default GET helper. Read the `call(...)` helper it uses to see how an unauthenticated
  request is made (almost certainly: calling without an account/token argument).
- `artifacts/api-server/tests/mirror-department.test.ts` lines 85-121 — the existing
  four-case block in this same file ("Settings write - 401 unauthenticated" / "403 test HOD
  on mirror department" / "200 real HOD on own department" / "404 nonexistent procedure")
  for a different route (`PATCH /admin/department/procedures/:id`) — this is the shape and
  style to match for the new test.
- `artifacts/api-server/tests/mirror-department.test.ts` lines 247-266 — the two existing
  tests for the new `assignments.ts` guard ("Real-department assignmentTypesTable change is
  visible on mirror" and "Write to assignmentTypesTable scoped to a mirror department
  returns 403") — the new test belongs right next to these, testing the same route.
- `artifacts/api-server/src/routes/assignments.ts` lines 17-30 (`POST /types`) — confirm the
  exact middleware chain (`requireAuth`, `requireRole`, etc.) so the new test's
  unauthenticated request actually exercises the right rejection path.

## Build
- [ ] In `artifacts/api-server/tests/mirror-department.test.ts`, add exactly one new test,
      placed adjacent to the two existing `assignmentTypesTable` tests (after "Write to
      assignmentTypesTable scoped to a mirror department returns 403"): an unauthenticated
      `POST /assignments/types` request (no account/token) asserts a `401` response. Match
      the request-helper style already used elsewhere in this file (e.g. how the
      "Settings write - 401 unauthenticated" test at line ~89 calls the helper with no
      account argument).

## Do NOT touch
- Any file other than `artifacts/api-server/tests/mirror-department.test.ts`.
- Any existing test in this file.
- Application/source code — this is a test-only addition; the guard itself already works
  correctly, this only adds missing test coverage for it.
- Any file outside `artifacts/api-server/`.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).

## Hard stops — stop and report, do not decide
- If the unauthenticated request doesn't actually return 401 (e.g. it returns something
  else), stop and report the discrepancy rather than changing the assertion to match
  whatever you observe — that would hide a real finding instead of surfacing it.
- Any value you would otherwise guess or invent.

## Verification
File-reads only (no shell available in this sandbox): after adding the test, re-read it and
confirm it matches the existing unauthenticated-request pattern used elsewhere in this file
exactly (same helper, same call shape). Do not attempt to run the test suite — Claude Code
will do that after this dispatch returns.

## Report
Write `HANDOFF.md` at the repo root (overwrite the existing one — this is a continuation of
the same task):
- The exact new test added, and where.
- Confirmation you touched no other file.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)` — Opus 4.6 (Thinking) quota is still exhausted from earlier in this
task; this is a small, low-stakes test-only addition, so waiting for Opus isn't warranted.
Disclosed; this diff still gets reviewed before close-out.
