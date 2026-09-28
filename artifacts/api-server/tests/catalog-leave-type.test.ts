import { before, after, test, describe } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine, db, departmentCatalogTable, leaveRecordsTable } from "./database.js";
import { eq, and } from "drizzle-orm";

let runtime: Awaited<ReturnType<typeof setup>>;
let customLeaveId: number;
let casualLeaveId: number;

const call = (path: string, who?: keyof typeof a, method?: string, body?: unknown) =>
  request(runtime.base, path, who ? a[who] : undefined, method, body);

before(async () => {
  runtime = await setup();

  // casual leave type is seeded by support.ts for department 1
  const [casual] = await db.select().from(departmentCatalogTable)
    .where(and(eq(departmentCatalogTable.departmentId, 1), eq(departmentCatalogTable.value, "casual"))).limit(1);
  casualLeaveId = casual.id;
});

after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); 
  await engine.close();
});

describe("HOD leave type catalog endpoints", () => {
  test("HOD can add a leave_type catalog entry", async () => {
    const res = await call("/admin/department/catalog", "hod0", "POST", { kind: "leave_type", name: "Custom Leave", value: "custom_leave", period: "total", required: 0 });
    assert.equal(res.status, 201);
    assert.equal(res.body.kind, "leave_type");
    customLeaveId = res.body.id;
  });

  test("HOD can check usage of a leave_type entry", async () => {
    const res = await call(`/admin/department/catalog/${customLeaveId}/usage-count`, "hod0", "GET");
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 0);
  });

  test("HOD cannot delete casual leave type", async () => {
    const res = await call(`/admin/department/catalog/${casualLeaveId}`, "hod0", "DELETE");
    assert.equal(res.status, 403);
    assert.equal(res.body.message, "This leave type is required for quota tracking and cannot be removed");
  });

  test("HOD can delete custom leave_type entry", async () => {
    const res = await call(`/admin/department/catalog/${customLeaveId}`, "hod0", "DELETE");
    assert.equal(res.status, 200);
  });
});

describe("Student leave records validation against dynamic leave types", () => {
  test("Student gets 400 Bad Request when submitting an invalid leave type", async () => {
    const res = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST", {
        startDate: "2024-01-01",
        endDate: "2024-01-02",
        leaveType: "made_up_leave", // Invalid because not in department 1's catalog
        reason: "Taking a break"
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Invalid leave type for this department");
  });

  test("Student can successfully submit leave with a valid leave type", async () => {
    // Re-add custom leave to catalog since we deleted it
    await db.insert(departmentCatalogTable).values({ departmentId: 1, kind: "leave_type", name: "Custom Leave", value: "custom_leave" });
    
    const res = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST", {
        startDate: "2024-01-01",
        endDate: "2024-01-02",
        leaveType: "custom_leave",
        reason: "Taking a custom break"
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.leave.leaveType, "custom_leave");
  });

  test("Leave balance calculation still returns casual and academic totals", async () => {
    // Approve the custom leave to make sure it doesn't break balance calculation
    await db.update(leaveRecordsTable).set({ status: "approved" }).where(eq(leaveRecordsTable.studentId, a.student0.studentId!));
    const res = await call(`/students/${a.student0.studentId}/leave-balance`, "student0", "GET");
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.casual.used, "number");
    assert.equal(typeof res.body.academic.used, "number");
  });

  test("Concurrency: advisory lock serializes near-simultaneous leave submissions", async () => {
    const [testLeave] = await db.insert(departmentCatalogTable).values({ departmentId: 1, kind: "leave_type", name: "Concurrency Test Leave", value: "concurrency_leave", required: 5 }).returning();
    
    const req1 = call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST", {
        startDate: "2024-03-01",
        endDate: "2024-03-03",
        leaveType: "concurrency_leave",
        reason: "Test 1"
    });
    const req2 = call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST", {
        startDate: "2024-03-04",
        endDate: "2024-03-06",
        leaveType: "concurrency_leave",
        reason: "Test 2"
    });
    
    const currentYear = new Date().getFullYear();
    const [res1, res2] = await Promise.all([req1, req2]);
    const statusCodes = [res1.status, res2.status].sort();
    assert.deepEqual(statusCodes, [201, 400], "One request should succeed and one should fail due to lock");
  });
});

describe("Leave allowances are counted per calendar year of the leave", () => {
  const thisYear = new Date().getFullYear();
  const nextYear = thisYear + 1;

  test("a leave for next year is checked against next year's usage, not this year's", async () => {
    await db.insert(departmentCatalogTable).values({ departmentId: 1, kind: "leave_type", name: "Yearly Test Leave", value: "yearly_test_leave", required: 5 });
    const fillThisYear = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST",
      { startDate: `${thisYear}-01-05`, endDate: `${thisYear}-01-09`, leaveType: "yearly_test_leave", reason: "Uses this year's 5 days" });
    assert.equal(fillThisYear.status, 201);

    const nextYearLeave = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST",
      { startDate: `${nextYear}-01-05`, endDate: `${nextYear}-01-07`, leaveType: "yearly_test_leave", reason: "Next year" });
    assert.equal(nextYearLeave.status, 201, JSON.stringify(nextYearLeave.body));

    const overNextYear = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST",
      { startDate: `${nextYear}-02-01`, endDate: `${nextYear}-02-03`, leaveType: "yearly_test_leave", reason: "Over next year's allowance" });
    assert.equal(overNextYear.status, 400);
    assert.match(overNextYear.body.message, /Available: 2 days/);
  });

  test("the HOD's pending-leave list explicitly excludes pending leaves from the available balance", async () => {
    await db.insert(departmentCatalogTable).values({ departmentId: 1, kind: "leave_type", name: "Distinguish Test Leave", value: "distinguish_test", required: 5 });

    const approvedThis = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST",
      { startDate: `${thisYear}-01-01`, endDate: `${thisYear}-01-04`, leaveType: "distinguish_test", reason: "Approved this year" });
    const appThisRes = await call(`/admin/leaves/${approvedThis.body.leave.id}/action`, "hod0", "POST", { action: "approve" });
    assert.equal(appThisRes.status, 200);

    const pendingThis = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST",
      { startDate: `${thisYear}-02-01`, endDate: `${thisYear}-02-01`, leaveType: "distinguish_test", reason: "Pending this year" });

    const approvedNext = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST",
      { startDate: `${nextYear}-01-05`, endDate: `${nextYear}-01-06`, leaveType: "distinguish_test", reason: "Approved next year" });
    const appNextRes = await call(`/admin/leaves/${approvedNext.body.leave.id}/action`, "hod0", "POST", { action: "approve" });
    assert.equal(appNextRes.status, 200);

    const pendingNext = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST",
      { startDate: `${nextYear}-02-01`, endDate: `${nextYear}-02-02`, leaveType: "distinguish_test", reason: "Pending next year" });

    const res = await call("/admin/leaves/pending", "hod0", "GET");
    assert.equal(res.status, 200);
    const nextYearLeave = res.body.find((leave: any) => leave.reason === "Pending next year");
    const thisYearLeave = res.body.find((leave: any) => leave.reason === "Pending this year");

    assert.equal(nextYearLeave.availableByYear.find((y: any) => y.year === nextYear.toString()).available, 3);
    assert.equal(thisYearLeave.availableByYear.find((y: any) => y.year === thisYear.toString()).available, 1);
  });

  test("cross-year leaves return availability splits for both years in the HOD list", async () => {
    await db.insert(departmentCatalogTable).values({ departmentId: 1, kind: "leave_type", name: "Cross Year Pending", value: "cross_year_pending", required: 5 });

    const crossYearRes = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST",
      { startDate: `${thisYear}-12-30`, endDate: `${nextYear}-01-02`, leaveType: "cross_year_pending", reason: "Cross year pending" });
    assert.equal(crossYearRes.status, 201);

    const res = await call("/admin/leaves/pending", "hod0", "GET");
    assert.equal(res.status, 200);
    const leave = res.body.find((l: any) => l.reason === "Cross year pending");
    assert.equal(leave.availableByYear.length, 2);

    const thisYearSplit = leave.availableByYear.find((y: any) => y.year === thisYear.toString());
    const nextYearSplit = leave.availableByYear.find((y: any) => y.year === nextYear.toString());
    assert.equal(thisYearSplit.available, 5);
    assert.equal(nextYearSplit.available, 5);
  });

  test("cross-year leave validates against both years' limits individually", async () => {
    await db.insert(departmentCatalogTable).values({ departmentId: 1, kind: "leave_type", name: "Cross Year Block", value: "cross_year_block", required: 2 });

    const fillThis = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST",
      { startDate: `${thisYear}-05-01`, endDate: `${thisYear}-05-02`, leaveType: "cross_year_block", reason: "Fill this year" });
    const appCrossRes = await call(`/admin/leaves/${fillThis.body.leave.id}/action`, "hod0", "POST", { action: "approve" });
    assert.equal(appCrossRes.status, 200);

    const blockRes = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST",
      { startDate: `${thisYear}-12-31`, endDate: `${nextYear}-01-01`, leaveType: "cross_year_block", reason: "Blocked cross year" });
    assert.equal(blockRes.status, 400);
    assert.equal(blockRes.body.message, `Requested leave exceeds remaining balance for ${thisYear} (Available: 0 days)`);

    await db.insert(departmentCatalogTable).values({ departmentId: 1, kind: "leave_type", name: "Cross Year Allow", value: "cross_year_allow", required: 5 });
    const allowRes = await call(`/students/${a.student0.studentId}/leave-records`, "student0", "POST",
      { startDate: `${thisYear}-12-31`, endDate: `${nextYear}-01-01`, leaveType: "cross_year_allow", reason: "Allowed cross year" });
    assert.equal(allowRes.status, 201);
  });
});
