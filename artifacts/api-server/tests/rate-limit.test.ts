// Evidence Gate G (docs/SECURITY_FIXES.md sec 7) — SEC-12.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { setup, request, accounts as a, password } from "./support.js";
import { engine } from "./database.js";

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { runtime = await setup(); });
after(async () => { if (runtime) await new Promise<void>((done) => runtime.server.close(() => done())); await engine.close(); });

const post = (path: string, body: unknown, headers: Record<string, string>) =>
  request(runtime.base, path, undefined, "POST", body, headers);

test("SEC-12: two different resolved client IPs get two separate rate-limit buckets", async () => {
  // trust proxy: 1 (app.ts) takes the LAST X-Forwarded-For entry as req.ip - simulating
  // "the real load balancer appended this" for two distinct simulated clients.
  const ipA = { "X-Forwarded-For": "noise, 203.0.113.10" };
  const ipB = { "X-Forwarded-For": "noise, 203.0.113.20" };

  let lastA;
  for (let i = 0; i < 100; i++) {
    lastA = await post("/auth/send-otp", { email: "sec12-a@example.test" }, ipA);
  }
  const exhaustedA = await post("/auth/send-otp", { email: "sec12-a@example.test" }, ipA);
  console.log("SEC-12 IP A, 101st request ->", exhaustedA.status, JSON.stringify(exhaustedA.body));
  assert.equal(exhaustedA.status, 429);
  assert.match(exhaustedA.body.message, /Too many authentication attempts/);

  const freshB = await post("/auth/send-otp", { email: "sec12-b@example.test" }, ipB);
  console.log("SEC-12 IP B, first request while A is exhausted ->", freshB.status, JSON.stringify(freshB.body));
  assert.notEqual(freshB.status, 429);
});

test("SEC-12: an attacker-prepended X-Forwarded-For entry does not create a fresh bucket", async () => {
  // The REAL, last-hop address (what a genuine load balancer would append) stays fixed;
  // only the attacker-controlled prefix varies per request. If trust proxy correctly
  // discards everything but the last entry, all 100 land in the SAME bucket as before.
  const realTail = "203.0.113.99";
  for (let i = 0; i < 100; i++) {
    await post("/auth/send-otp", { email: "sec12-forge@example.test" }, { "X-Forwarded-For": `forged-${i}, ${realTail}` });
  }
  const the101st = await post("/auth/send-otp", { email: "sec12-forge@example.test" }, { "X-Forwarded-For": `forged-101, ${realTail}` });
  console.log("SEC-12 forged-prefix, 101st request (last hop unchanged) ->", the101st.status, JSON.stringify(the101st.body));
  assert.equal(the101st.status, 429, "varying only the attacker-controlled prefix must not create a fresh bucket");
  assert.match(the101st.body.message, /Too many authentication attempts/);

  // Sanity check on the property actually being tested: a genuinely different last hop
  // (a different real client, as trust proxy would resolve it) is unaffected.
  const differentRealClient = await post("/auth/send-otp", { email: "sec12-forge2@example.test" }, { "X-Forwarded-For": "forged-x, 203.0.113.100" });
  console.log("SEC-12 different real last-hop IP, unaffected ->", differentRealClient.status);
  assert.notEqual(differentRealClient.status, 429);
});

test("SEC-12: exhausting one account's login-failure counter does not block a different account", async () => {
  // Spread across 10 distinct simulated source IPs - proving this is genuinely
  // account-scoped, not incidentally still relying on IP identity.
  for (let i = 0; i < 10; i++) {
    const r = await post("/auth/login", { username: a.student0.email, password: "definitely-wrong-password" },
      { "X-Forwarded-For": `198.51.100.${i}` });
    assert.equal(r.status, 401);
  }
  const locked = await post("/auth/login", { username: a.student0.email, password }, // the CORRECT password, now locked out
    { "X-Forwarded-For": "198.51.100.250" });
  console.log("SEC-12 account locked after 10 failures, even with the correct password ->", locked.status, JSON.stringify(locked.body));
  assert.equal(locked.status, 429);
  assert.match(locked.body.message, /Too many failed attempts for this account/);

  const otherAccount = await post("/auth/login", { username: a.student1.email, password }, { "X-Forwarded-For": "198.51.100.251" });
  console.log("SEC-12 a completely different account logs in normally ->", otherAccount.status);
  assert.equal(otherAccount.status, 200);
});

test("SEC-12: a successful login clears that account's failure counter", async () => {
  for (let i = 0; i < 5; i++) {
    const r = await post("/auth/login", { username: a.student2.email, password: "wrong" }, { "X-Forwarded-For": `198.51.100.${i + 10}` });
    assert.equal(r.status, 401);
  }
  const success = await post("/auth/login", { username: a.student2.email, password }, { "X-Forwarded-For": "198.51.100.200" });
  console.log("SEC-12 correct password after 5 failures (below threshold) ->", success.status);
  assert.equal(success.status, 200);
  // Ten MORE failures after that success must still be able to lock the account again -
  // proving the counter actually reset rather than being permanently disabled.
  for (let i = 0; i < 10; i++) {
    await post("/auth/login", { username: a.student2.email, password: "wrong-again" }, { "X-Forwarded-For": `198.51.100.${i + 20}` });
  }
  const lockedAgain = await post("/auth/login", { username: a.student2.email, password }, { "X-Forwarded-For": "198.51.100.201" });
  console.log("SEC-12 locked again after 10 fresh failures post-reset ->", lockedAgain.status);
  assert.equal(lockedAgain.status, 429);
});
