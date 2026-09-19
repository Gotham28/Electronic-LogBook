# HANDOFF.md — Dispatch 48

Supersedes dispatch 47's HANDOFF.md.

## Files modified

- `artifacts/api-server/src/lib/department-requirements.ts`
- `artifacts/api-server/tests/access.test.ts`

---

## Build item 1 — atomic upsert in `department-requirements.ts`

Both `recomputeProcedureRequirement` and `recomputeCatalogRequirements` previously
performed a SELECT to check for an existing `department_configs` row, then branched to
a separate INSERT or UPDATE. Two near-simultaneous calls for a new department could both
see "no row" and both attempt INSERT, causing an unhandled unique-constraint violation on
`department_configs.departmentId`.

Both functions now use a single atomic Drizzle upsert (`.onConflictDoUpdate`), matching
the convention established in `department-provisioning.ts:30-31`. The two SUM queries are
unchanged. Only the write mechanism changed.

### Diff — `artifacts/api-server/src/lib/department-requirements.ts`

```diff
@@ -17,25 +17,8 @@
 
   const requiredProcedures = Number(row?.total ?? 0);
 
-  const existing = await db
-    .select({ id: departmentConfigsTable.id })
-    .from(departmentConfigsTable)
-    .where(eq(departmentConfigsTable.departmentId, departmentId))
-    .limit(1);
-
-  if (existing.length > 0) {
-    await db
-      .update(departmentConfigsTable)
-      .set({ requiredProcedures })
-      .where(eq(departmentConfigsTable.departmentId, departmentId));
-  } else {
-    await db.insert(departmentConfigsTable).values({
-      departmentId,
-      requiredProcedures,
-      // requiredCases / requiredAcademic left at schema default (0)
-      // programDurationMonths / casualLeaveAllowance / academicLeaveAllowance left null
-    });
-  }
+  await db.insert(departmentConfigsTable).values({ departmentId, requiredProcedures })
+    .onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: { requiredProcedures } });
 }
 
 /**
@@ -58,25 +41,7 @@
   const requiredCases = Number(casesRow?.total ?? 0);
   const requiredAcademic = Number(academicRow?.total ?? 0);
 
-  const existing = await db
-    .select({ id: departmentConfigsTable.id })
-    .from(departmentConfigsTable)
-    .where(eq(departmentConfigsTable.departmentId, departmentId))
-    .limit(1);
-
-  if (existing.length > 0) {
-    await db
-      .update(departmentConfigsTable)
-      .set({ requiredCases, requiredAcademic })
-      .where(eq(departmentConfigsTable.departmentId, departmentId));
-  } else {
-    await db.insert(departmentConfigsTable).values({
-      departmentId,
-      requiredCases,
-      requiredAcademic,
-      // requiredProcedures left at schema default (0)
-      // programDurationMonths / casualLeaveAllowance / academicLeaveAllowance left null
-    });
-  }
+  await db.insert(departmentConfigsTable).values({ departmentId, requiredCases, requiredAcademic })
+    .onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: { requiredCases, requiredAcademic } });
 }
```

---

## Build item 2 — real test coverage in `access.test.ts`

Inserted a block of 6 lines into the test
`"HOD requirements and training catalog are database-backed and reject cross-department updates"`,
immediately after the existing `assert.equal(option.status, 201)` line (the `academic`/`period: "month"` entry)
and before the cross-department PATCH assertion.

### Value derivation

| Assertion | Value | Derivation |
|---|---|---|
| `requiredCases` after one `case_category`/`total` row at `required: 5` | **5** | `departmentIds[2]` starts with zero `case_category` catalog rows → SUM = 5 |
| `requiredAcademic` after one more `academic`/`total` row at `required: 7` | **12** | Existing seed row "Test discussion 2" at `required: 5` + new row at `required: 7` = 12. The `period: "month"` "Custom seminar" added earlier in this test is excluded from the sum. |

### Diff — `artifacts/api-server/tests/access.test.ts`

```diff
@@ -212,6 +212,12 @@
   assert.equal((await call("/departments/" + departmentIds[2] + "/catalog", "student2")).body.config.requiredCases, 9);
   const option = await call("/admin/department/catalog", "hod2", "POST", { kind: "academic", name: "Custom seminar", value: "custom-seminar", required: 2, period: "month" });
   assert.equal(option.status, 201);
+  const caseCategory = await call("/admin/department/catalog", "hod2", "POST", { kind: "case_category", name: "Custom case type", value: "custom-case-type", required: 5, period: "total" });
+  assert.equal(caseCategory.status, 201);
+  assert.equal((await call("/departments/" + departmentIds[2] + "/catalog", "student2")).body.config.requiredCases, 5);
+  const academicTotal = await call("/admin/department/catalog", "hod2", "POST", { kind: "academic", name: "Custom total seminar", value: "custom-total-seminar", required: 7, period: "total" });
+  assert.equal(academicTotal.status, 201);
+  assert.equal((await call("/departments/" + departmentIds[2] + "/catalog", "student2")).body.config.requiredAcademic, 12);
   assert.equal((await call("/admin/department/catalog/" + option.body.id, "hod0", "PATCH", { required: 200, period: "total" })).status, 404);
 });
```

---

## Commands run

None. No shell commands, no typecheck, no test run, no git commands.

## Not touched

- `admin.ts` call sites — untouched, already correct.
- `validation.ts` — untouched.
- `DepartmentSettings.tsx` — untouched.
- `tests/support.ts` — untouched.
- No schema changes, migrations, or backfills.
- No secrets or credentials.

## Noticed but not changed

Nothing outside scope was observed that requires flagging.
