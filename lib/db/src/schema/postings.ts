import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { studentsTable } from "./students.js";
import { usersTable } from "./users.js";

export const postingsTable = pgTable("postings", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  ward: text("ward").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  supervisorId: integer("supervisor_id").references(() => usersTable.id),
  status: text("status", { enum: ["pending", "verified", "rejected"] }).notNull().default("pending"),
  facultyRemarks: text("faculty_remarks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPostingSchema = createInsertSchema(postingsTable);
export type InsertPosting = typeof postingsTable.$inferInsert;
export type Posting = typeof postingsTable.$inferSelect;
