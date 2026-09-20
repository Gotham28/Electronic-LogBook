# Antigravity dispatch 25 — Fix assignment/assignment_types/assignment_recipients fixtures in hard-delete.test.ts

## Guard
This prompt is for the project `Electronic-LogBook` (Gotham28/Electronic-LogBook), branch
`feature/hard-delete-students-faculty`. If this is not that repo, stop, say which repo this
is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. Do the entire task using only file-reading
and file-editing tools.

## Context
The `case_logs` fixture in `artifacts/api-server/tests/hard-delete.test.ts` was already fixed
in a previous dispatch (that test now passes). Running `pnpm test` now shows the remaining
failure is in the professor-delete test, at the `assignment_types` / `assignments` /
`assignment_recipients` inserts, which also use field names/values that don't match the real
schema (`lib/db/src/schema/assignments.ts`):

```ts
export const assignmentTypesTable = pgTable("assignment_types", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, ...);

export const assignmentsTable = pgTable("assignments", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id),
  typeId: integer("type_id").notNull().references(() => assignmentTypesTable.id),
  facultyId: integer("faculty_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, ...);

export const assignmentRecipientsTable = pgTable("assignment_recipients", {
  id: serial("id").primaryKey(),
  assignmentId: integer("assignment_id").notNull().references(() => assignmentsTable.id),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  status: text("status", { enum: ["assigned", "submitted", "returned", "completed"] }).notNull().default("assigned"),
  response: text("response"),
  feedback: text("feedback"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
}, ...);
```

## Build
In the professor-delete test's three insert calls in `hard-delete.test.ts`:
- [ ] `db.insert(assignmentTypesTable)`: add `description: "Test description"` — the column
  is `NOT NULL` with no default and is currently missing entirely, which is why the insert
  fails.
- [ ] `db.insert(assignmentsTable)`: the current insert uses `dueDate: "2026-10-01"`, but the
  real column is `dueAt` (a `timestamp` with timezone), not `dueDate` — replace it with
  `dueAt: new Date("2026-10-01T00:00:00Z")`. Also add `instructions: "Test instructions"` —
  that column is `NOT NULL` with no default and is currently missing entirely.
- [ ] `db.insert(assignmentRecipientsTable)`: the current insert sets `status: "pending"`,
  but `"pending"` is not a valid value for this table's status enum
  (`"assigned" | "submitted" | "returned" | "completed"` — this is a different enum than the
  one `case_logs`/`procedure_logs` use). Either remove the `status` field entirely (the
  column defaults to `"assigned"`) or set it explicitly to `"assigned"` — your choice, both
  are correct; pick whichever reads more clearly in context.
- [ ] Do not change anything else — not the `case_logs` insert (already fixed and correct),
  not any assertion, not any other test.

## Do NOT touch
- `artifacts/api-server/src/routes/admin.ts`
- `artifacts/mockup-sandbox/src/components/HODPortal.tsx`
- Any schema file under `lib/db/`
- Any test file other than `artifacts/api-server/tests/hard-delete.test.ts`
- Any assertion or test logic inside `hard-delete.test.ts` — only the three insert payloads
  named above
- The already-fixed `case_logs` insert in the same file

## Report
Overwrite `HANDOFF.md` at the repo root with what changed and why. Do not open a pull
request. Do not run `git commit` or `git push`.


## Files you may touch
- artifacts/api-server/tests/hard-delete.test.ts
- HANDOFF.md