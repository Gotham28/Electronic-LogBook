import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { studentsTable } from "./students.js";
import { usersTable } from "./users.js";

export const conferencesTable = pgTable("conferences", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  conferenceName: text("conference_name").notNull(),
  role: text("role", { enum: ["attended", "presented"] }).notNull(),
  date: text("date").notNull(),
  location: text("location"),
  certificateUrl: text("certificate_url"),
  supervisorId: integer("supervisor_id").references(() => usersTable.id),
  status: text("status", { enum: ["pending", "verified", "rejected"] }).notNull().default("pending"),
  facultyRemarks: text("faculty_remarks"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertConferenceSchema = createInsertSchema(conferencesTable);
export type InsertConference = typeof conferencesTable.$inferInsert;
export type Conference = typeof conferencesTable.$inferSelect;
