import { randomUUID } from "node:crypto";
import express, { Router, type Request, type Response } from "express";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, postingAttachmentCleanupTable, postingAttachmentsTable, postingsTable, studentsTable, usersTable } from "@workspace/db";
import { getDepartmentFeatures } from "../lib/department-features.js";
import { getFileStorage } from "../lib/file-storage.js";
import { postingAttachmentKey, POSTING_ATTACHMENT_UPLOAD_GRACE_MS } from "../lib/posting-attachment-storage.js";
import { idSchema } from "../lib/validation.js";

const router = Router({ mergeParams: true });
const MAX_ATTACHMENTS = 5;
const MAX_JPEG_BYTES = 1024 * 1024;
const MAX_PDF_BYTES = 3 * 1024 * 1024;
const attachmentIdSchema = z.string().uuid();
const publicFields = {
  id: postingAttachmentsTable.id,
  fileName: postingAttachmentsTable.fileName,
  contentType: postingAttachmentsTable.contentType,
  byteSize: postingAttachmentsTable.byteSize,
};

function detectFile(bytes: Buffer) {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
    return { contentType: "application/pdf", extension: "pdf" } as const;
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" } as const;
  }
  return null;
}

function fileName(header: string | undefined, extension: string) {
  let name = header ?? "";
  try { name = decodeURIComponent(name); } catch { name = ""; }
  const base = (name.split(/[\\/]/).pop() ?? "").replace(/\.[^.]+$/, "")
    .replace(/[\u0000-\u001f\u007f"\u202a-\u202e\u2066-\u2069]/g, "").trim();
  return `${Array.from(base).slice(0, 120).join("") || "attachment"}.${extension}`;
}

function editable(status: string, supervisorId: number | null, freeText: boolean) {
  return status === "pending" || status === "rejected" || (freeText && status === "verified" && supervisorId === null);
}

function postingQuery(database: Pick<typeof db, "select">, postingId: number) {
  return database.select({
    id: postingsTable.id, studentId: postingsTable.studentId, status: postingsTable.status,
    supervisorId: postingsTable.supervisorId, ownerId: studentsTable.userId, departmentId: usersTable.departmentId,
    ownerStatus: usersTable.status, ownerRole: usersTable.role,
  }).from(postingsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, postingsTable.studentId))
    .innerJoin(usersTable, eq(usersTable.id, studentsTable.userId))
    .where(eq(postingsTable.id, postingId));
}

type PostingScope = Awaited<ReturnType<typeof postingQuery>>[number];

function withinScope(req: Request, posting: PostingScope, studentId: number, write: boolean) {
  const caller = req.user!;
  return !!caller.departmentId && posting.departmentId === caller.departmentId && posting.studentId === studentId
    && posting.ownerRole === "student" && posting.ownerStatus === "approved"
    && (caller.role === "student" ? posting.ownerId === caller.id
      : !write && (caller.role === "hod" || (caller.role === "professor" && posting.supervisorId === caller.id)));
}

class AttachmentError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function authorize(req: Request, write = false) {
  const studentId = idSchema.safeParse(req.params.studentId);
  const postingId = idSchema.safeParse(req.params.postingId);
  if (!studentId.success || !postingId.success) throw new AttachmentError(400, "Invalid posting or student ID");
  const [posting] = await postingQuery(db, postingId.data);
  if (!posting) throw new AttachmentError(404, "Posting not found");
  if (!withinScope(req, posting, studentId.data, write)) throw new AttachmentError(403, "Posting is outside your access scope");
  const { features } = await getDepartmentFeatures(posting.departmentId!);
  if (features.postingAttachments !== true) throw new AttachmentError(403, "Posting attachments are disabled for this department");
  const freeText = features.freeTextPostingUnit === true;
  if (write && !editable(posting.status, posting.supervisorId, freeText)) throw new AttachmentError(409, "This posting is locked");
  return { postingId: posting.id, studentId: studentId.data, freeText };
}

function respondToError(req: Request, res: Response, error: unknown) {
  if (error instanceof AttachmentError) {
    res.status(error.status).json({ message: error.message });
    return;
  }
  req.log.error({ status: 500 }, "Posting attachment request failed");
  res.status(500).json({ message: "Could not process posting attachment" });
}

function attachmentFilter(postingId: number, rawId: unknown) {
  const id = attachmentIdSchema.safeParse(rawId);
  if (!id.success) throw new AttachmentError(404, "Attachment not found");
  return and(eq(postingAttachmentsTable.postingId, postingId), eq(postingAttachmentsTable.id, id.data));
}

// All routes are mounted under studentAccess and the authenticated student router.
router.get("/", async (req, res) => {
  try {
    const { postingId } = await authorize(req);
    const attachments = await db.select(publicFields).from(postingAttachmentsTable)
      .where(eq(postingAttachmentsTable.postingId, postingId)).orderBy(asc(postingAttachmentsTable.createdAt));
    res.set("Cache-Control", "no-store").json(attachments);
  } catch (error) { respondToError(req, res, error); }
});

router.get("/:attachmentId", async (req, res) => {
  try {
    const { postingId } = await authorize(req);
    const [file] = await db.select(publicFields).from(postingAttachmentsTable)
      .where(attachmentFilter(postingId, req.params.attachmentId));
    if (!file) throw new AttachmentError(404, "Attachment not found");
    const object = await getFileStorage().get(postingAttachmentKey(file.id));
    if (!object) throw new AttachmentError(404, "Attachment not found");
    res.set("Cache-Control", "no-store").set("X-Content-Type-Options", "nosniff");
    res.attachment(file.fileName).type(file.contentType).send(object.bytes);
  } catch (error) { respondToError(req, res, error); }
});

router.post("/", express.raw({ type: "application/octet-stream", limit: MAX_PDF_BYTES }), async (req, res) => {
  try {
    const { postingId, studentId, freeText } = await authorize(req, true);
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw new AttachmentError(400, "Choose a file to upload");
    const file = detectFile(bytes);
    if (!file) throw new AttachmentError(415, "Only PDF and JPEG files are accepted");
    if (file.contentType === "image/jpeg" && bytes.length > MAX_JPEG_BYTES) {
      throw new AttachmentError(413, "JPEG files must be 1 MB or smaller");
    }
    const id = randomUUID();

    // An interrupted upload leaves a cleanup job, including if the API restarts mid-request.
    await db.insert(postingAttachmentCleanupTable).values({
      id, readyAt: new Date(Date.now() + POSTING_ATTACHMENT_UPLOAD_GRACE_MS),
    });

    const attachment = await db.transaction(async (tx) => {
      const [posting] = await postingQuery(tx, postingId).for("update", { of: postingsTable });
      if (!posting) throw new AttachmentError(404, "Posting not found");
      if (!withinScope(req, posting, studentId, true)) throw new AttachmentError(403, "Posting is outside your access scope");
      if (!editable(posting.status, posting.supervisorId, freeText)) throw new AttachmentError(409, "This posting is locked");
      const [total] = await tx.select({ value: count() }).from(postingAttachmentsTable)
        .where(eq(postingAttachmentsTable.postingId, postingId));
      if (total.value >= MAX_ATTACHMENTS) throw new AttachmentError(409, "This posting already has five attachments");

      const [upload] = await tx.select({ id: postingAttachmentCleanupTable.id }).from(postingAttachmentCleanupTable)
        .where(eq(postingAttachmentCleanupTable.id, id)).for("update");
      if (!upload) throw new AttachmentError(409, "The upload expired. Please try again.");
      await getFileStorage().put(postingAttachmentKey(id), bytes, file.contentType);
      const [saved] = await tx.insert(postingAttachmentsTable).values({
        id, postingId, fileName: fileName(req.get("X-File-Name"), file.extension),
        contentType: file.contentType, byteSize: bytes.length,
      }).returning(publicFields);
      await tx.delete(postingAttachmentCleanupTable).where(eq(postingAttachmentCleanupTable.id, id));
      return saved;
    });
    res.status(201).json(attachment);
  } catch (error) { respondToError(req, res, error); }
});

router.delete("/:attachmentId", async (req, res) => {
  try {
    const { postingId, studentId, freeText } = await authorize(req, true);
    const filter = attachmentFilter(postingId, req.params.attachmentId);
    await db.transaction(async (tx) => {
      const [posting] = await postingQuery(tx, postingId).for("update", { of: postingsTable });
      if (!posting) throw new AttachmentError(404, "Posting not found");
      if (!withinScope(req, posting, studentId, true)) throw new AttachmentError(403, "Posting is outside your access scope");
      if (!editable(posting.status, posting.supervisorId, freeText)) throw new AttachmentError(409, "This posting is locked");
      const [deleted] = await tx.delete(postingAttachmentsTable).where(filter).returning({ id: postingAttachmentsTable.id });
      if (!deleted) throw new AttachmentError(404, "Attachment not found");
    });
    res.json({ removed: true });
  } catch (error) { respondToError(req, res, error); }
});

export default router;
