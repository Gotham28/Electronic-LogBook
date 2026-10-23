// Local-only browser smoke. All API requests are intercepted with synthetic responses.
// Usage: tsx tests/physiology-sidebar.browser.ts <installed-playwright-package-directory>
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { physiologyLogbook } from "../../../lib/api-zod/src/logbook-profiles/physiology.ts";
import { writeAcademicRecord } from "../../../lib/api-zod/src/academic-logbook.ts";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const origin = "http://127.0.0.1:5191";
const server = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)), "--host", "127.0.0.1", "--port", "5191", "--strictPort"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)), windowsHide: true, stdio: "ignore", env: { ...process.env, VITE_API_URL: "" },
});
let ready = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Wait for the local server only. */ }
  await delay(250);
}
if (!ready) { server.kill(); throw new Error("Local test server did not start"); }
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const user = { id: 9001, name: "Synthetic Resident", role: "student", departmentId: 9002, departmentName: "Physiology", studentProfileId: 9003 };
const logs = [
  { id: 1, activityType: "Seminars", topic: "Synthetic teaching entry", date: "2026-10-23", description: writeAcademicRecord(1, {}, ""), status: "pending", supervisorId: 9004 },
  { id: 2, activityType: "Attendance", topic: "Synthetic attendance entry", date: "2026-10-23", description: writeAcademicRecord(3, {}, ""), status: "verified", supervisorId: 9004 },
];
const saved: any[] = [];
const assistantRequests: any[] = [];
const apiRequests: string[] = [];
let profile: typeof physiologyLogbook | null = physiologyLogbook;
let logsFail = false;
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addInitScript((session: typeof user) => {
    sessionStorage.setItem("elogbook-user", JSON.stringify(session));
    sessionStorage.setItem("elogbook-authenticated", "true");
    sessionStorage.setItem("elogbook-token", "synthetic-browser-test-only");
    localStorage.setItem(`disclaimer_accepted_${session.id}`, "true");
  }, user);
  await context.route("**/*", async (route: any) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    apiRequests.push(url.pathname);
    let body: unknown = [];
    let status = 200;
    if (url.pathname === "/api/auth/me") body = user;
    else if (url.pathname === "/api/arogya/context") body = {
      mode: "v2", role: "student", departmentLabel: "Physiology", workflows: [], actions: [],
      knowledgeVersion: "synthetic", capabilitySignature: "synthetic",
    };
    else if (url.pathname === "/api/arogya/ask") {
      assistantRequests.push(request.postDataJSON());
      body = { reply: "Synthetic contextual answer", kind: "help", steps: [], sources: [], facts: [], actions: [],
        checkedAt: "2026-10-23T00:00:00Z", knowledgeVersion: "synthetic", capabilitySignature: "synthetic" };
    }
    else if (url.pathname.endsWith("/catalog")) body = {
      department: { id: 9002, name: profile ? "Physiology" : "Other Department", code: profile ? "PSI" : "OTHER" },
      config: { requiredCases: null, requiredProcedures: null, requiredAcademic: null, enabledFeatures: {} },
      academics: [], postings: [], academicLogbook: profile,
    };
    else if (url.pathname.endsWith("/professors")) body = [{ id: 9004, fullName: "Synthetic Faculty" }];
    else if (url.pathname.endsWith("/academic-logs") && request.method() === "POST") {
      const payload = request.postDataJSON();
      saved.push(payload);
      logs.push({ ...payload, id: 3, status: "pending" });
      body = { id: 3 };
    } else if (url.pathname.endsWith("/logs")) {
      status = logsFail ? 503 : 200;
      body = logsFail ? { error: "Synthetic service unavailable" } : { academicLogs: logs, caseLogs: [], procedureLogs: [] };
    } else if (url.pathname.endsWith("/dashboard")) body = { categories: [] };
    else if (url.pathname.includes("name-change")) body = { notifications: [], unreadCount: 0 };
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(error.message));
  await page.goto(`${origin}/academics/teaching-learning`);
  await page.getByRole("heading", { name: "Teaching & Learning", exact: true }).waitFor();
  await page.getByTestId("cookie-consent-banner").getByRole("button", { name: "Accept All", exact: true }).click();
  const sidebar = page.locator('[data-sidebar="menu"]');
  assert.equal(await sidebar.locator("a").count(), 8);
  assert.equal(await sidebar.getByText("Case Logs", { exact: true }).count(), 0);
  assert.equal(await sidebar.getByText("Procedure Logs", { exact: true }).count(), 0);
  await page.getByRole("cell", { name: /^Synthetic teaching entry/ }).waitFor();
  assert.equal(await page.getByRole("cell", { name: /^Synthetic attendance entry/ }).count(), 0);
  assert.equal(await page.locator("button").filter({ hasText: /Years / }).count(), 10);
  console.log("PASS desktop: eight sidebar items, ten teaching sections, records restricted to category");

  await page.getByRole("button", { name: /^Seminars/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Logbook year", exact: true }).click();
  await page.getByRole("option", { name: "Year 1", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Activity category", exact: true }).click();
  assert.equal(await page.getByRole("option", { name: "Attendance", exact: true }).count(), 0);
  await page.getByRole("option", { name: "Seminars", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Participation", exact: true }).click();
  await page.getByRole("option", { name: "Attended", exact: true }).click();
  await dialog.getByLabel("Topic / title", { exact: true }).fill("Synthetic new seminar");
  await dialog.getByRole("combobox", { name: "Reviewing faculty member", exact: true }).click();
  await page.getByRole("option", { name: "Synthetic Faculty", exact: true }).click();
  await dialog.getByRole("button", { name: "Send to faculty", exact: true }).click();
  await page.getByRole("cell", { name: /^Synthetic new seminar/ }).waitFor();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].activityType, "Seminars");
  assert.equal(JSON.parse(saved[0].description).trainingYear, 1);
  console.log("PASS forms: category-only options; existing POST payload and year/participation validation preserved");

  for (const category of physiologyLogbook.navigationCategories!) {
    await sidebar.getByRole("link", { name: category.title, exact: true }).click();
    await page.getByRole("heading", { name: category.title, exact: true }).waitFor();
    assert.equal(await sidebar.locator('a[aria-current="page"]').count(), 1);
    for (const related of category.relatedPages ?? []) {
      assert.equal(await page.getByRole("navigation", { name: "Related records" }).getByRole("link", { name: related.title, exact: true }).getAttribute("href"), related.href);
    }
    await page.getByRole("button", { name: "Open Arogya assistant", exact: true }).click();
    const requestPromise = page.waitForRequest((request: any) => new URL(request.url()).pathname === "/api/arogya/ask");
    await page.getByPlaceholder("Write a prompt...", { exact: true }).fill("How do I use this page?");
    await page.getByRole("button", { name: "Send prompt to Arogya", exact: true }).click();
    const assistantRequest = await requestPromise;
    assert.equal(assistantRequest.postDataJSON().context.workflowId, "academics", category.id);
    assert.equal(assistantRequest.postDataJSON().context.studentId, user.studentProfileId);
    await page.getByText("Synthetic contextual answer", { exact: true }).last().waitFor();
    await page.locator('[data-tour="arogya-panel"]').getByRole("button", { name: "Close Arogya assistant", exact: true }).click();
  }
  console.log("PASS all five category routes: correct titles, active menu and existing assessment/posting/thesis/conference links");
  assert.equal(assistantRequests.length, 5);
  console.log("PASS Arogya context: all five category pages send academics workflow and existing student profile ID");

  await sidebar.getByRole("link", { name: "Practicals & Postings", exact: true }).click();
  await page.getByRole("combobox", { name: "Show year", exact: true }).click();
  await page.getByRole("option", { name: "Year 1", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: /^District Residency Programme/ }).count(), 0);
  assert.equal(await page.getByRole("button", { name: /^Postings in allied departments/ }).count(), 0);
  await page.getByRole("combobox", { name: "Show year", exact: true }).click();
  await page.getByRole("option", { name: "Year 2", exact: true }).click();
  await page.getByRole("button", { name: /^District Residency Programme/ }).waitFor();
  console.log("PASS year filter: first-year practicals exclude later-year postings; DRP appears in second year");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.getByRole("navigation", { name: "Main pages", exact: true });
  assert.equal(await mobile.getByRole("link").count(), 4);
  await mobile.getByRole("link", { name: "Research", exact: true }).click();
  await page.getByRole("heading", { name: "Research & Events", exact: true }).waitFor();
  await mobile.getByRole("button", { name: "More pages", exact: true }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Leave Records", exact: true }).waitFor();
  console.log("PASS mobile: four category shortcuts; full menu retains Leave Records");
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1366, height: 900 });

  logsFail = true;
  await page.goto(`${origin}/academics/daily-attendance`);
  await page.getByRole("button", { name: "Try Again", exact: true }).waitFor();
  assert.ok(await page.getByText("Activity records are unavailable", { exact: true }).isVisible());
  console.log("PASS failed fetch: visible retry/error state instead of fabricated totals");
  logsFail = false;

  profile = null;
  await page.goto(`${origin}/academics/teaching-learning`);
  await page.getByRole("heading", { name: "Category unavailable", exact: true }).waitFor();
  assert.ok(await sidebar.getByRole("link", { name: "Case Logs", exact: true }).isVisible());
  assert.ok(await sidebar.getByRole("link", { name: "Procedure Logs", exact: true }).isVisible());
  assert.ok(await sidebar.getByRole("link", { name: "Assessments", exact: true }).isVisible());
  console.log("PASS other department: existing sidebar retained and Physiology category unavailable");
  assert.deepEqual(errors, []);
  assert.ok(apiRequests.length > 0);
  console.log(`PASS browser runtime: no uncaught errors; ${apiRequests.length} API calls intercepted locally; no real API/database requests`);
} finally {
  await browser.close();
  server.kill();
}
