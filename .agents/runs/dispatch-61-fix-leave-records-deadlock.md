# Antigravity dispatch 61 — fix deadlock introduced by dispatch 60's leave-records fix

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
Dispatch 60 fixed `student.ts:577` so the leave-type catalog lookup resolves through
`resolveConfigDepartmentId()` instead of the caller's own `departmentId`. The fix is
correct in intent but was placed in the wrong scope: it calls `resolveConfigDepartmentId()`
*inside* the `db.transaction(async (tx) => {...})` callback in the
`POST /:studentId/leave-records` handler, after that transaction has already taken
`pg_advisory_xact_lock` via `tx.execute(...)`.
`resolveConfigDepartmentId()` (`artifacts/api-server/src/lib/department-config-source.ts`)
always queries through the module-level `db` — it never accepts or uses a transaction
client. Calling it from inside an open `db.transaction()` callback deadlocks: the
transaction won't release its connection until the callback resolves, and the callback is
blocked waiting for a connection to run `resolveConfigDepartmentId`'s own queries. This was
confirmed by running the api-server test suite: it hung indefinitely inside
`tests/catalog-leave-type.test.ts` (30+ minutes, near-zero CPU on the stuck worker process —
confirmed stuck, not slow).

The sibling fix in the same dispatch, `student.ts:865-867` (procedure-logs), does not have
this problem: it calls `resolveConfigDepartmentId()` at line 857, before any transaction is
opened in that handler.

## Read first
- `AGENTS.md` (repo root) — §3 Ownership before data, §4 The two ID systems, §14.5 Halt
  conditions, §16 Rule map.
- `CURRENT_TASK.md` (repo root) — `## Blocked on developer input`, the entry dated
  2026-09-21 describing this exact deadlock in full.
- `artifacts/api-server/src/routes/student.ts` lines 556-600 (the
  `POST /:studentId/leave-records` handler) — read the whole handler before editing it.
- `artifacts/api-server/src/lib/department-config-source.ts` — confirm for yourself that
  `resolveConfigDepartmentId` has no transaction-aware variant; it always uses the
  module-level `db`.

## Build
- [ ] `artifacts/api-server/src/routes/student.ts`, the `POST /:studentId/leave-records`
      handler (currently around lines 556-600): move the
      `const configSourceId = await resolveConfigDepartmentId(studentUser.departmentId!);`
      call out of the `db.transaction(async (tx) => {...})` callback and up to before the
      `db.transaction(...)` call, at the same level as the existing
      `const currentYear = new Date().getFullYear().toString();` line. The transaction
      callback should then reference the already-computed `configSourceId` from its closure
      instead of computing it itself. Do not change anything else about the transaction body,
      the advisory lock, or the catalog lookup query itself — only where `configSourceId` is
      computed.

## Do NOT touch
- Any file other than `artifacts/api-server/src/routes/student.ts`.
- The procedure-logs handler (`student.ts:845-883`) — it does not have this bug and needs no
  change.
- `assignments.ts` — not part of this fix.
- Any test file — the existing tests already cover this path; this dispatch only needs to
  make them pass, not add new ones.
- Schema/migrations.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).

## Hard stops — stop and report, do not decide
- If moving the `resolveConfigDepartmentId` call outside the transaction changes behavior in
  a way that isn't just "compute it earlier" (e.g. if `studentUser.departmentId` could
  somehow differ by the time the transaction runs, or if there's a reason it needs to be
  inside the lock), stop and report the concern instead of proceeding.
- Any value you would otherwise guess or invent.

## Verification
File-reads only (no shell available in this sandbox): after the edit, re-read the whole
handler and confirm `configSourceId` is computed exactly once, before `db.transaction(...)`
is called, and that the transaction callback still uses it correctly at the catalog lookup.
Do not attempt to run the test suite — Claude Code will do that after this dispatch returns.

## Report
Write `HANDOFF.md` at the repo root (overwrite the existing one — this is a continuation of
the same task):
- The exact before/after of the `POST /:studentId/leave-records` handler's relevant lines.
- Confirmation you touched no other file.

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.

## Model
`Gemini 3.1 Pro (High)` — Opus 4.6 (Thinking) quota is still exhausted from earlier in this
task (dispatch 59); not retrying it. Disclosed; this diff gets extra scrutiny at
`code-review`.
