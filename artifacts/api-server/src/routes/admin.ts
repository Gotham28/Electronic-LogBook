import { Router } from "express";
import { db, usersTable, studentsTable, departmentsTable, departmentConfigsTable, procedureTypesTable, caseLogsTable, procedureLogsTable, academicLogsTable, departmentCatalogTable, paymentsTable, leaveRecordsTable, leaveApplicationsTable, assessmentsTable, appraisalsTable, assignmentRecipientsTable, attendanceLogsTable, certificationsTable, postingsTable, thesisMilestonesTable, researchTable, auditTable, assignmentsTable, assignmentTypesTable } from "@workspace/db";
import { eq, and, count, inArray, sql, or, like } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole, requireDepartment } from "../middlewares/auth.js";
import { completionPercent, configSchema, dateSchema, emailSchema, nameSchema, passwordSchema, targetSchema, validate } from "../lib/validation.js";
import { resolveConfigDepartmentId } from "../lib/department-config-source.js";
import { recomputeProcedureRequirement, recomputeCatalogRequirements } from "../lib/department-requirements.js";
import { sendAccountCreatedEmail } from "../lib/mailer.js";

const router = Router();

// Only HODs can access these routes
router.use(requireAuth, requireRole(["hod"]), requireDepartment);
router.param("id", (req, res, next, value) => {
  if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) { res.status(400).json({ message: "Invalid record ID" }); return; }
  next();
});

router.post("/users/:id/reactivate", validate(z.object({}).strict()), async (req, res) => {
  const [account] = await db.update(usersTable).set({ status: "approved", sessionVersion: sql`${usersTable.sessionVersion} + 1` })
    .where(and(eq(usersTable.id, Number(req.params.id)), eq(usersTable.departmentId, req.user!.departmentId!),
      inArray(usersTable.role, ["student", "professor"]), eq(usersTable.status, "rejected"))).returning({ id: usersTable.id });
  if (!account) { res.status(404).json({ message: "Inactive account not found in your department" }); return; }
  res.json({ message: "Account reactivated. The user must sign in again." });
});

// GET /api/admin/students/pending
// List all students pending approval
router.get("/students/pending", async (req, res) => {
  try {
    const departmentId = req.user?.departmentId;
    const conditions = [
      eq(usersTable.role, "student"), 
      eq(usersTable.status, "pending")
    ];
    conditions.push(eq(usersTable.departmentId, departmentId!));

    const pendingUsers = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        email: usersTable.email,
        registrationNumber: studentsTable.registrationNumber,
        batch: studentsTable.batch,
        dateOfJoining: studentsTable.dateOfJoining,
        kuhsId: studentsTable.kuhsId,
        specialty: studentsTable.specialty,
        department: departmentsTable.name,
        createdAt: usersTable.createdAt
      })
      .from(usersTable)
      .innerJoin(studentsTable, eq(usersTable.id, studentsTable.userId))
      .leftJoin(departmentsTable, eq(usersTable.departmentId, departmentsTable.id))
      .where(and(...conditions));

    res.json(pendingUsers);
  } catch (error) {
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error fetching pending students");
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/admin/students/:id/approve
// Approve a student account
router.post("/students/:id/approve", async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const departmentId = req.user?.departmentId;
    const [target] = await db.select().from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.role, "student"), eq(usersTable.status, "pending")))
      .limit(1);
    // Nonexistent id and wrong-department both return the same status and body (SEC-36):
    // an HOD probing ids cannot tell "no such student" from "real student, other department".
    if (!target || target.departmentId !== departmentId) {
      res.status(403).json({ message: "Cannot approve a student outside your department" });
      return;
    }

    // target.id (and therefore userId, since the lookup above matched eq(usersTable.id, userId))
    // is a usersTable.id. paymentsTable.userId is also a usersTable.id (see lib/db/src/schema/payments.ts),
    // so no separate studentsTable lookup is needed to compare them.
    const [paidPayment] = await db.select({ id: paymentsTable.id }).from(paymentsTable)
      .where(and(eq(paymentsTable.userId, userId), eq(paymentsTable.status, "paid"))).limit(1);
    if (!paidPayment) {
      res.status(402).json({ message: "This student has not completed payment and cannot be approved yet" });
      return;
    }

    await db.update(usersTable)
      .set({ status: "approved" })
      .where(and(eq(usersTable.id, userId), eq(usersTable.departmentId, departmentId!), eq(usersTable.status, "pending")));

    res.json({ message: "Student approved successfully" });
  } catch (error) {
    req.log.error({ userId: req.params.id, status: 500 }, "Error approving student");
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/admin/students/:id/reject
// Reject (delete) a pending student account
router.post("/students/:id/reject", async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    // Only allow rejecting pending students in HOD's own department
    const departmentId = req.user?.departmentId;
    const [target] = await db.select().from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.role, "student"), eq(usersTable.status, "pending")))
      .limit(1);

    // Nonexistent id and wrong-department both return the same status and body (SEC-36):
    // an HOD probing ids cannot tell "no such student" from "real student, other department".
    if (!target || target.departmentId !== departmentId) {
      res.status(403).json({ message: "Cannot reject a student outside your department" });
      return;
    }

    await db.update(usersTable).set({ status: "rejected", sessionVersion: sql`${usersTable.sessionVersion} + 1` })
      .where(and(eq(usersTable.id, userId), eq(usersTable.departmentId, departmentId!), eq(usersTable.status, "pending")));

    res.json({ message: "Student registration rejected" });
  } catch (error) {
    req.log.error({ userId: req.params.id, status: 500 }, "Error rejecting student");
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE /api/admin/users/:id
// Remove a student or professor from the department roster
router.delete("/users/:id", async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const departmentId = req.user?.departmentId;
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    // Nonexistent id and wrong-department/role both return the same status and body
    // (SEC-36): an HOD probing ids cannot tell "no such user" from "real user, not theirs
    // to remove".
    if (!target || target.departmentId !== departmentId || !["student", "professor"].includes(target.role)) {
      res.status(403).json({ message: "Cannot remove a user outside your department" });
      return;
    }
    // Prevent removing yourself
    if (target.id === req.user?.id) {
      res.status(400).json({ message: "Cannot remove your own account" });
      return;
    }

    // Revoke access while preserving logbooks, assignments and their audit history.
    await db.update(usersTable).set({ status: "rejected", sessionVersion: sql`${usersTable.sessionVersion} + 1` })
      .where(and(eq(usersTable.id, userId), eq(usersTable.departmentId, departmentId!), inArray(usersTable.role, ["student", "professor"])));

    res.json({ message: "Account deactivated; records retained" });
  } catch (error: any) {
    if (error.code === "23503") {
      res.status(409).json({ message: "This student has existing logs or records and cannot be removed. Please contact an administrator if removal is required." });
      return;
    }
    req.log.error({ userId: req.params.id, status: 500 }, "Error removing user");
    res.status(500).json({ message: "Internal server error" });
  }
});


// POST /api/admin/professors
// Create a new professor account
router.post("/professors", validate(z.object({ fullName: nameSchema, email: emailSchema, password: passwordSchema }).strict()), async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      res.status(400).json({ message: "Full name, email, and password are required" });
      return;
    }

    const existingUser = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existingUser.length > 0) {
      res.status(400).json({ message: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [newProf] = await db.insert(usersTable).values({
      fullName,
      email,
      passwordHash,
      role: "professor",
      status: "approved", // Professors created by HOD are auto-approved
      departmentId: req.user!.departmentId!
    }).returning();

    try {
      const [dept] = await db.select({ name: departmentsTable.name }).from(departmentsTable)
        .where(eq(departmentsTable.id, req.user!.departmentId!)).limit(1);
        
      await sendAccountCreatedEmail(email, fullName, password, "professor", dept?.name);
    } catch (error) {
      req.log.error({ email, error }, "Failed to send welcome email");
      // Continue without returning error to allow account creation to succeed
    }

    res.status(201).json({ 
      message: "Faculty account created successfully",
      professor: {
        id: newProf.id,
        fullName: newProf.fullName,
        email: newProf.email,
        departmentId: newProf.departmentId
      }
    });
  } catch (error) {
    // Never the error object itself: a failed insert throws DrizzleQueryError, whose
    // message carries the SQL plus every bound parameter - including the new professor's
    // passwordHash. Id and status code only, matching app.ts:96.
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error creating professor");
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/admin/students
// Create a new student account
router.post("/students", validate(z.object({
  fullName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  registrationNumber: nameSchema,
  batch: z.string().trim().min(1).max(40),
  dateOfJoining: dateSchema,
  kuhsId: nameSchema
}).strict()), async (req, res) => {
  try {
    const { fullName, email, password, registrationNumber, batch, dateOfJoining, kuhsId } = req.body;

    if (!fullName || !email || !password || !registrationNumber || !batch || !dateOfJoining || !kuhsId) {
      res.status(400).json({ message: "All fields are required" });
      return;
    }

    const existingUser = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existingUser.length > 0) {
      res.status(400).json({ message: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [dept] = await db.select({ name: departmentsTable.name }).from(departmentsTable)
      .where(eq(departmentsTable.id, req.user!.departmentId!)).limit(1);

    const newStudent = await db.transaction(async (tx) => {
      const [user] = await tx.insert(usersTable).values({
        fullName,
        email,
        passwordHash,
        role: "student",
        status: "approved", // Students created by HOD are auto-approved
        departmentId: req.user!.departmentId!
      }).returning();
      
      await tx.insert(studentsTable).values({
        userId: user.id,
        registrationNumber,
        batch,
        dateOfJoining,
        kuhsId,
        specialty: dept?.name || ""
      });

      return user;
    });

    try {
      await sendAccountCreatedEmail(email, fullName, password, "student", dept?.name);
    } catch (error) {
      req.log.error({ email, error }, "Failed to send welcome email");
      // Continue without returning error to allow account creation to succeed
    }

    res.status(201).json({ 
      message: "Student account created successfully",
      student: {
        id: newStudent.id,
        fullName: newStudent.fullName,
        email: newStudent.email,
        departmentId: newStudent.departmentId
      }
    });
  } catch (error) {
    // Never the error object itself: a failed insert throws DrizzleQueryError, whose
    // message carries the SQL plus every bound parameter - including the new student's
    // passwordHash. Id and status code only.
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error creating student");
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/admin/leaves/pending
// List all pending leave requests for the department
router.get("/leaves/pending", async (req, res) => {
  try {
    const { leaveRecordsTable } = await import("@workspace/db");
    
    // Leave records are scoped through their student's current department.
    const pendingLeaves = await db
      .select({
        id: leaveRecordsTable.id,
        number: leaveRecordsTable.id, // for frontend compat
        fromDate: leaveRecordsTable.startDate,
        toDate: leaveRecordsTable.endDate,
        type: leaveRecordsTable.leaveType,
        reason: leaveRecordsTable.reason,
        status: leaveRecordsTable.status,
        residentName: usersTable.fullName,
        residentId: studentsTable.id
      })
      .from(leaveRecordsTable)
      .innerJoin(studentsTable, eq(leaveRecordsTable.studentId, studentsTable.id))
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(and(eq(leaveRecordsTable.status, "pending"), eq(usersTable.departmentId, req.user!.departmentId!)));

    const { resolveConfigDepartmentId } = await import("../lib/department-config-source.js");
    const { departmentCatalogTable } = await import("@workspace/db");
    
    const configSourceId = await resolveConfigDepartmentId(req.user!.departmentId!);
    const leaveTypes = await db.select({ value: departmentCatalogTable.value, required: departmentCatalogTable.required }).from(departmentCatalogTable).where(and(eq(departmentCatalogTable.departmentId, configSourceId), eq(departmentCatalogTable.kind, "leave_type")));
    const limits = Object.fromEntries(leaveTypes.map(t => [t.value, t.required]));

    const currentYear = new Date().getFullYear().toString();
    const studentIds = [...new Set(pendingLeaves.map(l => l.residentId))];
    let usedMap: Record<number, Record<string, number>> = {};
    
    if (studentIds.length > 0) {
      const allRelevantLeaves = await db.select({ 
        studentId: leaveRecordsTable.studentId, 
        leaveType: leaveRecordsTable.leaveType, 
        startDate: leaveRecordsTable.startDate, 
        endDate: leaveRecordsTable.endDate 
      })
      .from(leaveRecordsTable)
      .where(and(inArray(leaveRecordsTable.studentId, studentIds), inArray(leaveRecordsTable.status, ['approved', 'pending']), like(leaveRecordsTable.startDate, `${currentYear}-%`)));

      for (const l of allRelevantLeaves) {
        if (!l.startDate || !l.endDate) continue;
        const lStart = new Date(l.startDate);
        const lEnd = new Date(l.endDate);
        const diffDays = Math.ceil((lEnd.getTime() - lStart.getTime()) / (1000 * 3600 * 24)) + 1;
        if (diffDays > 0) {
          usedMap[l.studentId] = usedMap[l.studentId] || {};
          usedMap[l.studentId][l.leaveType] = (usedMap[l.studentId][l.leaveType] || 0) + diffDays;
        }
      }
    }

    const mappedLeaves = pendingLeaves.map(leave => {
      const start = new Date(leave.fromDate).getTime();
      const end = new Date(leave.toDate).getTime();
      const diff = Math.ceil((end - start) / (1000 * 3600 * 24)) + 1;
      
      const total = limits[leave.type];
      let remainingBalance: number | null = null;
      if (typeof total === 'number') {
        const used = usedMap[leave.residentId]?.[leave.type] || 0;
        // Remaining balance shows how many days are left, considering ALL approved/pending leaves
        remainingBalance = total - used;
      }

      return { ...leave, totalDays: isNaN(diff) ? 1 : diff, remainingBalance };
    });

    res.json(mappedLeaves);
  } catch (error) {
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error fetching pending leaves");
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/admin/leaves/:id/action
router.post("/leaves/:id/action", async (req, res) => {
  try {
    const leaveId = parseInt(req.params.id);
    const { action } = req.body; // "approve" or "reject"
    const { leaveRecordsTable } = await import("@workspace/db");

    if (!["approve", "reject"].includes(action)) {
      res.status(400).json({ message: "Invalid action" });
      return;
    }

    const status = action === "approve" ? "approved" : "rejected";

    const [updated] = await db.update(leaveRecordsTable)
      .set({ 
        status, 
        reviewedBy: req.user?.id 
      })
      .where(and(eq(leaveRecordsTable.id, leaveId), eq(leaveRecordsTable.status, "pending"),
        inArray(leaveRecordsTable.studentId, db.select({ id: studentsTable.id }).from(studentsTable)
          .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id)).where(eq(usersTable.departmentId, req.user!.departmentId!)))))
      .returning();

    if (!updated) {
      res.status(404).json({ message: "Leave not found" });
      return;
    }

    res.json({ message: `Leave ${status} successfully` });
  } catch (error) {
    req.log.error({ leaveId: req.params.id, status: 500 }, "Error updating leave status");
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/admin/department/config
router.get("/department/config", async (req, res) => {
  try {
    const departmentId = req.user?.departmentId;
    if (!departmentId) {
      res.status(400).json({ message: "No department assigned" });
      return;
    }

    const configSourceId = await resolveConfigDepartmentId(departmentId);
    const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId));
    res.json(config || null);
  } catch (error) {
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error fetching department config");
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/admin/department/config
router.post("/department/config", validate(configSchema), async (req, res) => {
  try {
    const departmentId = req.user?.departmentId;
    if (!departmentId) {
      res.status(400).json({ message: "No department assigned" });
      return;
    }

    const [dept] = await db.select({ configSourceDepartmentId: departmentsTable.configSourceDepartmentId }).from(departmentsTable).where(eq(departmentsTable.id, departmentId));
    if (dept?.configSourceDepartmentId !== null) {
      res.status(403).json({ message: "Test departments cannot modify mirrored settings" });
      return;
    }

    const { enabledFeatures } = req.body;

    const existing = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, departmentId));
    
    if (existing.length > 0) {
      const [updated] = await db.update(departmentConfigsTable).set({
        enabledFeatures: enabledFeatures ?? existing[0].enabledFeatures
      }).where(eq(departmentConfigsTable.departmentId, departmentId)).returning();
      res.json(updated);
      return;
    } else {
      const [inserted] = await db.insert(departmentConfigsTable).values({
        departmentId,
        enabledFeatures: enabledFeatures ?? {}
      }).returning();
      res.json(inserted);
      return;
    }
  } catch (error) {
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error updating department config");
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/admin/department/procedures
router.get("/department/procedures", async (req, res) => {
  try {
    const departmentId = req.user?.departmentId;
    if (!departmentId) {
      res.status(400).json({ message: "No department assigned" });
      return;
    }

    const configSourceId = await resolveConfigDepartmentId(departmentId);
    const procedures = await db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, configSourceId));
    res.json(procedures);
  } catch (error) {
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error fetching procedures");
    res.status(500).json({ message: "Internal server error" });
  }
});

// POST /api/admin/department/procedures
router.post("/department/procedures", validate(z.object({ name: nameSchema, group: nameSchema, required: targetSchema }).strict()), async (req, res) => {
  try {
    const departmentId = req.user?.departmentId;
    if (!departmentId) {
      res.status(400).json({ message: "No department assigned" });
      return;
    }

    const [dept] = await db.select({ configSourceDepartmentId: departmentsTable.configSourceDepartmentId }).from(departmentsTable).where(eq(departmentsTable.id, departmentId));
    if (dept?.configSourceDepartmentId !== null) {
      res.status(403).json({ message: "Test departments cannot modify mirrored settings" });
      return;
    }

    const { name, group } = req.body;
    if (!name || !group) {
      res.status(400).json({ message: "Name and group are required" });
      return;
    }

    const [inserted] = await db.insert(procedureTypesTable).values({
      departmentId,
      name,
      group,
      required: req.body.required,
    }).returning();
    await recomputeProcedureRequirement(departmentId);
    res.json(inserted);
  } catch (error) {
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error adding procedure");
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /api/admin/roster — all students + professors in the HOD's own department
router.get("/roster", async (req, res) => {
  try {
    const departmentId = req.user?.departmentId;
    if (!departmentId) {
      res.status(400).json({ message: "HOD account has no department assigned" });
      return;
    }

    const students = await db
      .select({
        id: usersTable.id,
        studentProfileId: studentsTable.id,
        fullName: usersTable.fullName,
        email: usersTable.email,
        status: usersTable.status,
        registrationNumber: studentsTable.registrationNumber,
        batch: studentsTable.batch,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .innerJoin(studentsTable, eq(studentsTable.userId, usersTable.id))
      .where(and(eq(usersTable.role, "student"), eq(usersTable.departmentId, departmentId)))
      .orderBy(usersTable.fullName);

    const configSourceId = await resolveConfigDepartmentId(departmentId);
    const [caseCountRows, procedureCountRows, academicCountRows, configs] = await Promise.all([
      db.select({ studentId: caseLogsTable.studentId, value: count() }).from(caseLogsTable)
        .where(eq(caseLogsTable.status, "verified")).groupBy(caseLogsTable.studentId),
      db.select({ studentId: procedureLogsTable.studentId, value: count() }).from(procedureLogsTable)
        .where(eq(procedureLogsTable.status, "verified")).groupBy(procedureLogsTable.studentId),
      db.select({ studentId: academicLogsTable.studentId, value: count() }).from(academicLogsTable)
        .where(eq(academicLogsTable.status, "verified")).groupBy(academicLogsTable.studentId),
      db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, configSourceId)),
    ]);
    const toMap = (rows: Array<{ studentId: number; value: number }>) =>
      new Map(rows.map((row) => [row.studentId, Number(row.value)]));
    const caseCounts = toMap(caseCountRows as any);
    const procedureCounts = toMap(procedureCountRows as any);
    const academicCounts = toMap(academicCountRows as any);
    const config = configs[0];
    const targets = {
      cases: config?.requiredCases ?? 0,
      procedures: config?.requiredProcedures ?? 0,
      academics: config?.requiredAcademic ?? 0,
    };
    const studentsWithProgress = students.map((student) => {
      const verified = {
        cases: caseCounts.get(student.studentProfileId) || 0,
        procedures: procedureCounts.get(student.studentProfileId) || 0,
        academics: academicCounts.get(student.studentProfileId) || 0,
      };
      const completion = completionPercent([[verified.cases, targets.cases], [verified.procedures, targets.procedures], [verified.academics, targets.academics]]);
      return { ...student, verified, targets, completion };
    });

    const professors = await db
      .select({
        id: usersTable.id,
        fullName: usersTable.fullName,
        email: usersTable.email,
        status: usersTable.status,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(and(eq(usersTable.role, "professor"), eq(usersTable.departmentId, departmentId)))
      .orderBy(usersTable.fullName);

    res.json({ students: studentsWithProgress, professors });
  } catch (error) {
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error fetching department roster");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/department/catalog", validate(z.object({ kind: z.enum(["posting", "academic", "case_category", "competency_level", "leave_type"]), name: nameSchema,
  value: nameSchema, required: targetSchema, period: z.enum(["total", "month"]) }).strict()), async (req, res) => {
  const [dept] = await db.select({ configSourceDepartmentId: departmentsTable.configSourceDepartmentId }).from(departmentsTable).where(eq(departmentsTable.id, req.user!.departmentId!));
  if (dept?.configSourceDepartmentId !== null) { res.status(403).json({ message: "Test departments cannot modify mirrored settings" }); return; }
  const [row] = await db.insert(departmentCatalogTable).values({ ...req.body, departmentId: req.user!.departmentId! }).returning();
  if (req.body.kind === "case_category" || req.body.kind === "academic") {
    await recomputeCatalogRequirements(req.user!.departmentId!);
  }
  res.status(201).json(row);
});

router.patch("/department/procedures/:id", validate(z.object({ required: targetSchema }).strict()), async (req, res) => {
  const [dept] = await db.select({ configSourceDepartmentId: departmentsTable.configSourceDepartmentId }).from(departmentsTable).where(eq(departmentsTable.id, req.user!.departmentId!));
  if (dept?.configSourceDepartmentId !== null) { res.status(403).json({ message: "Test departments cannot modify mirrored settings" }); return; }
  const [row] = await db.update(procedureTypesTable).set({ required: req.body.required })
    .where(and(eq(procedureTypesTable.id, Number(req.params.id)), eq(procedureTypesTable.departmentId, req.user!.departmentId!))).returning();
  if (!row) { res.status(404).json({ message: "Procedure not found" }); return; }
  await recomputeProcedureRequirement(req.user!.departmentId!);
  res.json(row);
});

router.patch("/department/catalog/:id", validate(z.object({ required: targetSchema, period: z.enum(["total", "month"]) }).strict()), async (req, res) => {
  const [dept] = await db.select({ configSourceDepartmentId: departmentsTable.configSourceDepartmentId }).from(departmentsTable).where(eq(departmentsTable.id, req.user!.departmentId!));
  if (dept?.configSourceDepartmentId !== null) { res.status(403).json({ message: "Test departments cannot modify mirrored settings" }); return; }
  const [row] = await db.update(departmentCatalogTable).set(req.body)
    .where(and(eq(departmentCatalogTable.id, Number(req.params.id)), eq(departmentCatalogTable.departmentId, req.user!.departmentId!))).returning();
  if (!row) { res.status(404).json({ message: "Training option not found" }); return; }
  if (row.kind === "case_category" || row.kind === "academic") {
    await recomputeCatalogRequirements(req.user!.departmentId!);
  }
  res.json(row);
});

// DELETE /api/admin/users/:id/hard
// Permanently delete a student or professor and cascade through all their associated data
router.delete("/users/:id/hard", async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id);
    if (isNaN(targetUserId)) {
      res.status(400).json({ message: "Invalid user ID" });
      return;
    }

    const departmentId = req.user?.departmentId;
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId)).limit(1);

    if (!target || target.departmentId !== departmentId || !["student", "professor"].includes(target.role)) {
      res.status(403).json({ message: "Cannot hard-delete this user" });
      return;
    }

    // Prevent removing yourself
    if (target.id === req.user?.id) {
      res.status(400).json({ message: "Cannot remove your own account" });
      return;
    }

    const role = target.role;
    let deletedCounts: any = {};

    await db.transaction(async (tx) => {
      if (role === "student") {
        const [student] = await tx.select({ id: studentsTable.id }).from(studentsTable).where(eq(studentsTable.userId, targetUserId)).limit(1);
        if (student) {
          const studentId = student.id;

          const _cases = await tx.delete(caseLogsTable).where(eq(caseLogsTable.studentId, studentId)).returning({ id: caseLogsTable.id });
          deletedCounts.caseLogs = _cases.length;

          const _procs = await tx.delete(procedureLogsTable).where(eq(procedureLogsTable.studentId, studentId)).returning({ id: procedureLogsTable.id });
          deletedCounts.procedureLogs = _procs.length;

          const _acad = await tx.delete(academicLogsTable).where(eq(academicLogsTable.studentId, studentId)).returning({ id: academicLogsTable.id });
          deletedCounts.academicLogs = _acad.length;

          const _leave = await tx.delete(leaveRecordsTable).where(eq(leaveRecordsTable.studentId, studentId)).returning({ id: leaveRecordsTable.id });
          deletedCounts.leaveRecords = _leave.length;

          const _leaveApp = await tx.delete(leaveApplicationsTable).where(eq(leaveApplicationsTable.studentId, studentId)).returning({ id: leaveApplicationsTable.id });
          deletedCounts.leaveApplications = _leaveApp.length;

          const _ass = await tx.delete(assessmentsTable).where(eq(assessmentsTable.studentId, studentId)).returning({ id: assessmentsTable.id });
          deletedCounts.assessments = _ass.length;

          const _appr = await tx.delete(appraisalsTable).where(eq(appraisalsTable.studentId, studentId)).returning({ id: appraisalsTable.id });
          deletedCounts.appraisals = _appr.length;

          const _asRec = await tx.delete(assignmentRecipientsTable).where(eq(assignmentRecipientsTable.studentId, studentId)).returning({ id: assignmentRecipientsTable.id });
          deletedCounts.assignmentRecipients = _asRec.length;

          const _att = await tx.delete(attendanceLogsTable).where(eq(attendanceLogsTable.studentId, studentId)).returning({ id: attendanceLogsTable.id });
          deletedCounts.attendanceLogs = _att.length;

          const _cert = await tx.delete(certificationsTable).where(eq(certificationsTable.studentId, studentId)).returning({ id: certificationsTable.id });
          deletedCounts.certifications = _cert.length;

          const _post = await tx.delete(postingsTable).where(eq(postingsTable.studentId, studentId)).returning({ id: postingsTable.id });
          deletedCounts.postings = _post.length;

          const _thes = await tx.delete(thesisMilestonesTable).where(eq(thesisMilestonesTable.studentId, studentId)).returning({ id: thesisMilestonesTable.id });
          deletedCounts.thesisMilestones = _thes.length;

          const _res = await tx.delete(researchTable).where(eq(researchTable.studentId, studentId)).returning({ id: researchTable.id });
          deletedCounts.research = _res.length;

          const _stud = await tx.delete(studentsTable).where(eq(studentsTable.id, studentId)).returning({ id: studentsTable.id });
          deletedCounts.students = _stud.length;
        }
      } else {
        const _cases = await tx.delete(caseLogsTable).where(or(eq(caseLogsTable.supervisorId, targetUserId), eq(caseLogsTable.reviewedBy, targetUserId))).returning({ id: caseLogsTable.id });
        deletedCounts.caseLogs = _cases.length;

        const _procs = await tx.delete(procedureLogsTable).where(or(eq(procedureLogsTable.supervisorId, targetUserId), eq(procedureLogsTable.reviewedBy, targetUserId))).returning({ id: procedureLogsTable.id });
        deletedCounts.procedureLogs = _procs.length;

        const _acad = await tx.delete(academicLogsTable).where(or(eq(academicLogsTable.supervisorId, targetUserId), eq(academicLogsTable.reviewedBy, targetUserId))).returning({ id: academicLogsTable.id });
        deletedCounts.academicLogs = _acad.length;

        const _leave = await tx.delete(leaveRecordsTable).where(eq(leaveRecordsTable.reviewedBy, targetUserId)).returning({ id: leaveRecordsTable.id });
        deletedCounts.leaveRecords = _leave.length;

        const _leaveApp = await tx.delete(leaveApplicationsTable).where(eq(leaveApplicationsTable.approvedBy, targetUserId)).returning({ id: leaveApplicationsTable.id });
        deletedCounts.leaveApplications = _leaveApp.length;

        const _ass = await tx.delete(assessmentsTable).where(eq(assessmentsTable.assessorId, targetUserId)).returning({ id: assessmentsTable.id });
        deletedCounts.assessments = _ass.length;

        const _appr = await tx.delete(appraisalsTable).where(eq(appraisalsTable.evaluatorId, targetUserId)).returning({ id: appraisalsTable.id });
        deletedCounts.appraisals = _appr.length;

        let totalAssignmentRecipients = 0;
        const _asRec = await tx.delete(assignmentRecipientsTable).where(eq(assignmentRecipientsTable.reviewedBy, targetUserId)).returning({ id: assignmentRecipientsTable.id });
        totalAssignmentRecipients += _asRec.length;

        const _att = await tx.delete(attendanceLogsTable).where(eq(attendanceLogsTable.verifiedBy, targetUserId)).returning({ id: attendanceLogsTable.id });
        deletedCounts.attendanceLogs = _att.length;

        const _post = await tx.delete(postingsTable).where(eq(postingsTable.supervisorId, targetUserId)).returning({ id: postingsTable.id });
        deletedCounts.postings = _post.length;

        const _thes = await tx.delete(thesisMilestonesTable).where(or(eq(thesisMilestonesTable.guideId, targetUserId), eq(thesisMilestonesTable.coGuideId, targetUserId))).returning({ id: thesisMilestonesTable.id });
        deletedCounts.thesisMilestones = _thes.length;

        const _res = await tx.delete(researchTable).where(or(eq(researchTable.guideId, targetUserId), eq(researchTable.coGuideId, targetUserId))).returning({ id: researchTable.id });
        deletedCounts.research = _res.length;

        await tx.update(studentsTable).set({ mentorId: null }).where(eq(studentsTable.mentorId, targetUserId));

        const _assignTypes = await tx.update(assignmentTypesTable).set({ createdBy: req.user!.id }).where(eq(assignmentTypesTable.createdBy, targetUserId)).returning({ id: assignmentTypesTable.id });
        deletedCounts.assignmentTypesReassigned = _assignTypes.length;

        const assignments = await tx.select({ id: assignmentsTable.id }).from(assignmentsTable).where(eq(assignmentsTable.facultyId, targetUserId));
        const assignmentIds = assignments.map(a => a.id);
        if (assignmentIds.length > 0) {
          const _asRec2 = await tx.delete(assignmentRecipientsTable).where(inArray(assignmentRecipientsTable.assignmentId, assignmentIds)).returning({ id: assignmentRecipientsTable.id });
          totalAssignmentRecipients += _asRec2.length;
        }
        deletedCounts.assignmentRecipients = totalAssignmentRecipients;

        const _assignments = await tx.delete(assignmentsTable).where(eq(assignmentsTable.facultyId, targetUserId)).returning({ id: assignmentsTable.id });
        deletedCounts.assignments = _assignments.length;
      }

      const _audit = await tx.delete(auditTable).where(eq(auditTable.performedById, targetUserId)).returning({ id: auditTable.id });
      deletedCounts.audit = _audit.length;

      const _payments = await tx.delete(paymentsTable).where(eq(paymentsTable.userId, targetUserId)).returning({ id: paymentsTable.id });
      deletedCounts.payments = _payments.length;

      const _users = await tx.delete(usersTable).where(eq(usersTable.id, targetUserId)).returning({ id: usersTable.id });
      deletedCounts.users = _users.length;
    });

    req.log.info({ targetUserId, departmentId, status: 200 }, "Account hard-deleted by HOD");
    res.json({ message: "Account and associated records permanently deleted", deletedRecords: deletedCounts });

  } catch (error: any) {
    const pgErrorCode = error.code ?? error.cause?.code;
    if (pgErrorCode === "23503") {
      req.log.error({ targetUserId: parseInt(req.params.id), departmentId: req.user!.departmentId, status: 409 }, "Hard-delete blocked by FK constraint");
      res.status(409).json({ message: "Hard-delete failed due to related data conflict" });
      return;
    }
    req.log.error({ targetUserId: parseInt(req.params.id), departmentId: req.user!.departmentId, status: 500 }, "Error hard-deleting user");
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /department/catalog/:id/usage-count
router.get("/department/catalog/:id/usage-count", async (req, res) => {
  try {
    const entryId = parseInt(req.params.id);
    const departmentId = req.user?.departmentId;
    
    const [entry] = await db.select().from(departmentCatalogTable)
      .where(and(eq(departmentCatalogTable.id, entryId), eq(departmentCatalogTable.departmentId, departmentId!))).limit(1);
      
    if (!entry) {
      res.status(403).json({ message: "Catalog entry not found in your department" });
      return;
    }

    let countRes: { count: number } = { count: 0 };
    if (entry.kind === "posting") {
      [countRes] = await db.select({ count: count() })
        .from(postingsTable)
        .innerJoin(studentsTable, eq(postingsTable.studentId, studentsTable.id))
        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(and(eq(postingsTable.ward, entry.value), eq(usersTable.departmentId, departmentId!)));
    } else if (entry.kind === "competency_level") {
      [countRes] = await db.select({ count: count() })
        .from(procedureLogsTable)
        .innerJoin(studentsTable, eq(procedureLogsTable.studentId, studentsTable.id))
        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(and(eq(procedureLogsTable.competencyLevel, entry.value), eq(usersTable.departmentId, departmentId!)));
    } else if (entry.kind === "case_category") {
      [countRes] = await db.select({ count: count() })
        .from(caseLogsTable)
        .innerJoin(studentsTable, eq(caseLogsTable.studentId, studentsTable.id))
        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(and(eq(caseLogsTable.category, entry.value), eq(usersTable.departmentId, departmentId!)));
    } else if (entry.kind === "academic") {
      [countRes] = await db.select({ count: count() })
        .from(academicLogsTable)
        .innerJoin(studentsTable, eq(academicLogsTable.studentId, studentsTable.id))
        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(and(eq(academicLogsTable.activityType, entry.value), eq(usersTable.departmentId, departmentId!)));
    } else if (entry.kind === "leave_type") {
      [countRes] = await db.select({ count: count() })
        .from(leaveRecordsTable)
        .innerJoin(studentsTable, eq(leaveRecordsTable.studentId, studentsTable.id))
        .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
        .where(and(eq(leaveRecordsTable.leaveType, entry.value), eq(usersTable.departmentId, departmentId!)));
    }
    
    res.json({ count: countRes.count });
  } catch (error) {
    req.log.error({ entryId: req.params.id, status: 500 }, "Error getting catalog usage count");
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE /department/catalog/:id
router.delete("/department/catalog/:id", async (req, res) => {
  try {
    const entryId = parseInt(req.params.id);
    const departmentId = req.user?.departmentId;
    
    const [entry] = await db.select().from(departmentCatalogTable)
      .where(and(eq(departmentCatalogTable.id, entryId), eq(departmentCatalogTable.departmentId, departmentId!))).limit(1);

    if (entry && entry.kind === "leave_type" && (entry.value === "casual" || entry.value === "academic")) {
      res.status(403).json({ message: "This leave type is required for quota tracking and cannot be removed" });
      return;
    }

    const [deleted] = await db.delete(departmentCatalogTable)
      .where(and(eq(departmentCatalogTable.id, entryId), eq(departmentCatalogTable.departmentId, departmentId!)))
      .returning();
      
    if (!deleted) {
      res.status(403).json({ message: "Catalog entry not found in your department" });
      return;
    }

    if (deleted.kind === "case_category" || deleted.kind === "academic") {
      await recomputeCatalogRequirements(departmentId!);
    }
    
    res.json({ message: "Catalog entry deleted successfully" });
  } catch (error) {
    req.log.error({ entryId: req.params.id, status: 500 }, "Error deleting catalog entry");
    res.status(500).json({ message: "Internal server error" });
  }
});

// GET /department/procedures/:id/usage-count
router.get("/department/procedures/:id/usage-count", async (req, res) => {
  try {
    const entryId = parseInt(req.params.id);
    const departmentId = req.user?.departmentId;
    
    const [entry] = await db.select().from(procedureTypesTable)
      .where(and(eq(procedureTypesTable.id, entryId), eq(procedureTypesTable.departmentId, departmentId!))).limit(1);
      
    if (!entry) {
      res.status(403).json({ message: "Procedure type not found in your department" });
      return;
    }

    const [countRes] = await db.select({ count: count() })
      .from(procedureLogsTable)
      .innerJoin(studentsTable, eq(procedureLogsTable.studentId, studentsTable.id))
      .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id))
      .where(and(
        eq(procedureLogsTable.procedureName, entry.name),
        eq(procedureLogsTable.procedureGroup, entry.group),
        eq(usersTable.departmentId, departmentId!)
      ));
    
    res.json({ count: countRes.count });
  } catch (error) {
    req.log.error({ entryId: req.params.id, status: 500 }, "Error getting procedure usage count");
    res.status(500).json({ message: "Internal server error" });
  }
});

// DELETE /department/procedures/:id
router.delete("/department/procedures/:id", async (req, res) => {
  try {
    const entryId = parseInt(req.params.id);
    const departmentId = req.user?.departmentId;
    
    const [deleted] = await db.delete(procedureTypesTable)
      .where(and(eq(procedureTypesTable.id, entryId), eq(procedureTypesTable.departmentId, departmentId!)))
      .returning();
      
    if (!deleted) {
      res.status(403).json({ message: "Procedure type not found in your department" });
      return;
    }

    await recomputeProcedureRequirement(departmentId!);
    
    res.json({ message: "Procedure type deleted successfully" });
  } catch (error) {
    req.log.error({ entryId: req.params.id, status: 500 }, "Error deleting procedure type");
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
