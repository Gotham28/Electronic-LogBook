import { Router, type Request, type Response } from "express";
import { and, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, psychiatryAttendeesTable, psychiatryEntriesTable, studentsTable, usersTable } from "@workspace/db";
import { resolvePsychiatryDiagnosis, psychiatryEntrySchema, psychiatryFieldVisible, psychiatryPages, validatePsychiatryEntry } from "@workspace/api-zod";
import { requireAuth, requireDepartment, requireRole } from "../middlewares/auth.js";
import { getDepartmentFeatures } from "../lib/department-features.js";
import { idSchema } from "../lib/validation.js";

type Entry = typeof psychiatryEntriesTable.$inferSelect;
const router = Router();
const sections = Object.keys(psychiatryPages);
const sharedSections = sections.filter((section) => psychiatryPages[section].shared);
const studentOnly = requireRole(["student"]);
const reviewerOnly = requireRole(["professor", "hod"]);

router.use(requireAuth, requireDepartment, requireRole(["student", "professor", "hod"]), async (req, res, next) => {
  const { features } = await getDepartmentFeatures(req.user!.departmentId!);
  if (features.psychiatryWorkspace !== true) { res.status(403).json({ message: "Psychiatry workspace is unavailable for your department" }); return; }
  next();
});

async function studentFor(userId: number) {
  const [student] = await db.select({ id: studentsTable.id, mentorId: studentsTable.mentorId }).from(studentsTable).where(eq(studentsTable.userId, userId)).limit(1);
  return student;
}

function scopedToDepartment(departmentId: number) {
  return and(eq(psychiatryEntriesTable.departmentId, departmentId), exists(
    db.select({ id: studentsTable.id }).from(studentsTable).innerJoin(usersTable, eq(usersTable.id, studentsTable.userId)).where(and(
      eq(studentsTable.id, psychiatryEntriesTable.studentId), eq(usersTable.departmentId, departmentId), eq(usersTable.status, "approved"), eq(usersTable.role, "student"),
    )),
  ));
}

async function describe(rows: Entry[], departmentId: number, studentId?: number) {
  if (!rows.length) return [];
  const memberRows = await db.select({ entryId: psychiatryAttendeesTable.entryId, id: usersTable.id, name: usersTable.fullName })
    .from(psychiatryAttendeesTable).innerJoin(usersTable, eq(psychiatryAttendeesTable.userId, usersTable.id)).where(and(
      inArray(psychiatryAttendeesTable.entryId, rows.map((row) => row.id)), eq(usersTable.departmentId, departmentId), eq(usersTable.status, "approved"),
    ));
  const reviewerIds = [...new Set(rows.flatMap((row) => row.reviewerId === null ? [] : [row.reviewerId]))];
  const reviewers = reviewerIds.length ? await db.select({ id: usersTable.id, name: usersTable.fullName }).from(usersTable)
    .where(and(inArray(usersTable.id, reviewerIds), eq(usersTable.departmentId, departmentId), eq(usersTable.status, "approved"))) : [];
  const names = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer.name]));
  const residents = studentId === undefined ? await db.select({ id: studentsTable.id, name: usersTable.fullName }).from(studentsTable)
    .innerJoin(usersTable, eq(studentsTable.userId, usersTable.id)).where(and(eq(usersTable.departmentId, departmentId),
      eq(usersTable.status, "approved"), inArray(studentsTable.id, [...new Set(rows.map((row) => row.studentId))]))) : [];
  const residentNames = new Map(residents.map((resident) => [resident.id, resident.name]));
  const attendeesByEntry = new Map<number, Array<{ id: number; name: string }>>();
  for (const row of memberRows) {
    const namesForEntry = attendeesByEntry.get(row.entryId) ?? [];
    namesForEntry.push({ id: row.id, name: row.name });
    attendeesByEntry.set(row.entryId, namesForEntry);
  }
  return rows.map(({ departmentId: _department, studentId: ownerId, ...entry }) => {
    const { recordNumber: _legacyPatientId, ...values } = entry.values;
    const own = studentId === ownerId;
    const attendees = attendeesByEntry.get(entry.id) ?? [];
    if (studentId !== undefined && !own) {
      const { date, topic, journal } = entry.values;
      const verified = entry.status === "verified" || entry.status === "recorded";
      return { id: entry.id, section: entry.section, status: entry.status, own, values: { date, topic, journal },
        reviewerName: verified ? names.get(entry.reviewerId ?? 0) : undefined,
        attendeeNames: verified ? attendees.map(({ name }) => name) : [] };
    }
    return { ...entry, values, own, reviewerName: names.get(entry.reviewerId ?? 0), residentName: residentNames.get(ownerId), attendeeNames: attendees.map(({ name }) => name),
      ...(own ? { attendeeIds: attendees.map(({ id }) => id) } : {}) };
  });
}

async function sharedSummaries(departmentId: number, section: string, entryId?: number) {
  const rows = await db.select({ id: psychiatryEntriesTable.id, section: psychiatryEntriesTable.section, status: psychiatryEntriesTable.status,
    date: sql<string | null>`${psychiatryEntriesTable.values}->>'date'`, topic: sql<string | null>`${psychiatryEntriesTable.values}->>'topic'` })
    .from(psychiatryEntriesTable).where(and(scopedToDepartment(departmentId), eq(psychiatryEntriesTable.section, section),
      eq(psychiatryEntriesTable.status, section === "a_cme" ? "recorded" : "verified"), entryId === undefined ? undefined : eq(psychiatryEntriesTable.id, entryId)))
    .orderBy(desc(psychiatryEntriesTable.id));
  return rows.map(({ date, topic, ...row }) => ({ ...row, values: { date, topic } }));
}

router.get("/roster", studentOnly, async (req, res) => {
  const rows = await db.select({ id: usersTable.id, name: usersTable.fullName, role: usersTable.role }).from(usersTable)
    .where(and(eq(usersTable.departmentId, req.user!.departmentId!), eq(usersTable.status, "approved"), inArray(usersTable.role, ["student", "professor", "hod"])))
    .orderBy(usersTable.fullName);
  res.json(rows);
});

router.get("/entries", studentOnly, async (req, res) => {
  const caller = req.user!;
  const student = await studentFor(caller.id);
  if (!student) { res.status(403).json({ message: "An active resident profile is required" }); return; }
  const scope = scopedToDepartment(caller.departmentId!);
  if (req.query.view === "department") {
    const section = req.query.section;
    if (typeof section !== "string" || !sharedSections.includes(section)) { res.status(400).json({ message: "Select a shared academic section" }); return; }
    res.json(await sharedSummaries(caller.departmentId!, section));
    return;
  }
  const participant = exists(db.select({ id: psychiatryAttendeesTable.entryId }).from(psychiatryAttendeesTable).where(and(
    eq(psychiatryAttendeesTable.entryId, psychiatryEntriesTable.id), eq(psychiatryAttendeesTable.userId, caller.id),
  )));
  const rows = await db.select().from(psychiatryEntriesTable).where(and(scope, or(eq(psychiatryEntriesTable.studentId, student.id),
    and(inArray(psychiatryEntriesTable.section, sharedSections), participant))))
    .orderBy(desc(psychiatryEntriesTable.id));
  res.json(await describe(rows, caller.departmentId!, student.id));
});

router.get("/sessions/:section/:entryId", studentOnly, async (req, res) => {
  const section = String(req.params.section);
  const id = idSchema.safeParse(req.params.entryId);
  if (!id.success || !sharedSections.includes(section)) { res.status(400).json({ message: "Invalid academic session" }); return; }
  if (!await studentFor(req.user!.id)) { res.status(403).json({ message: "An active resident profile is required" }); return; }
  const [row] = await sharedSummaries(req.user!.departmentId!, section, id.data);
  if (!row) { res.status(404).json({ message: "Session not found" }); return; }
  res.json(row);
});

const submission = psychiatryEntrySchema.extend({ revision: z.number().int().positive().optional() });

async function writeEntry(req: Request, res: Response) {
  const section = String(req.params.section ?? "");
  const input = submission.safeParse(req.body);
  const entryId = req.params.entryId === undefined ? null : idSchema.safeParse(req.params.entryId);
  if (!sections.includes(section) || !input.success || (entryId && !entryId.success)) {
    res.status(400).json({ message: "Invalid Psychiatry entry" }); return;
  }
  const page = psychiatryPages[section];
  const issue = validatePsychiatryEntry(page, input.data);
  if (issue) { res.status(400).json({ message: issue }); return; }
  const caller = req.user!;
  const departmentId = caller.departmentId!;
  const student = await studentFor(caller.id);
  if (!student) { res.status(403).json({ message: "An active resident profile is required" }); return; }
  const reviewerId = input.data.values.reviewerId ? Number(input.data.values.reviewerId) : page.review ? student.mentorId : null;
  const attendeeIds = Array.isArray(input.data.values.attendees) ? input.data.values.attendees.map(Number) : [];
  const userIds = [...new Set(reviewerId ? [...attendeeIds, reviewerId] : attendeeIds)];
  if (userIds.length) {
    const roster = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(and(
      inArray(usersTable.id, userIds), eq(usersTable.departmentId, departmentId), eq(usersTable.status, "approved"),
      inArray(usersTable.role, ["student", "professor", "hod"]),
    ));
    const reviewer = roster.find((user) => user.id === reviewerId);
    if (roster.length !== userIds.length || (reviewerId && reviewer?.role !== "professor" && reviewer?.role !== "hod") ||
      (["comm", "a_cme"].includes(section) && roster.some((user) => attendeeIds.includes(user.id) && user.role !== "student"))) {
      res.status(400).json({ message: "Select active participants from your department" }); return;
    }
  }
  const status = input.data.draft ? "draft" : page.review ? "pending" : "recorded";
  const preserveDiagnosis = (raw: string) => resolvePsychiatryDiagnosis(raw)!;
  const values: Entry["values"] = {};
  for (const field of page.fields) {
    const value = input.data.values[field.key];
    if (value === undefined || field.key === "attendees" || field.key === "reviewerId" || !psychiatryFieldVisible(field, input.data.values)) continue;
    values[field.key] = field.kind === "diagnosis" && typeof value === "string" && value ? preserveDiagnosis(value) : value;
  }
  const diagnosisRows = input.data.rows.map(({ diagnosisCode, count, medical, visit, tags, department, icu }) => ({
    diagnosis: preserveDiagnosis(diagnosisCode), count, medical,
    ...(page.monthly === "counts" ? { visit, tags } : { department, ...(department === "ICU" ? { icu } : {}) }),
  }));
  const record = { departmentId, studentId: student.id, section, reviewerId, status, values, diagnosisRows,
    month: page.monthly ? String(values.month) : null } as const;

  if (entryId?.success) {
    const [row] = await db.select({ id: psychiatryEntriesTable.id, studentId: psychiatryEntriesTable.studentId, status: psychiatryEntriesTable.status,
      revision: psychiatryEntriesTable.revision, departmentId: psychiatryEntriesTable.departmentId, values: psychiatryEntriesTable.values }).from(psychiatryEntriesTable).where(and(
      eq(psychiatryEntriesTable.id, entryId.data), eq(psychiatryEntriesTable.section, section))).limit(1);
    if (!row) { res.status(404).json({ message: "Entry not found" }); return; }
    if (row.studentId !== student.id || row.departmentId !== departmentId) { res.status(403).json({ message: "Entry is outside your access scope" }); return; }
    if (row.status === "verified" || row.revision !== input.data.revision) { res.status(409).json({ message: "This entry changed or was already verified" }); return; }
    const updated = await db.transaction(async (tx) => {
      const legacyPatientId = row.values.recordNumber;
      const retainedValues = legacyPatientId === undefined ? values : { ...values, recordNumber: legacyPatientId };
      const [result] = await tx.update(psychiatryEntriesTable).set({ ...record, values: retainedValues, revision: row.revision + 1,
        reviewNote: null, reviewedBy: null, reviewedAt: null }).where(and(eq(psychiatryEntriesTable.id, row.id),
        scopedToDepartment(departmentId), eq(psychiatryEntriesTable.studentId, student.id), eq(psychiatryEntriesTable.revision, row.revision))).returning({ id: psychiatryEntriesTable.id });
      if (!result) return false;
      await tx.delete(psychiatryAttendeesTable).where(eq(psychiatryAttendeesTable.entryId, row.id));
      if (attendeeIds.length) await tx.insert(psychiatryAttendeesTable).values(attendeeIds.map((userId) => ({ userId, entryId: row.id })));
      return true;
    });
    res.status(updated ? 200 : 409).json(updated ? { id: row.id } : { message: "This entry changed. Reload it and try again." });
    return;
  }
  const id = await db.transaction(async (tx) => {
    const [created] = await tx.insert(psychiatryEntriesTable).values(record).onConflictDoNothing()
      .returning({ id: psychiatryEntriesTable.id });
    if (created && attendeeIds.length) await tx.insert(psychiatryAttendeesTable).values(attendeeIds.map((userId) => ({ userId, entryId: created.id })));
    return created?.id;
  });
  res.status(id ? 201 : 409).json(id ? { id } : { message: "A log for this month already exists. Open it to make changes." });
}

router.post("/entries/:section", studentOnly, writeEntry);
router.patch("/entries/:section/:entryId", studentOnly, writeEntry);

router.get("/reviews", reviewerOnly, async (req, res) => {
  const caller = req.user!;
  const statuses: Entry["status"][] = req.query.view === "history" ? caller.role === "hod" ? ["verified", "rejected", "recorded"] : ["verified", "rejected"] : ["pending"];
  const rows = await db.select().from(psychiatryEntriesTable).where(and(scopedToDepartment(caller.departmentId!),
    inArray(psychiatryEntriesTable.status, statuses), caller.role === "professor" ? eq(psychiatryEntriesTable.reviewerId, caller.id) : undefined)).orderBy(desc(psychiatryEntriesTable.id));
  res.json(await describe(rows, caller.departmentId!));
});

const review = z.object({ status: z.enum(["verified", "rejected"]), comment: z.string().trim().max(2000).optional(), revision: z.number().int().positive() }).strict();
router.patch("/reviews/:entryId", reviewerOnly, async (req, res) => {
  const caller = req.user!;
  const id = idSchema.safeParse(req.params.entryId);
  const input = review.safeParse(req.body);
  if (!id.success || !input.success) { res.status(400).json({ message: "Invalid review" }); return; }
  const [row] = await db.select({ reviewerId: psychiatryEntriesTable.reviewerId, status: psychiatryEntriesTable.status, revision: psychiatryEntriesTable.revision,
    departmentId: psychiatryEntriesTable.departmentId, ownerDepartment: usersTable.departmentId, ownerStatus: usersTable.status })
    .from(psychiatryEntriesTable).innerJoin(studentsTable, eq(studentsTable.id, psychiatryEntriesTable.studentId))
    .innerJoin(usersTable, eq(usersTable.id, studentsTable.userId)).where(eq(psychiatryEntriesTable.id, id.data)).limit(1);
  if (!row) { res.status(404).json({ message: "Entry not found" }); return; }
  if (row.departmentId !== caller.departmentId || row.ownerDepartment !== caller.departmentId || row.ownerStatus !== "approved" ||
    (caller.role === "professor" && row.reviewerId !== caller.id)) {
    res.status(403).json({ message: "Entry is outside your assigned reviews" }); return;
  }
  if (row.status !== "pending" || row.revision !== input.data.revision) { res.status(409).json({ message: "This entry changed or was already reviewed" }); return; }
  const [updated] = await db.update(psychiatryEntriesTable).set({ status: input.data.status, reviewNote: input.data.comment || null,
    reviewedAt: new Date(), reviewedBy: caller.id, revision: row.revision + 1 }).where(and(eq(psychiatryEntriesTable.id, id.data),
    scopedToDepartment(caller.departmentId!), eq(psychiatryEntriesTable.status, "pending"), eq(psychiatryEntriesTable.revision, row.revision),
    caller.role === "professor" ? eq(psychiatryEntriesTable.reviewerId, caller.id) : undefined)).returning({ id: psychiatryEntriesTable.id });
  res.status(updated ? 200 : 409).json(updated ? { id: updated.id } : { message: "This entry changed. Reload it and try again." });
});

export default router;
