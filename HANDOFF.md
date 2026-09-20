# HANDOFF.md — Dispatch 57

**Date:** 2026-09-20
**Scope:** Fix Critical finding from dispatch 56 code review — the `isTest`-guard test
reimplemented the guard logic instead of calling the production function.

---

## What changed

### 1. `artifacts/api-server/src/routes/superadmin.ts` (line 228)

**Single-word change:** added `export` to the `deleteDepartmentCascade` function
declaration.

```
- async function deleteDepartmentCascade(tx: any, targetDepartmentId: number, isMirror: boolean = false): Promise<void> {
+ export async function deleteDepartmentCascade(tx: any, targetDepartmentId: number, isMirror: boolean = false): Promise<void> {
```

No change to the function's behavior, parameters, or internal logic.

### 2. `artifacts/api-server/tests/mirror-cascade-coverage.test.ts`

**Import added** (line 13):
```ts
import { deleteDepartmentCascade } from "../src/routes/superadmin.js";
```

**Test 4 rewritten** (lines 332–402). The test
`"department with configSourceDepartmentId set but isTest=false is refused rather than hard-deleted"`
now has two parts:

- **Part A** (lines 344–362): Wraps the rogue department insert (`isTest: false` +
  `configSourceDepartmentId` set) in `assert.rejects` and asserts it fails with the
  `mirror_test_dept_source_requires_test` CHECK constraint violation. This was previously
  a bare `await db.insert(...)` that would crash on constraint violation. Now it's a proper
  assertion.

- **Part B** (lines 364–401): Creates an ordinary real department (`isTest: false`, no
  `configSourceDepartmentId`), confirms it is `isTest === false`, opens a transaction, and
  calls the **actual exported `deleteDepartmentCascade`** at **line 386**:
  ```ts
  await deleteDepartmentCascade(tx, guardDeptId, true);
  ```
  Asserts this rejects with `statusOverride === 403` and a message containing `"non-test"`.
  Also verifies the department still exists after the rejected transaction.

---

## Confirmation: the test now calls the real function

**File:** `artifacts/api-server/tests/mirror-cascade-coverage.test.ts`, **line 386**:
```ts
await deleteDepartmentCascade(tx, guardDeptId, true);
```

This is the actual exported function from `artifacts/api-server/src/routes/superadmin.ts`
(line 228), imported at line 13. The test no longer contains any reimplementation of the
guard's select-and-check logic. If the guard in `superadmin.ts` were deleted, this test
would fail (the call would succeed instead of rejecting).

---

## Other three tests

Untouched. Tests 1 (12-table mirror delete), 2 (409 non-mirror), and 3
(catalog-derived-taxonomy) are exactly as they were in dispatch 56.

---

## What was skipped and why

- **Major/Minor findings from the code review** (missing tables in `checkedTables`,
  provisioning issues in `department-provisioning.ts`, AdminPortal.tsx changes) — all
  explicitly out of scope per dispatch instructions.
- **No shell commands were run** — sandbox constraint prohibits all command execution.
- **No tests were run** — verification happens outside this dispatch.

---

## What was expanded beyond the Build list

Nothing. Only the two files named under `## Build` were modified.

---

## Files modified

1. `artifacts/api-server/src/routes/superadmin.ts` — added `export` keyword (line 228)
2. `artifacts/api-server/tests/mirror-cascade-coverage.test.ts` — added import (line 13),
   rewrote test 4 body (lines 332–402)

---
---

# HANDOFF.md — Dispatch 58

**Date:** 2026-09-21
**Scope:** Fix one assertion in dispatch 57's test rewrite so it finds the CHECK constraint
name on `err.cause.message` (where Drizzle puts it) instead of only on `err.message`.

---

## What changed

### `artifacts/api-server/tests/mirror-cascade-coverage.test.ts` (lines 354–358)

The Part A assertion in test 4 checked `err.message.includes("mirror_test_dept_source_requires_test")`.
This fails because Drizzle wraps the underlying Postgres error: `err.message` is a generic
`"Failed query: insert into \"departments\" ..."` string that never contains the constraint
name. The actual constraint name (`violates check constraint "mirror_test_dept_source_requires_test"`)
lives on `err.cause.message`.

**Before:**
```ts
(err: any) => {
  assert.ok(
    err.message.includes("mirror_test_dept_source_requires_test"),
    `Expected CHECK constraint violation, got: ${err.message}`,
  );
```

**After:**
```ts
(err: any) => {
  const combined = err.message + " " + (err.cause?.message ?? "");
  assert.ok(
    combined.includes("mirror_test_dept_source_requires_test"),
    `Expected CHECK constraint violation, got: ${err.message} (cause: ${err.cause?.message ?? "none"})`,
  );
```

This checks both `err.message` and `err.cause?.message` so the assertion passes regardless
of which level carries the constraint name.

---

## What was not touched

- Everything else in `mirror-cascade-coverage.test.ts` (Part B, tests 1–3) — untouched.
- `superadmin.ts`, `department-provisioning.ts`, `AdminPortal.tsx` — untouched.
- No migrations, no schema files, no `.env`, no `lib/db/` files.
- No shell commands were run (sandbox constraint).
- No tests were run (verification happens outside this dispatch).

---

## Files modified

1. `artifacts/api-server/tests/mirror-cascade-coverage.test.ts` — fixed CHECK constraint
   assertion at lines 354–358 to search `err.cause?.message` in addition to `err.message`.
