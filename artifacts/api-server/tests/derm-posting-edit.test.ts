// In a department that logs postings as free text (the freeTextPostingUnit setting, which
// Dermatology has on), a posting with no supervisor is verified automatically, so the resident
// may keep editing it. A posting a faculty member verified is locked, as in every other
// department. The rules follow the setting, never a department id (AGENTS.md sec 5).
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
  const [department] = await db.insert(departmentsTable).values({ name: "Free-text postings fixture", code: "DERM-FIXTURE" }).returning();
  await db.insert(departmentConfigsTable).values({ departmentId: department.id, enabledFeatures: { freeTextPostingUnit: true, freeTextProcedures: true } });
  for (const kind of ["owner", "other", "faculty"] as const) {
    const role = kind === "faculty" ? "professor" : "student";
    const [user] = await db.insert(usersTable).values({ fullName: "Derm " + kind, email: "derm-" + kind + "@example.test",
      role, status: "approved", departmentId: department.id, passwordHash: "unused: this test signs tokens directly" }).returning();
    derm[kind] = { id: user.id, email: user.email, role, departmentId: department.id,
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

test("PATCH an auto-verified free-text posting: 401 / 403 / 200 / 404", async () => {
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

test("a free-text posting verified by a faculty member cannot be edited by the resident", async () => {
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

test("without the setting a verified posting stays locked even with no supervisor", async () => {
  const [posting] = await db.insert(postingsTable).values({ studentId: a.student0.studentId!, ward: "unit-0",
    startDate: "2026-06-01", endDate: "2026-06-10", status: "verified" }).returning();
  const res = await request(runtime.base, `/students/${a.student0.studentId}/postings/${posting.id}`, a.student0, "PATCH",
    { endDate: "2026-06-20" });
  assert.equal(res.status, 400);
});

test("department id 15 without the setting follows the normal rules", async () => {
  // Dermatology's live id. Before this change the id alone switched the free-text rules on.
  await db.insert(departmentsTable).values({ id: 15, name: "Id 15 fixture", code: "ID-15-FIXTURE" });
  await db.insert(departmentConfigsTable).values({ departmentId: 15 });
  const [user] = await db.insert(usersTable).values({ fullName: "Id 15 resident", email: "id15@example.test", role: "student",
    status: "approved", departmentId: 15, passwordHash: "unused: this test signs tokens directly" }).returning();
  const [student] = await db.insert(studentsTable).values({ userId: user.id, batch: "2026", registrationNumber: "ID15-" + user.id,
    kuhsId: "ID15-UNIV-" + user.id, specialty: "Id 15 fixture", dateOfJoining: "2026-01-01" }).returning();
  const resident: Account = { id: user.id, email: user.email, role: "student", departmentId: 15, studentId: student.id,
    token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
  const res = await request(runtime.base, `/students/${student.id}/postings`, resident, "POST",
    { ward: "Free-text ward", startDate: "2026-07-01", endDate: "2026-07-10" });
  assert.equal(res.status, 400);
  assert.equal(res.body.message, "Supervisor is required");
});

test("GET postings: faculty see unsupervised postings only where the setting is on (401 / 403 / 200 / nonexistent)", async () => {
  const path = `/students/${derm.owner.studentId}/postings`;
  const show = (label: string, who: string, res: { status: number; body: any }) =>
    console.log(`${label}: GET /api${path} as ${who} -> ${res.status} ${JSON.stringify(res.body?.message !== undefined ? { message: res.body.message } : { postings: res.body.data?.length })}`);

  let res = await request(runtime.base, path);
  show("unauthenticated", "nobody", res);
  assert.equal(res.status, 401);

  res = await request(runtime.base, path, a.faculty0);
  show("wrong owner (faculty of another department)", a.faculty0.email, res);
  assert.equal(res.status, 403);

  res = await request(runtime.base, path, derm.faculty);
  show("correct owner (faculty, setting on)", derm.faculty.email, res);
  assert.equal(res.status, 200);
  const unsupervised = res.body.data.filter((p: any) => p.supervisorId === null);
  assert.ok(unsupervised.length > 0, "a faculty member sees postings that name no supervisor");

  const missing = "/students/999999/postings";
  res = await request(runtime.base, missing, derm.faculty);
  console.log(`nonexistent student (403 by design, studentAccess): GET /api${missing} as ${derm.faculty.email} -> ${res.status} ${JSON.stringify({ message: res.body.message })}`);
  assert.equal(res.status, 403);

  // Without the setting, a professor sees only the postings they supervise.
  await db.insert(postingsTable).values({ studentId: a.student0.studentId!, ward: "unit-0", startDate: "2026-08-01", endDate: "2026-08-10",
    status: "verified" });
  const other = await request(runtime.base, `/students/${a.student0.studentId}/postings`, a.faculty0);
  assert.equal(other.status, 200);
  assert.equal(other.body.data.filter((p: any) => p.supervisorId !== a.faculty0.id).length, 0);
});

test("free-text procedures are accepted only where the setting is on", async () => {
  const body = (supervisorId: number) => ({ supervisorId, procedureName: "Typed-in procedure", date: "2026-09-01",
    patientUhid: "TEST-FT-1", patientAge: "30", competencyLevel: "N/A" });
  const on = await request(runtime.base, `/students/${derm.owner.studentId}/procedure-logs`, derm.owner, "POST", body(derm.faculty.id));
  assert.equal(on.status, 201, JSON.stringify(on.body));
  assert.equal(on.body.procedureGroup, "N/A");
  const off = await request(runtime.base, `/students/${a.student0.studentId}/procedure-logs`, a.student0, "POST",
    { ...body(a.faculty0.id), procedureGroup: "Test group 0" });
  assert.equal(off.status, 400);
  assert.equal(off.body.message, "Select a procedure from your department");
});
