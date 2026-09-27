// Procedure groups are identified by name in the URL. The admin router's router.param("id")
// accepts positive integers only, so these routes must not name their parameter :id.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a } from "./support.js";
import { engine } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

test("HOD can check a procedure group's usage by name", async () => {
  // support.ts gives department 0 one procedure type in "Test group 0".
  const res = await request(runtime.base, "/admin/department/procedure-groups/" + encodeURIComponent("Test group 0") + "/usage-count", a.hod0);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.count, 1);
});

test("deleting a procedure group that still has procedure types is refused with a clear reason", async () => {
  const res = await request(runtime.base, "/admin/department/procedure-groups/" + encodeURIComponent("Test group 0"), a.hod0, "DELETE");
  assert.equal(res.status, 403);
  assert.match(res.body.message, /still used by procedure types/);
});
