import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { setup, request, accounts as a, departmentIds, password } from "./support.js";
import { engine, db, departmentsTable, usersTable, departmentPostingScheduleTable } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
let admin: { id: number; token: string };

before(async () => {
  runtime = await setup();
  const hash = await bcrypt.hash(password, 10);
  const [adminRow] = await db.insert(usersTable).values({ fullName: "Schedule Admin", email: "schedule-admin@example.test",
    role: "admin", status: "approved", departmentId: null, passwordHash: hash }).returning();
  admin = { id: adminRow.id, token: jwt.sign({ id: adminRow.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
  await db.insert(departmentPostingScheduleTable).values([
    { departmentId: departmentIds[1], trainingYear: 2, postingValue: "unit-1", months: 3, sortOrder: 0 },
    { departmentId: departmentIds[1], trainingYear: 1, postingValue: "later", months: 2, sortOrder: 1 },
    { departmentId: departmentIds[1], trainingYear: 1, postingValue: "unit-1", months: 6, sortOrder: 0 },
  ]);
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

test("catalog returns the schedule ordered by year then sort order, and only for the caller's department", async () => {
  const res = await request(runtime.base, `/departments/${departmentIds[1]}/catalog`, a.student1);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.postingSchedule, [
    { trainingYear: 1, postingValue: "unit-1", months: 6 },
    { trainingYear: 1, postingValue: "later", months: 2 },
    { trainingYear: 2, postingValue: "unit-1", months: 3 },
  ]);
  const other = await request(runtime.base, `/departments/${departmentIds[0]}/catalog`, a.student0);
  assert.deepEqual(other.body.postingSchedule, []);
  assert.equal((await request(runtime.base, `/departments/${departmentIds[1]}/catalog`, a.student0)).status, 403);
});

test("a test department sees its source department's schedule", async () => {
  const [mirror] = await db.insert(departmentsTable).values({ name: "Schedule Mirror", code: "SCHED-MIRROR", isTest: true,
    configSourceDepartmentId: departmentIds[1] }).returning();
  const hash = await bcrypt.hash(password, 10);
  const [student] = await db.insert(usersTable).values({ fullName: "Mirror Student", email: "sched-mirror@example.test",
    role: "student", status: "approved", departmentId: mirror.id, passwordHash: hash }).returning();
  const token = jwt.sign({ id: student.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" });
  const res = await request(runtime.base, `/departments/${mirror.id}/catalog`, { token } as any);
  assert.equal(res.status, 200);
  assert.equal(res.body.postingSchedule.length, 3);
});

test("the database refuses a zero-month or year-zero row and duplicate year/posting pairs", async () => {
  await assert.rejects(db.insert(departmentPostingScheduleTable).values({ departmentId: departmentIds[0], trainingYear: 1, postingValue: "x", months: 0 }));
  await assert.rejects(db.insert(departmentPostingScheduleTable).values({ departmentId: departmentIds[0], trainingYear: 0, postingValue: "x", months: 1 }));
  await assert.rejects(db.insert(departmentPostingScheduleTable).values({ departmentId: departmentIds[1], trainingYear: 1, postingValue: "unit-1", months: 1 }));
});

test("deleting a department removes its schedule rows", async () => {
  const created = await request(runtime.base, "/superadmin/departments", { token: admin.token } as any, "POST", {
    setup: { name: "Schedule Delete Dept", code: "SCHEDDEL", hod: { fullName: "Schedule HOD", email: "sched-hod@example.test" } },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const departmentId = created.body.departmentId;
  await db.insert(departmentPostingScheduleTable).values({ departmentId, trainingYear: 1, postingValue: "x", months: 1 });
  const res = await request(runtime.base, `/superadmin/departments/${departmentId}`, { token: admin.token } as any, "DELETE");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const left = await db.select().from(departmentPostingScheduleTable).where(eq(departmentPostingScheduleTable.departmentId, departmentId));
  assert.equal(left.length, 0);
});
