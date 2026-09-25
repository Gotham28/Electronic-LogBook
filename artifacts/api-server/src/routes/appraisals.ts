import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm";
import { z } from "zod";
import { db, appraisalsTable, departmentsTable, studentsTable, usersTable } from "@workspace/db";
import { requireAuth, requireDepartment, requireRole } from "../middlewares/auth.js";
import { dateSchema, idSchema, validate } from "../lib/validation.js";

const router: IRouter = Router();
const staff = requireRole(["professor", "hod"]);
router.use(requireAuth, requireRole(["student", "professor", "hod"]), requireDepartment);

const scoreSchema = z.number().int().min(1).max(9);
const appraisalBodySchema = z.object({
  quarter: z.number().int().min(1).max(4),
  year: z.number().int().min(2000).max(2200),
  appraisalDate: dateSchema,
  journalRecentAdvancesLearningScore: scoreSchema,
  patientLabSkillLearningScore: scoreSchema,
  selfDirectedLearningTeachingScore: scoreSchema,
  departmentalInterdepartmentalLearningScore: scoreSchema,
  externalOutreachCmeScore: scoreSchema,
  thesisResearchScore: scoreSchema,
  logbookMaintenanceScore: scoreSchema,
  patientCareScore: scoreSchema,
  communicationSkillScore: scoreSchema,
  professionalismScore: scoreSchema,
  publications: z.boolean(),
  remediationSuggestions: z.string().max(5000).optional().default(""),
}).strict().superRefine((values, context) => {
  const hasLowScore = [
    values.journalRecentAdvancesLearningScore,
    values.patientLabSkillLearningScore,
    values.selfDirectedLearningTeachingScore,
    values.departmentalInterdepartmentalLearningScore,
    values.externalOutreachCmeScore,
    values.thesisResearchScore,
    values.logbookMaintenanceScore,
    values.patientCareScore,
    values.communicationSkillScore,
    values.professionalismScore,
  ].some((score) => score < 4);
  if (hasLowScore && !values.remediationSuggestions.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["remediationSuggestions"], message: "Add remediation suggestions when any score is below 4" });
  }
});

const appraisalStudentUsers = aliasedTable(usersTable, "appraisal_student_users");

async function findStudent(studentId: number) {
  const [student] = await db.select({
    id: studentsTable.id,
    userId: studentsTable.userId,
    mentorId: studentsTable.mentorId,
    name: appraisalStudentUsers.fullName,
    registrationNumber: studentsTable.registrationNumber,
    batch: studentsTable.batch,
    departmentId: appraisalStudentUsers.departmentId,
    departmentName: departmentsTable.name,
  }).from(studentsTable)
    .innerJoin(appraisalStudentUsers, eq(studentsTable.userId, appraisalStudentUsers.id))
    .innerJoin(departmentsTable, eq(appraisalStudentUsers.departmentId, departmentsTable.id))
    .where(and(eq(studentsTable.id, studentId), eq(appraisalStudentUsers.role, "student"), eq(appraisalStudentUsers.status, "approved")))
    .limit(1);
  return student;
}

function callerCanAccessStudent(caller: NonNullable<Express.Request["user"]>, student: NonNullable<Awaited<ReturnType<typeof findStudent>>>) {
  if (caller.role === "student") return student.userId === caller.id;
  if (student.departmentId !== caller.departmentId) return false;
  return caller.role !== "professor" || student.mentorId === caller.id;
}

async function listStudentAppraisals(studentId: number) {
  return db.select({
    id: appraisalsTable.id,
    studentId: appraisalsTable.studentId,
    evaluatorId: appraisalsTable.evaluatorId,
    quarter: appraisalsTable.quarter,
    year: appraisalsTable.year,
    appraisalDate: appraisalsTable.appraisalDate,
    scholasticGrade: appraisalsTable.scholasticGrade,
    patientCareGrade: appraisalsTable.patientCareGrade,
    professionalAttributesGrade: appraisalsTable.professionalAttributesGrade,
    facultyRemarks: appraisalsTable.facultyRemarks,
    journalRecentAdvancesLearningScore: appraisalsTable.journalRecentAdvancesLearningScore,
    patientLabSkillLearningScore: appraisalsTable.patientLabSkillLearningScore,
    selfDirectedLearningTeachingScore: appraisalsTable.selfDirectedLearningTeachingScore,
    departmentalInterdepartmentalLearningScore: appraisalsTable.departmentalInterdepartmentalLearningScore,
    externalOutreachCmeScore: appraisalsTable.externalOutreachCmeScore,
    thesisResearchScore: appraisalsTable.thesisResearchScore,
    logbookMaintenanceScore: appraisalsTable.logbookMaintenanceScore,
    patientCareScore: appraisalsTable.patientCareScore,
    communicationSkillScore: appraisalsTable.communicationSkillScore,
    professionalismScore: appraisalsTable.professionalismScore,
    publications: appraisalsTable.publications,
    remediationSuggestions: appraisalsTable.remediationSuggestions,
    createdAt: appraisalsTable.createdAt,
    studentName: appraisalStudentUsers.fullName,
    registrationNumber: studentsTable.registrationNumber,
    batch: studentsTable.batch,
    departmentName: departmentsTable.name,
    evaluatorName: usersTable.fullName,
  }).from(appraisalsTable)
    .innerJoin(studentsTable, eq(appraisalsTable.studentId, studentsTable.id))
    .innerJoin(appraisalStudentUsers, eq(studentsTable.userId, appraisalStudentUsers.id))
    .innerJoin(departmentsTable, eq(appraisalStudentUsers.departmentId, departmentsTable.id))
    .innerJoin(usersTable, eq(appraisalsTable.evaluatorId, usersTable.id))
    .where(eq(appraisalsTable.studentId, studentId))
    .orderBy(desc(appraisalsTable.year), desc(appraisalsTable.quarter), desc(appraisalsTable.createdAt));
}

router.get("/students", staff, async (req, res) => {
  const caller = req.user!;
  try {
    const students = await db.select({
      id: studentsTable.id,
      name: usersTable.fullName,
      registrationNumber: studentsTable.registrationNumber,
      batch: studentsTable.batch,
    }).from(studentsTable)
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(and(
        eq(usersTable.departmentId, caller.departmentId!),
        eq(usersTable.role, "student"),
        eq(usersTable.status, "approved"),
        caller.role === "professor" ? eq(studentsTable.mentorId, caller.id) : undefined,
      ))
      .orderBy(usersTable.fullName);
    res.json(students);
  } catch {
    req.log.error({ status: 500 }, "Failed to load appraisal student list");
    res.status(500).json({ message: "Could not load students for appraisal" });
  }
});

router.get("/mine", requireRole(["student"]), async (req, res) => {
  try {
    const [student] = await db.select({ id: studentsTable.id }).from(studentsTable)
      .where(eq(studentsTable.userId, req.user!.id)).limit(1);
    if (!student) { res.status(404).json({ message: "Student profile not found" }); return; }
    res.json(await listStudentAppraisals(student.id));
  } catch {
    req.log.error({ status: 500 }, "Failed to load student appraisals");
    res.status(500).json({ message: "Could not load appraisals" });
  }
});

router.get("/students/:studentId", staff, async (req, res) => {
  const parsed = idSchema.safeParse(req.params.studentId);
  if (!parsed.success) { res.status(400).json({ message: "Invalid student ID" }); return; }
  try {
    const student = await findStudent(parsed.data);
    if (!student) { res.status(404).json({ message: "Student not found" }); return; }
    if (!callerCanAccessStudent(req.user!, student)) { res.status(403).json({ message: "Student is outside your appraisal access scope" }); return; }
    res.json(await listStudentAppraisals(student.id));
  } catch {
    req.log.error({ studentId: parsed.data, status: 500 }, "Failed to load appraisals for student");
    res.status(500).json({ message: "Could not load appraisals" });
  }
});

router.post("/students/:studentId", staff, validate(appraisalBodySchema), async (req, res) => {
  const parsed = idSchema.safeParse(req.params.studentId);
  if (!parsed.success) { res.status(400).json({ message: "Invalid student ID" }); return; }
  const caller = req.user!;
  try {
    const student = await findStudent(parsed.data);
    if (!student) { res.status(404).json({ message: "Student not found" }); return; }
    if (!callerCanAccessStudent(caller, student)) { res.status(403).json({ message: "Student is outside your appraisal access scope" }); return; }
    const body = req.body as z.infer<typeof appraisalBodySchema>;
    const [created] = await db.insert(appraisalsTable).values({
      studentId: student.id,
      evaluatorId: caller.id,
      quarter: body.quarter,
      year: body.year,
      appraisalDate: body.appraisalDate,
      scholasticGrade: null,
      patientCareGrade: null,
      professionalAttributesGrade: null,
      journalRecentAdvancesLearningScore: body.journalRecentAdvancesLearningScore,
      patientLabSkillLearningScore: body.patientLabSkillLearningScore,
      selfDirectedLearningTeachingScore: body.selfDirectedLearningTeachingScore,
      departmentalInterdepartmentalLearningScore: body.departmentalInterdepartmentalLearningScore,
      externalOutreachCmeScore: body.externalOutreachCmeScore,
      thesisResearchScore: body.thesisResearchScore,
      logbookMaintenanceScore: body.logbookMaintenanceScore,
      patientCareScore: body.patientCareScore,
      communicationSkillScore: body.communicationSkillScore,
      professionalismScore: body.professionalismScore,
      publications: body.publications,
      remediationSuggestions: body.remediationSuggestions.trim() || null,
    }).returning({ id: appraisalsTable.id });
    res.status(201).json({ id: created.id, message: "Quarterly appraisal saved" });
  } catch {
    req.log.error({ studentId: parsed.data, status: 500 }, "Failed to save quarterly appraisal");
    res.status(500).json({ message: "Could not save appraisal" });
  }
});

export default router;
