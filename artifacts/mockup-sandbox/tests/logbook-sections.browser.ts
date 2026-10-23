// Local browser regression: synthetic accounts and intercepted APIs only.
// Usage: tsx tests/logbook-sections.browser.ts <playwright-package-directory> [screenshot-path]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { physiologyLogbook } from "../../../lib/api-zod/src/logbook-profiles/physiology.ts";

const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2]);
const origin = "http://127.0.0.1:5192";
const server = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)), "--host", "127.0.0.1", "--port", "5192", "--strictPort"], {
  cwd: fileURLToPath(new URL("../", import.meta.url)), windowsHide: true, stdio: "ignore", env: { ...process.env, VITE_API_URL: "" },
});
let browser: any;
let user = { id: 9001, name: "Synthetic HOD", role: "hod", departmentId: 9002, departmentName: "Physiology", studentProfileId: 9003 };
const categories = physiologyLogbook.navigationCategories!;
const sections: any[] = physiologyLogbook.sections.map((section, index) => ({ ...section, name: section.value, multilineTopic: !!section.multilineTopic,
  categoryId: categories.find((category) => category.sectionValues.includes(section.value))!.id, sortOrder: index, archived: false, required: 0, period: "total", revision: 0 }));
let saved: any;
let unavailable = false;
let readOnly = false;
let profile = structuredClone(physiologyLogbook);
const errors: string[] = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Local readiness only. */ }
    await delay(250);
  }
  if (!ready) throw new Error("Local test server did not start");
  browser = await chromium.launch({ headless: true, channel: "msedge" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    const session = { id: 9001, name: "Synthetic HOD", role: "hod", departmentId: 9002, departmentName: "Physiology", studentProfileId: 9003 };
    sessionStorage.setItem("elogbook-user", JSON.stringify(session));
    sessionStorage.setItem("elogbook-authenticated", "true");
    sessionStorage.setItem("elogbook-token", "synthetic-browser-test-only");
    localStorage.setItem(`disclaimer_accepted_${session.id}`, "true");
  });
  await context.route("**/*", async (route: any) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let body: any = [];
    let status = 200;
    if (url.pathname === "/api/auth/me") body = user;
    else if (url.pathname === "/api/arogya/context") body = { mode: "v2", role: user.role, departmentLabel: "Physiology", workflows: [], actions: [], knowledgeVersion: "synthetic", capabilitySignature: "synthetic" };
    else if (url.pathname.endsWith("/catalog")) body = { department: { id: 9002, name: "Physiology", code: "PSI" }, config: { requiredCases: null, requiredProcedures: null, requiredAcademic: null, enabledFeatures: {} }, academics: saved ? [{ id: 10, name: saved.name, value: "synthetic-section", required: saved.required, period: saved.period }] : [], academicLogbook: profile };
    else if (url.pathname.endsWith("/logbook-sections") && request.method() === "GET") {
      status = unavailable ? 503 : 200;
      body = unavailable ? { message: "Synthetic settings unavailable" } : { sections, categories, readOnly };
    } else if (url.pathname.endsWith("/logbook-sections") && request.method() === "POST") {
      saved = request.postDataJSON();
      sections.push({ ...saved, value: "synthetic-section", revision: 1 });
      profile.sections.push({ ...saved, value: "synthetic-section" });
      profile.navigationCategories!.find((category) => category.id === saved.categoryId)!.sectionValues.push("synthetic-section");
      body = { value: "synthetic-section", revision: 1 }; status = 201;
    } else if (url.pathname.endsWith("/analytics")) body = { totalStudents: 0, avgCompletion: null, logStats: {} };
    else if (url.pathname.endsWith("/review-queue")) body = { faculty: { name: "Synthetic HOD", role: "hod" }, pendingReviews: [], assignedMentees: [] };
    else if (url.pathname.endsWith("/roster")) body = { students: [], professors: [] };
    else if (url.pathname.endsWith("/logs")) body = { academicLogs: [] };
    else if (url.pathname.endsWith("/professors")) body = [{ id: 9004, fullName: "Synthetic Faculty" }];
    else if (url.pathname.includes("name-change")) body = { items: [], unreadCount: 0, hasMore: false, notifications: [] };
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on("pageerror", (error: Error) => errors.push(error.message));
  await page.goto(`${origin}/requirements`, { waitUntil: "commit" });
  await page.getByRole("heading", { name: "Training requirements", exact: true }).waitFor();
  const consent = page.getByTestId("cookie-consent-banner").getByRole("button", { name: "Accept All", exact: true });
  if (await consent.isVisible()) await consent.click();
  await page.getByRole("button", { name: /^Logbook sections/ }).click();
  await page.getByRole("button", { name: "Add logbook section", exact: true }).click();
  await page.getByLabel("Section name", { exact: true }).fill("Synthetic taught record");
  await page.getByLabel("Topic field label", { exact: true }).fill("Topic taught");
  await page.getByLabel("Use a multiline topic field", { exact: true }).check();
  await page.getByLabel("Year 3", { exact: true }).uncheck();
  await page.getByLabel("Participation choices (one per line; leave blank to hide)", { exact: true }).fill("Attended\nPresented");
  await page.getByLabel("Required activity count", { exact: true }).fill("5");
  await page.getByLabel("Requirement period", { exact: true }).selectOption("month");
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await page.getByLabel("Field 1 label", { exact: true }).fill("Session format");
  await page.getByLabel("Field 1 type", { exact: true }).selectOption("select");
  await page.getByLabel("Field 1 dropdown choices (one per line)", { exact: true }).fill("Group\nIndividual");
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  await page.getByLabel("Field 2 label", { exact: true }).fill("Session details");
  await page.getByLabel("Field 2 type", { exact: true }).selectOption("textarea");
  await page.getByLabel("Field 2 maximum characters (optional)", { exact: true }).fill("200");
  await page.getByText("Conditional display and requirement", { exact: true }).nth(1).click();
  const source = await page.getByLabel("Show field 2 when", { exact: true }).locator("option").nth(1).getAttribute("value");
  await page.getByLabel("Show field 2 when", { exact: true }).selectOption(source);
  await page.getByLabel("Field 2 source must equal", { exact: true }).selectOption("Group");
  const preview = page.getByRole("complementary", { name: "Resident form preview" });
  assert.equal(await preview.getByLabel("Session details *", { exact: true }).count(), 0);
  await preview.getByRole("combobox", { name: "Session format (optional)", exact: true }).click();
  await page.getByRole("option", { name: "Group", exact: true }).click();
  await preview.getByLabel("Session details *", { exact: true }).waitFor();
  if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "editor must fit mobile viewport");
  await page.getByRole("button", { name: "Save logbook section", exact: true }).click();
  await page.getByRole("button", { name: "Add logbook section", exact: true }).waitFor();
  assert.equal(saved.name, "Synthetic taught record");
  assert.deepEqual(saved.years, [1, 2]);
  assert.equal(saved.categoryId, "teaching-learning");
  assert.equal(saved.period, "month");
  assert.equal(saved.required, 5);
  assert.equal(saved.fields[1].requiredWhen.field, saved.fields[0].key);
  console.log("PASS HOD editor: create, field choices, conditional preview, targets, persisted settings and mobile fit");
  await page.setViewportSize({ width: 1440, height: 1000 });
  unavailable = true;
  await page.reload();
  await page.getByRole("button", { name: /^Logbook sections/ }).click();
  await page.getByText("Synthetic settings unavailable", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Add logbook section", exact: true }).count(), 0);
  unavailable = false;
  readOnly = true;
  await page.getByRole("button", { name: "Reload sections", exact: true }).click();
  assert.ok(await page.getByRole("button", { name: "Add logbook section", exact: true }).isDisabled());
  console.log("PASS failed load is visible and mirrored settings are read-only");
  user = { ...user, name: "Synthetic Resident", role: "student" };
  await page.evaluate((session: typeof user) => sessionStorage.setItem("elogbook-user", JSON.stringify(session)), user);
  await page.goto(`${origin}/academics/teaching-learning`);
  await page.getByRole("button", { name: /^Synthetic taught record/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Topic taught", { exact: true }).waitFor();
  await dialog.getByRole("combobox", { name: "Logbook year", exact: true }).click();
  await page.getByRole("option", { name: "Year 1", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Session format (optional)", exact: true }).click();
  await page.getByRole("option", { name: "Group", exact: true }).click();
  await dialog.getByLabel("Session details *", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS resident: saved section and its configured fields render in Teaching & Learning; no browser errors");
} finally {
  if (browser) await browser.close();
  server.kill();
}
