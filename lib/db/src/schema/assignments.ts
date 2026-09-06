import { pgTable, serial, text, integer, timestamp, unique, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { departmentsTable, usersTable } from "./users.js";
import { studentsTable } from "./students.js";

export const assignmentTypesTable = pgTable("assignment_types", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique("assignment_types_department_name_unique").on(t.departmentId, t.name)]);

export const assignmentsTable = pgTable("assignments", {
  id: serial("id").primaryKey(),
  departmentId: integer("department_id").notNull().references(() => departmentsTable.id),
  typeId: integer("type_id").notNull().references(() => assignmentTypesTable.id),
  facultyId: integer("faculty_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  instructions: text("instructions").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("assignments_department_faculty_idx").on(t.departmentId, t.facultyId)]);

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
}, (t) => [
  unique("assignment_recipient_unique").on(t.assignmentId, t.studentId),
  index("assignment_recipients_student_idx").on(t.studentId),
  check("assignment_recipient_status_check", sql`${t.status} IN ('assigned', 'submitted', 'returned', 'completed')`),
]);
