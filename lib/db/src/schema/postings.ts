import { pgTable, serial, text, integer, timestamp, uuid, index, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
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

export const postingAttachmentsTable = pgTable("posting_attachments", {
  id: uuid("id").primaryKey(),
  postingId: integer("posting_id").notNull().references(() => postingsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  contentType: text("content_type", { enum: ["application/pdf", "image/jpeg"] }).notNull(),
  byteSize: integer("byte_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("posting_attachments_posting_id_idx").on(table.postingId),
  check("posting_attachments_content_type_check", sql`${table.contentType} IN ('application/pdf', 'image/jpeg')`),
  check("posting_attachments_byte_size_check", sql`
    ${table.byteSize} BETWEEN 1 AND CASE ${table.contentType} WHEN 'image/jpeg' THEN 1048576 ELSE 3145728 END
  `),
]);

export const postingAttachmentCleanupTable = pgTable("posting_attachment_cleanup", {
  id: uuid("id").primaryKey(),
  readyAt: timestamp("ready_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("posting_attachment_cleanup_ready_at_idx").on(table.readyAt)]);
