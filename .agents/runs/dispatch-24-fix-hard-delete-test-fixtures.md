# Antigravity dispatch 24 — Fix case_logs test fixtures in hard-delete.test.ts

job_id: 57ff2337be9945889d442d4fea9e517a
workdir: D:\Electronic-LogBook-main
branch: feature/hard-delete-students-faculty
model: Gemini 3.1 Pro (High)
allowed_paths:
- artifacts/api-server/tests/hard-delete.test.ts
- HANDOFF.md

Follow-up to dispatch 23 (which the developer ran directly in Antigravity's own UI, outside
Claude Code, because the auto-mode classifier blocked agy_start_edit for that task even
after developer approval). Claude Code verified dispatch 23's result by running `pnpm test`
directly: 84/86 passing, 2 failing — both new hard-delete tests fail because
`hard-delete.test.ts`'s `case_logs` insert fixtures use field names that don't match the
real schema (`diagnosis` instead of `diagnosisProvisional`/`diagnosisFinal`, `patientInitials`
instead of `patientUhid`, `patientGender: "M"` instead of a valid enum value, a nonexistent
`departmentId` column). The actual hard-delete route logic was never exercised by either
failing test — the insert itself fails first. This dispatch fixes only the test fixtures.

This is the first dispatch sent via agy_start_edit for this task after the developer added a
`mcp__agy-bridge__agy_start_edit` permission rule to `.claude/settings.local.json` to work
around the auto-mode classifier's repeated blocks on this task. It went through cleanly.

## Guard
This prompt is for the project `Electronic-LogBook` (Gotham28/Electronic-LogBook), branch
`feature/hard-delete-students-faculty`. If this is not that repo, stop, say which repo this
is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. Do the entire task using only file-reading
and file-editing tools.

## Context
`artifacts/api-server/tests/hard-delete.test.ts` inserts `case_logs` rows using field names
that don't match the real schema (`lib/db/src/schema/logs.ts`), so `pnpm test` fails both new
tests with a NOT NULL constraint violation before the actual hard-delete route under test is
ever exercised. The real `caseLogsTable` schema:

```ts
export const caseLogsTable = pgTable("case_logs", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  supervisorId: integer("supervisor_id").references(() => usersTable.id),
  date: text("date").notNull(),
  attemptNumber: integer("attempt_number").default(1),
  patientUhid: text("patient_uhid"),
  patientAge: text("patient_age").notNull(),
  patientGender: text("patient_gender", { enum: ["male", "female", "other"] }).notNull(),
  chiefComplaints: text("chief_complaints"),
  diagnosisProvisional: text("diagnosis_provisional"),
  diagnosisFinal: text("diagnosis_final").notNull(),
  history: text("history"),
  examination: text("examination"),
  investigations: text("investigations"),
  differentialDiagnosis: text("differential_diagnosis"),
  managementPlan: text("management_plan"),
  outcome: text("outcome"),
  learningPoints: text("learning_points"),
  status: text("status", { enum: ["pending", "verified", "rejected"] }).default("pending"),
  facultyRemarks: text("faculty_remarks"),
  facultyGrade: text("faculty_grade"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

There is no `department_id` column on `case_logs` at all (department is derived transitively
through `studentId` → `studentsTable`).

## Build
- [ ] In `artifacts/api-server/tests/hard-delete.test.ts`, fix both `db.insert(caseLogsTable)`
  calls (one in the student-delete test, one in the professor-delete test):
  - Remove `departmentId` — not a real column on `case_logs`, it's silently dropped today
    (harmless at runtime but wrong/confusing; remove it for clarity).
  - Replace `patientInitials: "JD"` with `patientUhid: "JD"` (the real column name).
  - Replace `diagnosis: "Test"` with both `diagnosisProvisional: "Test"` and
    `diagnosisFinal: "Test"` — `diagnosisFinal` is `NOT NULL` with no default, which is
    exactly why both current tests fail before the route under test ever runs.
  - Replace `patientGender: "M"` with `patientGender: "male"` — the column is a
    `["male", "female", "other"]` enum; `"M"` is not a valid value and would also fail once
    the `diagnosisFinal` issue is fixed.
  - Change `patientAge: 30` (a number) to `patientAge: "30"` (a string) — the column is
    `text`, not integer.
  - Do not change anything else in either insert call (`studentId`, `date`, `status`,
    `reviewedBy` in the second test all stay as they are — only the fields named above are
    wrong).
- [ ] Do not touch any assertion, any other test, or any other file. This is a fixture-data
  fix only — the actual hard-delete route logic in `admin.ts` is not in scope for this
  dispatch and must not be touched.

## Do NOT touch
- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/mockup-sandbox/src/components/HODPortal.tsx`
- Any schema file under `lib/db/`
- Any test file other than `artifacts/api-server/tests/hard-delete.test.ts`
- Any assertion or test logic inside `hard-delete.test.ts` — only the two insert payloads

## Report
Overwrite `HANDOFF.md` at the repo root with what changed and why. Do not open a pull
request. Do not run `git commit` or `git push`.
