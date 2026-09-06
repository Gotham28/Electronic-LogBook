import { Router } from "express";
import { z } from "zod";
import { and, eq, desc, inArray, ilike, lt } from "drizzle-orm";
import { db, assignmentsTable as assignments, assignmentRecipientsTable as recipients,
  assignmentTypesTable as types, studentsTable as students, usersTable as users, auditTable } from "@workspace/db";
import { requireAuth, requireDepartment, requireRole } from "../middlewares/auth.js";
import { idSchema, nameSchema, validate } from "../lib/validation.js";

const router = Router();
router.use(requireAuth, requireRole(["student", "professor", "hod"]), requireDepartment);
const staff = requireRole(["professor", "hod"]);
const typeSchema = z.object({ name: nameSchema, description: z.string().trim().min(1).max(2000) }).strict();
const createSchema = z.object({ typeId: idSchema, title: nameSchema,
  instructions: z.string().trim().min(1).max(16000), dueAt: z.string().datetime({ offset: true }),
  studentIds: z.array(idSchema).min(1).max(100).refine((ids) => new Set(ids).size === ids.length, "Duplicate students"),
}).strict();

router.get("/types", async (req, res) => {
  res.json(await db.select({ id: types.id, name: types.name, description: types.description })
    .from(types).where(eq(types.departmentId, req.user!.departmentId!)).orderBy(types.name));
});

router.post("/types", staff, validate(typeSchema), async (req, res) => {
  const [created] = await db.insert(types).values({ ...req.body, departmentId: req.user!.departmentId!, createdBy: req.user!.id })
    .returning({ id: types.id, name: types.name, description: types.description });
  res.status(201).json(created);
});

router.get("/students", staff, async (req, res) => {
  const search = String(req.query.search || "").slice(0, 160).replace(/[\\%_]/g, "\\$&");
  res.json(await db.select({ id: students.id, name: users.fullName, registrationNumber: students.registrationNumber })
    .from(students).innerJoin(users, eq(students.userId, users.id))
    .where(and(eq(users.departmentId, req.user!.departmentId!), eq(users.role, "student"), eq(users.status, "approved"),
      search ? ilike(users.fullName, `%${search}%`) : undefined)).orderBy(users.fullName).limit(100));
});

router.post("/", staff, validate(createSchema), async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;
  if (Date.parse(body.dueAt) <= Date.now()) { res.status(400).json({ message: "Due date must be in the future" }); return; }
  const caller = req.user!;
  const created = await db.transaction(async (tx) => {
    const [type] = await tx.select({ id: types.id }).from(types)
      .where(and(eq(types.id, body.typeId), eq(types.departmentId, caller.departmentId!))).limit(1);
    const targets = await tx.select({ id: students.id }).from(students).innerJoin(users, eq(students.userId, users.id))
      .where(and(inArray(students.id, body.studentIds), eq(users.departmentId, caller.departmentId!),
        eq(users.role, "student"), eq(users.status, "approved"))).for("share");
    if (!type || targets.length !== body.studentIds.length) return null;
    const [assignment] = await tx.insert(assignments).values({ departmentId: caller.departmentId!, facultyId: caller.id,
      typeId: type.id, title: body.title, instructions: body.instructions, dueAt: new Date(body.dueAt) }).returning();
    await tx.insert(recipients).values(targets.map((s) => ({ assignmentId: assignment.id, studentId: s.id })));
    await tx.insert(auditTable).values({ tableName: "assignments", recordId: String(assignment.id), action: "CREATE",
      performedById: caller.id, afterState: { departmentId: caller.departmentId, studentIds: body.studentIds, typeId: type.id } });
    return assignment;
  });
  if (!created) { res.status(400).json({ message: "Select a type and approved students from your own department" }); return; }
  res.status(201).json(created);
});

router.get("/", async (req, res) => {
  const caller = req.user!;
  const cursor = req.query.cursor === undefined ? undefined : idSchema.safeParse(req.query.cursor);
  if (cursor && !cursor.success) { res.status(400).json({ message: "Invalid cursor" }); return; }
  const rows = await db.select({ id: recipients.id, assignmentId: assignments.id, title: assignments.title,
    instructions: assignments.instructions, typeName: types.name, typeDescription: types.description,
    dueAt: assignments.dueAt, facultyId: assignments.facultyId, studentId: students.id,
    studentName: users.fullName, registrationNumber: students.registrationNumber, status: recipients.status,
    response: recipients.response, feedback: recipients.feedback, submittedAt: recipients.submittedAt, reviewedAt: recipients.reviewedAt })
    .from(recipients).innerJoin(assignments, eq(recipients.assignmentId, assignments.id))
    .innerJoin(types, eq(assignments.typeId, types.id)).innerJoin(students, eq(recipients.studentId, students.id))
    .innerJoin(users, eq(students.userId, users.id))
    .where(and(eq(assignments.departmentId, caller.departmentId!), eq(users.departmentId, caller.departmentId!),
      caller.role === "student" ? eq(users.id, caller.id) : caller.role === "professor" ? eq(assignments.facultyId, caller.id) : undefined,
      cursor?.success ? lt(recipients.id, cursor.data) : undefined))
    .orderBy(desc(recipients.id)).limit(51);
  res.json({ items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null });
});

router.post("/:recipientId/submit", requireRole(["student"]),
  validate(z.object({ response: z.string().trim().min(1).max(20000) }).strict()), async (req, res) => {
    const id = idSchema.safeParse(req.params.recipientId);
    if (!id.success) { res.status(400).json({ message: "Invalid assignment ID" }); return; }
    const caller = req.user!;
    const eligible = db.select({ id: recipients.id }).from(recipients)
      .innerJoin(assignments, eq(assignments.id, recipients.assignmentId))
      .innerJoin(students, eq(students.id, recipients.studentId)).innerJoin(users, eq(students.userId, users.id))
      .where(and(eq(recipients.id, id.data), eq(students.userId, caller.id), eq(users.departmentId, caller.departmentId!),
        eq(assignments.departmentId, caller.departmentId!)));
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx.update(recipients).set({ response: req.body.response, status: "submitted", submittedAt: new Date(),
        feedback: null, reviewedAt: null, reviewedBy: null })
        .where(and(inArray(recipients.id, eligible), inArray(recipients.status, ["assigned", "returned"]))).returning();
      if (updated) await tx.insert(auditTable).values({ tableName: "assignment_recipients", recordId: String(updated.id),
        action: "UPDATE", performedById: caller.id, afterState: { status: updated.status } });
      return updated;
    });
    if (!row) { res.status(409).json({ message: "Assignment is unavailable or is not accepting a submission" }); return; }
    res.json(row);
  });

router.post("/:recipientId/review", staff,
  validate(z.object({ status: z.enum(["completed", "returned"]), feedback: z.string().trim().min(1).max(10000) }).strict()),
  async (req, res) => {
    const id = idSchema.safeParse(req.params.recipientId);
    if (!id.success) { res.status(400).json({ message: "Invalid assignment ID" }); return; }
    const caller = req.user!;
    const eligible = db.select({ id: recipients.id }).from(recipients)
      .innerJoin(assignments, eq(assignments.id, recipients.assignmentId))
      .innerJoin(students, eq(students.id, recipients.studentId)).innerJoin(users, eq(students.userId, users.id))
      .where(and(eq(recipients.id, id.data), eq(assignments.departmentId, caller.departmentId!), eq(users.departmentId, caller.departmentId!),
        caller.role === "professor" ? eq(assignments.facultyId, caller.id) : undefined));
    const row = await db.transaction(async (tx) => {
      const [updated] = await tx.update(recipients).set({ status: req.body.status, feedback: req.body.feedback,
        reviewedBy: caller.id, reviewedAt: new Date() })
        .where(and(inArray(recipients.id, eligible), eq(recipients.status, "submitted"))).returning();
      if (updated) await tx.insert(auditTable).values({ tableName: "assignment_recipients", recordId: String(updated.id),
        action: "UPDATE", performedById: caller.id, afterState: { status: updated.status } });
      return updated;
    });
    if (!row) { res.status(409).json({ message: "Assignment is unavailable or is not awaiting your review" }); return; }
    res.json(row);
  });

export default router;
