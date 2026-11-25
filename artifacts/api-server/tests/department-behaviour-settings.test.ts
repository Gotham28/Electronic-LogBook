// Task 2b: no behaviour depends on a department's name or code. Every behaviour is a stored setting,
// and migration 0035 writes down what the name checks used to decide (AGENTS.md sec 3, 5, 6, 11).
import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { physiologyLogbook } from "@workspace/api-zod";
import { setup, request, accounts, type Account } from "./support.js";
import { db, engine, departmentsTable, departmentConfigsTable, usersTable, studentsTable, postingsTable, getTestCollegeId, migrationConnection } from "./database.js";
import { applyMigrations } from "../../../lib/db/src/migrations.js";
import { academicLogbookForDepartment } from "../src/lib/academic-logbook.js";

const migrationFile = new URL("../../../lib/db/migrations/0035_department_behaviour_settings.sql", import.meta.url);
const show = (label: string, method: string, path: string, response: { status: number; body: any }) =>
  console.log(JSON.stringify({ case: label, request: { method, path }, response: { status: response.status, body: response.body } }));

// What every Microbiology behaviour setting is after the backfill: today's effective behaviour, with
// procedureExperience false (developer decision, 2026-11-24).
const MICRO_FEATURES = {
  microbiologyCaseFields: true, freeTextProcedures: true, hideProcedureAge: true, useThesisAndMandatoryCertificationsLabel: true,
  attendedConferences: true, hideLeaveRecords: true, dailyAttendance: true, yearlyAttendance: true, conferenceLevels: true,
  freeTextPostingUnit: true, conferenceDateRange: true, hideHodQuarterlyAppraisal: true, procedureDetailsField: true,
  hideProcedureProgress: true, freeTextPostingSupervisor: true, extendedAssessmentTypes: true, procedureExperience: false,
};
const MICRO_CATALOG = [
  ["academic", "journal_club", "Journal club"], ["academic", "seminars", "Seminars"], ["academic", "ug_teaching", "UG teaching"],
  ["conference_level", "national", "National"], ["conference_level", "state", "State"],
];

const backfillSql = async () => {
  const sql = await readFile(migrationFile, "utf8");
  const start = sql.indexOf("-- Backfill: Microbiology");
  // A missing marker must fail the test, not silently run the whole file (or nothing).
  assert.notEqual(start, -1, "the '-- Backfill: Microbiology' marker is missing from 0035_department_behaviour_settings.sql");
  const slice = sql.slice(start);
  assert.doesNotMatch(slice, /ALTER TABLE department_configs ADD COLUMN/i, "the slice must not contain the column DDL");
  assert.match(slice, /UPDATE department_configs/, "the slice must contain the backfill");
  return slice;
};

// ---------------------------------------------------------------------------------------------
// HTTP behaviour: the stored setting is the only input.
// ---------------------------------------------------------------------------------------------
let runtime: Awaited<ReturnType<typeof setup>>;
type Fixture = { professorA: Account; professorB: Account; student: Account; postingId: number };
const fixtures: Record<string, Fixture> = {};
let collegeId: number;

async function mintUser(departmentId: number, kind: "professor" | "student", label: string): Promise<Account> {
  const [user] = await db.insert(usersTable).values({ fullName: `Behaviour ${label}`, email: `behaviour-${label}@example.test`, role: kind,
    status: "approved", departmentId, passwordHash: "unused: this test signs tokens directly" }).returning();
  const account: Account = { id: user.id, email: user.email, role: kind, departmentId,
    token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
  if (kind === "student") {
    const [student] = await db.insert(studentsTable).values({ userId: user.id, batch: "2026", registrationNumber: "BEH-" + user.id,
      kuhsId: "BEH-UNIV-" + user.id, specialty: "Behaviour fixture", dateOfJoining: "2026-01-01" }).returning();
    account.studentId = student.id;
  }
  return account;
}

// One supervised posting per fixture department: supervised by professor A, so professor B is "someone else".
async function fixture(label: string, departmentId: number): Promise<Fixture> {
  const professorA = await mintUser(departmentId, "professor", `${label}-a`);
  const professorB = await mintUser(departmentId, "professor", `${label}-b`);
  const student = await mintUser(departmentId, "student", `${label}-s`);
  const [posting] = await db.insert(postingsTable).values({ studentId: student.studentId!, ward: "Fixture ward",
    startDate: "2026-02-01", endDate: "2026-02-10", supervisorId: professorA.id, status: "pending" }).returning();
  return fixtures[label] = { professorA, professorB, student, postingId: posting.id };
}

before(async () => {
  runtime = await setup();
  collegeId = await getTestCollegeId();
  // Real-looking ids from the developer's query, so the literal-id backfill targets them: 14 Microbiology
  // with its test copy 24, and 30 Physiology with its test copy 31. Each real department holds the stored
  // config row the query showed ({procedureExperience: true}) and nothing else.
  await engine.exec(`INSERT INTO departments (id, name, code, is_test, config_source_department_id, college_id) VALUES
    (14, 'Microbiology', 'MIC', false, NULL, ${collegeId}), (24, 'Microbiology (Test)', 'TEST-14', true, 14, ${collegeId}),
    (30, 'Physiology', 'PSI', false, NULL, ${collegeId}), (31, 'Physiology (Test)', 'TEST-30', true, 30, ${collegeId});
    INSERT INTO department_configs (department_id, enabled_features) VALUES (14, '{"procedureExperience": true}'), (30, '{"procedureExperience": true}');
    SELECT setval(pg_get_serial_sequence('departments', 'id'), (SELECT max(id) FROM departments));`);
  // The backfill, run for real against those rows.
  await engine.exec(await backfillSql());

  // A department NAMED Microbiology with no settings, and one NAMED Physiology with no profile.
  const [named] = await db.insert(departmentsTable).values({ name: "Microbiology", code: "MIC-NOSET", collegeId }).returning();
  await db.insert(departmentConfigsTable).values({ departmentId: named.id, enabledFeatures: { procedureExperience: true } });
  // The code PSI is already taken by department 30 in this college, so the name-only copy lives in another one.
  await engine.exec("INSERT INTO colleges (name, code) VALUES ('Second behaviour college', 'second-behaviour-college')");
  const [secondCollege] = (await engine.query<{ id: number }>("SELECT id FROM colleges WHERE code = 'second-behaviour-college'")).rows;
  const [physiologyNamed] = await db.insert(departmentsTable).values({ name: "Physiology", code: "PSI", collegeId: secondCollege.id }).returning();
  await db.insert(departmentConfigsTable).values({ departmentId: physiologyNamed.id, enabledFeatures: { procedureExperience: true } });
  // A department NAMED Pediatrics that stores the settings.
  const [peds] = await db.insert(departmentsTable).values({ name: "Pediatrics", code: "PEDS-SET", collegeId }).returning();
  await db.insert(departmentConfigsTable).values({ departmentId: peds.id, enabledFeatures: { ...MICRO_FEATURES } });
  // A department NAMED Microbiology that saved microbiologyCaseFields: false.
  const [savedFalse] = await db.insert(departmentsTable).values({ name: "Microbiology", code: "MIC-FALSE", collegeId }).returning();
  await db.insert(departmentConfigsTable).values({ departmentId: savedFalse.id, enabledFeatures: { microbiologyCaseFields: false } });

  await fixture("micro", 14);
  await fixture("microcopy", 24);
  await fixture("noset", named.id);
  await fixture("peds", peds.id);
  await fixture("physiology", 30);
  await fixture("physiologycopy", 31);
  await fixture("physiologynamed", physiologyNamed.id);
  await fixture("savedfalse", savedFalse.id);
});
after(async () => {
  if (runtime) await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
  await engine.close();
});

describe("GET /students/:studentId/postings: visibility follows the stored freeTextPostingUnit (AGENTS.md sec 3, 11)", () => {
  const list = (who: Account | undefined, studentId: number) => request(runtime.base, `/students/${studentId}/postings`, who);
  const ids = (response: { body: any }) => response.body.data.map((item: any) => item.id);

  it("§11: unauthenticated 401, professor of another department 403, free-text department professor 200 with the posting, nonexistent student", async () => {
    const f = fixtures.micro;
    const path = `/students/${f.student.studentId}/postings`;

    const unauthenticated = await list(undefined, f.student.studentId!);
    show("unauthenticated", "GET", path, unauthenticated);
    assert.equal(unauthenticated.status, 401);

    const otherDepartment = await list(accounts.faculty0, f.student.studentId!);
    show("professor of another department (Pediatrics fixture, department " + accounts.faculty0.departmentId + ")", "GET", path, otherDepartment);
    assert.equal(otherDepartment.status, 403);

    // The flag comes from the backfilled config of department 14, not from its name.
    const correct = await list(f.professorB, f.student.studentId!);
    show("professor B of department 14 (Microbiology, backfilled), posting supervised by professor A", "GET", path, correct);
    assert.equal(correct.status, 200);
    assert.deepEqual(ids(correct), [f.postingId], "the posting supervised by someone else is visible");

    const missing = await list(f.professorB, 99999999);
    show("nonexistent student id", "GET", "/students/99999999/postings", missing);
    // studentAccess answers a missing student exactly like an out-of-scope one, so ids cannot be enumerated.
    assert.equal(missing.status, 403);
  });

  it("the same professor shape in a department without the flag gets 200 with the posting absent, even when the department is named Microbiology", async () => {
    for (const label of ["noset"] as const) {
      const f = fixtures[label];
      const path = `/students/${f.student.studentId}/postings`;
      const response = await list(f.professorB, f.student.studentId!);
      show(`professor B of the department named Microbiology with no settings (${label})`, "GET", path, response);
      assert.equal(response.status, 200);
      assert.deepEqual(ids(response), [], "posting supervised by someone else is hidden: no flag, so no name fallback");
      const supervisor = await list(f.professorA, f.student.studentId!);
      assert.deepEqual(ids(supervisor), [f.postingId], "the supervisor still sees their own posting");
    }
  });

  it("a department named Pediatrics that stores the setting gets the all-postings visibility", async () => {
    const f = fixtures.peds;
    const response = await list(f.professorB, f.student.studentId!);
    show("professor B of the department named Pediatrics that stores the settings", "GET", `/students/${f.student.studentId}/postings`, response);
    assert.equal(response.status, 200);
    assert.deepEqual(ids(response), [f.postingId]);
  });

  it("the test copy of Microbiology (24) inherits the visibility through config_source_department_id", async () => {
    const f = fixtures.microcopy;
    const response = await list(f.professorB, f.student.studentId!);
    show("professor B of the test copy (department 24), source department 14", "GET", `/students/${f.student.studentId}/postings`, response);
    assert.equal(response.status, 200);
    assert.deepEqual(ids(response), [f.postingId]);
  });

  it("creating a posting without a supervisor: 400 with no setting (named Microbiology), 201 with the setting", async () => {
    const body = { ward: "Free text ward", startDate: "2026-03-01", endDate: "2026-03-05" };
    const noset = fixtures.noset;
    const rejected = await request(runtime.base, `/students/${noset.student.studentId}/postings`, noset.student, "POST", body);
    show("department named Microbiology, no settings: posting without supervisor", "POST", `/students/${noset.student.studentId}/postings`, rejected);
    assert.equal(rejected.status, 400);
    for (const label of ["micro", "peds"] as const) {
      const f = fixtures[label];
      const created = await request(runtime.base, `/students/${f.student.studentId}/postings`, f.student, "POST", body);
      show(`${label}: posting without supervisor`, "POST", `/students/${f.student.studentId}/postings`, created);
      assert.equal(created.status, 201);
    }
  });
});

describe("catalog: settings and lists come from storage only", () => {
  const catalog = (f: Fixture) => request(runtime.base, `/departments/${f.student.departmentId}/catalog`, f.student);

  it("Microbiology (14) returns the backfilled settings, a real config row and catalog lists; its test copy returns the same", async () => {
    for (const label of ["micro", "microcopy"] as const) {
      const response = await catalog(fixtures[label]);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.config.enabledFeatures, MICRO_FEATURES, label);
      assert.notEqual(response.body.config.id, 0, "a real config row, not the made-up id-0 row");
      assert.deepEqual(response.body.academics.map((item: any) => item.value).sort(), ["journal_club", "seminars", "ug_teaching"], label);
      assert.deepEqual(response.body.conferenceLevels.map((item: any) => item.value).sort(), ["national", "state"], label);
    }
  });

  it("a department only NAMED Microbiology, with no settings, gets none of the behaviour and no hardcoded lists", async () => {
    const response = await catalog(fixtures.noset);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.config.enabledFeatures, { procedureExperience: true });
    assert.deepEqual(response.body.academics, []);
    assert.deepEqual(response.body.conferenceLevels, []);
  });

  it("a saved false is returned as false, whatever the department is named", async () => {
    const response = await catalog(fixtures.savedfalse);
    assert.equal(response.status, 200);
    assert.equal(response.body.config.enabledFeatures.microbiologyCaseFields, false);
  });

  it("Physiology: the stored profile gives the logbook to the department and its test copy; a department only named Physiology (code PSI) gets none", async () => {
    const real = await catalog(fixtures.physiology);
    const copy = await catalog(fixtures.physiologycopy);
    const named = await catalog(fixtures.physiologynamed);
    assert.deepEqual(real.body.academicLogbook, physiologyLogbook);
    assert.deepEqual(copy.body.academicLogbook, physiologyLogbook);
    assert.equal(named.body.academicLogbook, null);
    assert.equal((await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, 30)))[0].academicLogbookProfile, "physiology");
  });

  it("academicLogbookForDepartment reads only the stored profile id", () => {
    assert.equal(academicLogbookForDepartment({ academicLogbookProfile: "physiology" }), physiologyLogbook);
    assert.equal(academicLogbookForDepartment({ academicLogbookProfile: null }), null);
    assert.equal(academicLogbookForDepartment({ academicLogbookProfile: "unknown" }), null);
    assert.equal(academicLogbookForDepartment(undefined), null);
    // A department's name or code is not an input any more: extra properties are ignored.
    assert.equal(academicLogbookForDepartment({ name: "Physiology", code: "PSI" } as any), null);
  });
});

// ---------------------------------------------------------------------------------------------
// The 0035 backfill, on test data seeded from the developer's SELECT output (2026-11-24).
// ---------------------------------------------------------------------------------------------
describe("migration 0035 backfill (PGlite, test data only)", () => {
  const ALL_TRUE_DERM = { awards: true, conferenceLevels: true, publicationsOnly: true, useCaseTypeLabel: true, freeTextProcedures: true,
    attendedConferences: true, freeTextPostingUnit: true, procedureExperience: true, academicActivityExtras: true,
    hideConferenceLocation: true, medicalSummaryCaseFields: true, splitThesisAndCertifications: true, useThesisAndPublicationsLabel: true };
  const CONFIGS: Record<number, Record<string, boolean>> = {
    2: { procedureExperience: true }, 13: { procedureExperience: true }, 14: { procedureExperience: true }, 15: ALL_TRUE_DERM,
    18: { hideCaseLogs: true, clinicalWorks: true, hideProcedureLogs: true, procedureExperience: true },
    28: { procedureExperience: true }, 30: { procedureExperience: true },
    32: { hideProcedureAge: false, hideProcedureLogs: false, freeTextProcedures: false, procedureExperience: true,
      dynamicProcedureFields: true, procedureClinicalDetails: true },
    38: ALL_TRUE_DERM,
  };

  async function seeded() {
    const database = new PGlite();
    await applyMigrations(migrationConnection(database));
    const kannur = "(SELECT id FROM colleges WHERE code = 'kannur-medical-college')";
    await database.exec(`INSERT INTO colleges (name, code) VALUES ('Second test college', 'second-test-college');
      INSERT INTO departments (id, name, code, is_test, config_source_department_id, college_id) VALUES
      (2, 'Pediatrics', 'PAED', false, NULL, ${kannur}), (13, 'Test Department', 'TEST', false, NULL, ${kannur}),
      (14, 'Microbiology', 'MIC', false, NULL, ${kannur}), (15, 'Dermatology', 'DERM', false, NULL, ${kannur}),
      (18, 'Radiology', 'RED', false, NULL, ${kannur}), (19, 'Radiology (Test)', 'TEST-18', true, 18, ${kannur}),
      (20, 'Pediatrics (Test)', 'TEST-2', true, 2, ${kannur}), (23, 'Test Department (Test)', 'TEST-13', true, 13, ${kannur}),
      (24, 'Microbiology (Test)', 'TEST-14', true, 14, ${kannur}), (26, 'Dermatology (Test)', 'TEST-15', true, 15, ${kannur}),
      (28, 'Gynecology', 'GYN', false, NULL, ${kannur}), (29, 'Gynecology (Test)', 'TEST-28', true, 28, ${kannur}),
      (30, 'Physiology', 'PSI', false, NULL, ${kannur}), (31, 'Physiology (Test)', 'TEST-30', true, 30, ${kannur}),
      (32, 'Surgery', 'SURG', false, NULL, ${kannur}), (33, 'Surgery (Test)', 'TEST-32', true, 32, ${kannur}),
      (38, 'Dermatology', 'DERM', false, NULL, (SELECT id FROM colleges WHERE code = 'second-test-college')),
      (39, 'Dermatology (Test)', 'TEST-38', true, 38, (SELECT id FROM colleges WHERE code = 'second-test-college'))`);
    for (const [id, features] of Object.entries(CONFIGS)) {
      await database.query("INSERT INTO department_configs (department_id, enabled_features) VALUES ($1, $2::jsonb)", [Number(id), JSON.stringify(features)]);
    }
    return database;
  }
  const configs = async (database: PGlite) => (await database.query<any>(
    "SELECT department_id, enabled_features, academic_logbook_profile FROM department_configs ORDER BY department_id")).rows;
  const catalogRows = async (database: PGlite) => (await database.query<any>(
    "SELECT department_id, kind, value, name, required, period, parent_value FROM department_catalog ORDER BY department_id, kind, value")).rows;
  const departments = async (database: PGlite) => (await database.query<any>("SELECT id, name, code, is_test, config_source_department_id FROM departments ORDER BY id")).rows;

  it("id 14 ends with exactly today's effective features, a real config row and the catalog rows; Physiology gets the profile; nothing else changes; a second run changes nothing", async () => {
    const database = await seeded();
    try {
      const beforeConfigs = await configs(database);
      const beforeDepartments = await departments(database);
      await database.exec(await backfillSql());
      const afterConfigs = await configs(database);

      const micro = afterConfigs.find((row) => row.department_id === 14);
      assert.deepEqual(micro.enabled_features, MICRO_FEATURES);
      assert.equal(micro.academic_logbook_profile, null);
      assert.deepEqual(afterConfigs.find((row) => row.department_id === 30), { department_id: 30, enabled_features: { procedureExperience: true }, academic_logbook_profile: "physiology" });
      // Every other config row is byte-for-byte what it was: ids 2, 13, 15, 18, 28, 32, 38 get nothing.
      const others = (rows: any[]) => rows.filter((row) => ![14, 30].includes(row.department_id));
      assert.deepEqual(others(afterConfigs), others(beforeConfigs), "no other department's configuration changes");
      assert.deepEqual(afterConfigs.map((row) => row.department_id), beforeConfigs.map((row) => row.department_id), "no config row appears for a test copy or any other id");
      assert.deepEqual(afterConfigs.filter((row) => row.academic_logbook_profile !== null).map((row) => row.department_id), [30]);

      const catalog = await catalogRows(database);
      assert.deepEqual(catalog.map((row) => [row.department_id, row.kind, row.value, row.name, row.required, row.period, row.parent_value]),
        MICRO_CATALOG.map(([kind, value, name]) => [14, kind, value, name, 0, "total", null]).sort((a, b) =>
          String(a[1]).localeCompare(String(b[1])) || String(a[2]).localeCompare(String(b[2]))));
      // The test copies hold no rows of their own: they follow config_source_department_id to 14 and 30.
      for (const copy of [24, 31]) {
        assert.equal(afterConfigs.some((row) => row.department_id === copy), false, `test copy ${copy} has no config row`);
        assert.equal(catalog.some((row) => row.department_id === copy), false);
      }
      assert.deepEqual(await departments(database), beforeDepartments, "no department is renamed or changed");

      await database.exec(await backfillSql());
      assert.deepEqual(await configs(database), afterConfigs, "re-running changes no configuration");
      assert.deepEqual(await catalogRows(database), catalog, "re-running changes no catalog row");
    } finally { await database.close(); }
  });

  it("a stored value wins for keys the server only defaulted, and a missing config row is created", async () => {
    const database = await seeded();
    try {
      await database.exec(`UPDATE department_configs SET enabled_features = '{"procedureExperience": true, "dailyAttendance": false, "useThesisAndMandatoryCertificationsLabel": false, "conferenceLevels": false}'::jsonb WHERE department_id = 14`);
      await database.exec(await backfillSql());
      const stored = (await configs(database)).find((row) => row.department_id === 14).enabled_features;
      assert.equal(stored.dailyAttendance, false);
      assert.equal(stored.useThesisAndMandatoryCertificationsLabel, false);
      assert.equal(stored.conferenceLevels, false);
      assert.equal(stored.freeTextPostingUnit, true);
      assert.equal(stored.procedureExperience, false);
    } finally { await database.close(); }
    const bare = await seeded();
    try {
      await bare.exec("DELETE FROM department_configs WHERE department_id IN (14, 30)");
      await bare.exec(await backfillSql());
      const rows = await configs(bare);
      assert.deepEqual(rows.find((row) => row.department_id === 14).enabled_features, MICRO_FEATURES, "a real row is created for 14");
      assert.equal(rows.find((row) => row.department_id === 30).academic_logbook_profile, "physiology", "and for 30");
    } finally { await bare.close(); }
  });

  it("the name check is case-insensitive, so the pre-0034 name still matches", async () => {
    const database = await seeded();
    try {
      await database.exec("UPDATE departments SET name = 'MicroBiology' WHERE id = 14");
      await database.exec(await backfillSql());
      assert.deepEqual((await configs(database)).find((row) => row.department_id === 14).enabled_features, MICRO_FEATURES);
    } finally { await database.close(); }
  });

  it("an id that holds a different name gets nothing, and the guard is per id", async () => {
    for (const rename of [14, 30]) {
      const database = await seeded();
      try {
        const beforeConfigs = await configs(database);
        await database.exec(`UPDATE departments SET name = 'Pediatric Surgery', code = 'PSURG${rename}' WHERE id = ${rename}`);
        await database.exec(await backfillSql());
        const afterConfigs = await configs(database);
        assert.deepEqual(afterConfigs.find((row) => row.department_id === rename), beforeConfigs.find((row) => row.department_id === rename), `id ${rename} is untouched`);
        const other = rename === 14 ? 30 : 14;
        assert.notDeepEqual(afterConfigs.find((row) => row.department_id === other), beforeConfigs.find((row) => row.department_id === other), `id ${other} still gets its backfill`);
        assert.equal((await catalogRows(database)).length, rename === 14 ? 0 : MICRO_CATALOG.length);
      } finally { await database.close(); }
    }
  });

  it("a stored value that contradicts a forced value, or catalog rows the hardcoded lists were hiding, fail the migration instead of being guessed", async () => {
    let database = await seeded();
    try {
      await database.exec(`UPDATE department_configs SET enabled_features = '{"procedureExperience": true, "hideLeaveRecords": false}'::jsonb WHERE department_id = 14`);
      await assert.rejects(async () => { await database.exec(await backfillSql()); }, /contradicts the Microbiology behaviour/);
    } finally { await database.close(); }
    database = await seeded();
    try {
      await database.exec(`INSERT INTO department_catalog (department_id, kind, name, value) VALUES (14, 'academic', 'Grand rounds', 'grand_rounds')`);
      await assert.rejects(async () => { await database.exec(await backfillSql()); }, /hardcoded lists were hiding/);
    } finally { await database.close(); }
  });
});

describe("no behaviour reads a department's name or code (AGENTS.md sec 5)", () => {
  const files = [
    "artifacts/api-server/src/lib/department-features.ts", "artifacts/api-server/src/lib/academic-logbook.ts", "artifacts/api-server/src/routes/department.ts",
    "artifacts/mockup-sandbox/src/lib/department-context.tsx", "artifacts/mockup-sandbox/src/components/ProfessorPortal.tsx",
    "artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx", "artifacts/mockup-sandbox/src/components/pages/AssessmentsPage.tsx",
    "artifacts/mockup-sandbox/src/components/pages/AttendancePage.tsx", "artifacts/mockup-sandbox/src/components/pages/CaseLogsPage.tsx",
    "artifacts/mockup-sandbox/src/components/pages/ConferencesPage.tsx", "artifacts/mockup-sandbox/src/components/pages/PostingsPage.tsx",
    "artifacts/mockup-sandbox/src/components/pages/ProcedureLogsPage.tsx",
    "lib/api-zod/src/academic-logbook.ts", "lib/api-zod/src/logbook-profiles/physiology.ts",
  ];
  it("none of the files that used to branch on a department name or code still does", async () => {
    const forbidden = /includes\("(microbiology|radiology|dermatology|physiology)"\)|=== "microbiology"|isMicro\b|isMicroDept|isMenteeMicro|isMicrobiology|departmentNames|departmentCodes/;
    for (const file of files) {
      const source = await readFile(new URL(`../../../${file}`, import.meta.url), "utf8");
      const hit = source.split("\n").findIndex((line) => forbidden.test(line));
      assert.equal(hit, -1, `${file}:${hit + 1} still branches on a department name or code`);
    }
  });
});
