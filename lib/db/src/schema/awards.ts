import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { studentsTable } from "./students.js";
import { usersTable } from "./users.js";

export const awardsTable = pgTable("awards", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  supervisorId: integer("supervisor_id").references(() => usersTable.id),
  date: text("date").notNull(),
  description: text("description").notNull(),
  status: text("status", { enum: ["pending", "verified", "rejected"] }).notNull().default("pending"),
  facultyRemarks: text("faculty_remarks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAwardSchema = createInsertSchema(awardsTable);
export type InsertAward = typeof awardsTable.$inferInsert;
export type Award = typeof awardsTable.$inferSelect;
