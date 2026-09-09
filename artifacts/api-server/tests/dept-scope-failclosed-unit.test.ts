// Evidence Gate H (docs/SECURITY_FIXES.md sec 8) — SEC-06, unit-level.
//
// The null-departmentId case cannot be produced over HTTP - proved in the sibling file,
// dept-scope-failclosed.test.ts, across three independent layers (requireDepartment,
// studentAccess's own SQL equality check, and the users_department_required CHECK
// constraint on usersTable). That is exactly why the three-line fix's only purpose is to
// keep working the day one of those layers is removed - and exactly why it must be
// tested at the level it actually lives at, not through the stack that currently makes
// it unreachable.
//
// This file calls each of the three fixed handlers DIRECTLY, pulled out of the real,
// unmodified router via Express's own route.stack, with a hand-built req/res and no
// server, no middleware, no requireDepartment, no studentAccess. Nothing about those
// three layers is touched, removed, or weakened anywhere in this file - the mock simply
// stands where they would have stood.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { IRouter } from "express";

// student.ts pulls in middlewares/auth.js, which reads JWT_SECRET at import time
// (lib/env.ts) and throws if it is unset. Every other test file gets this for free by
// importing support.ts first, which sets it before anything imports the app; this file
// imports the router directly, so it must be set here, before that import runs.
process.env.JWT_SECRET ??= "dept-scope-unit-test-secret";

const { default: studentRouter } = await import("../src/routes/student.js");
const { db } = await import("./database.js");

type Handler = (req: any, res: any) => unknown;

// Express stores each router.get/post(path, ...middleware, handler) registration as one
// layer in router.stack, with its own middleware chain in layer.route.stack. The actual
// terminal handler - never requireAuth, requireRole, or validate - is always the last
// entry, regardless of how many middleware precede it.
function getHandler(router: IRouter, method: "get" | "post", path: string): Handler {
  const layer = (router as any).stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method],
  );
  if (!layer) throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
  const chain = layer.route.stack;
  return chain[chain.length - 1].handle;
}

function mockRes() {
  return {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}

// A minimal stand-in for drizzle's chainable query builder: every chain method returns
// itself, and it resolves (via `then`) to a fixed row set when awaited.
function fakeRows(rows: unknown[]) {
  const builder: any = {
    from() { return builder; }, innerJoin() { return builder; }, leftJoin() { return builder; },
    where() { return builder; }, orderBy() { return builder; }, limit() { return builder; },
    then(resolve: (v: unknown[]) => void) { resolve(rows); },
  };
  return builder;
}

test("SEC-06 unit: GET /:studentId/leave-balance - null departmentId returns 403 without touching the database", async () => {
  const handler = getHandler(studentRouter, "get", "/:studentId/leave-balance");
  let queried = false;
  const originalSelect = db.select;
  (db as any).select = (...args: unknown[]) => { queried = true; throw new Error("UNEXPECTED QUERY: the department guard did not fire before querying"); };
  try {
    const req = { params: { studentId: "1" }, user: { id: 99, role: "professor", departmentId: null, sessionVersion: 0 }, log: { error() {} } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(queried, false, "db.select must never be called when departmentId is null");
    assert.equal(res.statusCode, 403);
  } finally {
    (db as any).select = originalSelect;
  }
});

test("SEC-06 unit: GET /:studentId/assessments - null departmentId returns 403 without touching the database", async () => {
  const handler = getHandler(studentRouter, "get", "/:studentId/assessments");
  let queried = false;
  const originalSelect = db.select;
  (db as any).select = (...args: unknown[]) => { queried = true; throw new Error("UNEXPECTED QUERY: the department guard did not fire before querying"); };
  try {
    const req = { params: { studentId: "1" }, user: { id: 99, role: "hod", departmentId: null, sessionVersion: 0 }, log: { error() {} } };
    const res = mockRes();
    await handler(req, res);
    assert.equal(queried, false, "db.select must never be called when departmentId is null");
    assert.equal(res.statusCode, 403);
  } finally {
    (db as any).select = originalSelect;
  }
});

test("SEC-06 unit: POST /:studentId/assessments - null departmentId returns 403 without ever inserting", async () => {
  const handler = getHandler(studentRouter, "post", "/:studentId/assessments");
  // Unlike the two GET routes, this handler's own design must resolve the target
  // student's existence and department BEFORE it can compare - the department check is
  // necessarily the third step here, not the first. That is unchanged by this fix and
  // out of this batch's scope. What must never happen is the INSERT: the actual
  // state-changing action a null-department caller must not reach. The two reads are
  // stubbed with plausible, ordinary data (a real student, in some other real
  // department) precisely so the test proves the guard rejects on professorDeptId
  // alone, not because the stubbed data happened to already look wrong.
  let selectCalls = 0;
  let inserted = false;
  const originalSelect = db.select;
  const originalInsert = db.insert;
  (db as any).select = (...args: unknown[]) => {
    selectCalls += 1;
    return selectCalls === 1 ? fakeRows([{ id: 1, userId: 7 }]) : fakeRows([{ departmentId: 555 }]);
  };
  (db as any).insert = (...args: unknown[]) => { inserted = true; throw new Error("UNEXPECTED INSERT: the department guard did not fire before writing"); };
  try {
    const req = {
      params: { studentId: "1" },
      user: { id: 99, role: "professor", departmentId: null, sessionVersion: 0 },
      body: { examName: "Unit test exam", type: "quarterly", date: "2026-09-01", marks: 50 },
      log: { error() {} },
    };
    const res = mockRes();
    await handler(req, res);
    assert.equal(selectCalls, 2, "the two pre-existing read lookups (student existence, department) still run - unchanged by this fix");
    assert.equal(inserted, false, "db.insert must never be called when departmentId is null, regardless of what the reads returned");
    assert.equal(res.statusCode, 403);
  } finally {
    (db as any).select = originalSelect;
    (db as any).insert = originalInsert;
  }
});
