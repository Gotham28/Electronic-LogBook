import { before, after, test, describe } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine, db, departmentCatalogTable, procedureTypesTable, procedureLogsTable } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
let competencyId: number;

const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

before(async () => {
  runtime = await setup();
  // Insert a dummy procedure type
  await db.insert(procedureTypesTable).values({
    departmentId: 1, name: "Intubation", group: "Airway"
  });

  // Insert a competency level
  const [comp] = await db.insert(departmentCatalogTable).values({
    departmentId: 1, kind: "competency_level", name: "Novice", value: "Novice"
  }).returning();
  competencyId = comp.id;
  
  // Insert a procedure log using this competency level
  await db.insert(procedureLogsTable).values({
    studentId: a.student0.studentId!, procedureName: "Intubation", procedureGroup: "Airway",
    date: "2024-01-01", patientUhid: "123", patientAge: "10", competencyLevel: "Novice", supervisorId: a.faculty0.id
  });
});

after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); 
  await engine.close();
});

describe("HOD competency level catalog endpoints", () => {
  test("HOD can add a competency_level catalog entry", async () => {
    const res = await call("/admin/department/catalog", "hod0", "POST", { kind: "competency_level", name: "Expert", value: "Expert", period: "total", required: 0 });
    assert.equal(res.status, 201);
    assert.equal(res.body.kind, "competency_level");
  });

  test("HOD can check usage of a competency_level entry", async () => {
    const res = await call(`/admin/department/catalog/${competencyId}/usage-count`, "hod0", "GET");
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 1);
  });

  test("HOD can delete a competency_level entry", async () => {
    const res = await call(`/admin/department/catalog/${competencyId}`, "hod0", "DELETE");
    assert.equal(res.status, 200);
  });
});

describe("Student procedure logs validation against dynamic competency levels", () => {
  test("Student gets 400 Bad Request when submitting an invalid competency level", async () => {
    const res = await call(`/students/${a.student0.studentId}/procedure-logs`, "student0", "POST", {
        procedureGroup: "Airway",
        procedureName: "Intubation",
        date: "2024-01-02",
        patientUhid: "456",
        patientAge: "15",
        competencyLevel: "made_up_level", // Invalid because not in department 1's catalog
        supervisorId: String(a.faculty0.id)
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Invalid competency level for your department");
  });

  test("Student can successfully submit a procedure with a valid competency level", async () => {
    const res = await call(`/students/${a.student0.studentId}/procedure-logs`, "student0", "POST", {
        procedureGroup: "Airway",
        procedureName: "Intubation",
        date: "2024-01-02",
        patientUhid: "789",
        patientAge: "20",
        competencyLevel: "Expert", // Added in previous test
        supervisorId: String(a.faculty0.id)
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.competencyLevel, "Expert");
  });
});
