import { Router, type IRouter } from "express";
import { 
  db, studentsTable, caseLogsTable, procedureLogsTable, 
  academicLogsTable, usersTable, departmentsTable, departmentConfigsTable,
  postingsTable, leaveRecordsTable, appraisalsTable, researchTable, assessmentsTable
} from "@workspace/db";
import { eq, and, desc, count, sql, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

// Static Requirements Data
const procedureRequirements = [
  { name: "Endotracheal Intubation", required: 15, group: "emergency" },
  { name: "Lumbar Puncture", required: 20, group: "invasive" },
  { name: "ICD Insertion", required: 5, group: "emergency" },
  { name: "Bone Marrow Aspiration", required: 3, group: "invasive" },
  { name: "Central Venous Line Insertion", required: 3, group: "invasive" },
  { name: "Peritoneal Dialysis", required: 2, group: "invasive" },
  { name: "Umbilical Venous Catheterisation", required: 20, group: "invasive" },
  { name: "Arterial Blood Gas", required: 3, group: "emergency" },
  { name: "Mechanical Ventilation Setup", required: 20, group: "emergency" },
  { name: "CPAP / HFNC", required: 10, group: "emergency" },
];

const academicRequirements = [
  { name: "Case Discussion", required: 50, period: "total" },
  { name: "Journal Club", required: 2, period: "month" },
  { name: "Seminar", required: 2, period: "month" },
  { name: "Interesting Case Presentation", required: 1, period: "month" },
];

router.get("/requirements", (_req, res) => res.json({ procedureRequirements, academicRequirements }));

// Helper for validating supervisor
async function validateSupervisor(supervisorId: number) {
  if (isNaN(supervisorId)) return false;
  const supervisorMatch = await db.select().from(usersTable).where(eq(usersTable.id, supervisorId)).limit(1);
  return supervisorMatch.length > 0 && ["professor", "hod"].includes(supervisorMatch[0].role);
}

// ---------------------------------------------------------
// NEW REAL DATABASE ROUTES
// ---------------------------------------------------------

router.get("/:studentId/dashboard", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    if (isNaN(studentId)) {
      res.status(400).json({ message: "Invalid studentId" });
      return;
    }

    const studentMatch = await db.select({
      id: studentsTable.id,
      userId: studentsTable.userId,
      name: usersTable.fullName,
      registrationNumber: studentsTable.registrationNumber,
      dateOfJoining: studentsTable.dateOfJoining,
      batch: studentsTable.batch,
      department: departmentsTable.name,
      departmentId: usersTable.departmentId,
    })
    .from(studentsTable)
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(studentsTable.id, studentId))
    .limit(1);

    if (studentMatch.length === 0) {
      res.status(404).json({ message: "Student not found" });
      return;
    }
    const student = studentMatch[0];

    const caller = req.user!;
    if (caller.role === "student" && caller.id !== student.userId) {
      res.status(403).json({ message: "You may only view your own dashboard" });
      return;
    }
    if (["professor", "hod"].includes(caller.role) && caller.departmentId !== student.departmentId) {
      res.status(403).json({ message: "This student is outside your department" });
      return;
    }

    // Counts
    const caseLogsCounts = await db.select({ status: caseLogsTable.status, count: count() }).from(caseLogsTable).where(eq(caseLogsTable.studentId, studentId)).groupBy(caseLogsTable.status);
    const procLogsCounts = await db.select({ status: procedureLogsTable.status, count: count() }).from(procedureLogsTable).where(eq(procedureLogsTable.studentId, studentId)).groupBy(procedureLogsTable.status);
    const acadLogsCounts = await db.select({ status: academicLogsTable.status, count: count() }).from(academicLogsTable).where(eq(academicLogsTable.studentId, studentId)).groupBy(academicLogsTable.status);

    const calcCounts = (counts: any[]) => ({
      verified: counts.find(c => c.status === "verified")?.count || 0,
      total: counts.reduce((acc, c) => acc + Number(c.count), 0)
    });

    const cases = calcCounts(caseLogsCounts);
    const procs = calcCounts(procLogsCounts);
    const acads = calcCounts(acadLogsCounts);

    let reqCases = 50, reqProcs = 101, reqAcad = 50;
    if (student.departmentId) {
      const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, student.departmentId));
      reqCases = config?.requiredCases || 50;
      reqProcs = config?.requiredProcedures || 101;
      reqAcad = config?.requiredAcademic || 50;
    }

    // Recent Logs (simplified for dashboard)
    const recentCases = await db.select().from(caseLogsTable).where(eq(caseLogsTable.studentId, studentId)).orderBy(desc(caseLogsTable.createdAt)).limit(1);
    const recentProcs = await db.select().from(procedureLogsTable).where(eq(procedureLogsTable.studentId, studentId)).orderBy(desc(procedureLogsTable.createdAt)).limit(1);
    
    res.json({
      student: {
        id: student.id,
        name: student.name,
        registrationNumber: student.registrationNumber,
        dateOfJoining: student.dateOfJoining,
        joiningYear: student.batch,
        department: student.department || "Unassigned",
      },
      categories: [
        { id: "cases", name: "Clinical Cases Presented", logged: cases.total, required: reqCases, verified: cases.verified, percentage: Math.min(100, Math.round((cases.verified / (reqCases || 1)) * 100)) },
        { id: "procedures", name: "Required Procedures", logged: procs.total, required: reqProcs, verified: procs.verified, percentage: Math.min(100, Math.round((procs.verified / (reqProcs || 1)) * 100)) },
        { id: "academics", name: "Case Discussions", logged: acads.total, required: reqAcad, verified: acads.verified, percentage: Math.min(100, Math.round((acads.verified / (reqAcad || 1)) * 100)) },
      ],
      recentLogs: [...recentCases, ...recentProcs]
    });
  } catch (error) {
    req.log.error(error, "Error fetching dashboard");
    res.status(500).json({ message: "Internal server error" });
  }
});

// Logs (Cases, Procedures, Academics) are fetched in one go by the frontend using /:studentId/logs
router.get("/:studentId/logs", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    if (isNaN(studentId)) {
      res.status(400).json({ message: "Invalid studentId format" });
      return;
    }

    // Fetch profile
    const studentMatch = await db.select({
      id: studentsTable.id,
      userId: studentsTable.userId,
      registrationNumber: studentsTable.registrationNumber,
      dateOfJoining: studentsTable.dateOfJoining,
      batch: studentsTable.batch,
      department: departmentsTable.name,
      departmentId: usersTable.departmentId,
    })
    .from(studentsTable)
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
    .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
    .where(eq(studentsTable.id, studentId))
    .limit(1);

    if (studentMatch.length === 0) {
      res.status(404).json({ message: "Student not found" });
      return;
    }

    const caller = req.user!;
    const student = studentMatch[0];
    if (caller.role === "student" && caller.id !== student.userId) {
      res.status(403).json({ message: "You may only view your own logbook" });
      return;
    }
    if (["professor", "hod"].includes(caller.role) && caller.departmentId !== student.departmentId) {
      res.status(403).json({ message: "This student is outside your department" });
      return;
    }

    // Faculty inspection is assignment-scoped. HODs retain department-wide oversight.
    const caseFilter = caller.role === "professor"
      ? and(eq(caseLogsTable.studentId, studentId), eq(caseLogsTable.supervisorId, caller.id), isNull(caseLogsTable.deletedAt))
      : and(eq(caseLogsTable.studentId, studentId), isNull(caseLogsTable.deletedAt));
    const procedureFilter = caller.role === "professor"
      ? and(eq(procedureLogsTable.studentId, studentId), eq(procedureLogsTable.supervisorId, caller.id), isNull(procedureLogsTable.deletedAt))
      : and(eq(procedureLogsTable.studentId, studentId), isNull(procedureLogsTable.deletedAt));
    const academicFilter = caller.role === "professor"
      ? and(eq(academicLogsTable.studentId, studentId), eq(academicLogsTable.supervisorId, caller.id))
      : eq(academicLogsTable.studentId, studentId);

    const [caseLogsRaw, procedureLogsRaw, academicLogsRaw] = await Promise.all([
      db.select({ log: caseLogsTable, supervisorName: usersTable.fullName })
        .from(caseLogsTable).leftJoin(usersTable, eq(caseLogsTable.supervisorId, usersTable.id))
        .where(caseFilter).orderBy(desc(caseLogsTable.createdAt)),
      db.select({ log: procedureLogsTable, supervisorName: usersTable.fullName })
        .from(procedureLogsTable).leftJoin(usersTable, eq(procedureLogsTable.supervisorId, usersTable.id))
        .where(procedureFilter).orderBy(desc(procedureLogsTable.createdAt)),
      db.select({ log: academicLogsTable, supervisorName: usersTable.fullName })
        .from(academicLogsTable).leftJoin(usersTable, eq(academicLogsTable.supervisorId, usersTable.id))
        .where(academicFilter).orderBy(desc(academicLogsTable.createdAt)),
    ]);

    res.json({
      profile: {
        department: studentMatch[0].department || "Unassigned",
        registrationNumber: studentMatch[0].registrationNumber,
        dateOfJoining: studentMatch[0].dateOfJoining,
        joiningYear: studentMatch[0].batch,
      },
      caseLogs: caseLogsRaw.map(r => ({ ...r.log, supervisorName: r.supervisorName })),
      procedureLogs: procedureLogsRaw.map(r => ({ ...r.log, supervisorName: r.supervisorName })),
      academicLogs: academicLogsRaw.map(r => ({ ...r.log, supervisorName: r.supervisorName })),
    });
  } catch (error) {
    req.log.error(error, "Error fetching student logs");
    res.status(500).json({ message: "Internal server error" });
  }
});

// Postings
router.get("/:studentId/postings", async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const data = await db
      .select({
        id: postingsTable.id,
        ward: postingsTable.ward,
        startDate: postingsTable.startDate,
        endDate: postingsTable.endDate,
        supervisorId: postingsTable.supervisorId,
        supervisorName: usersTable.fullName
      })
      .from(postingsTable)
      .leftJoin(usersTable, eq(postingsTable.supervisorId, usersTable.id))
      .where(eq(postingsTable.studentId, studentId))
      .orderBy(desc(postingsTable.createdAt));
      
    res.json({ options: ["Ward Posting U1", "Ward Posting U2", "PICU", "NICU", "DRP"], data });
  } catch (error) {
    req.log.error(error, "Error fetching postings");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:studentId/postings", async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const { ward, postingName, startDate, endDate, supervisorId } = req.body;
    
    const [inserted] = await db.insert(postingsTable).values({
      studentId,
      ward: ward || postingName || "General",
      startDate,
      endDate,
      supervisorId: parseInt(supervisorId, 10) || null,
    }).returning();
    res.status(201).json({ success: true, posting: inserted });
  } catch (error) {
    req.log.error(error, "Error creating posting");
    res.status(500).json({ message: "Internal server error" });
  }
});

// Leave Records
router.get("/:studentId/leave-balance", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const caller = req.user!;

    if (caller.role === "student") {
      const [ownProfile] = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(eq(studentsTable.userId, caller.id));
      if (!ownProfile || ownProfile.id !== studentId) {
        res.status(403).json({ message: "Forbidden: you may only view your own leave balance" });
        return;
      }
    } else if (caller.role === "professor" || caller.role === "hod") {
      if (caller.departmentId !== null) {
        const [studentUser] = await db
          .select({ departmentId: usersTable.departmentId })
          .from(studentsTable)
          .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
          .where(eq(studentsTable.id, studentId));
        if (!studentUser) {
          res.status(404).json({ message: "Student not found" });
          return;
        }
        if (studentUser.departmentId !== caller.departmentId) {
          res.status(403).json({ message: "Forbidden: student is in a different department" });
          return;
        }
      }
    }

    const currentYear = new Date().getFullYear().toString();
    
    const approvedLeaves = await db.select({
      leaveType: leaveRecordsTable.leaveType,
      startDate: leaveRecordsTable.startDate,
      endDate: leaveRecordsTable.endDate
    })
    .from(leaveRecordsTable)
    .where(sql`${leaveRecordsTable.studentId} = ${studentId} AND ${leaveRecordsTable.status} = 'approved' AND ${leaveRecordsTable.startDate} LIKE ${currentYear + '-%'}`);

    let casualUsed = 0;
    let academicUsed = 0;

    for (const l of approvedLeaves) {
      if (!l.startDate || !l.endDate) continue;
      const start = new Date(l.startDate);
      const end = new Date(l.endDate);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end dates
      
      if (diffDays > 0) {
        if (l.leaveType === 'casual') casualUsed += diffDays;
        else if (l.leaveType === 'academic') academicUsed += diffDays;
      }
    }

    res.json({
      casual: { used: casualUsed, total: 20 },
      academic: { used: academicUsed, total: 15 }
    });
  } catch (error) {
    req.log.error(error, "Error fetching leave balance");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:studentId/leave-records", async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const data = await db.select().from(leaveRecordsTable).where(eq(leaveRecordsTable.studentId, studentId)).orderBy(desc(leaveRecordsTable.createdAt));
    res.json({ data: data.map(d => ({ ...d, number: d.id })) }); // Map id to number for frontend compat
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:studentId/leave-records", async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const { fromDate, toDate, leaveType, reason, startDate, endDate } = req.body;
    
    let type: "casual" | "academic" | "medical" | "maternity_paternity" = "casual";
    const rawType = leaveType?.toLowerCase();
    if (rawType === "academic") type = "academic";
    else if (rawType === "medical") type = "medical";
    else if (rawType === "maternity" || rawType === "maternity_paternity") type = "maternity_paternity";

    const [inserted] = await db.insert(leaveRecordsTable).values({
      studentId,
      startDate: startDate || fromDate,
      endDate: endDate || toDate,
      leaveType: type,
      reason,
      status: "pending"
    }).returning();
    res.status(201).json({ success: true, leave: { ...inserted, number: inserted.id } });
  } catch (error) {
    req.log.error(error, "Leave POST error");
    res.status(500).json({ message: "Internal server error" });
  }
});

// Assessments — GET is auth-required with ownership/department check
router.get("/:studentId/assessments", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const caller = req.user!;

    if (caller.role === "student") {
      // Students may only read their own assessments
      const [ownProfile] = await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(eq(studentsTable.userId, caller.id));
      if (!ownProfile || ownProfile.id !== studentId) {
        res.status(403).json({ message: "Forbidden: you may only view your own assessments" });
        return;
      }
    } else if (caller.role === "professor" || caller.role === "hod") {
      // Professors/HODs may only read assessments for students in their department
      if (caller.departmentId !== null) {
        const [studentUser] = await db
          .select({ departmentId: usersTable.departmentId })
          .from(studentsTable)
          .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
          .where(eq(studentsTable.id, studentId));
        if (!studentUser) {
          res.status(404).json({ message: "Student not found" });
          return;
        }
        if (studentUser.departmentId !== caller.departmentId) {
          res.status(403).json({ message: "Forbidden: student is not in your department" });
          return;
        }
      }
    }
    // admin role: no restriction

    const data = await db
      .select({
        id: assessmentsTable.id,
        number: assessmentsTable.id,
        examName: assessmentsTable.examName,
        type: assessmentsTable.type,
        date: assessmentsTable.date,
        marks: assessmentsTable.marks,
        maximum: sql`100`.as("maximum"),
        assessorId: assessmentsTable.assessorId,
        assessorName: usersTable.fullName
      })
      .from(assessmentsTable)
      .leftJoin(usersTable, eq(assessmentsTable.assessorId, usersTable.id))
      .where(eq(assessmentsTable.studentId, studentId))
      .orderBy(desc(assessmentsTable.createdAt));
    res.json(data);
  } catch (error) {
    req.log.error(error, "Error fetching assessments");
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /students/:studentId/assessments — professors only; assessorId set server-side
router.post("/:studentId/assessments", requireAuth, requireRole(["professor", "hod"]), async (req, res) => {
  try {
    const professorId = req.user!.id;
    const professorDeptId = req.user!.departmentId;
    const studentId = parseInt(String(req.params.studentId), 10);

    // Validate the student belongs to the professor's department
    const [student] = await db
      .select({ id: studentsTable.id, userId: studentsTable.userId })
      .from(studentsTable)
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(eq(studentsTable.id, studentId));

    if (!student) {
      res.status(404).json({ message: "Student not found" });
      return;
    }

    const [studentUser] = await db
      .select({ departmentId: usersTable.departmentId })
      .from(usersTable)
      .where(eq(usersTable.id, student.userId));

    if (professorDeptId !== null && studentUser?.departmentId !== professorDeptId) {
      res.status(403).json({ message: "Student does not belong to your department" });
      return;
    }

    const { examName, type, date, marks } = req.body;
    if (!examName || !marks) {
      res.status(400).json({ message: "examName and marks are required" });
      return;
    }

    const [inserted] = await db.insert(assessmentsTable).values({
      examName,
      type: type || "quarterly",
      date: date || new Date().toISOString().slice(0, 10),
      marks: parseInt(marks, 10) || 0,
      assessorId: professorId,   // always set from JWT — never client-supplied
      studentId
    }).returning();
    res.status(201).json(inserted);
  } catch (error) {
    req.log.error(error, "Error creating assessment");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:studentId/thesis", async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const match = await db.select().from(researchTable).where(eq(researchTable.studentId, studentId)).limit(1);
    res.json({ data: match.length > 0 ? match[0] : null });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});


// ---------------------------------------------------------
// POST LOGS (Existing DB endpoints preserved)
// ---------------------------------------------------------

router.post("/:studentId/case-logs", async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const { supervisorId, date, patientAge, patientGender, diagnosisFinal } = req.body;
    const supervisorIdNum = parseInt(supervisorId, 10);
    if (!(await validateSupervisor(supervisorIdNum))) {
      res.status(400).json({ message: "Invalid supervisorId" });
      return;
    }
    
    const [inserted] = await db.insert(caseLogsTable).values({
      studentId, supervisorId: supervisorIdNum, date, patientAge, patientGender, 
      diagnosisFinal,
      patientUhid: req.body.patientUhid,
      chiefComplaints: req.body.chiefComplaints,
      diagnosisProvisional: req.body.diagnosisProvisional,
      history: req.body.history, 
      examination: req.body.examination, investigations: req.body.investigations, 
      differentialDiagnosis: req.body.differentialDiagnosis, managementPlan: req.body.managementPlan, 
      outcome: req.body.outcome, learningPoints: req.body.learningPoints, status: "pending"
    }).returning();
    res.status(201).json(inserted);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:studentId/procedure-logs", async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const { supervisorId, procedureGroup, procedureName, date, patientUhid, patientAge, competencyLevel } = req.body;
    const supervisorIdNum = parseInt(supervisorId, 10);
    if (!(await validateSupervisor(supervisorIdNum))) {
      res.status(400).json({ message: "Invalid supervisorId" });
      return;
    }

    const [inserted] = await db.insert(procedureLogsTable).values({
      studentId, supervisorId: supervisorIdNum, procedureGroup, procedureName, date, 
      patientUhid, patientAge, competencyLevel, status: "pending"
    }).returning();
    res.status(201).json(inserted);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/:studentId/academic-logs", async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const { supervisorId, activityType, topic, date } = req.body;
    const supervisorIdNum = parseInt(supervisorId, 10);
    if (!(await validateSupervisor(supervisorIdNum))) {
      res.status(400).json({ message: "Invalid supervisorId" });
      return;
    }

    const [inserted] = await db.insert(academicLogsTable).values({
      studentId, supervisorId: supervisorIdNum, activityType, presentationType: req.body.presentationType, 
      topic, date, presenter: req.body.presenter, status: "pending"
    }).returning();
    res.status(201).json(inserted);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE Case Log
router.delete("/:studentId/case-logs/:logId", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const logId = parseInt(String(req.params.logId), 10);
    const caller = req.user!;

    if (caller.role !== "student") {
      res.status(403).json({ message: "Only students can delete their own logs" });
      return;
    }
    
    const [ownProfile] = await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.userId, caller.id));
    if (!ownProfile || ownProfile.id !== studentId) {
      res.status(403).json({ message: "Forbidden: you can only delete your own logs" });
      return;
    }

    const [log] = await db.select().from(caseLogsTable).where(and(eq(caseLogsTable.id, logId), eq(caseLogsTable.studentId, studentId)));
    if (!log) {
      res.status(404).json({ message: "Log not found" });
      return;
    }

    if (log.status !== "pending") {
      res.status(400).json({ message: "Only pending logs can be deleted" });
      return;
    }

    await db.update(caseLogsTable).set({ deletedAt: new Date() }).where(eq(caseLogsTable.id, logId));
    res.json({ message: "Log deleted successfully" });
  } catch (error) {
    req.log.error(error, "Error deleting case log");
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE Procedure Log
router.delete("/:studentId/procedure-logs/:logId", requireAuth, async (req, res) => {
  try {
    const studentId = parseInt(String(req.params.studentId), 10);
    const logId = parseInt(String(req.params.logId), 10);
    const caller = req.user!;

    if (caller.role !== "student") {
      res.status(403).json({ message: "Only students can delete their own logs" });
      return;
    }
    
    const [ownProfile] = await db.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.userId, caller.id));
    if (!ownProfile || ownProfile.id !== studentId) {
      res.status(403).json({ message: "Forbidden: you can only delete your own logs" });
      return;
    }

    const [log] = await db.select().from(procedureLogsTable).where(and(eq(procedureLogsTable.id, logId), eq(procedureLogsTable.studentId, studentId)));
    if (!log) {
      res.status(404).json({ message: "Log not found" });
      return;
    }

    if (log.status !== "pending") {
      res.status(400).json({ message: "Only pending logs can be deleted" });
      return;
    }

    await db.update(procedureLogsTable).set({ deletedAt: new Date() }).where(eq(procedureLogsTable.id, logId));
    res.json({ message: "Log deleted successfully" });
  } catch (error) {
    req.log.error(error, "Error deleting procedure log");
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
