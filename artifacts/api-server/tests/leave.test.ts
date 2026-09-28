import test from "node:test";
import assert from "node:assert/strict";
import { splitLeaveDaysByYear } from "../src/lib/leave.js";

test("splitLeaveDaysByYear", async (t) => {
  await t.test("single day", () => {
    assert.deepEqual(splitLeaveDaysByYear("2026-06-15", "2026-06-15"), [{ year: "2026", days: 1 }]);
  });
  await t.test("2026-12-31 -> 2027-01-01", () => {
    assert.deepEqual(splitLeaveDaysByYear("2026-12-31", "2027-01-01"), [
      { year: "2026", days: 1 },
      { year: "2027", days: 1 }
    ]);
  });
  await t.test("leap day", () => {
    assert.deepEqual(splitLeaveDaysByYear("2024-02-28", "2024-03-01"), [{ year: "2024", days: 3 }]);
  });
  await t.test("3-year span", () => {
    assert.deepEqual(splitLeaveDaysByYear("2025-12-31", "2027-01-01"), [
      { year: "2025", days: 1 },
      { year: "2026", days: 365 },
      { year: "2027", days: 1 }
    ]);
  });
  await t.test("start > end", () => {
    assert.deepEqual(splitLeaveDaysByYear("2026-05-01", "2026-04-01"), []);
  });
  await t.test("invalid", () => {
    assert.deepEqual(splitLeaveDaysByYear("abc", "def"), []);
    assert.deepEqual(splitLeaveDaysByYear("", "2026-01-01"), []);
    assert.deepEqual(splitLeaveDaysByYear("2026/01/01", "2026/01/02"), []); // strict YYYY-MM-DD
  });
  await t.test(">100-year span", () => {
    assert.deepEqual(splitLeaveDaysByYear("1900-01-01", "2050-01-01"), []);
  });
});
