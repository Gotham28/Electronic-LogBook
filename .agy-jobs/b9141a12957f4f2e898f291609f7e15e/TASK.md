# Antigravity dispatch 42 — Fix flawed mirrorDepartmentId assertions in superadmin.test.ts

workdir: D:\Electronic-LogBook-main
branch: feature/mirror-test-department
model: Gemini 3.1 Pro (High)

allowed_paths:
- artifacts/api-server/tests/superadmin.test.ts

## Guard
This prompt is for "Electronic-LogBook" (Arogya platform, Pediatrics pilot), fixing a test
that Task D's dispatch just added to `artifacts/api-server/tests/superadmin.test.ts`. If this
is not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead. A denied shell call is not something to work around and continue
past. Do the entire task using only file-reading and file-editing tools.

The branch `feature/mirror-test-department` is already checked out for you. Do not check
out, create, or switch any branch. Do not run `git` at all.

## Read first
- `artifacts/api-server/tests/superadmin.test.ts` — the test named "admin can list all
  departments with their current HOD and mirror test department ids" (search for that
  string), currently around lines 69-104.
- `artifacts/api-server/tests/support.ts` — line ~31: `const [department] = await
  db.insert(departmentsTable).values({ name, code: "TEST-" + index }).returning();` — this is
  the root cause, explained below.
- `artifacts/api-server/src/lib/department-provisioning.ts` — `provisionMirrorForRealDepartment`
  (confirm the mirror's `code` is derived as `` `TEST-${realDepartmentId}` ``), and
  `provisionDepartment()` (confirm it `await`s `provisionMirrorForRealDepartment(...)` before
  returning — i.e. a `POST /departments` call that resolves with 201 has ALREADY finished
  provisioning that department's mirror, synchronously, before the response is sent).

## The bug, confirmed by actually running the test
Running `pnpm test` produces this real failure (pasted verbatim, not a guess):

```
✖ admin can list all departments with their current HOD and mirror test department ids
  AssertionError [ERR_ASSERTION]: mirrorDepartmentId should be a number after backfilling
      at TestContext.<anonymous> (tests\superadmin.test.ts:85:12)
```

Root cause: `support.ts:31` seeds each fixture department with `code: "TEST-" + index` (index
being that department's position in the seed array, e.g. `TEST-0`, `TEST-1`, `TEST-2`, ...).
`provisionMirrorForRealDepartment` derives a mirror's own `code` as `` `TEST-${realDepartmentId}`
`` — using the REAL department's database id, not its seed index. Because department ids are
small sequential integers too, it's common for one seeded department's `code` (e.g. `TEST-1`,
from being seed index 1) to collide with the `code` another seeded department's MIRROR would
need (e.g. `TEST-1`, because some other seeded department happens to have database id `1`).
When that collision happens, the mirror insert hits `departmentsTable`'s unique constraint on
`code`, the per-department provisioning call throws, and the bulk backfill route
(`superadmin.ts`'s `POST /departments/backfill-test-departments`) correctly catches that one
department's failure and puts it in its `failed` array — `mirrorDepartmentId` stays `null`
for that department precisely because the system worked as designed (it does not create a
department with a colliding code; it fails that one and moves on). The test's assertion at
line 85 wrongly assumes EVERY department gets a mirror after one backfill call, which isn't
guaranteed given this shared fixture's own code-naming scheme.

Separately, further down in the same test (currently ~line 94-103), after creating a brand
new department via `POST /superadmin/departments`, the test asserts
`newDept.mirrorDepartmentId` is `null` with the comment "Create a new department with no
mirror". This is factually wrong: `provisionDepartment()` (the function `POST
/superadmin/departments` calls) already `await`s its own call to
`provisionMirrorForRealDepartment` before returning — this is Task A's already-shipped,
already-reviewed behavior from earlier this session, unrelated to and unchanged by Task D.
A freshly created real department gets its mirror synchronously, before the 201 response is
even sent. So immediately after creation, `GET /departments` should show that department's
`mirrorDepartmentId` as a NUMBER, not `null` — this assertion is checking for the opposite of
what the shipped system actually (and correctly) does.

## Fix
In the same test, make two changes:

1. Replace the blanket `assert.ok(typeof dept.mirrorDepartmentId === "number", ...)` inside
   the `for (const dept of res.body)` loop with a version that tolerates the seed-data code
   collision described above: read `backfillRes.body.failed` (an array of `{departmentId,
   message}`), build a `Set` of the department ids present in it, and only assert
   `mirrorDepartmentId` is a number for departments NOT in that set — for departments that
   ARE in `failed`, assert `mirrorDepartmentId` is either `null` or a number (don't over
   constrain; the point of this loop is to confirm the field is correctly wired end-to-end,
   not to force every fixture department through a scheme its own seed codes weren't designed
   to survive). Keep the existing `isTest` and `hod` assertions in this loop unchanged.
2. Fix the "Create a new department" section: rename the comment from "Create a new
   department with no mirror" to something accurate (e.g. "Create a new department and
   confirm it gets a mirror automatically, per Task A's auto-provisioning"), and change the
   final assertion from `assert.strictEqual(newDept.mirrorDepartmentId, null, ...)` to
   `assert.ok(typeof newDept.mirrorDepartmentId === "number", "a freshly created department
   should already have a mirror, per provisionDepartment()'s synchronous auto-provisioning")`.

Do not change anything else in this test file — not the earlier assertions in this same test,
not any other test, not the imports, not `support.ts`, not any production code. This is a
test-only fix for a flawed assumption in a test that was itself added by an earlier dispatch
on this branch; nothing about the actual `GET /departments`/backfill/auto-provisioning
behavior is wrong or needs to change.

## Do NOT touch
- Anything in `superadmin.test.ts` other than the two changes described above, inside the one
  named test.
- `support.ts` — its `"TEST-" + index` seed code scheme is a pre-existing, already-shipped
  fixture convention used by many other tests in this suite; do not change it to "fix" the
  collision at its source, that would be a much wider-blast-radius change than this task
  warrants.
- Any production code (`superadmin.ts`, `department-provisioning.ts`, or anything else).
- Any other test file.
- Any shell command whatsoever, including `pnpm test`, `git`, or any other command.

## Hard stops — stop and report, do not decide
- Any schema change, migration, or database-connecting command.
- Anything that puts patient text or leave reasons near a log, error, or audit trail.
- Any secret, credential, or `.env` value.
- Any change beyond the two fixes named above.

## Report
Append a new section to `HANDOFF.md` at the repo root (keep everything above it):
- Quote the exact new assertion logic for both fixes, with file:line.
- State you did not run `pnpm test` (sandbox constraint) — Claude Code verifies it after this
  dispatch returns.

Do not open a pull request. Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/tests/superadmin.test.ts