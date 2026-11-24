import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { PGlite } from "@electric-sql/pglite";
import { setup, request, accounts, departmentIds, type Account } from "./support.js";
import { db, engine, departmentsTable, departmentConfigsTable, usersTable, departmentLabelOverridesTable, getTestCollegeId, migrationConnection } from "./database.js";
import { applyMigrations } from "../../../lib/db/src/migrations.js";
import { DEPARTMENT_LABELS, DEPARTMENT_LABEL_KEYS } from "@workspace/api-zod";

let runtime: Awaited<ReturnType<typeof setup>>;
let mirrorHod: Account;
const endpoint = "/admin/department/labels";
const rowsFor = (departmentId: number) => db.select().from(departmentLabelOverridesTable)
  .where(eq(departmentLabelOverridesTable.departmentId, departmentId)).orderBy(departmentLabelOverridesTable.key);
const show = (label: string, method: string, path: string, body: unknown, response: { status: number; body: any }) =>
  console.log(JSON.stringify({ case: label, request: { method, path, body }, response: { status: response.status, body: response.body } }));
// For the log only: the real request value, cut to 40 characters with its full length noted.
const shorten = (body: any) => body && typeof body.value === "string" && body.value.length > 40
  ? { ...body, value: `${body.value.slice(0, 40)}... (${body.value.length} chars)` } : body;
const mintAccount = async (departmentId: number, email: string): Promise<Account> => {
  const [user] = await db.insert(usersTable).values({ fullName: "Label test HOD", email, role: "hod", status: "approved",
    departmentId, passwordHash: "test-hash" }).returning();
  return { id: user.id, email: user.email, role: "hod", departmentId,
    token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
};

before(async () => {
  runtime = await setup();
  // A mirror (test) department of Pediatrics: its HOD must not change the source's wording.
  const [mirror] = await db.insert(departmentsTable).values({ name: "Pediatrics (Test)", code: "LABEL-MIRROR", isTest: true,
    configSourceDepartmentId: departmentIds[0], collegeId: await getTestCollegeId() }).returning();
  const [user] = await db.insert(usersTable).values({ fullName: "Label mirror HOD", email: "label-mirror-hod@example.test", role: "hod",
    status: "approved", departmentId: mirror.id, passwordHash: "test-hash" }).returning();
  mirrorHod = { id: user.id, email: user.email, role: "hod", departmentId: mirror.id,
    token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
});
after(async () => {
  if (runtime) await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
  await engine.close();
});

describe("PATCH /admin/department/labels/:key (AGENTS.md §11)", () => {
  const key = "postings.unitTitle";
  const path = `${endpoint}/${key}`;
  const body = { value: "Clinical unit" };

  it("unauthenticated 401, wrong owner 403, correct HOD 200, nonexistent key 404", async () => {
    const before1 = await rowsFor(departmentIds[1]);
    for (const [label, caller, route, expected] of [
      ["unauthenticated", undefined, path, 401],
      ["student", accounts.student0, path, 403],
      ["professor", accounts.faculty0, path, 403],
      ["HOD of a mirrored department", mirrorHod, path, 403],
      ["correct HOD", accounts.hod0, path, 200],
      ["nonexistent key", accounts.hod0, `${endpoint}/postings.nonexistent`, 404],
    ] as const) {
      const response = await request(runtime.base, route, caller, "PATCH", body);
      show(label, "PATCH", route, body, response);
      assert.equal(response.status, expected, label);
    }
    // The write landed for the caller's own department only.
    const own = await rowsFor(departmentIds[0]);
    assert.deepEqual(own.map((row) => [row.key, row.value, row.revision, row.updatedBy]), [[key, "Clinical unit", 1, accounts.hod0.id]]);
    assert.deepEqual(await rowsFor(departmentIds[1]), before1);
    assert.deepEqual(await rowsFor(mirrorHod.departmentId), []);
  });

  it("the written value is what is stored and what the catalog and the wording list return", async () => {
    const written = "Clinical unit (written)";
    const response = await request(runtime.base, path, accounts.hod0, "PATCH", { value: written });
    show("written value", "PATCH", path, { value: written }, response);
    assert.equal(response.status, 200);
    assert.equal(response.body.value, written, "response value");
    assert.equal(response.body.override, written, "response override");
    const [stored] = (await rowsFor(departmentIds[0])).filter((row) => row.key === key);
    assert.equal(stored.value, written, "stored value");
    const catalog = await request(runtime.base, `/departments/${departmentIds[0]}/catalog`, accounts.student0);
    assert.equal(catalog.body.labels[key], written, "catalog value");
    const listed = (await request(runtime.base, endpoint, accounts.hod0)).body.labels.find((item: any) => item.key === key);
    assert.equal(listed.value, written, "wording list value");
    assert.equal(listed.default, "Ward / Posting Unit", "the default is unchanged");
  });

  it("a department named in the body is rejected, and one named in the query is ignored; department B is unchanged", async () => {
    const departmentB = departmentIds[1];
    const seeded = await request(runtime.base, path, accounts.hod1, "PATCH", { value: "B wording for the body test" });
    assert.equal(seeded.status, 200);
    const snapshot = await rowsFor(departmentB);
    const ownBefore = await rowsFor(departmentIds[0]);
    for (const extra of [{ departmentId: departmentB }, { department_id: departmentB }]) {
      const attempt = await request(runtime.base, path, accounts.hod0, "PATCH", { value: "Hijacked via body", ...extra });
      show("hod of A naming department B in the body", "PATCH", path, { value: "Hijacked via body", ...extra }, attempt);
      assert.equal(attempt.status, 400, "the strict body schema rejects a department field");
      assert.deepEqual(await rowsFor(departmentB), snapshot, "department B is unchanged");
      assert.deepEqual(await rowsFor(departmentIds[0]), ownBefore, "the caller's own rows are unchanged too");
    }
  });

  it("a HOD of department A cannot change department B's rows, whatever they send", async () => {
    const departmentB = departmentIds[1];
    const seeded = await request(runtime.base, path, accounts.hod1, "PATCH", { value: "Department B wording" });
    assert.equal(seeded.status, 200);
    const snapshot = await rowsFor(departmentB);
    // A client-supplied department is ignored: the department is always req.user.departmentId.
    const attempt = await request(runtime.base, `${path}?departmentId=${departmentB}`, accounts.hod0, "PATCH", { value: "Hijacked" });
    show("hod of A naming department B in the query", "PATCH", `${path}?departmentId=${departmentB}`, { value: "Hijacked" }, attempt);
    assert.equal(attempt.status, 200);
    assert.deepEqual(await rowsFor(departmentB), snapshot, "department B is unchanged");
    assert.equal((await rowsFor(departmentIds[0]))[0].value, "Hijacked", "the write landed on the caller's own department");
  });

  it("stale revision is 409; empty, 81-character and multi-line values are 400; revision increments", async () => {
    const [current] = await rowsFor(departmentIds[0]);
    const stale = await request(runtime.base, path, accounts.hod0, "PATCH", { value: "Stale", revision: current.revision + 5 });
    show("stale revision", "PATCH", path, { value: "Stale", revision: current.revision + 5 }, stale);
    assert.equal(stale.status, 409);
    for (const [label, value] of [["empty", ""], ["blank", "   "], ["81 characters", "x".repeat(81)], ["multi-line", "line one\nline two"],
      ["carriage return", "line one\rline two"]] as const) {
      const response = await request(runtime.base, path, accounts.hod0, "PATCH", { value });
      show(label, "PATCH", path, shorten({ value }), response);
      assert.equal(response.status, 400, label);
    }
    assert.equal((await request(runtime.base, path, accounts.hod0, "PATCH", { value: 7 })).status, 400);
    assert.equal((await request(runtime.base, path, accounts.hod0, "PATCH", { value: "ok", extra: true })).status, 400);
    assert.equal((await rowsFor(departmentIds[0]))[0].value, "Hijacked", "rejected values change nothing");
    const ok = await request(runtime.base, path, accounts.hod0, "PATCH", { value: "  80 chars ok  " + "y".repeat(66), revision: current.revision });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.value, "80 chars ok  " + "y".repeat(66), "the value is trimmed");
    assert.equal(ok.body.revision, current.revision + 1);
    assert.equal((await request(runtime.base, path, accounts.hod0, "PATCH", { value: "x".repeat(80) })).status, 200);
  });

  it("a value is stored as plain text and returned unchanged", async () => {
    const markup = "<b>Ward</b> & \"unit\"";
    const response = await request(runtime.base, path, accounts.hod0, "PATCH", { value: markup });
    assert.equal(response.status, 200);
    assert.equal(response.body.value, markup);
  });
});

describe("DELETE /admin/department/labels/:key (AGENTS.md §11)", () => {
  const key = "nav.postings";
  const path = `${endpoint}/${key}`;

  it("unauthenticated 401, wrong owner 403, correct HOD 200, nonexistent key 404", async () => {
    const created = await request(runtime.base, path, accounts.hod0, "PATCH", { value: "Rotations" });
    assert.equal(created.status, 200);
    const other = await request(runtime.base, path, accounts.hod1, "PATCH", { value: "Other department" });
    assert.equal(other.status, 200);
    const otherBefore = await rowsFor(departmentIds[1]);
    for (const [label, caller, route, expected] of [
      ["unauthenticated", undefined, path, 401],
      ["student", accounts.student0, path, 403],
      ["professor", accounts.faculty0, path, 403],
      ["HOD of a mirrored department", mirrorHod, path, 403],
      ["nonexistent key", accounts.hod0, `${endpoint}/nav.nonexistent`, 404],
    ] as const) {
      const response = await request(runtime.base, route, caller, "DELETE", {});
      show(label, "DELETE", route, {}, response);
      assert.equal(response.status, expected, label);
    }
    assert.ok((await rowsFor(departmentIds[0])).some((row) => row.key === key), "nothing was deleted by a rejected call");
    const response = await request(runtime.base, path, accounts.hod0, "DELETE", {});
    show("correct HOD", "DELETE", path, {}, response);
    assert.equal(response.status, 200);
    assert.deepEqual({ reset: response.body.reset, value: response.body.value, override: response.body.override },
      { reset: true, value: DEPARTMENT_LABELS[key].default, override: null });
    assert.ok(!(await rowsFor(departmentIds[0])).some((row) => row.key === key));
    assert.deepEqual(await rowsFor(departmentIds[1]), otherBefore, "department B's rows are unchanged");
  });

  it("a DELETE aimed at department B (query or body) never touches B's rows", async () => {
    const departmentB = departmentIds[1];
    const aimed = "caseLog.caseId";
    const aimedPath = `${endpoint}/${aimed}`;
    // Only B has an override for this key; A (the caller) has none.
    assert.equal((await request(runtime.base, aimedPath, accounts.hod1, "PATCH", { value: "B's case reference" })).status, 200);
    const snapshot = await rowsFor(departmentB);
    const ownBefore = await rowsFor(departmentIds[0]);
    const viaQuery = await request(runtime.base, `${aimedPath}?departmentId=${departmentB}`, accounts.hod0, "DELETE", {});
    show("hod of A aiming a DELETE at department B (query)", "DELETE", `${aimedPath}?departmentId=${departmentB}`, {}, viaQuery);
    assert.equal(viaQuery.status, 200);
    assert.equal(viaQuery.body.reset, false, "A has no override for this key, so nothing was reset");
    assert.deepEqual(await rowsFor(departmentB), snapshot, "department B's rows are unchanged");
    for (const extra of [{ departmentId: departmentB }, { department_id: departmentB }]) {
      const viaBody = await request(runtime.base, aimedPath, accounts.hod0, "DELETE", extra);
      show("hod of A aiming a DELETE at department B (body)", "DELETE", aimedPath, extra, viaBody);
      assert.equal(viaBody.status, 400, "the strict body schema rejects a department field");
      assert.deepEqual(await rowsFor(departmentB), snapshot, "department B's rows are unchanged");
    }
    assert.deepEqual(await rowsFor(departmentIds[0]), ownBefore, "the caller's own rows are unchanged");
    // Both have an override: A's DELETE removes A's row only, whatever it names.
    assert.equal((await request(runtime.base, aimedPath, accounts.hod0, "PATCH", { value: "A's case reference" })).status, 200);
    const both = await request(runtime.base, `${aimedPath}?departmentId=${departmentB}`, accounts.hod0, "DELETE", {});
    assert.equal(both.status, 200);
    assert.equal(both.body.reset, true);
    assert.ok(!(await rowsFor(departmentIds[0])).some((row) => row.key === aimed), "A's own row is gone");
    assert.deepEqual(await rowsFor(departmentB), snapshot, "department B's rows are unchanged");
  });

  it("stale revision is 409; a valid key with no override is 200 with reset false", async () => {
    await request(runtime.base, path, accounts.hod0, "PATCH", { value: "Rotations" });
    const [row] = (await rowsFor(departmentIds[0])).filter((item) => item.key === key);
    const stale = await request(runtime.base, path, accounts.hod0, "DELETE", { revision: row.revision + 3 });
    show("stale revision", "DELETE", path, { revision: row.revision + 3 }, stale);
    assert.equal(stale.status, 409);
    assert.ok((await rowsFor(departmentIds[0])).some((item) => item.key === key));
    assert.equal((await request(runtime.base, path, accounts.hod0, "DELETE", { revision: row.revision })).status, 200);
    const again = await request(runtime.base, path, accounts.hod0, "DELETE", {});
    assert.equal(again.status, 200);
    assert.equal(again.body.reset, false);
  });
});

describe("reading wording", () => {
  it("GET lists every registry key with its default, override and revision, for HODs only", async () => {
    assert.equal((await request(runtime.base, endpoint)).status, 401);
    assert.equal((await request(runtime.base, endpoint, accounts.student0)).status, 403);
    const result = await request(runtime.base, endpoint, accounts.hod0);
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.labels.map((item: any) => item.key), DEPARTMENT_LABEL_KEYS);
    const overridden = result.body.labels.find((item: any) => item.key === "postings.unitTitle");
    assert.equal(overridden.default, "Ward / Posting Unit");
    assert.notEqual(overridden.override, null);
    assert.equal(result.body.labels.find((item: any) => item.key === "caseLog.caseId").override, null);
    assert.equal(result.body.readOnly, false);
    const mirror = await request(runtime.base, endpoint, mirrorHod);
    assert.equal(mirror.status, 200);
    assert.equal(mirror.body.readOnly, true);
  });

  it("the catalog returns overrides only, following the config source, and never another department's rows", async () => {
    const own = await request(runtime.base, `/departments/${departmentIds[0]}/catalog`, accounts.student0);
    assert.equal(own.status, 200);
    assert.deepEqual(Object.keys(own.body.labels), ["postings.unitTitle"]);
    const mirror = await request(runtime.base, `/departments/${mirrorHod.departmentId}/catalog`, mirrorHod);
    assert.equal(mirror.status, 200);
    assert.deepEqual(mirror.body.labels, own.body.labels, "a mirror shows its config source's wording");
    const other = await request(runtime.base, `/departments/${departmentIds[2]}/catalog`, accounts.student2);
    assert.deepEqual(other.body.labels, {});
    assert.equal((await request(runtime.base, `/departments/${departmentIds[1]}/catalog`, accounts.student0)).status, 403);
  });
});

describe("the milestone defaults follow the same effective wording flag the catalog computes", () => {
  const byKey = (body: any, key: string) => body.labels.find((item: any) => item.key === key);

  it("flag off: the two milestone labels keep their generic defaults", async () => {
    const result = await request(runtime.base, endpoint, accounts.hod0);
    for (const [key, expected] of [["milestones.pageTitle", "Thesis & certifications"], ["nav.milestones", "Thesis & Certifications"]]) {
      const item = byKey(result.body, key);
      assert.deepEqual([item.value, item.default, item.override], [expected, expected, null], key);
    }
  });

  it("flag set in the stored config: value and default are the mandatory-certifications wording", async () => {
    const departmentId = departmentIds[2];
    await db.update(departmentConfigsTable).set({ enabledFeatures: { procedureExperience: true, useThesisAndMandatoryCertificationsLabel: true } })
      .where(eq(departmentConfigsTable.departmentId, departmentId));
    try {
      const result = await request(runtime.base, endpoint, accounts.hod2);
      const catalog = await request(runtime.base, `/departments/${departmentId}/catalog`, accounts.hod2);
      assert.equal(catalog.body.config.enabledFeatures.useThesisAndMandatoryCertificationsLabel, true, "the catalog sees the flag on");
      for (const key of ["milestones.pageTitle", "nav.milestones"]) {
        const item = byKey(result.body, key);
        assert.deepEqual([item.value, item.default, item.override], ["Thesis and mandatory certifications", "Thesis and mandatory certifications", null], key);
      }
      // Other keys are unaffected by the flag.
      assert.equal(byKey(result.body, "nav.postings").default, "Postings & Rotations");
      // An override wins, and the default beside it still follows the flag.
      const written = await request(runtime.base, `${endpoint}/nav.milestones`, accounts.hod2, "PATCH", { value: "Thesis (renamed)" });
      assert.deepEqual([written.body.value, written.body.default, written.body.override], ["Thesis (renamed)", "Thesis and mandatory certifications", "Thesis (renamed)"]);
      const reset = await request(runtime.base, `${endpoint}/nav.milestones`, accounts.hod2, "DELETE", {});
      assert.deepEqual([reset.body.value, reset.body.default, reset.body.override], ["Thesis and mandatory certifications", "Thesis and mandatory certifications", null]);
    } finally {
      await db.update(departmentConfigsTable).set({ enabledFeatures: { procedureExperience: true } })
        .where(eq(departmentConfigsTable.departmentId, departmentId));
    }
  });

  it("a department with no stored flag that the catalog treats as mandatory-certifications gets the same defaults", async () => {
    // No config row at all, and a name the catalog's existing defaults act on. The label route adds no name check of its own:
    // it asks the same feature helper the other routes use, so it agrees with the catalog.
    const [department] = await db.insert(departmentsTable).values({ name: "Parity Microbiology", code: "LABEL-PARITY",
      collegeId: await getTestCollegeId() }).returning();
    const hod = await mintAccount(department.id, "label-parity-hod@example.test");
    const catalog = await request(runtime.base, `/departments/${department.id}/catalog`, hod);
    assert.equal(catalog.status, 200);
    assert.equal(catalog.body.config.enabledFeatures.useThesisAndMandatoryCertificationsLabel, true, "the catalog computes the flag on");
    const result = await request(runtime.base, endpoint, hod);
    assert.equal(result.status, 200);
    for (const key of ["milestones.pageTitle", "nav.milestones"]) {
      const item = byKey(result.body, key);
      assert.deepEqual([item.value, item.default, item.override], ["Thesis and mandatory certifications", "Thesis and mandatory certifications", null], key);
    }
    const written = await request(runtime.base, `${endpoint}/milestones.pageTitle`, hod, "PATCH", { value: "Thesis (renamed)" });
    assert.equal(written.body.default, "Thesis and mandatory certifications");
  });
});

describe("migration backfill (PGlite, test data only)", () => {
  const migrationSql = async () => readFile(new URL("../../../lib/db/migrations/0034_department_label_overrides.sql", import.meta.url), "utf8");
  // The backfill and name fix are everything after the table DDL.
  const backfillSql = async () => {
    const sql = await migrationSql();
    const start = sql.indexOf("-- Radiology:");
    // A missing marker must fail the test, not silently run the whole file (or nothing).
    assert.notEqual(start, -1, "the '-- Radiology:' marker is missing from 0034_department_label_overrides.sql; the backfill slice cannot be found");
    const slice = sql.slice(start);
    assert.match(slice, /INSERT INTO department_label_overrides/, "the slice must contain the backfill inserts");
    assert.doesNotMatch(slice, /CREATE TABLE/i, "the slice must not contain the table DDL");
    return slice;
  };
  const snapshot = async (database: PGlite) => (await database.query<any>(
    "SELECT d.name, o.key, o.value, o.revision FROM department_label_overrides o JOIN departments d ON d.id = o.department_id ORDER BY d.code, o.key")).rows;

  // The departments the developer's read-only query returned (2026-11-23), with the same ids, names,
  // codes, test flags and config sources, plus Pediatrics (id 1) as a generic department. The two
  // real Dermatology departments share the code DERM, so they sit in different colleges here
  // (the unique index is per college).
  async function seeded() {
    const database = new PGlite();
    await applyMigrations(migrationConnection(database));
    await database.exec(`INSERT INTO colleges (name, code) VALUES ('Second test college', 'second-test-college');
      INSERT INTO departments (id, name, code, is_test, config_source_department_id, college_id) VALUES
      (1, 'Pediatrics', 'PEDS', false, NULL, (SELECT id FROM colleges WHERE code = 'kannur-medical-college')),
      (14, 'MicroBiology', 'MIC', false, NULL, (SELECT id FROM colleges WHERE code = 'kannur-medical-college')),
      (15, 'Dermatology', 'DERM', false, NULL, (SELECT id FROM colleges WHERE code = 'kannur-medical-college')),
      (18, 'Radiology', 'RED', false, NULL, (SELECT id FROM colleges WHERE code = 'kannur-medical-college')),
      (19, 'Radiology (Test)', 'TEST-18', true, 18, (SELECT id FROM colleges WHERE code = 'kannur-medical-college')),
      (24, 'MicroBiology (Test)', 'TEST-14', true, 14, (SELECT id FROM colleges WHERE code = 'kannur-medical-college')),
      (26, 'Dermatology (Test)', 'TEST-15', true, 15, (SELECT id FROM colleges WHERE code = 'kannur-medical-college')),
      (38, 'Dermatology', 'DERM', false, NULL, (SELECT id FROM colleges WHERE code = 'second-test-college')),
      (39, 'Dermatology (Test)', 'TEST-38', true, 38, (SELECT id FROM colleges WHERE code = 'second-test-college'))`);
    return database;
  }
  const labelsById = async (database: PGlite) => {
    const rows = (await database.query<any>("SELECT department_id, key, value FROM department_label_overrides ORDER BY department_id, key")).rows;
    const result: Record<number, Record<string, string>> = {};
    for (const row of rows) (result[row.department_id] ??= {})[row.key] = row.value;
    return result;
  };

  it("writes the exact label rows per department, fixes the name, leaves other departments alone, and is idempotent", async () => {
    const database = await seeded();
    try {
      // The migrations ran on an empty database, so the backfill itself is run explicitly here.
      await database.exec(await backfillSql());
      const rows = await snapshot(database);
      const labels = await labelsById(database);
      const derm = { "postings.unitTitle": "Posting unit", "postings.unitPhrase": "posting unit",
        "postings.settingsSection": "Postings", "postings.settingsNoun": "Postings" };
      assert.deepEqual(labels[18], { "postings.unitTitle": "Posting", "postings.unitPhrase": "posting", "postings.printColumn": "Posting",
        "postings.settingsSection": "Postings", "postings.settingsNoun": "Postings" }, "Radiology");
      assert.deepEqual(labels[15], derm, "Dermatology 15");
      assert.deepEqual(labels[38], derm, "the second real Dermatology, 38");
      assert.deepEqual(labels[14], { "milestones.pageTitle": "Thesis and mandatory certifications" }, "Microbiology, code MIC");
      // Test copies and generic departments get no rows. A test copy resolves to its config source at read time.
      for (const id of [1, 19, 24, 26, 39]) assert.equal(labels[id], undefined, `department ${id} gets no rows`);
      assert.deepEqual(Object.keys(labels).map(Number), [14, 15, 18, 38]);
      assert.equal(rows.length, 5 + 4 + 4 + 1);
      const names = Object.fromEntries((await database.query<any>("SELECT id, name FROM departments ORDER BY id")).rows.map((row) => [row.id, row.name]));
      assert.equal(names[14], "Microbiology");
      assert.equal(names[24], "Microbiology (Test)");
      assert.deepEqual([names[1], names[15], names[18], names[19], names[26], names[38], names[39]],
        ["Pediatrics", "Dermatology", "Radiology", "Radiology (Test)", "Dermatology (Test)", "Dermatology", "Dermatology (Test)"], "other names unchanged");

      await database.exec(await backfillSql());
      assert.deepEqual(await snapshot(database), rows, "re-running changes nothing");
      assert.equal((await database.query<any>("SELECT name FROM departments WHERE id = 14")).rows[0].name, "Microbiology");
    } finally { await database.close(); }
  });

  it("a department's id is not enough on its own: an id that holds some other department gets no rows", async () => {
    const database = await seeded();
    try {
      await database.exec("UPDATE departments SET name = 'Pediatric Surgery', code = 'PSURG' WHERE id = 18");
      await database.exec(await backfillSql());
      assert.equal((await labelsById(database))[18], undefined);
    } finally { await database.close(); }
  });

  it("the same name guard holds for the Dermatology ids 15 and 38 and the Microbiology id 14: a matching id holding a different name gets no rows", async () => {
    // The rows each id gets when nothing is renamed (same as the first backfill test).
    const dermRows = { "postings.unitTitle": "Posting unit", "postings.unitPhrase": "posting unit",
      "postings.settingsSection": "Postings", "postings.settingsNoun": "Postings" };
    const expectedById: Record<number, Record<string, string>> = {
      14: { "milestones.pageTitle": "Thesis and mandatory certifications" },
      15: dermRows,
      18: { "postings.unitTitle": "Posting", "postings.unitPhrase": "posting", "postings.printColumn": "Posting",
        "postings.settingsSection": "Postings", "postings.settingsNoun": "Postings" },
      38: dermRows,
    };
    for (const id of [15, 38, 14]) {
      const database = await seeded();
      try {
        await database.exec(`UPDATE departments SET name = 'Pediatric Surgery', code = 'PSURG${id}' WHERE id = ${id}`);
        await database.exec(await backfillSql());
        const labels = await labelsById(database);
        assert.equal(labels[id], undefined, `id ${id} holds a different name, so it gets no rows`);
        // The guard is per id, not global: the other three ids still get exactly the rows (key and value) they get when nothing is renamed.
        const expectedOthers = [14, 15, 18, 38].filter((other) => other !== id);
        assert.deepEqual(Object.keys(labels).map(Number), expectedOthers, `only the unrenamed ids get rows (renamed ${id})`);
        for (const other of expectedOthers) {
          assert.deepEqual(labels[other], expectedById[other], `department ${other} keeps exactly its rows (renamed ${id})`);
        }
      } finally { await database.close(); }
    }
  });

  it("does not overwrite an override that already exists, and fixes only the first match", async () => {
    const database = await seeded();
    try {
      await database.exec(`INSERT INTO department_label_overrides (department_id, key, value, revision)
        SELECT id, 'postings.unitTitle', 'Chosen by the HOD', 4 FROM departments WHERE id = 18`);
      await database.exec(`INSERT INTO departments (id, name, code, college_id) VALUES (90, 'MICROBIOLOGY and microbiology', 'MB2', (SELECT id FROM colleges WHERE code = 'kannur-medical-college'))`);
      await database.exec(await backfillSql());
      const row = (await database.query<any>("SELECT value, revision FROM department_label_overrides WHERE department_id = 18 AND key = 'postings.unitTitle'")).rows[0];
      assert.deepEqual(row, { value: "Chosen by the HOD", revision: 4 });
      assert.equal((await database.query<any>("SELECT name FROM departments WHERE code = 'MB2'")).rows[0].name, "Microbiology and microbiology");
    } finally { await database.close(); }
  });
});
