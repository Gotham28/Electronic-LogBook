import { pgTable, uuid, timestamp, text, pgEnum, integer } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { studentsTable } from "./students.js";
import { usersTable } from "./users.js";
import { createInsertSchema } from "drizzle-zod";

export const researchStatusEnum = pgEnum("research_status", ["pending", "submitted", "approved"]);

export const researchTable = pgTable("research", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Note: Using integer instead of uuid for foreign key to match studentsTable.id
  studentId: integer("student_id").notNull().unique().references(() => studentsTable.id),
  thesisTitle: text("thesis_title").notNull(),
  guideId: integer("guide_id").references(() => usersTable.id),
  coGuideId: integer("co_guide_id").references(() => usersTable.id),
  protocolSubmissionDate: text("protocol_submission_date"),
  iecClearanceDate: text("iec_clearance_date"),
  dataCollectionStartDate: text("data_collection_start_date"),
  dataCollectionEndDate: text("data_collection_end_date"),
  submissionDate: text("submission_date"),
  protocolStatus: researchStatusEnum("protocol_status").default("pending").notNull(),
  midTermStatus: researchStatusEnum("mid_term_status").default("pending").notNull(),
  finalSubmissionStatus: researchStatusEnum("final_submission_status").default("pending").notNull(),
  publicationProofUrl: text("publication_proof_url"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const researchRelations = relations(researchTable, ({ one }) => ({
  student: one(studentsTable, {
    fields: [researchTable.studentId],
    references: [studentsTable.id],
  }),
}));

export const insertResearchSchema = createInsertSchema(researchTable);
export type InsertResearch = typeof researchTable.$inferInsert;
export type Research = typeof researchTable.$inferSelect;
