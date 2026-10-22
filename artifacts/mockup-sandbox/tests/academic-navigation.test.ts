import assert from "node:assert/strict";
import test from "node:test";
import { physiologyLogbook } from "../../../lib/api-zod/src/logbook-profiles/physiology.ts";
import { writeAcademicRecord } from "../../../lib/api-zod/src/academic-logbook.ts";
import { categoryPath, categorySections, filterAcademicLogs, mobileNavigationItems, navigationIsActive, profileNavigation } from "../src/lib/academic-navigation.ts";

test("the five categories cover all 22 existing sections exactly once", () => {
  const categories = physiologyLogbook.navigationCategories!;
  assert.equal(categories.length, 5);
  const values = categories.flatMap((category) => category.sectionValues);
  assert.equal(values.length, 22);
  assert.equal(new Set(values).size, 22);
  assert.deepEqual([...values].sort(), physiologyLogbook.sections.map((section) => section.value).sort());
  assert.deepEqual(categories.map((category) => category.sectionValues.length), [10, 3, 3, 4, 2]);
});

test("year restrictions remain the existing 15/15/18 sections, partitioned by category", () => {
  for (const year of [1, 2, 3]) {
    const grouped = physiologyLogbook.navigationCategories!.flatMap((category) => categorySections(physiologyLogbook, category.id, String(year)));
    const original = physiologyLogbook.sections.filter((section) => section.years.includes(year));
    assert.equal(grouped.length, [15, 15, 18][year - 1]);
    assert.deepEqual(grouped.map((section) => section.value).sort(), original.map((section) => section.value).sort());
  }
  assert.deepEqual(categorySections(physiologyLogbook, "practicals-postings", "1").map((section) => section.value), ["Practical procedures / classes in the department"]);
  assert.ok(!categorySections(physiologyLogbook, "research-events", "3").some((section) => section.value === "Topic selection for thesis"));
});

test("category and year filters isolate records including legacy unstructured descriptions", () => {
  const logs = [
    { id: 1, activityType: "Seminars", description: writeAcademicRecord(1, {}, "") },
    { id: 2, activityType: "Attendance", description: writeAcademicRecord(3, {}, "") },
    { id: 3, activityType: "Seminars", description: writeAcademicRecord(2, {}, "") },
    { id: 4, activityType: "Seminars", description: "Legacy entry" },
    { id: 5, activityType: "Other configured activity", description: "" },
  ];
  assert.deepEqual(filterAcademicLogs(logs, physiologyLogbook, "teaching-learning").map((log) => log.id), [1, 3, 4]);
  assert.deepEqual(filterAcademicLogs(logs, physiologyLogbook, "teaching-learning", "1").map((log) => log.id), [1]);
  assert.deepEqual(filterAcademicLogs(logs, physiologyLogbook, "daily-attendance", "3").map((log) => log.id), [2]);
  assert.deepEqual(filterAcademicLogs(logs, physiologyLogbook), logs);
});

test("missing categories return no sections or records and do not invent navigation for other profiles", () => {
  const otherProfile = { ...physiologyLogbook, navigationCategories: undefined };
  assert.equal(profileNavigation(otherProfile), null);
  assert.equal(profileNavigation(null), null);
  assert.equal(profileNavigation({ ...otherProfile, navigationCategories: [] }), null);
  assert.deepEqual(categorySections(physiologyLogbook, "missing"), []);
  assert.deepEqual(categorySections(otherProfile, "teaching-learning"), []);
  assert.deepEqual(filterAcademicLogs([{ activityType: "Seminars" }], physiologyLogbook, "missing"), []);
});

test("eight menu items preserve existing leave/certifications and link other existing features", () => {
  const items = profileNavigation(physiologyLogbook)!;
  assert.equal(items.length, 8);
  assert.deepEqual(items.map((item) => item.title), ["Dashboard", "Teaching & Learning", "Practicals & Postings", "Research & Events", "Assessments & Appraisal", "Daily Record & Attendance", "Certifications", "Leave Records"]);
  assert.ok(!items.some((item) => ["/cases", "/procedures", "/academics"].includes(item.href)));
  assert.ok(items.some((item) => item.href === "/attendance"));
  assert.ok(items.some((item) => item.href === "/certifications"));
  assert.deepEqual(items.flatMap((item) => item.activePaths), ["/dashboard", "/postings", "/thesis", "/conferences", "/assessments"]);
});

test("active navigation matches one category, preserves existing feature links and ignores similar prefixes", () => {
  const items = profileNavigation(physiologyLogbook)!;
  for (const path of ["/postings", "/thesis", "/conferences", "/assessments", "/attendance", "/certifications", "/dashboard", categoryPath("daily-attendance")]) {
    assert.equal(items.filter((item) => navigationIsActive(`${path}?year=1`, item)).length, 1, path);
  }
  assert.ok(navigationIsActive("/assessments", items.find((item) => item.title === "Assessments & Appraisal")!));
  assert.ok(!navigationIsActive("/assessmentss", { href: "/assessments" }));
  assert.ok(!navigationIsActive("/academics/research-events", { href: categoryPath("teaching-learning") }));
});

test("mobile Physiology navigation has four useful shortcuts and retains other role/department priorities", () => {
  const physiology = profileNavigation(physiologyLogbook)!;
  assert.deepEqual(mobileNavigationItems("Student", physiology).map((item) => item.title), ["Dashboard", "Teaching & Learning", "Practicals & Postings", "Research & Events"]);
  const existing = ["/attendance", "/postings", "/procedures", "/academics", "/cases", "/"].map((href) => ({ href }));
  assert.deepEqual(mobileNavigationItems("Student", existing).map((item) => item.href), ["/", "/cases", "/procedures", "/academics"]);
  assert.deepEqual(mobileNavigationItems("Faculty", [{ href: "/assessments" }, { href: "/" }, { href: "/mentees" }]).map((item) => item.href), ["/", "/mentees", "/assessments"]);
  assert.deepEqual(mobileNavigationItems("HOD", [{ href: "/requirements" }, { href: "/roster" }, { href: "/review-queue" }, { href: "/mentees" }]).map((item) => item.href), ["/roster", "/mentees", "/review-queue", "/requirements"]);
});
