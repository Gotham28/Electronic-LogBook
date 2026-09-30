import { Router } from "express";
import { db, maintenanceAnnouncementsTable } from "@workspace/db";
import { and, gt, desc, sql, isNull, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { sendAnnouncementEmails } from "../lib/mailer.js";

const router = Router();

// Used by the global AppLayout to fetch upcoming and active announcements
router.get("/current", requireAuth, async (req, res) => {
  try {
    const userRole = req.user!.role;
    
    const now = new Date();
    // Get all announcements that haven't ended yet
    const announcements = await db.select()
      .from(maintenanceAnnouncementsTable)
      .where(and(
        gt(maintenanceAnnouncementsTable.endAt, now),
        isNull(maintenanceAnnouncementsTable.cancelledAt)
      ))
      .orderBy(maintenanceAnnouncementsTable.startAt);
      
    // Filter by audience role in memory (simpler than querying jsonb array directly for now)
    const relevant = announcements.filter((a: any) => Array.isArray(a.audienceRoles) && a.audienceRoles.includes(userRole));
    
    // Lazy evaluation for reminders!
    // We check if any of these need 24h or 1h reminders sent.
    // If we're within the threshold and the flag isn't set, we update it and dispatch.
    
    for (const a of relevant as any[]) {
      const msUntilStart = a.startAt.getTime() - now.getTime();
      const hoursUntilStart = msUntilStart / (1000 * 60 * 60);
      
      // 24h reminder
      if (hoursUntilStart <= 24 && hoursUntilStart > 1 && !a.reminder24hSent) {
        // Atomic update to prevent double-sending
        const updated = await db.update(maintenanceAnnouncementsTable)
          .set({ reminder24hSent: true })
          .where(and(
            eq(maintenanceAnnouncementsTable.id, a.id),
            eq(maintenanceAnnouncementsTable.reminder24hSent, false)
          ))
          .returning();
          
        if (updated.length > 0) {
          // Send reminder email (we dispatch and don't wait)
          sendAnnouncementEmails(a, "24h Reminder").catch(err => console.error("Reminder email error", err));
        }
      }
      
      // 1h reminder
      if (hoursUntilStart <= 1 && hoursUntilStart > 0 && !a.reminder1hSent) {
        const updated = await db.update(maintenanceAnnouncementsTable)
          .set({ reminder1hSent: true })
          .where(and(
            eq(maintenanceAnnouncementsTable.id, a.id),
            eq(maintenanceAnnouncementsTable.reminder1hSent, false)
          ))
          .returning();
          
        if (updated.length > 0) {
          sendAnnouncementEmails(a, "1h Reminder").catch(err => console.error("Reminder email error", err));
        }
      }
    }
    
    // Compute statuses
    const mapped = relevant.map((a: any) => {
      let status = "scheduled";
      if (a.cancelledAt) status = "cancelled";
      else if (a.startAt <= now && a.endAt > now) status = "active";
      else if (a.endAt <= now) status = "completed";
      
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        expectedImpact: a.expectedImpact,
        startAt: a.startAt,
        endAt: a.endAt,
        status,
        audienceRoles: a.audienceRoles,
        updatedAt: a.updatedAt
      };
    });

    return res.json(mapped);
  } catch (error) {
    console.error("Failed to fetch current announcements", error);
    return res.status(500).json({ message: "Failed to fetch announcements" });
  }
});

export default router;
