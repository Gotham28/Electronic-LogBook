import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts, type Account } from "./support.js";
import { engine } from "./database.js";

let runtime: { server: any; base: string };

before(async () => {
  const bootstrapped = await setup();
  runtime = { server: bootstrapped.server, base: bootstrapped.base };
});

after(async () => {
  if (runtime?.server) {
    await new Promise<void>((resolve) => runtime.server.close(() => resolve()));
  }
  await engine.close();
});

test("Daily Attendance Authorization Evidence (AGENTS.md sec 11)", async (t) => {
  const student0 = accounts.student0;
  const student1 = accounts.student1;
  const faculty0 = accounts.faculty0;
  const faculty1 = accounts.faculty1;

  await t.test("GET /students/:studentId/attendance", async (st) => {
    // 1. Unauthenticated request -> 401
    const unauth = await request(runtime.base, `/students/${student0.studentId}/attendance`);
    console.log("CASE 1 (Unauthenticated):", unauth.status, JSON.stringify(unauth.body));
    assert.equal(unauth.status, 401);

    // 2. Authenticated, wrong owner (student1 requesting student0) -> 403
    const wrongOwner = await request(runtime.base, `/students/${student0.studentId}/attendance`, student1);
    console.log("CASE 2 (Wrong Owner):", wrongOwner.status, JSON.stringify(wrongOwner.body));
    assert.equal(wrongOwner.status, 403);

    // 2b. Authenticated, faculty from different department -> 403
    const wrongDeptFaculty = await request(runtime.base, `/students/${student0.studentId}/attendance`, faculty1);
    console.log("CASE 2b (Wrong Dept Faculty):", wrongDeptFaculty.status, JSON.stringify(wrongDeptFaculty.body));
    assert.equal(wrongDeptFaculty.status, 403);

    // 3. Authenticated, correct owner (student0 requesting own attendance) -> 200
    const correctOwner = await request(runtime.base, `/students/${student0.studentId}/attendance`, student0);
    console.log("CASE 3 (Correct Owner):", correctOwner.status, JSON.stringify(correctOwner.body));
    assert.equal(correctOwner.status, 200);
    assert.ok(Array.isArray(correctOwner.body.data));

    // 3b. Authenticated, faculty from same department -> 200
    const sameDeptFaculty = await request(runtime.base, `/students/${student0.studentId}/attendance`, faculty0);
    console.log("CASE 3b (Same Dept Faculty):", sameDeptFaculty.status, JSON.stringify(sameDeptFaculty.body));
    assert.equal(sameDeptFaculty.status, 200);

    // 4. Authenticated, nonexistent student (collapses to 403 per SEC-35 / enumeration prevention)
    const nonexistent = await request(runtime.base, `/students/999999/attendance`, student0);
    console.log("CASE 4 (Nonexistent Student - collapsed per SEC-35):", nonexistent.status, JSON.stringify(nonexistent.body));
    assert.equal(nonexistent.status, 403);
  });

  await t.test("Professor Daily Attendance Endpoints", async (pt) => {
    // Faculty can view attendance for their department
    const viewDept = await request(runtime.base, `/professors/attendance?date=2026-10-27`, faculty0);
    console.log("PROFESSOR GET /professors/attendance:", viewDept.status, JSON.stringify(viewDept.body));
    assert.equal(viewDept.status, 200);
    assert.equal(viewDept.body.date, "2026-10-27");
    assert.ok(Array.isArray(viewDept.body.students));

    // Student cannot access professor attendance endpoint
    const studentBlocked = await request(runtime.base, `/professors/attendance?date=2026-10-27`, student0);
    console.log("STUDENT GET /professors/attendance (Blocked):", studentBlocked.status, JSON.stringify(studentBlocked.body));
    assert.equal(studentBlocked.status, 403);

    // Faculty marking attendance for their department's student -> 200
    const markAttendance = await request(
      runtime.base,
      `/professors/attendance`,
      faculty0,
      "POST",
      {
        date: "2026-10-27",
        records: [
          { studentId: student0.studentId, status: "present", clockIn: "08:30", clockOut: "16:30" },
        ],
      }
    );
    console.log("PROFESSOR POST /professors/attendance (Valid):", markAttendance.status, JSON.stringify(markAttendance.body));
    assert.equal(markAttendance.status, 200);
    assert.equal(markAttendance.body.success, true);

    // Student verifies newly marked attendance -> 200
    const studentCheck = await request(runtime.base, `/students/${student0.studentId}/attendance`, student0);
    console.log("STUDENT CHECK NEW ATTENDANCE:", studentCheck.status, JSON.stringify(studentCheck.body));
    assert.equal(studentCheck.status, 200);
    assert.equal(studentCheck.body.data.length, 1);
    assert.equal(studentCheck.body.data[0].status, "present");
    assert.equal(studentCheck.body.data[0].date, "2026-10-27");

    // Faculty marking attendance for student outside department -> 403
    const crossDeptMark = await request(
      runtime.base,
      `/professors/attendance`,
      faculty0,
      "POST",
      {
        date: "2026-10-27",
        records: [
          { studentId: student1.studentId, status: "present" }, // student1 is in department 1, faculty0 is in department 0
        ],
      }
    );
    console.log("PROFESSOR POST /professors/attendance (Cross-dept Blocked):", crossDeptMark.status, JSON.stringify(crossDeptMark.body));
    assert.equal(crossDeptMark.status, 403);
  });
});
