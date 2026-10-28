import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { studentsTable } from "./students.js";
import { usersTable } from "./users.js";

export const assessmentsTable = pgTable("assessments", {
  id: serial("id").primaryKey(),
  examName: text("exam_name").notNull(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  marks: integer("marks"),
  type: text("type", { enum: ["quarterly", "annual", "continuous", "half_yearly"] }).notNull(),
  date: text("date").notNull(),
  assessorId: integer("assessor_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAssessmentSchema = createInsertSchema(assessmentsTable);
export type InsertAssessment = typeof assessmentsTable.$inferInsert;
export type Assessment = typeof assessmentsTable.$inferSelect;
