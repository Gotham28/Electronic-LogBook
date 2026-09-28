import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { studentsTable } from "./students.js";
import { usersTable } from "./users.js";

export const clinicalWorkLogsTable = pgTable("clinical_work_logs", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id").notNull().references(() => studentsTable.id),
  supervisorId: integer("supervisor_id").references(() => usersTable.id),
  date: text("date").notNull(),
  category: text("category").notNull(),
  subType: text("sub_type"),
  patientAge: text("patient_age").notNull(),
  patientSex: text("patient_sex", { enum: ["male", "female", "other"] }).notNull(),
  caseNumber: text("case_number").notNull(),
  // Radiology-specific fields (nullable; other departments leave these null)
  organSystem: text("organ_system"),
  clinicalFindings: text("clinical_findings"),
  competency: text("competency"),
  status: text("status", { enum: ["pending", "verified", "rejected"] }).notNull().default("pending"),
  facultyRemarks: text("faculty_remarks"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("clinical_work_logs_student_id_idx").on(t.studentId),
  index("clinical_work_logs_supervisor_status_idx").on(t.supervisorId, t.status),
]);

export type ClinicalWorkLog = typeof clinicalWorkLogsTable.$inferSelect;
