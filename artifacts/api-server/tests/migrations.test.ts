import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../../../lib/db/src/migrations.js";
import { migrationConnection } from "./database.js";

const baseline = () => readFile(new URL("../../../lib/db/migrations/0001_baseline.sql", import.meta.url), "utf8");

test("fresh installation and rerunning migrations are safe and checksum-tracked", async () => {
  const database = new PGlite();
  try {
    await applyMigrations(migrationConnection(database));
    await applyMigrations(migrationConnection(database));
    assert.equal((await database.query("SELECT * FROM elogbook_migrations")).rows.length, 3);
    assert.equal((await database.query("SELECT * FROM departments")).rows.length, 0);
    assert.equal((await database.query("SELECT * FROM assignment_recipients")).rows.length, 0);
    await database.query("UPDATE elogbook_migrations SET checksum = 'tampered' WHERE name = '0002_departments_assignments.sql'");
    await assert.rejects(applyMigrations(migrationConnection(database)), /checksum differs/);
  } finally { await database.close(); }
});

test("legacy migration preserves users, requirements and logs and backfills catalog from actual records", async () => {
  const database = new PGlite();
  try {
    await database.exec(await baseline());
    await database.exec(`
      INSERT INTO departments (name, code) VALUES ('Legacy department', 'LEGACY');
      INSERT INTO users (full_name, email, role, status, department_id) VALUES
        ('Legacy HOD', 'HOD@Example.Test', 'hod', 'approved', 1),
        ('Legacy faculty', 'faculty@example.test', 'professor', 'approved', 1),
        ('Legacy student', 'student@example.test', 'student', 'approved', 1);
      INSERT INTO students (user_id, batch, registration_number, date_of_joining, kuhs_id, specialty)
        VALUES (3, '2025', 'LEGACY-REG', '2025-01-01', 'LEGACY-UNIV', 'Legacy department');
      INSERT INTO department_configs (department_id, required_cases, required_procedures, required_academic) VALUES (1, 99, 87, 31);
      INSERT INTO postings (student_id, ward, start_date, end_date, supervisor_id) VALUES (1, 'Existing unit', '2025-01-01', '2025-01-03', 2);
      INSERT INTO academic_logs (student_id, activity_type, topic, date, supervisor_id) VALUES (1, 'Existing activity', 'Preserved topic', '2025-01-01', 2);
      INSERT INTO procedure_logs (student_id, procedure_group, procedure_name, date, patient_uhid, patient_age, competency_level, supervisor_id)
        VALUES (1, 'Existing group', 'Existing procedure', '2025-01-01', 'SYNTHETIC', 'Adult', 'observed', 2);
      INSERT INTO research (student_id, thesis_title, protocol_status) VALUES (1, 'Preserved thesis', 'approved');
    `);
    await assert.rejects(applyMigrations(migrationConnection(database)), /adopt-existing/);
    await applyMigrations(migrationConnection(database), true);
    assert.equal((await database.query("SELECT * FROM users")).rows.length, 3);
    assert.equal((await database.query<any>("SELECT * FROM users WHERE id=1")).rows[0].email, "hod@example.test");
    assert.equal((await database.query<any>("SELECT * FROM department_configs")).rows[0].required_cases, 99);
    assert.equal((await database.query<any>("SELECT * FROM department_configs")).rows[0].program_duration_months, null);
    assert.equal((await database.query<any>("SELECT * FROM academic_logs")).rows[0].topic, "Preserved topic");
    assert.equal((await database.query<any>("SELECT * FROM research")).rows[0].protocol_status, "approved");
    assert.equal((await database.query<any>("SELECT * FROM department_catalog")).rows.length, 2);
    assert.equal((await database.query<any>("SELECT * FROM procedure_types")).rows[0].name, "Existing procedure");
    await applyMigrations(migrationConnection(database), true);
    assert.equal((await database.query("SELECT * FROM procedure_types")).rows.length, 1);
  } finally { await database.close(); }
});

test("ambiguous legacy memberships and duplicate HODs abort the entire migration without deleting records", async () => {
  const database = new PGlite();
  try {
    await database.exec(await baseline());
    await database.exec("INSERT INTO users (full_name, email, role) VALUES ('Unassigned', 'unassigned@example.test', 'student')");
    await assert.rejects(applyMigrations(migrationConnection(database), true), /Assign every/);
    assert.equal((await database.query("SELECT * FROM users")).rows.length, 1);
    assert.equal((await database.query<any>("SELECT to_regclass('assignment_types') AS table_name")).rows[0].table_name, null);
    assert.equal((await database.query<any>("SELECT to_regclass('elogbook_migrations') AS table_name")).rows[0].table_name, null);
    await database.exec(`
      INSERT INTO departments (name, code) VALUES ('Mapped department', 'MAPPED');
      UPDATE users SET department_id = 1;
      INSERT INTO users (full_name, email, role, status, department_id) VALUES
        ('HOD one', 'one@example.test', 'hod', 'approved', 1), ('HOD two', 'two@example.test', 'hod', 'approved', 1);
    `);
    await assert.rejects(applyMigrations(migrationConnection(database), true), /multiple approved HODs/);
    assert.equal((await database.query("SELECT * FROM users")).rows.length, 3);
  } finally { await database.close(); }
});
