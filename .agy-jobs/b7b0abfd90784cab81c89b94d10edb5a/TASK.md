# Antigravity dispatch 16 — fix the FK-violation catch for DELETE /departments/:id

## Guard
This prompt is for the project `Electronic-LogBook-main`, task file `CURRENT_TASK.md`
at the repo root (a fix to Item 2's already-written code), dated 2026-09-14. If this is
not that repo, stop, say which repo this is, and wait.

## Context — read this fully before doing anything
A prior dispatch implemented `DELETE /api/superadmin/departments/:id` in
`artifacts/api-server/src/routes/superadmin.ts`, plus three tests in
`artifacts/api-server/tests/superadmin.test.ts`. That prior dispatch was interrupted by an
account-level quota error before it could write its own `HANDOFF.md`, but its code changes
did land and are complete/syntactically valid (both `pnpm typecheck` calls, backend and
frontend, pass clean).

The developer then ran `pnpm test` in `artifacts/api-server` themselves (76 of 77 tests
pass). The one failure is exactly the safety-critical scenario this whole feature exists to
protect against:

```
test at tests\superadmin.test.ts:1:15912
✖ delete department returns 409 when clinical data blocks the delete, and nothing is deleted (639.6791ms)
  AssertionError [ERR_ASSERTION]: Expected 409 FK violation, got 500
  500 !== 409
      at TestContext.<anonymous> (D:\Electronic-LogBook-main\artifacts\api-server\tests\superadmin.test.ts:510:10)
```

That test (lines ~476-528 of `superadmin.test.ts`) creates a department, adds a student,
inserts a real `case_logs` row for that student, then attempts to delete the department. It
expects `409` and then checks that the department, HOD, student, student profile, and case
log **all still exist** afterward (proving the transaction rolled back). Because the test
failed at the status-code assertion (line 510), we don't yet know from this test run alone
whether the transaction actually rolled back correctly (data safety) or not — only that the
wrong HTTP status was returned.

The route's catch block (`superadmin.ts`, current `DELETE /departments/:id` handler) is:

```ts
} catch (error: any) {
  if (error.statusOverride === 404) { ... }
  if (error.code === "23503") { ... return 409 ... }
  req.log.error({ departmentId, userId: req.user!.id, status: 500 }, "Error deleting department");
  res.status(500).json({ message: "Internal server error" });
}
```

This exact `error.code === "23503"` pattern already exists elsewhere in this codebase (e.g.
`admin.ts`'s `DELETE /users/:id`), but investigate whether that existing usage has ever
actually been exercised by a real FK violation in a passing test — it may be dead/unverified
defensive code that was copied forward without ever having been proven to work, which would
explain why this is the first time the mismatch has surfaced.

**The likely root cause to investigate**: this project's test suite runs against
`drizzle-orm/pglite` (`@electric-sql/pglite`, see `artifacts/api-server/tests/database.ts`),
while production runs against `drizzle-orm/node-postgres` (`pg`, see
`lib/db/src/index.ts`). These are two different Drizzle driver adapters over two different
underlying engines, and the shape of the error thrown for a Postgres foreign-key violation
(SQLSTATE `23503`) may differ between them — e.g. the code may live at `error.cause.code`,
under a different property name, wrapped in a different error class, or PGlite's WASM
Postgres build may report it differently than real `pg` does.

## Sandbox constraint — overrides AGENTS.md §1 for this dispatch only
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. Use file-reading tools only (view a file,
list a directory, search file contents). You cannot run `pnpm test`, `pnpm typecheck`, or
anything else — the developer will run tests themselves after your fix and report back.

`AGENTS.md` §1's git-pull-first ritual does not apply to this dispatch either, for the same
reason: no shell access exists in your environment at all.

## Read first
- `artifacts/api-server/src/routes/superadmin.ts` — the `DELETE /departments/:id` handler
  and its catch block, as quoted above
- `artifacts/api-server/tests/superadmin.test.ts` lines ~460-528 — the two delete-department
  tests, especially the failing one
- `artifacts/api-server/tests/database.ts` — the test DB engine (`@electric-sql/pglite` via
  `drizzle-orm/pglite`)
- `lib/db/src/index.ts` — the production DB engine (`pg` via `drizzle-orm/node-postgres`)
- Read the actual source of the `drizzle-orm/pglite` driver adapter and the
  `@electric-sql/pglite` package inside `node_modules` (or wherever pnpm's workspace
  resolves them — check `node_modules/.pnpm/` if a flat `node_modules/drizzle-orm` doesn't
  exist) to determine exactly what shape a constraint-violation error takes when thrown from
  a query run through this adapter. Also check the `pg` driver's own error shape
  (`node_modules/pg` or `node_modules/pg-protocol`) for comparison — the fix must work
  correctly against **both**, since tests run on `pglite` but production runs on real `pg`.
- `artifacts/api-server/src/routes/admin.ts` around its own `error.code === "23503"` catch
  (`DELETE /users/:id`) — note that this particular route only does a soft-deactivate
  `UPDATE`, not a hard `DELETE`, so this catch may never have actually been exercised by a
  real FK violation before now. Do not assume it is a proven-correct reference; verify it
  independently the same way.

## Task
Fix the `DELETE /departments/:id` catch block in `superadmin.ts` so it correctly detects a
Postgres foreign-key-violation error (SQLSTATE `23503`) regardless of which driver adapter
threw it, and returns `409` in that case — without weakening or removing the transaction
rollback behavior, and without touching the transaction body itself (the delete order/logic
is believed correct; this is specifically an error-detection/classification fix).

Concretely:
1. Determine the actual property path where the SQLSTATE code lives for both adapters (it
   may need to check more than one location, e.g. `error.code ?? error.cause?.code ??
   error.originalError?.code`, or match on an error class/constructor name if that proves
   more reliable than a property path — base this on what you actually find in the driver
   source, not a guess).
2. Update the catch block to check every location you found necessary, so the 409 path
   fires correctly under `pglite` (which the test suite runs against) **and** would still
   fire correctly under real `pg` in production (do not fix only the test-passing case if
   doing so would break the production case — both must work).
3. If, after genuinely investigating, you cannot determine with confidence that a single
   fix covers both drivers correctly, say so explicitly in `HANDOFF.md` rather than
   guessing — this is exactly the kind of value AGENTS.md §14.5 says to stop and report
   rather than invent.
4. Do not change the test file's expectations (`superadmin.test.ts` lines 476-528) — the
   test's expected behavior (409, and all rows still existing afterward) is correct and is
   the specification. Fix the route to satisfy it, not the other way around.
5. If you find, while investigating, evidence about whether the transaction actually did or
   did not roll back correctly on the 500 path (e.g. by reasoning about how `db.transaction`
   is implemented for both adapters — does throwing inside a `db.transaction(async (tx) =>
   {...})` callback reliably issue a `ROLLBACK` before the error propagates, for both
   `drizzle-orm/pglite` and `drizzle-orm/node-postgres`?), report that finding explicitly —
   this matters even independently of the status-code fix, since it's the difference between
   "wrong error code, data safe" and "wrong error code, data at risk."

## Do NOT touch
- Any file other than `artifacts/api-server/src/routes/superadmin.ts` and, only if
  genuinely necessary, `artifacts/api-server/tests/superadmin.test.ts` (but only to add
  diagnostic assertions/logging if that helps prove your fix — not to weaken the existing
  assertions)
- The delete order/transaction body/logic in `DELETE /departments/:id` — this fix is about
  error classification only
- `AdminPortal.tsx`, `apiClient.ts` — not in scope for this fix
- Any schema file, any migration
- Any shell command whatsoever

## Hard stops — stop and report, do not decide
- If fixing this would require adding an `onDelete: "cascade"` anywhere, or any schema
  change — stop, that is absolutely out of scope and dangerous (see the original Item 2
  investigation in `HANDOFF.md`'s git history / dispatch 15's job report)
- Any value you would otherwise guess or invent about production driver behavior — say so
  and report your confidence level explicitly instead

## Report
Write `HANDOFF.md` at the repo root (append a new dated section rather than overwriting —
this dispatch is a fix-round on top of dispatch 15's unwritten work, and dispatch 14's
report before that is already reviewed; use your judgment on a clear structure, but do not
destroy the ability to tell what changed in this fix specifically):
- The actual root cause you found (the real error shape from each driver, with evidence —
  quote the driver source you read)
- The exact fix applied, with file:line
- Your assessment of whether the transaction rolled back correctly even under the old
  (buggy) 500 path, and why
- Anything you could not determine with confidence, named explicitly

Do not open a pull request. Do not run `git commit` or `git push`.

## Model
Claude Sonnet 4.6 (Thinking) — this is a narrow, well-diagnosed bug fix, not a new design
decision.


## Files you may touch
- artifacts/api-server/src/routes/superadmin.ts
- artifacts/api-server/tests/superadmin.test.ts
- HANDOFF.md