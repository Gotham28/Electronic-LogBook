import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { and, eq, sql } from "drizzle-orm";
import { setup, request, accounts as a, password } from "./support.js";
import { engine, db, usersTable, auditTable, departmentNameChangeNotificationsTable, nameChangeEmailOutboxTable } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
let admin: { id: number; token: string; role: string; departmentId: number; email: string };
before(async () => {
  runtime = await setup();
  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({ fullName: "Profile Test Admin", email: "profile-admin@example.test", role: "admin", status: "approved", passwordHash }).returning();
  admin = { id: user.id, role: user.role, departmentId: 0, email: user.email, token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
});
after(async () => { if (runtime) await new Promise<void>((resolve) => runtime.server.close(() => resolve())); await engine.close(); });

const call = (path: string, who?: keyof typeof a | "admin", method = "GET", body?: unknown, accountOverride?: any) => {
  const account = accountOverride ?? (who === "admin" ? admin : who ? a[who] : undefined);
  return request(runtime.base, path, account as any, method, body);
};

test("profile GET is self-only by construction and returns identity without sensitive account fields", async () => {
  const unauthenticated = await call("/profile");
  assert.equal(unauthenticated.status, 401);
  const response = await call("/profile", "student0");
  assert.equal(response.status, 200);
  assert.equal(response.body.user.id, a.student0.id);
  assert.equal(response.body.student.id, a.student0.studentId);
  assert.equal(response.body.user.fullName, "Pediatrics Test student");
  assert.equal("passwordHash" in response.body.user, false);
  assert.equal("passwordHash" in response.body, false);
  assert.equal(response.body.capabilities.canEditName, true);
});

test("student rename atomically updates the account, minimal audit, saved HOD notice and outbox", async () => {
  const originalName = "Pediatrics Test student";
  const response = await call("/profile", "student0", "PATCH", { fullName: "Asha Resident", expectedFullName: originalName });
  assert.equal(response.status, 200);
  assert.equal(response.body.changed, true);
  assert.equal(response.body.profile.user.fullName, "Asha Resident");
  assert.equal(response.body.session.name, "Asha Resident");
  assert.equal(response.body.notification.inAppSaved, true);
  assert.equal(response.body.notification.emailStatus, "queued");

  const [event] = await db.select().from(auditTable).where(and(
    eq(auditTable.tableName, "users"), eq(auditTable.recordId, String(a.student0.id)),
    sql`${auditTable.afterState}->>'eventType' = 'profile_name_change'`,
  ));
  assert.deepEqual(event.beforeState, { fullName: originalName });
  assert.deepEqual(event.afterState, { fullName: "Asha Resident", eventType: "profile_name_change", source: "self_service", actorRoleAtChange: "student" });
  assert.equal(event.performedById, a.student0.id);

  const [notice] = await db.select().from(departmentNameChangeNotificationsTable).where(eq(departmentNameChangeNotificationsTable.auditId, event.id));
  assert.equal(notice.subjectUserId, a.student0.id);
  assert.equal(notice.studentId, a.student0.studentId);
  assert.equal(notice.departmentId, a.student0.departmentId);
  const [outbox] = await db.select().from(nameChangeEmailOutboxTable).where(eq(nameChangeEmailOutboxTable.notificationId, notice.id));
  assert.equal(outbox.status, "queued");

  const history = await call("/profile/name-history", "student0");
  assert.equal(history.status, 200);
  assert.equal(history.body.items[0].previousName, originalName);
  assert.equal(history.body.items[0].newName, "Asha Resident");
  assert.equal(history.body.items[0].source, "self_service");

  const secondRename = await call("/profile", "student0", "PATCH", {
    fullName: "Asha Resident Revised", expectedFullName: "Asha Resident",
  });
  assert.equal(secondRename.status, 200);
  const secondEventId = secondRename.body.change.id as string;
  await db.execute(sql`UPDATE audit SET "timestamp" = '2026-10-18 12:00:00.123456'::timestamp WHERE id = ${event.id}`);
  await db.execute(sql`UPDATE audit SET "timestamp" = '2026-10-18 12:00:00.123789'::timestamp WHERE id = ${secondEventId}`);
  const firstPage = await call("/profile/name-history?limit=1", "student0");
  assert.equal(firstPage.status, 200);
  assert.equal(firstPage.body.items.length, 1);
  assert.equal(firstPage.body.items[0].id, secondEventId);
  assert.equal(firstPage.body.hasMore, true);
  const pageCursor = JSON.parse(Buffer.from(firstPage.body.nextCursor, "base64url").toString("utf8")) as { timestamp: string; id: string };
  assert.match(pageCursor.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.123789$/);
  const comparisons = await db.execute(sql`SELECT id, "timestamp" < ${pageCursor.timestamp}::timestamp AS before_cursor,
    "timestamp" = ${pageCursor.timestamp}::timestamp AS at_cursor FROM audit WHERE id IN (${event.id}::uuid, ${secondEventId}::uuid)`);
  assert.equal(comparisons.rows.find((row: any) => row.id === event.id)?.before_cursor, true);
  assert.equal(comparisons.rows.find((row: any) => row.id === secondEventId)?.at_cursor, true);
  const secondPage = await call(`/profile/name-history?limit=1&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`, "student0");
  assert.equal(secondPage.status, 200);
  assert.equal(secondPage.body.items.length, 1);
  assert.equal(secondPage.body.items[0].id, event.id, "microsecond timestamps must not skip history between pages");
});

test("name updates reject malformed, stale and client-scoped input and make repeated names a no-op", async () => {
  const malformed = await call("/profile", "student0", "PATCH", { fullName: "Line\nBreak", expectedFullName: "Asha Resident Revised" });
  assert.equal(malformed.status, 400);
  const extraField = await call("/profile", "student0", "PATCH", { fullName: "Other Name", expectedFullName: "Asha Resident Revised", departmentId: 1 });
  assert.equal(extraField.status, 400);
  const stale = await call("/profile", "student0", "PATCH", { fullName: "Other Name", expectedFullName: "Old Name" });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "PROFILE_NAME_CONFLICT");
  const before = await db.select().from(departmentNameChangeNotificationsTable).where(eq(departmentNameChangeNotificationsTable.subjectUserId, a.student0.id));
  const noOp = await call("/profile", "student0", "PATCH", { fullName: " Asha Resident Revised ", expectedFullName: "Asha Resident Revised" });
  assert.equal(noOp.status, 200);
  assert.equal(noOp.body.changed, false);
  assert.equal(noOp.body.notification, null);
  const afterRows = await db.select().from(departmentNameChangeNotificationsTable).where(eq(departmentNameChangeNotificationsTable.subjectUserId, a.student0.id));
  assert.equal(afterRows.length, before.length);
});

test("other roles can change their own name without creating a student notice", async () => {
  for (const who of ["faculty0", "hod0"] as const) {
    const [user] = await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, a[who].id));
    const response = await call("/profile", who, "PATCH", { fullName: user.fullName + " Updated", expectedFullName: user.fullName });
    assert.equal(response.status, 200);
    assert.equal(response.body.notification, null);
  }
});

test("impersonated profile is read-only and administrator roster rename uses shared history without notice", async () => {
  const impersonated = { ...a.student1, token: jwt.sign({ id: a.student1.id, sessionVersion: 0, impersonatedBy: admin.id, impersonatorSessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
  const readOnly = await call("/profile", undefined, "PATCH", { fullName: "No Change", expectedFullName: "Pediatrics Test student" }, impersonated);
  assert.equal(readOnly.status, 403);
  assert.equal(readOnly.body.code, "PROFILE_READ_ONLY");

  const [student] = await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, a.student2.id));
  const adminRename = await call(`/superadmin/departments/${a.student2.departmentId}/users/${a.student2.id}/name`, "admin", "PATCH", { fullName: "Administrator Correction" });
  assert.equal(adminRename.status, 200);
  const events = await db.select().from(auditTable).where(and(
    eq(auditTable.recordId, String(a.student2.id)), sql`${auditTable.afterState}->>'eventType' = 'profile_name_change'`,
  ));
  assert.equal(events.at(-1)?.beforeState && (events.at(-1)!.beforeState as any).fullName, student.fullName);
  assert.equal((events.at(-1)!.afterState as any).source, "admin_roster");
  assert.equal((await db.select().from(departmentNameChangeNotificationsTable).where(eq(departmentNameChangeNotificationsTable.subjectUserId, a.student2.id))).length, 0);
});
