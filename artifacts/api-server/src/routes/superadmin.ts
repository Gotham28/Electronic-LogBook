import { Router } from "express";
import { db, usersTable, departmentsTable, studentsTable, departmentConfigsTable, departmentCatalogTable, procedureTypesTable, assignmentTypesTable, assignmentsTable, assignmentRecipientsTable, caseLogsTable, procedureLogsTable, academicLogsTable, leaveRecordsTable, postingsTable, researchTable, assessmentsTable, attendanceLogsTable, leaveApplicationsTable, thesisMilestonesTable, appraisalsTable, auditTable } from "@workspace/db";
import { eq, and, sql, inArray, or } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { emailSchema, nameSchema, passwordSchema, idSchema, validate } from "../lib/validation.js";
import { sendAccountCreatedEmail } from "../lib/mailer.js";
import { provisionDepartment, provisionMirrorForRealDepartment } from "../lib/department-provisioning.js";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../lib/env.js";
import { sessionProfile } from "./auth.js";

const router = Router();

// Only admin accounts can access these routes. No requireDepartment — admin
// accounts are not bound to a single department by design (§3 note in
// CURRENT_TASK.md: this role intentionally crosses department boundaries).
router.use(requireAuth, requireRole(["admin"]));
router.param("id", (req, res, next, value) => {
  if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) { res.status(400).json({ message: "Invalid record ID" }); return; }
  next();
});

// ---------------------------------------------------------------------------
// GET /api/superadmin/departments — list all departments with current HOD
// ---------------------------------------------------------------------------
router.get("/departments", async (req, res) => {
  try {
    const departments = await db.select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      code: departmentsTable.code,
      description: departmentsTable.description,
    }).from(departmentsTable).where(eq(departmentsTable.isTest, false)).orderBy(departmentsTable.name);

    // Fetch the current approved HOD for each department. This is a separate
    // query to keep the department list clean — a department without an HOD
    // still appears in the list (it just has hod: null).
    const hods = await db.select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      email: usersTable.email,
      departmentId: usersTable.departmentId,
    }).from(usersTable).where(and(eq(usersTable.role, "hod"), eq(usersTable.status, "approved")));

    const hodByDept = new Map(hods.map((h) => [h.departmentId, { id: h.id, fullName: h.fullName, email: h.email }]));

    const mirrors = await db.select({
      id: departmentsTable.id,
      configSourceDepartmentId: departmentsTable.configSourceDepartmentId,
    }).from(departmentsTable).where(eq(departmentsTable.isTest, true));

    const mirrorByRealDeptId = new Map(mirrors.filter(m => m.configSourceDepartmentId !== null).map((m) => [m.configSourceDepartmentId!, m.id]));

    res.json(departments.map((d) => ({ ...d, hod: hodByDept.get(d.id) || null, mirrorDepartmentId: mirrorByRealDeptId.get(d.id) ?? null })));
  } catch (error) {
    req.log.error({ userId: req.user!.id, status: 500 }, "Error listing departments");
    res.status(500).json({ message: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/superadmin/departments — create a department with its first HOD
// Reuses provisionDepartment() from department-provisioning.ts (not modified).
// ---------------------------------------------------------------------------
const createDepartmentBody = z.object({
  setup: z.object({
    name: nameSchema,
    code: z.string().trim().min(1).max(32).regex(/^[a-zA-Z0-9_-]+$/),
    description: z.string().max(1000).optional(),
    hod: z.object({ fullName: nameSchema, email: emailSchema }).strict(),
  }).strict(),
  hodPassword: passwordSchema,
}).strict();

router.post("/departments", validate(createDepartmentBody), async (req, res) => {
  try {
    const { setup, hodPassword } = req.body;
    const result = await provisionDepartment(setup, hodPassword);
    req.log.info({ departmentId: result.departmentId, hodId: result.hodId, status: 201 }, "Department provisioned");
    res.status(201).json(result);
  } catch (error: any) {
    // provisionDepartment throws descriptive errors for constraint violations.
    // Surface the message but never the full error object (§8).
    if (error.message && !error.cause) {
      req.log.error({ userId: req.user!.id, status: 400 }, "Department provisioning rejected");
      res.status(400).json({ message: error.message });
      return;
    }
    req.log.error({ userId: req.user!.id, status: 500 }, "Error provisioning department");
    res.status(500).json({ message: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/superadmin/departments/backfill-test-departments — create missing mirrors
// ---------------------------------------------------------------------------
router.post("/departments/backfill-test-departments", async (req, res) => {
  try {
    const realDepartments = await db.select({
      id: departmentsTable.id,
      name: departmentsTable.name,
      description: departmentsTable.description,
    }).from(departmentsTable).where(eq(departmentsTable.isTest, false));

    const provisioned: number[] = [];
    const skipped: number[] = [];
    const failed: { departmentId: number; message: string }[] = [];

    for (const dept of realDepartments) {
      try {
        const result = await provisionMirrorForRealDepartment(dept.id, dept.name, dept.description);
        if (result.created) {
          provisioned.push(dept.id);
        } else {
          skipped.push(dept.id);
        }
      } catch (error: any) {
        failed.push({ departmentId: dept.id, message: "Failed to provision test department" });
      }
    }

    req.log.info({
      adminId: req.user!.id,
      provisionedCount: provisioned.length,
      skippedCount: skipped.length,
      failedCount: failed.length
    }, "Backfilled mirror test departments");

    res.json({ provisioned, skipped, failed });
  } catch (error) {
    req.log.error({ userId: req.user!.id, status: 500 }, "Error backfilling mirror test departments");
    res.status(500).json({ message: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/superadmin/departments/:id/replace-hod — atomic HOD swap
// Demotes the outgoing HOD to professor, promotes the incoming user to hod,
// bumps sessionVersion on both. Enforces the one-approved-HOD-per-department
// constraint the same way provisionDepartment does (check-then-insert inside
// the transaction).
// ---------------------------------------------------------------------------
const replaceHodBody = z.object({
  incomingUserId: idSchema,
}).strict();

router.post("/departments/:id/replace-hod", validate(replaceHodBody), async (req, res) => {
  const departmentId = Number(req.params.id);
  const { incomingUserId } = req.body;
  try {
    const result = await db.transaction(async (tx): Promise<
      | { error: string; status: number }
      | { demotedId: number; promotedId: number }
    > => {
      // 1. Verify the department exists
      const [dept] = await tx.select({ id: departmentsTable.id }).from(departmentsTable)
        .where(eq(departmentsTable.id, departmentId)).limit(1);
      if (!dept) return { error: "Department not found", status: 404 };

      // 2. Find the current approved HOD for this department
      const [currentHod] = await tx.select({ id: usersTable.id, role: usersTable.role })
        .from(usersTable)
        .where(and(eq(usersTable.departmentId, departmentId), eq(usersTable.role, "hod"), eq(usersTable.status, "approved")))
        .limit(1);
      if (!currentHod) return { error: "No active HOD found in this department to replace", status: 404 };

      // 3. Verify the incoming user exists, is in this department, and is a professor
      const [incoming] = await tx.select({ id: usersTable.id, role: usersTable.role, departmentId: usersTable.departmentId, status: usersTable.status })
        .from(usersTable)
        .where(eq(usersTable.id, incomingUserId))
        .limit(1);
      if (!incoming) return { error: "Incoming user not found", status: 404 };
      if (incoming.departmentId !== departmentId) return { error: "Incoming user is not in this department", status: 400 };
      if (incoming.role !== "professor") return { error: "Incoming user must be a professor in the department", status: 400 };
      if (incoming.status !== "approved") return { error: "Incoming user's account is not active", status: 400 };

      // 4. Demote current HOD to professor + bump sessionVersion
      await tx.update(usersTable)
        .set({ role: "professor", sessionVersion: sql`${usersTable.sessionVersion} + 1` })
        .where(and(eq(usersTable.id, currentHod.id), eq(usersTable.role, "hod"), eq(usersTable.status, "approved")));

      // 5. Confirm no approved HOD remains (matches provisionDepartment's check pattern)
      const [remaining] = await tx.select({ id: usersTable.id }).from(usersTable)
        .where(and(eq(usersTable.departmentId, departmentId), eq(usersTable.role, "hod"), eq(usersTable.status, "approved")))
        .limit(1);
      if (remaining) return { error: "Failed to demote existing HOD; aborting", status: 409 };

      // 6. Promote incoming user to HOD + bump sessionVersion
      await tx.update(usersTable)
        .set({ role: "hod", sessionVersion: sql`${usersTable.sessionVersion} + 1` })
        .where(and(eq(usersTable.id, incoming.id), eq(usersTable.role, "professor"), eq(usersTable.status, "approved")));

      return { demotedId: currentHod.id, promotedId: incoming.id };
    });

    if ("error" in result) {
      req.log.error({ departmentId, userId: req.user!.id, status: result.status }, "HOD replacement rejected");
      res.status(result.status).json({ message: result.error });
      return;
    }

    req.log.info({ departmentId, demotedId: result.demotedId, promotedId: result.promotedId, status: 200 }, "HOD replaced");
    res.json({ message: "HOD replaced successfully", demotedId: result.demotedId, promotedId: result.promotedId });
  } catch (error) {
    req.log.error({ departmentId, userId: req.user!.id, status: 500 }, "Error replacing HOD");
    res.status(500).json({ message: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/superadmin/departments/:id — hard-delete a department
//
// Deletes the department and all rows directly scoped to it: users,
// department_configs, department_catalog, procedure_types, assignment_types,
// and assignments. Everything runs in a single transaction so either all
// rows are removed or none are.
//
// If any of these deletes trips a FK constraint deeper in the graph
// (e.g. a user is referenced by case_logs, procedure_logs, academic_logs,
// leave_records, postings, research, assessments, attendance, appraisals,
// or audit rows), Postgres returns error code 23503 and the transaction
// rolls back cleanly. The client receives a 409 explaining why. This is
// the expected, correct outcome for any department with real clinical
// activity — it is not a bug to engineer around.
// ---------------------------------------------------------------------------
async function deleteDepartmentCascade(tx: any, targetDepartmentId: number, isMirror: boolean = false): Promise<void> {
  // 2. Collect user IDs, student IDs, and assignment IDs in this department
  const deptUsers = await tx.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.departmentId, targetDepartmentId));
  const userIds = deptUsers.map((u: any) => u.id);

  let studentIds: number[] = [];
  if (userIds.length > 0) {
    const studentRows = await tx.select({ id: studentsTable.id }).from(studentsTable)
      .where(inArray(studentsTable.userId, userIds));
    studentIds = studentRows.map((s: any) => s.id);
  }

  const deptAssignments = await tx.select({ id: assignmentsTable.id }).from(assignmentsTable)
    .where(eq(assignmentsTable.departmentId, targetDepartmentId));
  const assignmentIds = deptAssignments.map((a: any) => a.id);

  // 3. Delete in FK-safe order:
  //    assignment_recipients → assignments → assignment_types → students → users → config/catalog/procs → department
  //
  //    assignment_recipients references assignments.id, students.id, and
  //    users.id (via reviewedBy), so it must go before all three.
  //    students references users.id, so it goes before users.
  //    assignments references assignment_types.id, so assignments before types.
  //    Both assignments and assignment_types reference users.id, so they go before users.
  //    Everything references departments.id, so department is last.

  const conflicts: string[] = [];
  if (studentIds.length > 0 || userIds.length > 0) {
    const checkTable = async (tableName: string, table: any, uFields: any[], sFields: any[]) => {
      const conditions = [];
      if (studentIds.length > 0) {
        for (const field of sFields) conditions.push(inArray(field, studentIds));
      }
      if (userIds.length > 0) {
        for (const field of uFields) conditions.push(inArray(field, userIds));
      }
      if (conditions.length === 0) return;

      const [result] = await tx.select({ count: sql<number>`cast(count(*) as integer)` }).from(table).where(or(...conditions));
      if (result && result.count > 0) {
        conflicts.push(`${tableName} (${result.count} rows)`);
      }
    };

    await checkTable("case_logs", caseLogsTable, [caseLogsTable.supervisorId, caseLogsTable.reviewedBy], [caseLogsTable.studentId]);
    await checkTable("procedure_logs", procedureLogsTable, [procedureLogsTable.supervisorId, procedureLogsTable.reviewedBy], [procedureLogsTable.studentId]);
    await checkTable("academic_logs", academicLogsTable, [academicLogsTable.supervisorId, academicLogsTable.reviewedBy], [academicLogsTable.studentId]);
    await checkTable("leave_records", leaveRecordsTable, [leaveRecordsTable.reviewedBy], [leaveRecordsTable.studentId]);
    await checkTable("postings", postingsTable, [postingsTable.supervisorId], [postingsTable.studentId]);
    await checkTable("research", researchTable, [researchTable.guideId, researchTable.coGuideId], [researchTable.studentId]);
    await checkTable("assessments", assessmentsTable, [assessmentsTable.assessorId], [assessmentsTable.studentId]);
    await checkTable("attendance_logs", attendanceLogsTable, [attendanceLogsTable.verifiedBy], [attendanceLogsTable.studentId]);
    await checkTable("leave_applications", leaveApplicationsTable, [leaveApplicationsTable.approvedBy], [leaveApplicationsTable.studentId]);
    await checkTable("thesis_milestones", thesisMilestonesTable, [thesisMilestonesTable.guideId, thesisMilestonesTable.coGuideId], [thesisMilestonesTable.studentId]);
    await checkTable("appraisals", appraisalsTable, [appraisalsTable.evaluatorId], [appraisalsTable.studentId]);
    await checkTable("audit", auditTable, [auditTable.performedById], []);
  }

  if (conflicts.length > 0 && !isMirror) {
    const err: any = new Error("Clinical data conflict");
    err.statusOverride = 409;
    err.conflictMessage = `Cannot delete department due to existing clinical data: ${conflicts.join(", ")}`;
    throw err;
  }

  if (assignmentIds.length > 0) {
    await tx.delete(assignmentRecipientsTable).where(inArray(assignmentRecipientsTable.assignmentId, assignmentIds));
  }

  if (studentIds.length > 0) {
    await tx.delete(assignmentRecipientsTable).where(inArray(assignmentRecipientsTable.studentId, studentIds));
  }

  await tx.delete(assignmentsTable).where(eq(assignmentsTable.departmentId, targetDepartmentId));
  await tx.delete(assignmentTypesTable).where(eq(assignmentTypesTable.departmentId, targetDepartmentId));

  if (studentIds.length > 0) {
    await tx.delete(studentsTable).where(inArray(studentsTable.id, studentIds));
  }

  if (userIds.length > 0) {
    await tx.delete(usersTable).where(eq(usersTable.departmentId, targetDepartmentId));
  }

  await tx.delete(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, targetDepartmentId));
  await tx.delete(departmentCatalogTable).where(eq(departmentCatalogTable.departmentId, targetDepartmentId));
  await tx.delete(procedureTypesTable).where(eq(procedureTypesTable.departmentId, targetDepartmentId));

  // 4. Delete the department row itself
  await tx.delete(departmentsTable).where(eq(departmentsTable.id, targetDepartmentId));
}

router.delete("/departments/:id", async (req, res) => {
  const departmentId = Number(req.params.id);
  try {
    await db.transaction(async (tx) => {
      // 1. Verify the department exists
      const [dept] = await tx.select({ id: departmentsTable.id }).from(departmentsTable)
        .where(eq(departmentsTable.id, departmentId)).limit(1);
      if (!dept) {
        // Throw a sentinel to exit the transaction and return 404 below.
        const err: any = new Error("Department not found");
        err.statusOverride = 404;
        throw err;
      }

      // Look up any mirror departments
      const mirrors = await tx.select({ id: departmentsTable.id }).from(departmentsTable)
        .where(eq(departmentsTable.configSourceDepartmentId, departmentId));
      
      // Delete mirrors completely before touching the target department
      for (const mirror of mirrors) {
        await deleteDepartmentCascade(tx, mirror.id, true);
      }

      // Delete the target department itself
      await deleteDepartmentCascade(tx, departmentId, false);
    });

    req.log.info({ departmentId, status: 200 }, "Department deleted");
    res.json({ message: "Department and all associated data deleted" });
  } catch (error: any) {
    if (error.statusOverride === 404) {
      req.log.info({ departmentId, status: 404 }, "Department delete: not found");
      res.status(404).json({ message: "Department not found" });
      return;
    }
    if (error.statusOverride === 409) {
      req.log.info({ departmentId, status: 409 }, "Department delete blocked by pre-check");
      res.status(409).json({ message: error.conflictMessage });
      return;
    }
    const pgErrorCode = error.code ?? error.cause?.code;
    if (pgErrorCode === "23503") {
      req.log.info({ departmentId, status: 409 }, "Department delete blocked by FK constraint");
      res.status(409).json({
        message: "This department has faculty, residents, or records that reference clinical data and cannot be deleted. Remove or reassign them first.",
      });
      return;
    }
    req.log.error({ departmentId, userId: req.user!.id, status: 500 }, "Error deleting department");
    res.status(500).json({ message: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/superadmin/departments/:id/roster — plain user rows, no clinical joins
// Deliberately uses usersTable.id only (§4: never conflates with studentsTable.id).
// ---------------------------------------------------------------------------
router.get("/departments/:id/roster", async (req, res) => {
  const departmentId = Number(req.params.id);
  try {
    const [dept] = await db.select({ id: departmentsTable.id }).from(departmentsTable)
      .where(eq(departmentsTable.id, departmentId)).limit(1);
    if (!dept) { res.status(404).json({ message: "Department not found" }); return; }

    const users = await db.select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      email: usersTable.email,
      role: usersTable.role,
      status: usersTable.status,
    }).from(usersTable)
      .where(eq(usersTable.departmentId, departmentId))
      .orderBy(usersTable.fullName);

    res.json(users);
  } catch (error) {
    req.log.error({ departmentId, userId: req.user!.id, status: 500 }, "Error fetching roster");
    res.status(500).json({ message: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/superadmin/departments/:id/faculty — create a professor in any dept
// ---------------------------------------------------------------------------
const createFacultyBody = z.object({
  fullName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
}).strict();

router.post("/departments/:id/faculty", validate(createFacultyBody), async (req, res) => {
  const departmentId = Number(req.params.id);
  try {
    const [dept] = await db.select({ id: departmentsTable.id, name: departmentsTable.name }).from(departmentsTable)
      .where(eq(departmentsTable.id, departmentId)).limit(1);
    if (!dept) { res.status(404).json({ message: "Department not found" }); return; }

    const { fullName, email, password } = req.body;
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.email, email)).limit(1);
    if (existing) { res.status(400).json({ message: "Email already registered" }); return; }

    const passwordHash = await bcrypt.hash(password, 12);
    const [created] = await db.insert(usersTable).values({
      fullName, email, passwordHash,
      role: "professor", status: "approved", departmentId: dept.id,
    }).returning({ id: usersTable.id });

    try {
      await sendAccountCreatedEmail(email, fullName, password, "professor", dept.name);
    } catch {
      // Account created successfully; email failure is non-fatal.
      req.log.error({ userId: created.id, status: 200 }, "Faculty welcome email failed");
    }

    req.log.info({ createdId: created.id, departmentId, status: 201 }, "Faculty created by admin");
    res.status(201).json({ message: "Faculty account created", faculty: { id: created.id, fullName, email, departmentId } });
  } catch (error) {
    req.log.error({ departmentId, userId: req.user!.id, status: 500 }, "Error creating faculty");
    res.status(500).json({ message: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/superadmin/departments/:id/students — create a student (pending)
// Status is "pending" so the student enters the department's HOD approval queue.
// Payment gate is untouched — this just creates the user + student profile row.
// ---------------------------------------------------------------------------
const createStudentBody = z.object({
  fullName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  registrationNumber: nameSchema,
  batch: z.string().trim().min(1).max(40),
  dateOfJoining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Invalid date"),
  kuhsId: nameSchema,
}).strict();

router.post("/departments/:id/students", validate(createStudentBody), async (req, res) => {
  const departmentId = Number(req.params.id);
  try {
    const [dept] = await db.select({ id: departmentsTable.id, name: departmentsTable.name }).from(departmentsTable)
      .where(eq(departmentsTable.id, departmentId)).limit(1);
    if (!dept) { res.status(404).json({ message: "Department not found" }); return; }

    const { fullName, email, password, registrationNumber, batch, dateOfJoining, kuhsId } = req.body;
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.email, email)).limit(1);
    if (existing) { res.status(400).json({ message: "Email already registered" }); return; }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await db.transaction(async (tx) => {
      const [user] = await tx.insert(usersTable).values({
        fullName, email, passwordHash,
        role: "student", status: "pending", departmentId: dept.id,
      }).returning({ id: usersTable.id });
      await tx.insert(studentsTable).values({
        userId: user.id, registrationNumber, batch,
        dateOfJoining, kuhsId, specialty: dept.name,
      });
      return user;
    });

    req.log.info({ createdId: created.id, departmentId, status: 201 }, "Student created by admin");
    res.status(201).json({ message: "Student account created (pending HOD approval)", student: { id: created.id, fullName, email, departmentId } });
  } catch (error) {
    req.log.error({ departmentId, userId: req.user!.id, status: 500 }, "Error creating student");
    res.status(500).json({ message: "Internal server error" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/superadmin/users/:id/deactivate — soft-deactivate a student or faculty
// Same pattern as admin.ts DELETE /users/:id: status → "rejected", sessionVersion + 1,
// records retained. Refuses if target role is "admin" or "hod" (403).
// ---------------------------------------------------------------------------
router.post("/users/:id/deactivate", validate(z.object({}).strict()), async (req, res) => {
  const targetId = Number(req.params.id);
  try {
    const [target] = await db.select({
      id: usersTable.id,
      role: usersTable.role,
      status: usersTable.status,
    }).from(usersTable).where(eq(usersTable.id, targetId)).limit(1);

    if (!target) { res.status(404).json({ message: "User not found" }); return; }
    if (target.role === "admin" || target.role === "hod") {
      res.status(403).json({ message: "Cannot deactivate an admin or HOD via this endpoint" });
      return;
    }
    if (!["student", "professor"].includes(target.role)) {
      res.status(403).json({ message: "Cannot deactivate this account type" });
      return;
    }

    await db.update(usersTable)
      .set({ status: "rejected", sessionVersion: sql`${usersTable.sessionVersion} + 1` })
      .where(and(eq(usersTable.id, targetId), eq(usersTable.status, "approved")));

    req.log.info({ targetId, status: 200 }, "Account deactivated by admin");
    res.json({ message: "Account deactivated; records retained" });
  } catch (error) {
    req.log.error({ targetId, userId: req.user!.id, status: 500 }, "Error deactivating account");
    res.status(500).json({ message: "Internal server error" });
  }
});

const impersonateAttempts = new Map<number, { count: number; expires: number }>();

// ---------------------------------------------------------------------------
// POST /api/superadmin/users/:id/impersonate — log in as a test account
// ---------------------------------------------------------------------------
router.post("/users/:id/impersonate", validate(z.object({}).strict()), async (req, res) => {
  const targetId = Number(req.params.id);
  const adminId = req.user!.id;
  
  const now = Date.now();
  for (const [key, value] of impersonateAttempts) if (value.expires <= now) impersonateAttempts.delete(key);
  const entry = impersonateAttempts.get(adminId);
  if ((!entry && impersonateAttempts.size >= 5000) || (entry && entry.count >= 100)) {
    res.setHeader("Retry-After", "900");
    res.status(429).json({ message: "Too many impersonation attempts. Try again later." }); 
    return;
  }
  impersonateAttempts.set(adminId, { count: (entry?.count || 0) + 1, expires: entry?.expires || now + 900000 });

  try {
    const [target] = await db.select({
      id: usersTable.id,
      role: usersTable.role,
      status: usersTable.status,
      departmentId: usersTable.departmentId,
      sessionVersion: usersTable.sessionVersion,
    }).from(usersTable).where(eq(usersTable.id, targetId)).limit(1);

    if (!target) { res.status(404).json({ message: "User not found" }); return; }

    if (!target.departmentId) {
      res.status(403).json({ message: "User has no department" }); return;
    }
    
    const [dept] = await db.select({
      isTest: departmentsTable.isTest,
    }).from(departmentsTable).where(eq(departmentsTable.id, target.departmentId)).limit(1);
    
    if (!dept || !dept.isTest) {
      res.status(403).json({ message: "Cannot impersonate accounts outside of test departments" }); return;
    }

    if (!["hod", "professor", "student"].includes(target.role)) {
      res.status(403).json({ message: "Cannot impersonate this account type" }); return;
    }

    if (target.status !== "approved") {
      res.status(403).json({ message: "Cannot impersonate inactive accounts" }); return;
    }

    const token = jwt.sign({ 
      id: target.id, 
      sessionVersion: target.sessionVersion, 
      impersonatedBy: adminId 
    }, JWT_SECRET, { algorithm: "HS256", expiresIn: "20m" });

    req.log.info({ adminId, targetId: target.id, role: target.role, departmentId: target.departmentId, status: target.status }, "Admin impersonated user");

    res.json({ ...await sessionProfile(target.id), token });
  } catch (error) {
    req.log.error({ targetId, adminId, status: 500 }, "Error impersonating user");
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
