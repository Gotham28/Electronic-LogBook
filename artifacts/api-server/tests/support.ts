import { randomBytes } from "node:crypto";
import { once } from "node:events";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { applyMigrations } from "../../../lib/db/src/migrations.js";
import { engine, migrationConnection, db, departmentsTable, usersTable, studentsTable, departmentConfigsTable,
  procedureTypesTable, departmentCatalogTable } from "./database.js";

process.env.JWT_SECRET = randomBytes(48).toString("hex");
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";
// Tests capture outbound codes; this transport is never part of the application bundle.
export const mail = new Map<string, string>();
nodemailer.createTransport = (() => ({ sendMail: async (message: any) => {
  mail.set(message.to, message.text.match(/\b\d{6}\b/)[0]);
  return { accepted: [message.to] };
} })) as any;

export const password = "Test-only-pass-492!";
export type Account = { id: number; departmentId: number; role: string; email: string; token: string; studentId?: number };
export const accounts: Record<string, Account> = {};
export const departmentIds: number[] = [];

export async function setup() {
  await applyMigrations(migrationConnection(engine));
  const hash = await bcrypt.hash(password, 10);
  // Synthetic data only. Names are test fixtures, never application defaults.
  for (const [index, name] of ["Pediatrics", "Dermatology", "Cardiology"].entries()) {
    const [department] = await db.insert(departmentsTable).values({ name, code: "TEST-" + index }).returning();
    departmentIds.push(department.id);
    await db.insert(departmentConfigsTable).values({ departmentId: department.id, requiredCases: 7 + index,
      requiredProcedures: 11 + index, requiredAcademic: 3 + index, programDurationMonths: 24 + index,
      casualLeaveAllowance: 9 + index, academicLeaveAllowance: 4 + index });
    await db.insert(procedureTypesTable).values({ departmentId: department.id, name: "Test procedure " + index, group: "Test group " + index, required: 2 + index });
    await db.insert(departmentCatalogTable).values([
      { departmentId: department.id, kind: "posting", name: "Test unit " + index, value: "unit-" + index },
      { departmentId: department.id, kind: "academic", name: "Test discussion " + index, value: "discussion-" + index, required: 3 + index },
    ]);
    for (const kind of ["hod", "faculty", "faculty2", "student", "student2", "pending"] as const) {
      const role = kind.startsWith("faculty") ? "professor" : kind === "hod" ? "hod" : "student";
      const [user] = await db.insert(usersTable).values({ fullName: name + " Test " + kind, email: kind + index + "@example.test",
        role, status: kind === "pending" ? "pending" : "approved", departmentId: department.id, passwordHash: hash }).returning();
      const record: Account = { id: user.id, email: user.email, role, departmentId: department.id,
        token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
      if (role === "student") {
        const [student] = await db.insert(studentsTable).values({ userId: user.id, batch: "2026",
          registrationNumber: "TEST-" + user.id, kuhsId: "UNIV-" + user.id, specialty: name, dateOfJoining: "2026-01-01" }).returning();
        record.studentId = student.id;
      }
      accounts[kind + index] = record;
    }
  }
  const { default: app } = await import("../src/app.js");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  return { server, base: "http://127.0.0.1:" + address.port };
}

export async function request(base: string, path: string, account?: Account, method = "GET", body?: unknown, extraHeaders = {}) {
  const response = await fetch(base + "/api" + path, {
    method, headers: { ...(account ? { Authorization: "Bearer " + account.token } : {}),
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
