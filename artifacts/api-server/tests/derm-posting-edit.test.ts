// Dermatology postings with no supervisor are verified automatically, so the resident may keep
// editing them. A posting a faculty member verified is locked, as in every other department.
// The route still keys this branch on department ids 15/25 (see the report on AGENTS.md sec 5),
// so the fixture department is created with id 15.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { setup, request, accounts as a, type Account } from "./support.js";
import { engine, db, departmentsTable, departmentConfigsTable, usersTable, studentsTable, postingsTable } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
const derm: Record<"owner" | "other" | "faculty", Account> = {} as any;

before(async () => {
  runtime = await setup();
  await db.insert(departmentsTable).values({ id: 15, name: "Dermatology fixture", code: "DERM-FIXTURE" });
  await db.insert(departmentConfigsTable).values({ departmentId: 15 });
  for (const kind of ["owner", "other", "faculty"] as const) {
    const role = kind === "faculty" ? "professor" : "student";
    const [user] = await db.insert(usersTable).values({ fullName: "Derm " + kind, email: "derm-" + kind + "@example.test",
      role, status: "approved", departmentId: 15, passwordHash: "unused: this test signs tokens directly" }).returning();
    derm[kind] = { id: user.id, email: user.email, role, departmentId: 15,
      token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
    if (role === "student") {
      const [student] = await db.insert(studentsTable).values({ userId: user.id, batch: "2026", registrationNumber: "DERM-" + user.id,
        kuhsId: "DERM-UNIV-" + user.id, specialty: "Dermatology fixture", dateOfJoining: "2026-01-01" }).returning();
      derm[kind].studentId = student.id;
    }
  }
});
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

async function patch(label: string, who: Account | undefined, postingId: number, body: unknown) {
  const path = `/students/${derm.owner.studentId}/postings/${postingId}`;
  const res = await request(runtime.base, path, who, "PATCH", body);
  console.log(`${label}: PATCH /api${path} as ${who ? who.email : "nobody"} -> ${res.status} ${JSON.stringify(res.body)}`);
  return res;
}

test("PATCH an auto-verified Dermatology posting: 401 / 403 / 200 / 404", async () => {
  const created = await request(runtime.base, `/students/${derm.owner.studentId}/postings`, derm.owner, "POST",
    { ward: "Free-text ward", startDate: "2026-02-01", endDate: "2026-02-10" });
  assert.equal(created.status, 201);
  assert.equal(created.body.posting.status, "verified");
  const id = created.body.posting.id;

  assert.equal((await patch("unauthenticated", undefined, id, { endDate: "2026-02-11" })).status, 401);
  assert.equal((await patch("wrong owner (another resident, same department)", derm.other, id, { endDate: "2026-02-11" })).status, 403);
  const own = await patch("correct owner", derm.owner, id, { endDate: "2026-02-11" });
  assert.equal(own.status, 200);
  assert.equal(own.body.status, "verified");
  assert.equal(own.body.endDate, "2026-02-11");
  assert.equal((await patch("nonexistent posting", derm.owner, 999999, { endDate: "2026-02-11" })).status, 404);
});

test("a Dermatology posting verified by a faculty member cannot be edited by the resident", async () => {
  const [reviewed] = await db.insert(postingsTable).values({ studentId: derm.owner.studentId!, ward: "Reviewed ward",
    startDate: "2026-03-01", endDate: "2026-03-10", supervisorId: derm.faculty.id, status: "verified" }).returning();

  const res = await patch("faculty-verified posting", derm.owner, reviewed.id, { endDate: "2026-04-30" });
  assert.equal(res.status, 400);
  const [after] = await db.select().from(postingsTable).where(eq(postingsTable.id, reviewed.id));
  assert.equal(after.endDate, "2026-03-10");
  assert.equal(after.status, "verified");
});

test("naming a supervisor on an auto-verified posting sends it to that supervisor for review", async () => {
  const created = await request(runtime.base, `/students/${derm.owner.studentId}/postings`, derm.owner, "POST",
    { ward: "Another ward", startDate: "2026-05-01", endDate: "2026-05-10" });
  assert.equal(created.body.posting.status, "verified");

  const res = await patch("adds a supervisor", derm.owner, created.body.posting.id, { supervisorId: derm.faculty.id });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "pending");
  assert.equal(res.body.supervisorId, derm.faculty.id);
});

test("outside Dermatology a verified posting stays locked even with no supervisor", async () => {
  const [posting] = await db.insert(postingsTable).values({ studentId: a.student0.studentId!, ward: "unit-0",
    startDate: "2026-06-01", endDate: "2026-06-10", status: "verified" }).returning();
  const res = await request(runtime.base, `/students/${a.student0.studentId}/postings/${posting.id}`, a.student0, "PATCH",
    { endDate: "2026-06-20" });
  assert.equal(res.status, 400);
});
