// HOD analytics describe the department's residents: approved student accounts only. A pending
// applicant or a deactivated (rejected) account is not listed as "Active" or counted.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine, db, usersTable } from "./database.js";
import { eq } from "drizzle-orm";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

test("analytics count and list approved students only", async () => {
  // support.ts gives each department two approved students and one pending applicant.
  await db.update(usersTable).set({ status: "rejected" }).where(eq(usersTable.id, a.student21.id));
  const res = await request(runtime.base, "/departments/" + a.hod1.departmentId + "/analytics", a.hod1);
  assert.equal(res.status, 200);
  assert.equal(res.body.totalStudents, 1);
  assert.deepEqual(res.body.students.map((row: any) => row.registrationNumber), ["TEST-" + a.student1.id]);
});
