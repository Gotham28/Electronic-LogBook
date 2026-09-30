import { Router } from "express";
import { db, maintenanceAnnouncementsTable } from "@workspace/db";
import { and, gt, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { buildMaintenanceNotice } from "../lib/maintenance-messages.js";

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
    
    // Compute statuses
    const mapped = relevant.map((a: any) => {
      let status = "scheduled";
      if (a.cancelledAt) status = "cancelled";
      else if (a.startAt <= now && a.endAt > now) status = "active";
      else if (a.endAt <= now) status = "completed";
      const notice = buildMaintenanceNotice(a.startAt, a.endAt, status === "active" ? "active" : "scheduled");
      return {
        id: a.id,
        title: notice.heading,
        message: notice.message,
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
