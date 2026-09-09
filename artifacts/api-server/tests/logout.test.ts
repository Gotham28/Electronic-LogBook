// Evidence Gate D (docs/SECURITY_FIXES.md sec 4) — SEC-11.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a, password } from "./support.js";
import { engine } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

test("SEC-11: logout invalidates the token that logged out; a fresh login afterward still works", async () => {
  // A fresh login for student0 gives its own token, independent of support.ts's
  // fixture-issued one (sessionVersion 0 at fixture time), so this test cannot be
  // affected by whatever earlier tests in this process may already have done to that
  // account's session.
  const login = await request(runtime.base, "/auth/login", undefined, "POST", { username: a.student0.email, password });
  assert.equal(login.status, 200, "fixture: fresh login for student0");
  const freshToken = login.body.token as string;
  const account = { ...a.student0, token: freshToken };

  const beforeLogout = await request(runtime.base, "/auth/me", account);
  console.log("SEC-11 token works before logout ->", beforeLogout.status);
  assert.equal(beforeLogout.status, 200);

  const logout = await request(runtime.base, "/auth/logout", account, "POST", {});
  console.log("SEC-11 logout ->", logout.status, JSON.stringify(logout.body));
  assert.equal(logout.status, 200);

  // Case 1: the token that just logged out, reused -> 401.
  const reused = await request(runtime.base, "/auth/me", account);
  console.log("SEC-11 reused post-logout token ->", reused.status, JSON.stringify(reused.body));
  assert.equal(reused.status, 401);

  // Case 2: a freshly issued token after logout still works -> 200 (login itself is not broken).
  const reLogin = await request(runtime.base, "/auth/login", undefined, "POST", { username: a.student0.email, password });
  assert.equal(reLogin.status, 200, "fixture: login again after logout");
  const freshAfterLogout = { ...a.student0, token: reLogin.body.token as string };
  const afterRelogin = await request(runtime.base, "/auth/me", freshAfterLogout);
  console.log("SEC-11 freshly issued token after logout ->", afterRelogin.status);
  assert.equal(afterRelogin.status, 200);

  // The old, logged-out token stays dead even after a sibling re-login (sessionVersion
  // only ever increases; it does not get reset by a later login).
  const stillDead = await request(runtime.base, "/auth/me", account);
  console.log("SEC-11 original token, after a later re-login ->", stillDead.status);
  assert.equal(stillDead.status, 401);
});

test("SEC-11: logout itself requires a valid session (fail closed, not fail open)", async () => {
  const unauthenticated = await request(runtime.base, "/auth/logout", undefined, "POST", {});
  console.log("SEC-11 logout with no token ->", unauthenticated.status);
  assert.equal(unauthenticated.status, 401);
});
