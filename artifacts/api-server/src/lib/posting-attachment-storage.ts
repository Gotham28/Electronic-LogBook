import { db, postingAttachmentCleanupTable } from "@workspace/db";
import { and, eq, lte } from "drizzle-orm";
import { getFileStorage } from "./file-storage.js";
import { logger } from "./logger.js";

const RETRY_INTERVAL_MS = 60_000;
export const POSTING_ATTACHMENT_UPLOAD_GRACE_MS = 15 * RETRY_INTERVAL_MS;

export function postingAttachmentKey(id: string) {
  return `posting-attachments/${id}`;
}

export async function cleanUpPostingAttachments() {
  const now = new Date();
  const jobs = await db.select({ id: postingAttachmentCleanupTable.id })
    .from(postingAttachmentCleanupTable)
    .where(lte(postingAttachmentCleanupTable.readyAt, now))
    .orderBy(postingAttachmentCleanupTable.readyAt).limit(20);

  for (const { id } of jobs) {
    await db.transaction(async (tx) => {
      const [job] = await tx.select({ id: postingAttachmentCleanupTable.id })
        .from(postingAttachmentCleanupTable)
        .where(and(eq(postingAttachmentCleanupTable.id, id), lte(postingAttachmentCleanupTable.readyAt, now)))
        .for("update", { skipLocked: true });
      if (!job) return;

      try {
        await getFileStorage().delete(postingAttachmentKey(id));
      } catch {
        await tx.update(postingAttachmentCleanupTable)
          .set({ readyAt: new Date(Date.now() + RETRY_INTERVAL_MS) })
          .where(eq(postingAttachmentCleanupTable.id, id));
        logger.warn({ status: 503 }, "Posting attachment cleanup will retry");
        return;
      }
      await tx.delete(postingAttachmentCleanupTable).where(eq(postingAttachmentCleanupTable.id, id));
    });
  }
}

export function startPostingAttachmentCleanup() {
  let active: Promise<void> | undefined;
  const run = () => {
    active ??= cleanUpPostingAttachments().catch(() => {
      logger.error({ status: 500 }, "Could not process posting attachment cleanup");
    }).finally(() => { active = undefined; });
  };
  run();
  const timer = setInterval(run, RETRY_INTERVAL_MS).unref();
  return async () => {
    clearInterval(timer);
    await active;
  };
}
