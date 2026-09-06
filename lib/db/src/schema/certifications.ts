import { pgTable, uuid, timestamp, text, pgEnum, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { studentsTable } from "./students.js";
import { createInsertSchema } from "drizzle-zod";

export const certificationTitleEnum = pgEnum("certification_title", ["BLS", "NRP", "PALS", "ACLS", "other"]);

export const certificationsTable = pgTable("certifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Note: Using integer instead of uuid for foreign key to match studentsTable.id
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  title: text("title").notNull(),
  provider: text("provider"),
  issueDate: timestamp("issue_date").notNull(),
  expiryDate: timestamp("expiry_date").notNull(),
  certificateUrl: text("certificate_url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const certificationsRelations = relations(certificationsTable, ({ one }) => ({
  student: one(studentsTable, {
    fields: [certificationsTable.studentId],
    references: [studentsTable.id],
  }),
}));

export const insertCertificationSchema = createInsertSchema(certificationsTable);
export type InsertCertification = typeof certificationsTable.$inferInsert;
export type Certification = typeof certificationsTable.$inferSelect;
