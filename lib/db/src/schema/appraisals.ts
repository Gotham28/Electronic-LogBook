import { pgTable, uuid, timestamp, integer, text, varchar, date, boolean, check } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { studentsTable } from "./students.js";
import { usersTable } from "./users.js";
import { createInsertSchema } from "drizzle-zod";

export const appraisalsTable = pgTable("appraisals", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Note: Using integer instead of uuid for foreign keys to match referenced tables
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  evaluatorId: integer("evaluator_id").notNull().references(() => usersTable.id),
  quarter: integer("quarter").notNull(),
  year: integer("year").notNull(),
  // Retained for legacy appraisal rows; quarterly forms use the individual scores below.
  scholasticGrade: varchar("scholastic_grade", { length: 8 }),
  patientCareGrade: varchar("patient_care_grade", { length: 8 }),
  professionalAttributesGrade: varchar("professional_attributes_grade", { length: 8 }),
  facultyRemarks: text("faculty_remarks"),
  appraisalDate: date("appraisal_date", { mode: "string" }),
  journalRecentAdvancesLearningScore: integer("journal_recent_advances_learning_score"),
  patientLabSkillLearningScore: integer("patient_lab_skill_learning_score"),
  selfDirectedLearningTeachingScore: integer("self_directed_learning_teaching_score"),
  departmentalInterdepartmentalLearningScore: integer("departmental_interdepartmental_learning_score"),
  externalOutreachCmeScore: integer("external_outreach_cme_score"),
  thesisResearchScore: integer("thesis_research_score"),
  logbookMaintenanceScore: integer("logbook_maintenance_score"),
  patientCareScore: integer("patient_care_score"),
  communicationSkillScore: integer("communication_skill_score"),
  professionalismScore: integer("professionalism_score"),
  publications: boolean("publications"),
  remediationSuggestions: text("remediation_suggestions"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  check("appraisals_score_range_check", sql`
    (${table.journalRecentAdvancesLearningScore} IS NULL OR ${table.journalRecentAdvancesLearningScore} BETWEEN 1 AND 9)
    AND (${table.patientLabSkillLearningScore} IS NULL OR ${table.patientLabSkillLearningScore} BETWEEN 1 AND 9)
    AND (${table.selfDirectedLearningTeachingScore} IS NULL OR ${table.selfDirectedLearningTeachingScore} BETWEEN 1 AND 9)
    AND (${table.departmentalInterdepartmentalLearningScore} IS NULL OR ${table.departmentalInterdepartmentalLearningScore} BETWEEN 1 AND 9)
    AND (${table.externalOutreachCmeScore} IS NULL OR ${table.externalOutreachCmeScore} BETWEEN 1 AND 9)
    AND (${table.thesisResearchScore} IS NULL OR ${table.thesisResearchScore} BETWEEN 1 AND 9)
    AND (${table.logbookMaintenanceScore} IS NULL OR ${table.logbookMaintenanceScore} BETWEEN 1 AND 9)
    AND (${table.patientCareScore} IS NULL OR ${table.patientCareScore} BETWEEN 1 AND 9)
    AND (${table.communicationSkillScore} IS NULL OR ${table.communicationSkillScore} BETWEEN 1 AND 9)
    AND (${table.professionalismScore} IS NULL OR ${table.professionalismScore} BETWEEN 1 AND 9)
  `),
  check("appraisals_scores_all_or_none_check", sql`num_nonnulls(
    ${table.journalRecentAdvancesLearningScore}, ${table.patientLabSkillLearningScore},
    ${table.selfDirectedLearningTeachingScore}, ${table.departmentalInterdepartmentalLearningScore},
    ${table.externalOutreachCmeScore}, ${table.thesisResearchScore}, ${table.logbookMaintenanceScore},
    ${table.patientCareScore}, ${table.communicationSkillScore}, ${table.professionalismScore}
  ) IN (0, 10)`),
  check("appraisals_low_score_remediation_check", sql`
    num_nonnulls(
      ${table.journalRecentAdvancesLearningScore}, ${table.patientLabSkillLearningScore},
      ${table.selfDirectedLearningTeachingScore}, ${table.departmentalInterdepartmentalLearningScore},
      ${table.externalOutreachCmeScore}, ${table.thesisResearchScore}, ${table.logbookMaintenanceScore},
      ${table.patientCareScore}, ${table.communicationSkillScore}, ${table.professionalismScore}
    ) = 0
    OR (
      ${table.journalRecentAdvancesLearningScore} >= 4 AND ${table.patientLabSkillLearningScore} >= 4
      AND ${table.selfDirectedLearningTeachingScore} >= 4 AND ${table.departmentalInterdepartmentalLearningScore} >= 4
      AND ${table.externalOutreachCmeScore} >= 4 AND ${table.thesisResearchScore} >= 4
      AND ${table.logbookMaintenanceScore} >= 4 AND ${table.patientCareScore} >= 4
      AND ${table.communicationSkillScore} >= 4 AND ${table.professionalismScore} >= 4
    )
    OR NULLIF(BTRIM(${table.remediationSuggestions}), '') IS NOT NULL
  `),
]);

export const appraisalsRelations = relations(appraisalsTable, ({ one }) => ({
  student: one(studentsTable, {
    fields: [appraisalsTable.studentId],
    references: [studentsTable.id],
  }),
  evaluator: one(usersTable, {
    fields: [appraisalsTable.evaluatorId],
    references: [usersTable.id],
  }),
}));

export const insertAppraisalSchema = createInsertSchema(appraisalsTable);
export type InsertAppraisal = typeof appraisalsTable.$inferInsert;
export type Appraisal = typeof appraisalsTable.$inferSelect;
