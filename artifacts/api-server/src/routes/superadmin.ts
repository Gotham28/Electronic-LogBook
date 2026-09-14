import { Router } from "express";
import { db, usersTable, departmentsTable, studentsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import { emailSchema, nameSchema, passwordSchema, idSchema, validate } from "../lib/validation.js";
import { sendAccountCreatedEmail } from "../lib/mailer.js";
import { provisionDepartment } from "../lib/department-provisioning.js";

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
    }).from(departmentsTable).orderBy(departmentsTable.name);

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

    res.json(departments.map((d) => ({ ...d, hod: hodByDept.get(d.id) || null })));
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

export default router;
