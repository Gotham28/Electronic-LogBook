import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { eq, sql } from "drizzle-orm";
import { setup, request, accounts as a } from "./support.js";
import { engine, db, usersTable, departmentNameChangeNotificationsTable } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
let noticeId: string;
let secondNoticeId: string;
let successor: { id: number; role: string; departmentId: number | null; email: string; token: string };
before(async () => {
  runtime = await setup();
  const renamed = await request(runtime.base, "/profile", a.student0, "PATCH", {
    fullName: "HOD Inbox Resident", expectedFullName: "Pediatrics Test student",
  });
  assert.equal(renamed.status, 200);
  noticeId = renamed.body.notification.id;
  const secondRename = await request(runtime.base, "/profile", a.student20, "PATCH", {
    fullName: "Second HOD Inbox Resident", expectedFullName: "Pediatrics Test student2",
  });
  assert.equal(secondRename.status, 200);
  secondNoticeId = secondRename.body.notification.id;
  await db.execute(sql`UPDATE department_name_change_notifications SET created_at = '2026-10-18T12:00:00.123456Z'::timestamptz WHERE id = ${noticeId}`);
  await db.execute(sql`UPDATE department_name_change_notifications SET created_at = '2026-10-18T12:00:00.123789Z'::timestamptz WHERE id = ${secondNoticeId}`);
});
after(async () => { if (runtime) await new Promise<void>((resolve) => runtime.server.close(() => resolve())); await engine.close(); });

const call = (path: string, who?: keyof typeof a | "successor", method = "GET", body?: unknown) =>
  request(runtime.base, path, who === "successor" ? successor as any : who ? a[who] : undefined, method, body);

test("HOD notice detail enforces 401, 403, 200 and 404 independently", async () => {
  const unauthenticated = await call(`/notifications/name-changes/${noticeId}`);
  assert.equal(unauthenticated.status, 401);

  const wrongRole = await call(`/notifications/name-changes/${noticeId}`, "faculty0");
  assert.equal(wrongRole.status, 403);

  const wrongDepartment = await call(`/notifications/name-changes/${noticeId}`, "hod1");
  assert.equal(wrongDepartment.status, 403);

  const correctOwner = await call(`/notifications/name-changes/${noticeId}`, "hod0");
  assert.equal(correctOwner.status, 200);
  assert.equal(correctOwner.body.previousName, "Pediatrics Test student");
  assert.equal(correctOwner.body.newName, "HOD Inbox Resident");
  assert.equal(correctOwner.body.studentProfileId, a.student0.studentId);
  assert.equal(correctOwner.body.source, "self_service");

  const nonexistent = await call("/notifications/name-changes/00000000-0000-4000-8000-000000000000", "hod0");
  assert.equal(nonexistent.status, 404);
});

test("saved inbox is department scoped, supports cursor paging and persists a shared idempotent read state", async () => {
  const firstPage = await call("/notifications/name-changes?limit=1", "hod0");
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.items.length, 1);
  assert.equal(firstPage.body.items[0].id, secondNoticeId);
  assert.equal(firstPage.body.hasMore, true);
  assert.ok(firstPage.body.nextCursor);
  const secondPage = await call(`/notifications/name-changes?limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`, "hod0");
  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.body.items.length, 1);
  assert.equal(secondPage.body.items[0].id, noticeId, "microsecond timestamps must not skip rows between pages");
  assert.equal(secondPage.body.hasMore, false);

  const list = await call("/notifications/name-changes", "hod0");
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 2);
  assert.equal(list.body.unreadCount, 2);
  assert.equal(list.body.items[0].detailHref, "/notifications/name-changes/" + secondNoticeId);
  const outside = await call("/notifications/name-changes", "hod1");
  assert.equal(outside.status, 200);
  assert.equal(outside.body.items.length, 0);
  assert.equal(outside.body.unreadCount, 0);

  const firstRead = await call(`/notifications/name-changes/${noticeId}/read`, "hod0", "POST", {});
  assert.equal(firstRead.status, 200);
  assert.equal(firstRead.body.unreadCount, 1);
  const firstTimestamp = firstRead.body.readAt;
  const repeated = await call(`/notifications/name-changes/${noticeId}/read`, "hod0", "POST", {});
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.readAt, firstTimestamp);
  const [notice] = await db.select().from(departmentNameChangeNotificationsTable).where(eq(departmentNameChangeNotificationsTable.id, noticeId));
  assert.equal(notice.readByUserId, a.hod0.id);
  assert.equal(notice.readAt?.toISOString(), firstTimestamp);

  const invalidCursor = await call("/notifications/name-changes?cursor=not-a-cursor", "hod0");
  assert.equal(invalidCursor.status, 400);
});

test("successor HOD inherits saved notices and department transfers hide the old notice", async () => {
  await db.update(usersTable).set({ status: "rejected" }).where(eq(usersTable.id, a.hod0.id));
  const [created] = await db.insert(usersTable).values({
    fullName: "Successor Department HOD", email: `successor-hod-${randomUUID()}@example.test`, role: "hod", status: "approved", departmentId: a.hod0.departmentId,
  }).returning({ id: usersTable.id, role: usersTable.role, departmentId: usersTable.departmentId, email: usersTable.email });
  successor = { ...created, token: jwt.sign({ id: created.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };

  const inherited = await call("/notifications/name-changes", "successor");
  assert.equal(inherited.status, 200);
  assert.equal(inherited.body.items.length, 2);
  assert.equal(inherited.body.items.find((item: any) => item.id === noticeId).readAt,
    (await call(`/notifications/name-changes/${noticeId}`, "successor")).body.readAt);

  await db.update(usersTable).set({ departmentId: a.student1.departmentId }).where(eq(usersTable.id, a.student0.id));
  await db.update(usersTable).set({ departmentId: a.student1.departmentId }).where(eq(usersTable.id, a.student20.id));
  const hidden = await call("/notifications/name-changes", "successor");
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.items.length, 0);
  assert.equal(hidden.body.unreadCount, 0);
  const transferred = await call(`/notifications/name-changes/${noticeId}`, "successor");
  assert.equal(transferred.status, 403);
});
