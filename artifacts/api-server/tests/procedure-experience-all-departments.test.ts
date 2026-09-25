/**
 * Tests for migration 0011 (procedureExperience on for every department).
 *
 * Migration-level tests use isolated PGlite instances.
 * Provisioning and admin-route tests use the shared setup() and server.
 *
 * Approach for migration fixture tests:
 *   Apply migrations 0001-0010 manually to a fresh PGlite (bypassing the runner
 *   so 0011 has not yet run). Insert fixtures in the pre-0011 shape. Execute the
 *   0011 SQL text directly and assert the post-migration state. Run 0011 again to
 *   verify idempotency.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../../../lib/db/src/migrations.js";
import { setup, request, accounts as a } from "./support.js";
import { engine, db, migrationConnection, departmentsTable, departmentConfigsTable, departmentCatalogTable } from "./database.js";
import { eq } from "drizzle-orm";
import { provisionDepartment } from "../src/lib/department-provisioning.js";

const migrationsBaseUrl = new URL("../../../lib/db/migrations/", import.meta.url);

/** Apply migrations 0001-0010 only, to a fresh PGlite, outside the runner. */
async function applyMigrationsUpTo0010(database: PGlite): Promise<void> {
  const names = [
    "0001_baseline.sql",
    "0002_departments_assignments.sql",
    "0003_subscriptions_payments.sql",
    "0004_mirror_test_department.sql",
    "0005_case_log_category.sql",
    "0006_department_config_nullable_and_features.sql",
    "0007_conferences.sql",
    "0008_leave_allowance_restructure.sql",
    "0009_review_status.sql",
    "0010_quarterly_appraisal_scores.sql",
  ];
  for (const name of names) {
    const sql = await readFile(new URL(name, migrationsBaseUrl), "utf8");
    await database.exec(sql);
  }
}

// ─── Migration registration check ─────────────────────────────────────────

test("0011 is registered in the runner and runs through applyMigrations on a fresh PGlite", async () => {
  const database = new PGlite();
  try {
    await applyMigrations(migrationConnection(database));
    const { rows } = await database.query<{ name: string }>(
      "SELECT name FROM elogbook_migrations WHERE name = '0011_procedure_experience_all_departments.sql'"
    );
    assert.equal(rows.length, 1, "0011 must appear in elogbook_migrations");
  } finally {
    await database.close();
  }
});

// ─── Migration effect tests ────────────────────────────────────────────────

test("0011: every real department gets procedureExperience:true, test department untouched", async () => {
  const database = new PGlite();
  try {
    await applyMigrationsUpTo0010(database);

    // Fixtures (serial IDs will be 1, 2, 3, 4 in order):
    //   1 = real, config row with other key, existing levels → levels not re-seeded
    //   2 = real, no config row                              → row created, 4 levels inserted
    //   3 = real, config row with explicit procedureExperience:false → overwritten to true
    //   4 = test/mirror, config row with {}                 → untouched
    await database.exec(`
      INSERT INTO departments (name, code) VALUES
        ('Dept-Other-Keys',    'D-WOK'),
        ('Dept-No-Config',     'D-NC'),
        ('Dept-Explicit-False','D-EF'),
        ('Dept-Test',          'D-TST');
      UPDATE departments SET is_test = true WHERE code = 'D-TST';

      INSERT INTO department_configs (department_id, enabled_features) VALUES
        (1, '{"attendedConferences": true}'::jsonb),
        (3, '{"procedureExperience": false}'::jsonb),
        (4, '{}'::jsonb);

      INSERT INTO department_catalog (department_id, kind, name, value, required, period) VALUES
        (1, 'competency_level', 'Pre-existing Level', 'pre_existing', 0, 'total');
    `);

    const sql0011 = await readFile(new URL("0011_procedure_experience_all_departments.sql", migrationsBaseUrl), "utf8");
    await database.exec(sql0011);

    // Dept 1: procedureExperience:true AND attendedConferences preserved.
    const { rows: d1 } = await database.query<{ enabled_features: any }>(
      "SELECT enabled_features FROM department_configs WHERE department_id = 1"
    );
    assert.equal(d1.length, 1, "dept 1 config row must exist");
    assert.equal((d1[0].enabled_features as Record<string, boolean>).procedureExperience, true,
      "dept 1: procedureExperience must be true");
    assert.equal((d1[0].enabled_features as Record<string, boolean>).attendedConferences, true,
      "dept 1: attendedConferences must be preserved");

    // Dept 2: config row created, procedureExperience:true.
    const { rows: d2 } = await database.query<{ enabled_features: any }>(
      "SELECT enabled_features FROM department_configs WHERE department_id = 2"
    );
    assert.equal(d2.length, 1, "dept 2 must have a config row after 0011");
    assert.equal((d2[0].enabled_features as Record<string, boolean>).procedureExperience, true,
      "dept 2: procedureExperience must be true");

    // Dept 3: explicit false overwritten.
    const { rows: d3 } = await database.query<{ enabled_features: any }>(
      "SELECT enabled_features FROM department_configs WHERE department_id = 3"
    );
    assert.equal(d3.length, 1);
    assert.equal((d3[0].enabled_features as Record<string, boolean>).procedureExperience, true,
      "dept 3: explicit false must be overwritten to true");

    // Dept 4 (test): config row untouched.
    const { rows: d4 } = await database.query<{ enabled_features: any }>(
      "SELECT enabled_features FROM department_configs WHERE department_id = 4"
    );
    assert.equal(d4.length, 1, "test dept config must still exist");
    assert.equal((d4[0].enabled_features as Record<string, boolean>).procedureExperience, undefined,
      "test dept: procedureExperience must NOT be set");

    // Dept 1: exactly 1 level (pre-existing), not duplicated.
    const { rows: l1 } = await database.query<{ value: string }>(
      "SELECT value FROM department_catalog WHERE department_id = 1 AND kind = 'competency_level'"
    );
    assert.equal(l1.length, 1, "dept 1 must have exactly the one pre-existing level");
    assert.equal(l1[0].value, "pre_existing");

    // Dept 2: four default levels inserted.
    const { rows: l2 } = await database.query<{ value: string }>(
      "SELECT value FROM department_catalog WHERE department_id = 2 AND kind = 'competency_level' ORDER BY value"
    );
    assert.equal(l2.length, 4, "dept 2 must have exactly 4 default levels");
    assert.deepEqual(
      l2.map(r => r.value),
      ["assisted", "observed", "performed_independently", "performed_under_supervision"]
    );

    // Dept 3: four default levels inserted.
    const { rows: l3 } = await database.query<{ value: string }>(
      "SELECT value FROM department_catalog WHERE department_id = 3 AND kind = 'competency_level' ORDER BY value"
    );
    assert.equal(l3.length, 4, "dept 3 must have exactly 4 default levels");

    // Dept 4 (test): no levels.
    const { rows: l4 } = await database.query(
      "SELECT id FROM department_catalog WHERE department_id = 4 AND kind = 'competency_level'"
    );
    assert.equal(l4.length, 0, "test dept must have no competency_level rows");

  } finally {
    await database.close();
  }
});

test("0011 idempotency: running twice produces identical results", async () => {
  const database = new PGlite();
  try {
    await applyMigrationsUpTo0010(database);

    await database.exec(`
      INSERT INTO departments (name, code) VALUES ('Dept-A', 'IDEMP-A'), ('Dept-B', 'IDEMP-B');
      INSERT INTO department_configs (department_id, enabled_features)
        VALUES (1, '{"attendedConferences": true}'::jsonb);
    `);

    const sql0011 = await readFile(new URL("0011_procedure_experience_all_departments.sql", migrationsBaseUrl), "utf8");

    await database.exec(sql0011);
    const { rows: after1configs } = await database.query(
      "SELECT department_id, enabled_features FROM department_configs ORDER BY department_id"
    );
    const { rows: after1catalog } = await database.query(
      "SELECT department_id, kind, value FROM department_catalog ORDER BY department_id, value"
    );

    await database.exec(sql0011);
    const { rows: after2configs } = await database.query(
      "SELECT department_id, enabled_features FROM department_configs ORDER BY department_id"
    );
    const { rows: after2catalog } = await database.query(
      "SELECT department_id, kind, value FROM department_catalog ORDER BY department_id, value"
    );

    assert.deepEqual(after1configs, after2configs, "config rows must be identical after running 0011 twice");
    assert.deepEqual(after1catalog, after2catalog, "catalog rows must be identical after running 0011 twice");
  } finally {
    await database.close();
  }
});

test("0011 column default: config row inserted without enabled_features gets procedureExperience:true", async () => {
  const database = new PGlite();
  try {
    await applyMigrationsUpTo0010(database);
    const sql0011 = await readFile(new URL("0011_procedure_experience_all_departments.sql", migrationsBaseUrl), "utf8");
    await database.exec(sql0011);

    // After step 1 sets the default, a new row inserted without enabled_features uses it.
    await database.exec(`
      INSERT INTO departments (name, code) VALUES ('New Dept', 'NEW-POST-0010');
      INSERT INTO department_configs (department_id) VALUES (1);
    `);

    const { rows } = await database.query<{ enabled_features: any }>(
      "SELECT enabled_features FROM department_configs WHERE department_id = 1"
    );
    assert.equal(rows.length, 1);
    assert.equal((rows[0].enabled_features as Record<string, boolean>).procedureExperience, true,
      "column default after 0011 must produce procedureExperience:true");
  } finally {
    await database.close();
  }
});

// ─── Provisioning and admin route tests ───────────────────────────────────
// A single before/after wraps both describe blocks to avoid calling setup() twice.

let server: any;
let base: string;

before(async () => {
  const initialized = await setup();
  server = initialized.server;
  base = initialized.base;
});

after(() => {
  if (server) server.close();
});

describe("provisioning: procedureExperience default behaviour", () => {

  test("department provisioned without setup.config gets procedureExperience:true from column default", async () => {
    const input = {
      name: "Prov No Config",
      code: "PROV-NC",
      hod: { fullName: "HOD NC", email: "nc-hod@example.com" }
    };
    const result = await provisionDepartment(input, "SecurePass123!");

    const [cfg] = await db
      .select({ enabledFeatures: departmentConfigsTable.enabledFeatures })
      .from(departmentConfigsTable)
      .where(eq(departmentConfigsTable.departmentId, result.departmentId));

    assert.ok(cfg, "config row must exist");
    assert.equal(
      (cfg.enabledFeatures as Record<string, boolean>).procedureExperience,
      true,
      "departmentId-only insert must have procedureExperience:true from column default"
    );
  });

  test("setup.config omitting procedureExperience key gets true from merge", async () => {
    const input = {
      name: "Prov Omit Key",
      code: "PROV-OK",
      hod: { fullName: "HOD OK", email: "ok-hod@example.com" },
      config: { enabledFeatures: { attendedConferences: true } }
    };
    const result = await provisionDepartment(input, "SecurePass123!");

    const [cfg] = await db
      .select({ enabledFeatures: departmentConfigsTable.enabledFeatures })
      .from(departmentConfigsTable)
      .where(eq(departmentConfigsTable.departmentId, result.departmentId));

    assert.equal((cfg.enabledFeatures as Record<string, boolean>).procedureExperience, true);
    assert.equal((cfg.enabledFeatures as Record<string, boolean>).attendedConferences, true,
      "other keys must be preserved");
  });

  test("setup.config with explicit procedureExperience:false stays false (spread overrides default)", async () => {
    const input = {
      name: "Prov Explicit False",
      code: "PROV-EF",
      hod: { fullName: "HOD EF", email: "ef-hod@example.com" },
      config: { enabledFeatures: { procedureExperience: false } }
    };
    const result = await provisionDepartment(input, "SecurePass123!");

    const [cfg] = await db
      .select({ enabledFeatures: departmentConfigsTable.enabledFeatures })
      .from(departmentConfigsTable)
      .where(eq(departmentConfigsTable.departmentId, result.departmentId));

    assert.equal((cfg.enabledFeatures as Record<string, boolean>).procedureExperience, false,
      "explicit false in setup config must override the true default");
  });
});

describe("admin.ts insert branch: procedureExperience default", () => {

  test("POST /admin/department/config without enabledFeatures yields procedureExperience:true", async () => {
    // HOD 2's department has a config row from setup(). Delete it so the insert branch fires.
    const deptId = a.hod2.departmentId;
    await db.delete(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, deptId));

    const res = await request(base, "/admin/department/config", a.hod2, "POST", {});
    assert.equal(res.status, 200, "POST without enabledFeatures must return 200");
    assert.equal(
      (res.body as { enabledFeatures: Record<string, boolean> }).enabledFeatures.procedureExperience,
      true,
      "insert without enabledFeatures must produce procedureExperience:true"
    );
  });

  test("POST /admin/department/config with enabledFeatures:{procedureExperience:false} keeps false", async () => {
    // The config row for hod2's department was just inserted in the previous test.
    // Delete it again so the insert branch fires, not the update branch.
    const deptId = a.hod2.departmentId;
    await db.delete(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, deptId));

    const res = await request(base, "/admin/department/config", a.hod2, "POST", {
      enabledFeatures: { procedureExperience: false }
    });
    assert.equal(res.status, 200);
    assert.equal(
      (res.body as { enabledFeatures: Record<string, boolean> }).enabledFeatures.procedureExperience,
      false,
      "explicit false in body must override the true default"
    );
  });
});
