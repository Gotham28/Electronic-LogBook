import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { studentsTable } from "./students.js";
import { usersTable } from "./users.js";

export const caseLogsTable = pgTable("case_logs", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  supervisorId: integer("supervisor_id").references(() => usersTable.id),
  date: text("date").notNull(),
  attemptNumber: integer("attempt_number").default(1),
  patientUhid: text("patient_uhid"),
  patientAge: text("patient_age").notNull(),
  patientGender: text("patient_gender", { enum: ["male", "female", "other"] }).notNull(),
  chiefComplaints: text("chief_complaints"),
  diagnosisProvisional: text("diagnosis_provisional"),
  diagnosisFinal: text("diagnosis_final").notNull(),
  history: text("history"),
  examination: text("examination"),
  investigations: text("investigations"),
  differentialDiagnosis: text("differential_diagnosis"),
  managementPlan: text("management_plan"),
  outcome: text("outcome"),
  learningPoints: text("learning_points"),
  status: text("status", { enum: ["pending", "verified", "rejected"] }).default("pending"),
  facultyRemarks: text("faculty_remarks"),
  facultyGrade: text("faculty_grade"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCaseLogSchema = createInsertSchema(caseLogsTable);
export type InsertCaseLog = typeof caseLogsTable.$inferInsert;
export type CaseLog = typeof caseLogsTable.$inferSelect;

export const procedureLogsTable = pgTable("procedure_logs", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  supervisorId: integer("supervisor_id").references(() => usersTable.id),
  procedureGroup: text("procedure_group", { enum: ["emergency", "invasive"] }).notNull(),
  procedureName: text("procedure_name").notNull(),
  date: text("date").notNull(),
  patientUhid: text("patient_uhid").notNull(),
  patientAge: text("patient_age").notNull(),
  competencyLevel: text("competency_level", {
    enum: ["observed", "assisted", "performed_under_supervision", "performed_independently"]
  }).notNull(),
  facultyVerifiedLevel: text("faculty_verified_level"),
  status: text("status", { enum: ["pending", "verified", "rejected"] }).notNull().default("pending"),
  facultyRemarks: text("faculty_remarks"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertProcedureLogSchema = createInsertSchema(procedureLogsTable);
export type InsertProcedureLog = typeof procedureLogsTable.$inferInsert;
export type ProcedureLog = typeof procedureLogsTable.$inferSelect;

export const academicLogsTable = pgTable("academic_logs", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  activityType: text("activity_type", {
    enum: ["journal_club", "seminar", "symposia", "bedside_presentation", "mortality_meeting", "conference_attended", "conference_presentation"]
  }).notNull(),
  presentationType: text("presentation_type", { enum: ["poster", "paper", "case_presentation"] }),
  topic: text("topic").notNull(),
  date: text("date").notNull(),
  presenter: text("presenter"),
  supervisorId: integer("supervisor_id").references(() => usersTable.id),
  status: text("status", { enum: ["pending", "verified", "rejected"] }).notNull().default("pending"),
  facultyRemarks: text("faculty_remarks"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAcademicLogSchema = createInsertSchema(academicLogsTable);
export type InsertAcademicLog = typeof academicLogsTable.$inferInsert;
export type AcademicLog = typeof academicLogsTable.$inferSelect;
