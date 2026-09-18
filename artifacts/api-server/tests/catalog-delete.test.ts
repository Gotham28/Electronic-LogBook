import { before, after, test, describe } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine, db, departmentCatalogTable, procedureTypesTable, postingsTable, academicLogsTable, procedureLogsTable } from "./database.js";
import { eq } from "drizzle-orm";

let runtime: Awaited<ReturnType<typeof setup>>;
let catalogIdPosting: number;
let catalogIdAcademic: number;
let procedureId: number;

before(async () => {
  runtime = await setup();
  // Setup entries in the database using the HOD's department (department 1)
  const [posting] = await db.insert(departmentCatalogTable).values({
    departmentId: 1, kind: "posting", name: "Ward A", value: "Ward A"
  }).returning();
  catalogIdPosting = posting.id;

  const [academic] = await db.insert(departmentCatalogTable).values({
    departmentId: 1, kind: "academic", name: "Journal Club", value: "Journal Club"
  }).returning();
  catalogIdAcademic = academic.id;

  const [procedure] = await db.insert(procedureTypesTable).values({
    departmentId: 1, name: "Intubation", group: "Airway"
  }).returning();
  procedureId = procedure.id;
  
  // Insert log records for student0 (who is in department 1)
  await db.insert(postingsTable).values({
    studentId: a.student0.studentId!, ward: "Ward A", startDate: "2024-01-01", endDate: "2024-01-31"
  });
  
  await db.insert(academicLogsTable).values({
    studentId: a.student0.studentId!, activityType: "Journal Club", topic: "Test Topic", date: "2024-01-01"
  });
  
  await db.insert(procedureLogsTable).values({
    studentId: a.student0.studentId!, procedureName: "Intubation", procedureGroup: "Airway",
    date: "2024-01-01", patientUhid: "123", patientAge: "10", competencyLevel: "observed"
  });

  // Insert dummy data for department 2 to verify cross-department isolation
  await db.insert(departmentCatalogTable).values({
    departmentId: 2, kind: "posting", name: "Ward A", value: "Ward A"
  });

  await db.insert(departmentCatalogTable).values({
    departmentId: 2, kind: "academic", name: "Journal Club", value: "Journal Club"
  });

  await db.insert(procedureTypesTable).values({
    departmentId: 2, name: "Intubation", group: "Airway"
  });
  
  // Insert log records for student1 (who is in department 2)
  await db.insert(postingsTable).values({
    studentId: a.student1.studentId!, ward: "Ward A", startDate: "2024-02-01", endDate: "2024-02-28"
  });
  
  await db.insert(academicLogsTable).values({
    studentId: a.student1.studentId!, activityType: "Journal Club", topic: "Test Topic Dept 2", date: "2024-02-01"
  });
  
  await db.insert(procedureLogsTable).values({
    studentId: a.student1.studentId!, procedureName: "Intubation", procedureGroup: "Airway",
    date: "2024-02-01", patientUhid: "456", patientAge: "12", competencyLevel: "assisted"
  });
});

after(async () => { 
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); 
  await engine.close(); 
});

const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

test("DELETE and usage counts for catalog and procedures", async (t) => {
  await t.test("401 Unauthenticated", async () => {
    let res = await call(`/admin/department/catalog/${catalogIdPosting}/usage-count`, undefined, "GET");
    assert.equal(res.status, 401);
    res = await call(`/admin/department/catalog/${catalogIdPosting}`, undefined, "DELETE");
    assert.equal(res.status, 401);
  });

  await t.test("403 Cross-department attempt", async () => {
    // hod1 (department 2) trying to access hod0's (department 1) entry
    let res = await call(`/admin/department/catalog/${catalogIdPosting}/usage-count`, "hod1", "GET");
    assert.equal(res.status, 403);
    res = await call(`/admin/department/catalog/${catalogIdPosting}`, "hod1", "DELETE");
    assert.equal(res.status, 403);
  });

  await t.test("Usage count returns correctly for postings", async () => {
    const res = await call(`/admin/department/catalog/${catalogIdPosting}/usage-count`, "hod0", "GET");
    assert.equal(res.status, 200);
    const data = res.body;
    assert.equal(data.count, 1);
  });

  await t.test("Usage count returns correctly for academics", async () => {
    const res = await call(`/admin/department/catalog/${catalogIdAcademic}/usage-count`, "hod0", "GET");
    assert.equal(res.status, 200);
    const data = res.body;
    assert.equal(data.count, 1);
  });

  await t.test("Usage count returns correctly for procedures", async () => {
    const res = await call(`/admin/department/procedures/${procedureId}/usage-count`, "hod0", "GET");
    assert.equal(res.status, 200);
    const data = res.body;
    assert.equal(data.count, 1);
  });

  await t.test("Cross-department usage counts are isolated", async () => {
    // hod0 (department 1) usage count for Ward A should still be exactly 1,
    // ignoring the identical posting logged by a student in department 2.
    const resPosting = await call(`/admin/department/catalog/${catalogIdPosting}/usage-count`, "hod0", "GET");
    assert.equal(resPosting.body.count, 1);

    const resAcademic = await call(`/admin/department/catalog/${catalogIdAcademic}/usage-count`, "hod0", "GET");
    assert.equal(resAcademic.body.count, 1);

    const resProcedure = await call(`/admin/department/procedures/${procedureId}/usage-count`, "hod0", "GET");
    assert.equal(resProcedure.body.count, 1);
  });

  await t.test("Successfully delete a catalog entry without affecting existing logs", async () => {
    const res = await call(`/admin/department/catalog/${catalogIdPosting}`, "hod0", "DELETE");
    assert.equal(res.status, 200);

    const [entry] = await db.select().from(departmentCatalogTable).where(eq(departmentCatalogTable.id, catalogIdPosting));
    assert.equal(entry, undefined);

    const [log] = await db.select().from(postingsTable).where(eq(postingsTable.ward, "Ward A"));
    assert.notEqual(log, undefined);
    assert.equal(log.ward, "Ward A");
  });

  await t.test("Successfully delete a procedure entry without affecting existing logs", async () => {
    const res = await call(`/admin/department/procedures/${procedureId}`, "hod0", "DELETE");
    assert.equal(res.status, 200);

    const [entry] = await db.select().from(procedureTypesTable).where(eq(procedureTypesTable.id, procedureId));
    assert.equal(entry, undefined);

    const [log] = await db.select().from(procedureLogsTable).where(eq(procedureLogsTable.procedureName, "Intubation"));
    assert.notEqual(log, undefined);
    assert.equal(log.procedureGroup, "Airway");
  });
});
