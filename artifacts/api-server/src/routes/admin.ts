import { Router } from "express";
import { db, usersTable, studentsTable, departmentsTable, departmentConfigsTable, procedureTypesTable, caseLogsTable, procedureLogsTable, academicLogsTable, departmentCatalogTable } from "@workspace/db";
import { eq, and, count, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole, requireDepartment } from "../middlewares/auth.js";
import { completionPercent, configSchema, emailSchema, nameSchema, passwordSchema, targetSchema, validate } from "../lib/validation.js";

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
    req.log.error(error, "Error fetching pending students");
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
    if (!target) {
      res.status(404).json({ message: "Pending student not found" });
      return;
    }
    if (target.departmentId !== departmentId) {
      res.status(403).json({ message: "Cannot approve a student outside your department" });
      return;
    }

    await db.update(usersTable)
      .set({ status: "approved" })
      .where(and(eq(usersTable.id, userId), eq(usersTable.departmentId, departmentId!), eq(usersTable.status, "pending")));

    res.json({ message: "Student approved successfully" });
  } catch (error) {
    req.log.error(error, "Error approving student");
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

    if (!target) {
      res.status(404).json({ message: "Pending student not found" });
      return;
    }
    if (target.departmentId !== departmentId) {
      res.status(403).json({ message: "Cannot reject a student outside your department" });
      return;
    }

    await db.update(usersTable).set({ status: "rejected", sessionVersion: sql`${usersTable.sessionVersion} + 1` })
      .where(and(eq(usersTable.id, userId), eq(usersTable.departmentId, departmentId!), eq(usersTable.status, "pending")));

    res.json({ message: "Student registration rejected" });
  } catch (error) {
    req.log.error(error, "Error rejecting student");
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

    if (!target) {
      res.status(404).json({ message: "User not found" });
      return;
    }
    if (target.departmentId !== departmentId || !["student", "professor"].includes(target.role)) {
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
    req.log.error(error, "Error removing user");
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

    const passwordHash = await bcrypt.hash(password, 10);

    const [newProf] = await db.insert(usersTable).values({
      fullName,
      email,
      passwordHash,
      role: "professor",
      status: "approved", // Professors created by HOD are auto-approved
      departmentId: req.user!.departmentId!
    }).returning();

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
    req.log.error(error, "Error creating professor");
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

    const mappedLeaves = pendingLeaves.map(leave => {
      const start = new Date(leave.fromDate).getTime();
      const end = new Date(leave.toDate).getTime();
      const diff = Math.ceil((end - start) / (1000 * 3600 * 24)) + 1;
      return { ...leave, totalDays: isNaN(diff) ? 1 : diff };
    });

    res.json(mappedLeaves);
  } catch (error) {
    req.log.error(error, "Error fetching pending leaves");
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
    req.log.error(error, "Error updating leave status");
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

    const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, departmentId));
    res.json(config || null);
  } catch (error) {
    req.log.error(error, "Error fetching department config");
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

    const { requiredCases, requiredProcedures, requiredAcademic } = req.body;

    const existing = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, departmentId));
    
    if (existing.length > 0) {
      const [updated] = await db.update(departmentConfigsTable).set({
        programDurationMonths: req.body.programDurationMonths,
        casualLeaveAllowance: req.body.casualLeaveAllowance,
        academicLeaveAllowance: req.body.academicLeaveAllowance,
        requiredCases: parseInt(requiredCases, 10),
        requiredProcedures: parseInt(requiredProcedures, 10),
        requiredAcademic: parseInt(requiredAcademic, 10)
      }).where(eq(departmentConfigsTable.departmentId, departmentId)).returning();
      res.json(updated);
      return;
    } else {
      const [inserted] = await db.insert(departmentConfigsTable).values({
        departmentId,
        programDurationMonths: req.body.programDurationMonths,
        casualLeaveAllowance: req.body.casualLeaveAllowance,
        academicLeaveAllowance: req.body.academicLeaveAllowance,
        requiredCases: parseInt(requiredCases, 10),
        requiredProcedures: parseInt(requiredProcedures, 10),
        requiredAcademic: parseInt(requiredAcademic, 10)
      }).returning();
      res.json(inserted);
      return;
    }
  } catch (error) {
    req.log.error(error, "Error updating department config");
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

    const procedures = await db.select().from(procedureTypesTable).where(eq(procedureTypesTable.departmentId, departmentId));
    res.json(procedures);
  } catch (error) {
    req.log.error(error, "Error fetching procedures");
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
    res.json(inserted);
  } catch (error) {
    req.log.error(error, "Error adding procedure");
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

    const [caseCountRows, procedureCountRows, academicCountRows, configs] = await Promise.all([
      db.select({ studentId: caseLogsTable.studentId, value: count() }).from(caseLogsTable)
        .where(eq(caseLogsTable.status, "verified")).groupBy(caseLogsTable.studentId),
      db.select({ studentId: procedureLogsTable.studentId, value: count() }).from(procedureLogsTable)
        .where(eq(procedureLogsTable.status, "verified")).groupBy(procedureLogsTable.studentId),
      db.select({ studentId: academicLogsTable.studentId, value: count() }).from(academicLogsTable)
        .where(eq(academicLogsTable.status, "verified")).groupBy(academicLogsTable.studentId),
      db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, departmentId)),
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
    req.log.error(error, "Error fetching department roster");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/department/catalog", validate(z.object({ kind: z.enum(["posting", "academic"]), name: nameSchema,
  value: nameSchema, required: targetSchema, period: z.enum(["total", "month"]) }).strict()), async (req, res) => {
  const [row] = await db.insert(departmentCatalogTable).values({ ...req.body, departmentId: req.user!.departmentId! }).returning();
  res.status(201).json(row);
});

router.patch("/department/procedures/:id", validate(z.object({ required: targetSchema }).strict()), async (req, res) => {
  const [row] = await db.update(procedureTypesTable).set({ required: req.body.required })
    .where(and(eq(procedureTypesTable.id, Number(req.params.id)), eq(procedureTypesTable.departmentId, req.user!.departmentId!))).returning();
  if (!row) { res.status(404).json({ message: "Procedure not found" }); return; }
  res.json(row);
});

router.patch("/department/catalog/:id", validate(z.object({ required: targetSchema, period: z.enum(["total", "month"]) }).strict()), async (req, res) => {
  const [row] = await db.update(departmentCatalogTable).set(req.body)
    .where(and(eq(departmentCatalogTable.id, Number(req.params.id)), eq(departmentCatalogTable.departmentId, req.user!.departmentId!))).returning();
  if (!row) { res.status(404).json({ message: "Training option not found" }); return; }
  res.json(row);
});

export default router;
