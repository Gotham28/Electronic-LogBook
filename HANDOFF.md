# HANDOFF — Faculty Progress Endpoint (Task 1 of 2)

Branch: `feature/faculty-progress-breakdown`

## What changed

### `artifacts/api-server/src/routes/student.ts`

One new route added: `GET /:studentId/progress` (lines 225–393 in the modified file),
inserted between the closing `});` of `/:studentId/logs` (line 223) and the `// Postings`
comment (now line 395).

**No other file was touched. No existing route was modified.**

#### What the new route does

1. Parses `studentId` from the route parameter (lines 234–238).
2. Defense-in-depth: re-resolves the student row via `studentsTable` JOIN `usersTable` and
   re-checks `caller.departmentId !== student.departmentId`, mirroring `/:studentId/logs`
   (lines 147–176). This is redundant with `studentAccess` (line 26) but required by
   AGENTS.md §3 (lines 240–252, 259–268).
3. Runs three `GROUP BY` queries in parallel via `Promise.all` (lines 272–306):
   - **Query 1** — `case_logs` grouped by `category, status`, filtered by
     `studentId = ? AND deletedAt IS NULL` (lines 275–282).
   - **Query 2** — `procedure_logs` grouped by `procedureGroup, procedureName,
     competencyLevel, status`, filtered by `studentId = ? AND deletedAt IS NULL`
     (lines 285–294).
   - **Query 3** — `academic_logs` grouped by `activityType, status`, filtered by
     `studentId = ?` only — no `deletedAt` filter because academic_logs has no `deletedAt`
     column (lines 298–305).
4. Reshapes the raw per-status rows into the specified JSON shape (lines 308–385):
   - `caseCategories: [{ value, verified, pending }]`
   - `procedures: [{ group, name, verified, pending, byCompetency: [{ level, verified, pending }] }]`
   - `academics: [{ value, verified, pending }]`
5. Returns counts only — `res.json({ caseCategories, procedures, academics })` (line 388).
6. Error logging: id and status code only, no patient text (line 390).

## Diff

```diff
@@ -222,6 +222,176 @@
   }
 });

+// Progress — per-item log counts (category, procedure, academic type) by verified/pending.
+// Unlike /:studentId/logs above, which is assignment-scoped ("Faculty inspection is
+// assignment-scoped. HODs retain department-wide oversight." — student.ts:178), this
+// endpoint deliberately does NOT filter by supervisorId. Progress counts represent the
+// student's total training progress across all supervisors, not what one supervisor
+// personally reviewed. A professor calling this route sees the same totals as the HOD,
+// because the purpose is to assess training completeness, not to scope inspection.
+router.get("/:studentId/progress", requireAuth, async (req, res) => {
+  try {
+    const studentId = parseInt(String(req.params.studentId), 10);
+    if (isNaN(studentId)) {
+      res.status(400).json({ message: "Invalid studentId format" });
+      return;
+    }
+
+    // Defense-in-depth: re-resolve the student row and re-check departmentId,
+    // mirroring /:studentId/logs (student.ts:147-176), even though studentAccess
+    // (line 26) already covers this. AGENTS.md §3 treats a missing re-check as a
+    // defect, not redundant code.
+    const studentMatch = await db.select({
+      id: studentsTable.id,
+      userId: studentsTable.userId,
+      departmentId: usersTable.departmentId,
+    })
+    .from(studentsTable)
+    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
+    .where(eq(studentsTable.id, studentId))
+    .limit(1);
+
+    if (studentMatch.length === 0) {
+      res.status(404).json({ message: "Student not found" });
+      return;
+    }
+
+    const caller = req.user!;
+    const student = studentMatch[0];
+    if (caller.role === "student" && caller.id !== student.userId) {
+      res.status(403).json({ message: "You may only view your own progress" });
+      return;
+    }
+    if (["professor", "hod"].includes(caller.role) && caller.departmentId !== student.departmentId) {
+      res.status(403).json({ message: "This student is outside your department" });
+      return;
+    }
+
+    // All three queries filter by studentId only — no supervisorId filter.
+    // See the comment block above this handler for why.
+    const [caseCounts, procedureCounts, academicCounts] = await Promise.all([
+      // Query 1: case_logs grouped by category and status.
+      // NULL category (rows predating migration 0005) is a valid group — passed through as null.
+      db.select({
+        category: caseLogsTable.category,
+        status: caseLogsTable.status,
+        count: count(),
+      })
+      .from(caseLogsTable)
+      .where(and(eq(caseLogsTable.studentId, studentId), isNull(caseLogsTable.deletedAt)))
+      .groupBy(caseLogsTable.category, caseLogsTable.status),
+
+      // Query 2: procedure_logs grouped by procedureGroup, procedureName, competencyLevel, status.
+      db.select({
+        procedureGroup: procedureLogsTable.procedureGroup,
+        procedureName: procedureLogsTable.procedureName,
+        competencyLevel: procedureLogsTable.competencyLevel,
+        status: procedureLogsTable.status,
+        count: count(),
+      })
+      .from(procedureLogsTable)
+      .where(and(eq(procedureLogsTable.studentId, studentId), isNull(procedureLogsTable.deletedAt)))
+      .groupBy(procedureLogsTable.procedureGroup, procedureLogsTable.procedureName, procedureLogsTable.competencyLevel, procedureLogsTable.status),
+
+      // Query 3: academic_logs grouped by activityType and status.
+      // academic_logs has no deletedAt column — no deletedAt filter here.
+      db.select({
+        activityType: academicLogsTable.activityType,
+        status: academicLogsTable.status,
+        count: count(),
+      })
+      .from(academicLogsTable)
+      .where(eq(academicLogsTable.studentId, studentId))
+      .groupBy(academicLogsTable.activityType, academicLogsTable.status),
+    ]);
+
+    // Reshape raw per-status rows into the response shape.
+    // "verified" counts rows with status="verified". "pending" counts rows with
+    // status="pending". Rows with status="rejected" are counted in neither.
+
+    // --- Case categories ---
+    const caseCategoryMap = new Map<string | null, { verified: number; pending: number }>();
+    for (const row of caseCounts) {
+      const key = row.category ?? null;
+      if (!caseCategoryMap.has(key)) {
+        caseCategoryMap.set(key, { verified: 0, pending: 0 });
+      }
+      const entry = caseCategoryMap.get(key)!;
+      if (row.status === "verified") entry.verified += Number(row.count);
+      else if (row.status === "pending") entry.pending += Number(row.count);
+    }
+    const caseCategories = Array.from(caseCategoryMap.entries()).map(([value, counts]) => ({
+      value,
+      verified: counts.verified,
+      pending: counts.pending,
+    }));
+
+    // --- Procedures (group+name totals, with byCompetency breakdown) ---
+    const procedureMap = new Map<string, {
+      group: string;
+      name: string;
+      verified: number;
+      pending: number;
+      competencyMap: Map<string, { verified: number; pending: number }>;
+    }>();
+    for (const row of procedureCounts) {
+      const key = `${row.procedureGroup}\0${row.procedureName}`;
+      if (!procedureMap.has(key)) {
+        procedureMap.set(key, {
+          group: row.procedureGroup,
+          name: row.procedureName,
+          verified: 0,
+          pending: 0,
+          competencyMap: new Map(),
+        });
+      }
+      const entry = procedureMap.get(key)!;
+      if (row.status === "verified") entry.verified += Number(row.count);
+      else if (row.status === "pending") entry.pending += Number(row.count);
+
+      if (!entry.competencyMap.has(row.competencyLevel)) {
+        entry.competencyMap.set(row.competencyLevel, { verified: 0, pending: 0 });
+      }
+      const compEntry = entry.competencyMap.get(row.competencyLevel)!;
+      if (row.status === "verified") compEntry.verified += Number(row.count);
+      else if (row.status === "pending") compEntry.pending += Number(row.count);
+    }
+    const procedures = Array.from(procedureMap.values()).map((entry) => ({
+      group: entry.group,
+      name: entry.name,
+      verified: entry.verified,
+      pending: entry.pending,
+      byCompetency: Array.from(entry.competencyMap.entries()).map(([level, counts]) => ({
+        level,
+        verified: counts.verified,
+        pending: counts.pending,
+      })),
+    }));
+
+    // --- Academics ---
+    const academicMap = new Map<string, { verified: number; pending: number }>();
+    for (const row of academicCounts) {
+      if (!academicMap.has(row.activityType)) {
+        academicMap.set(row.activityType, { verified: 0, pending: 0 });
+      }
+      const entry = academicMap.get(row.activityType)!;
+      if (row.status === "verified") entry.verified += Number(row.count);
+      else if (row.status === "pending") entry.pending += Number(row.count);
+    }
+    const academics = Array.from(academicMap.entries()).map(([value, counts]) => ({
+      value,
+      verified: counts.verified,
+      pending: counts.pending,
+    }));
+
+    // Counts only — no patient text, no UHID, no free-text field (AGENTS.md §8).
+    res.json({ caseCategories, procedures, academics });
+  } catch (error) {
+    req.log.error({ studentId: req.params.studentId, status: 500 }, "Error fetching student progress");
+    res.status(500).json({ message: "Internal server error" });
+  }
+});
+
 // Postings
 router.get("/:studentId/postings", async (req, res) => {
```

## Confirmations — read directly from the file

### 1. No `supervisorId` filter in any of the three new queries

- **Query 1** (lines 275–282): `.where(and(eq(caseLogsTable.studentId, studentId), isNull(caseLogsTable.deletedAt)))` — no `supervisorId`.
- **Query 2** (lines 285–294): `.where(and(eq(procedureLogsTable.studentId, studentId), isNull(procedureLogsTable.deletedAt)))` — no `supervisorId`.
- **Query 3** (lines 298–305): `.where(eq(academicLogsTable.studentId, studentId))` — no `supervisorId`.

### 2. No `conferences` reference in the new route

The string `conference` does not appear anywhere in lines 225–393. The existing
`conferencesTable` import (line 5) and the `conferenceFilter`/`conferenceLogsRaw` usage in
`/:studentId/logs` (lines 188–204) are untouched.

### 3. No `target`/`required` field in the response shape

The only call to `res.json` in the new route is at line 388:
`res.json({ caseCategories, procedures, academics })`. None of these three arrays contain a
`required`, `target`, or `percentage` field. The response contains only `value`/`group`/
`name`/`level`, `verified`, and `pending`.

## Skipped

- **All shell commands** — the dispatch explicitly prohibits `run_command` for any purpose.
  No `git status`, no `git stash list`, no `git checkout`, no `git pull`, no `pnpm test`,
  no typecheck. The §1 "pull before every task" rule cannot be satisfied under this
  constraint; this is noted as skipped rather than silently omitted.
- **No test file touched** — explicitly out of scope per `CURRENT_TASK.md`.
- **No other file touched** — only `student.ts` and this `HANDOFF.md`.

## Expanded beyond Build list

Nothing. Only the one route specified, plus this report.

## Noticed but not changed

- The existing `/:studentId/postings` GET handler (line 396, formerly 226) does not have
  `requireAuth` in its own middleware chain, unlike `/:studentId/logs` and the new
  `/:studentId/progress`. It relies solely on the `requireAuth` at the router level
  (line 15) and `studentAccess` (line 26). This is not a defect (it works), but is a
  stylistic inconsistency with the other GET handlers. Not touched per §9.

## Commands run

None. The sandbox constraint forbids all shell commands.

---

## Dispatch 52 — Fix NULL status handling in case-category reshape loop

### What changed

One condition in `artifacts/api-server/src/routes/student.ts`, in the case-category
reshape loop only.

### Diff

```diff
@@ -320,7 +320,10 @@
       const entry = caseCategoryMap.get(key)!;
       if (row.status === "verified") entry.verified += Number(row.count);
-      else if (row.status === "pending") entry.pending += Number(row.count);
+      // case_logs.status has no NOT NULL constraint (unlike procedure_logs.status and
+      // academic_logs.status) — a NULL status is treated as pending, matching the
+      // column's DEFAULT 'pending' semantics.
+      else if (row.status === "pending" || row.status === null) entry.pending += Number(row.count);
     }
     const caseCategories = Array.from(caseCategoryMap.entries()).map(([value, counts]) => ({
```

### Confirmations — read directly from the file after the edit

**Procedure reshape loop not touched** — read from
[student.ts lines 352–353](file:///D:/Electronic-LogBook-main/artifacts/api-server/src/routes/student.ts#L352-L353)
and [lines 359–360](file:///D:/Electronic-LogBook-main/artifacts/api-server/src/routes/student.ts#L359-L360):
```
      if (row.status === "verified") entry.verified += Number(row.count);
      else if (row.status === "pending") entry.pending += Number(row.count);
```
Both conditions in the procedure loop remain `=== "pending"` only — no `null` handling
added, because `procedure_logs.status` is `NOT NULL`.

**Academic reshape loop not touched** — read from
[student.ts lines 381–382](file:///D:/Electronic-LogBook-main/artifacts/api-server/src/routes/student.ts#L381-L382):
```
      if (row.status === "verified") entry.verified += Number(row.count);
      else if (row.status === "pending") entry.pending += Number(row.count);
```
Condition remains `=== "pending"` only — no `null` handling added, because
`academic_logs.status` is `NOT NULL`.

**No other line in student.ts changed.** The file grew from 961 lines to 964 lines (net +3
from the 2-line comment plus the expanded condition line replacing the original 1-line
condition). All other code — the redundant department re-check block, the three queries,
the procedure and academic reshape loops, every other route — is byte-identical to dispatch
51's output.

**No other file touched** besides this HANDOFF.md.

### Commands run

None. The sandbox constraint forbids all shell commands.
