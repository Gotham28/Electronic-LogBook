import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { setup, request, accounts as a, mail } from "./support.js";
import { db, engine, usersTable } from "./database.js";
import { maintenanceAnnouncementsTable } from "@workspace/db";
import { istDateTimeInputToIso, isoToIstDateTimeInput } from "../../mockup-sandbox/src/lib/maintenanceTime.js";

let runtime: Awaited<ReturnType<typeof setup>>;
let admin: { id: number; email: string; role: string; departmentId: number; token: string };
before(async () => {
  runtime = await setup();
  const [user] = await db.insert(usersTable).values({
    fullName: "Synthetic Maintenance Admin",
    email: "maintenance-admin@example.test",
    role: "admin",
    status: "approved",
  }).returning();
  admin = {
    id: user.id,
    email: user.email,
    role: user.role,
    departmentId: 0,
    token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }),
  };
});
after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

function futureIso(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

test("IST datetime-local values convert to ISO independently of device timezone", () => {
  const input = "2026-10-01T00:15";
  const iso = istDateTimeInputToIso(input);
  assert.equal(iso, "2026-09-30T18:45:00.000Z");
  assert.equal(isoToIstDateTimeInput(iso!), input);
  assert.equal(istDateTimeInputToIso("2026-02-30T10:00"), null);
});

test("maintenance schedule uses fixed copy, IST-safe dates and audience, without sending email", async () => {
  const unauthenticated = await request(runtime.base, "/superadmin/announcements", undefined, "POST", {});
  assert.equal(unauthenticated.status, 401);
  const nonAdmin = await request(runtime.base, "/superadmin/announcements", a.student0, "POST", {});
  assert.equal(nonAdmin.status, 403);

  const startAt = futureIso(30);
  const endAt = futureIso(90);
  const created = await request(runtime.base, "/superadmin/announcements", admin, "POST", {
    title: "Untrusted custom title",
    description: "Untrusted custom maintenance text",
    expectedImpact: "Untrusted impact",
    startAt,
    endAt,
    audienceRoles: ["student"],
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.title, "ELogbook scheduled maintenance");
  assert.match(created.body.description, /^ELogbook is scheduled for maintenance from /);
  assert.doesNotMatch(created.body.description, /Untrusted/);
  assert.equal(created.body.emailDelivery, undefined);
  assert.equal(mail.size, 0);

  const now = new Date();
  const historicalStart = new Date(now.getTime() - 2 * 60_000);
  const historicalEnd = new Date(now.getTime() - 60_000);
  const activeStart = new Date(now.getTime() - 60_000);
  const activeEnd = new Date(now.getTime() + 60_000);
  const cancelledStart = new Date(now.getTime() + 2 * 60_000);
  const cancelledEnd = new Date(now.getTime() + 3 * 60_000);
  const seeded = await db.insert(maintenanceAnnouncementsTable).values([
    { title: "Historical", description: "Historical", startAt: historicalStart, endAt: historicalEnd, audienceRoles: ["student"], createdBy: admin.id },
    { title: "Active", description: "Active", startAt: activeStart, endAt: activeEnd, audienceRoles: ["student"], createdBy: admin.id },
    { title: "Cancelled", description: "Cancelled", startAt: cancelledStart, endAt: cancelledEnd, cancelledAt: now, audienceRoles: ["student"], createdBy: admin.id },
  ]).returning({ id: maintenanceAnnouncementsTable.id, title: maintenanceAnnouncementsTable.title });
  const adminList = await request(runtime.base, "/superadmin/announcements", admin);
  assert.equal(adminList.status, 200);
  assert.deepEqual(new Set(adminList.body.map((item: any) => item.id)), new Set([created.body.id, seeded[1].id]));
  assert.deepEqual(adminList.body.map((item: any) => item.status).sort(), ["active", "scheduled"]);

  const readBefore = mail.size;
  const current = await request(runtime.base, "/announcements/current", a.student0);
  assert.equal(current.status, 200);
  const currentNotice = current.body.find((item: any) => item.id === created.body.id);
  assert.equal(currentNotice.status, "scheduled");
  assert.match(currentNotice.message, /^ELogbook is scheduled for maintenance from /);
  assert.equal(mail.size, readBefore, "reading announcements must not send email");

  const updated = await request(runtime.base, `/superadmin/announcements/${created.body.id}`, admin, "PATCH", {
    title: "Still ignored",
    description: "Still ignored",
    startAt: futureIso(45),
    endAt: futureIso(105),
    audienceRoles: ["professor"],
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.emailDelivery, undefined);
  assert.equal(mail.size, 0);

  const cancelled = await request(runtime.base, `/superadmin/announcements/${created.body.id}/cancel`, admin, "POST", {});
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.emailDelivery, undefined);
  assert.equal(mail.size, 0);

  const invalidDate = await request(runtime.base, "/superadmin/announcements", admin, "POST", {
    startAt: "2026-10-01T10:00",
    endAt: "2026-10-01T11:00",
    audienceRoles: ["student"],
  });
  assert.equal(invalidDate.status, 400);

  const reversed = await request(runtime.base, "/superadmin/announcements", admin, "POST", {
    startAt: futureIso(120),
    endAt: futureIso(60),
    audienceRoles: ["student"],
  });
  assert.equal(reversed.status, 400);
});

test("public maintenance status is unauthenticated, active-only, and limited to public audience", async () => {
  const publicSchedule = await request(runtime.base, "/superadmin/announcements", admin, "POST", {
    startAt: futureIso(15),
    endAt: futureIso(75),
    audienceRoles: ["public"],
  });
  assert.equal(publicSchedule.status, 201);
  assert.deepEqual(publicSchedule.body.audienceRoles, ["public"]);

  const now = new Date();
  const entries = await db.insert(maintenanceAnnouncementsTable).values([
    {
      title: "Public active",
      description: "Stored copy is not returned",
      startAt: new Date(now.getTime() - 60_000),
      endAt: new Date(now.getTime() + 60_000),
      audienceRoles: ["public", "student"],
      createdBy: admin.id,
    },
    {
      title: "Public scheduled",
      description: "Scheduled",
      startAt: new Date(now.getTime() + 60_000),
      endAt: new Date(now.getTime() + 120_000),
      audienceRoles: ["public"],
      createdBy: admin.id,
    },
    {
      title: "Public completed",
      description: "Completed",
      startAt: new Date(now.getTime() - 120_000),
      endAt: new Date(now.getTime() - 60_000),
      audienceRoles: ["public"],
      createdBy: admin.id,
    },
    {
      title: "Public cancelled",
      description: "Cancelled",
      startAt: new Date(now.getTime() - 60_000),
      endAt: new Date(now.getTime() + 60_000),
      cancelledAt: now,
      audienceRoles: ["public"],
      createdBy: admin.id,
    },
    {
      title: "Role-only active",
      description: "Private to a selected role",
      startAt: new Date(now.getTime() - 60_000),
      endAt: new Date(now.getTime() + 60_000),
      audienceRoles: ["student"],
      createdBy: admin.id,
    },
  ]).returning({ id: maintenanceAnnouncementsTable.id });

  const publicResponse = await request(runtime.base, "/announcements/public-current");
  assert.equal(publicResponse.status, 200);
  const publicItems = publicResponse.body as any[];
  assert.deepEqual(publicItems.map((item) => item.id), [entries[0].id]);
  assert.equal(publicItems[0].title, "ELogbook service notice");
  assert.match(publicItems[0].message, /^ELogbook maintenance is in progress until /);
  assert.equal(publicItems[0].audienceRoles, undefined);
  assert.equal(publicItems[0].description, undefined);

  const authenticatedResponse = await request(runtime.base, "/announcements/current", a.student0);
  assert.equal(authenticatedResponse.status, 200);
  const authenticatedItems = authenticatedResponse.body as any[];
  assert.equal(authenticatedItems.some((item) => item.id === entries[0].id), false);
  assert.equal(authenticatedItems.some((item) => item.id === entries[4].id), true);
});
