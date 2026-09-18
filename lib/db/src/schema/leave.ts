import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { studentsTable } from "./students.js";
import { usersTable } from "./users.js";

export const leaveRecordsTable = pgTable("leave_records", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  leaveType: text("leave_type").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  reason: text("reason"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).default("pending"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLeaveRecordSchema = createInsertSchema(leaveRecordsTable);
export type InsertLeaveRecord = typeof leaveRecordsTable.$inferInsert;
export type LeaveRecord = typeof leaveRecordsTable.$inferSelect;
