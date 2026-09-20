# Antigravity dispatch 09 — Fix dispatch-08 review findings (Admin role backend API)

## Guard
This prompt is for the project `Electronic-LogBook` (Gotham28/Electronic-LogBook), task file
`CURRENT_TASK.md` at the repo root. If this is not that repo, stop, say which repo this is,
and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Read first
- `AGENTS.md` — §3 (ownership before data), §8 (no patient text near logs)
- `HANDOFF.md` at the repo root — dispatch 08's own report, for context on what already exists

## Fix these findings, and nothing else
1. **(Critical)** `artifacts/api-server/src/routes/superadmin.ts:145` — `res.status(result.status)`
   fails `tsc --noEmit` with "Argument of type 'number | undefined' is not assignable to
   parameter of type 'number'." Fix the type so `result.status` is always `number` inside the
   `if ("error" in result)` branch — e.g. give the `db.transaction(...)` callback an explicit
   return-type annotation (a proper discriminated union of the error-branch shape and the
   success-branch shape) so TypeScript narrows correctly, rather than suppressing the error
   with a cast. Confirm with `tsc -p tsconfig.json --noEmit` yourself if your sandbox allows
   it; if not, say so plainly in your report rather than claiming it passes.
2. **(Major)** `artifacts/api-server/tests/superadmin.test.ts:182-241` — the test named "HOD
   swap is transactional: forced failure leaves neither demotion nor promotion applied" does
   not actually force a failure between the demote and promote writes; it only exercises
   pre-write validation. Add a genuine forced-failure case: make the *second* write (the
   promotion, `superadmin.ts:136-138`) fail after the demotion has already run inside the same
   transaction (e.g. by making the incoming user violate a real constraint at that point, or
   by another reliable way to force the transaction to throw after the demote executes), then
   assert that **both** the outgoing HOD is still `hod` (not left as `professor`) and the
   incoming user is still `professor` (not promoted) — i.e. the transaction actually rolled
   back. Keep the existing pre-write-validation sub-cases too; they're valid tests of a
   different thing, just don't let the "transactional" test title stand for something it
   doesn't check.
3. **(Major, per review policy — treat as a real fix, not optional polish)**
   `artifacts/api-server/src/routes/superadmin.ts:71,149,219,270,306` — five successful (2xx)
   operations are logged via `req.log.error(...)`. Change each to `req.log.info(...)`,
   matching `routes/admin.ts`'s convention of reserving `.error()` for actual failure
   branches only. Do not change the log payload shape (still id/status fields only) or any
   already-correct `.error()` call inside a genuine `catch`/failure branch.
4. **(Minor)** `artifacts/api-server/src/provision-admin.ts:32` — remove the admin's `email`
   from the success `console.log`, matching `provision-department.ts:10`'s pattern of logging
   only ids (e.g. `{ id: admin.id }`).
5. **(Minor)** `artifacts/api-server/package.json` — add a `"db:provision-admin"` script
   mirroring the existing `"db:provision-department"` entry exactly (same `tsx`/env-file
   invocation style, pointed at `src/provision-admin.ts`).

## Do NOT touch
- Everything not named in the five numbered items above.
- `artifacts/api-server/src/routes/admin.ts`, `lib/department-provisioning.ts`,
  `lib/validation.ts`, `lib/mailer.ts`, `lib/db/src/schema/users.ts` — still off-limits.
- The unreachable 409 guard at `superadmin.ts:129-133` — leave it as-is, it is intentional
  defense-in-depth, not a bug to remove.
- Any shell command whatsoever (restates the Sandbox constraint above).

## Hard stops — stop and report, do not decide
- If forcing a genuine mid-transaction failure for item 2 seems to require touching
  `db.transaction`'s own implementation, schema, or any file outside this dispatch's Fix
  list — stop and report rather than improvising a workaround.
- Any schema change, migration, or backfill.
- Any value you would otherwise guess or invent.

## Report
Update `HANDOFF.md` at the repo root with what changed for each of the five items above, and
paste actual line-level evidence. Do not open a pull request. Do not run `git commit` or
`git push`.


## Files you may touch
- artifacts/api-server/src/routes/superadmin.ts
- artifacts/api-server/tests/superadmin.test.ts
- artifacts/api-server/src/provision-admin.ts
- artifacts/api-server/package.json
- HANDOFF.md