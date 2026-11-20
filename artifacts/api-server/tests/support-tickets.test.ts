import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { setup, request, accounts as a, sentEmails, simulateFailure } from "./support.js";
import { db, engine, usersTable } from "./database.js";
import { supportTicketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

let runtime: Awaited<ReturnType<typeof setup>>;
let admin: { id: number; email: string; role: string; departmentId: number; token: string };

before(async () => {
  process.env.SUPPORT_ADMIN_EMAIL = "therealgautam2004@gmail.com";
  runtime = await setup();
  const [user] = await db.insert(usersTable).values({
    fullName: "Synthetic Support Admin",
    email: "support-admin@example.test",
    role: "admin",
    status: "approved",
  }).returning();
  admin = {
    id: user.id,
    email: user.email,
    role: user.role,
    departmentId: 0,
    token: jwt.sign({ id: user.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }),
  };
});

after(async () => {
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

test("valid anonymous submit stores a ticket and sends notification email", async () => {
  const initialSentCount = sentEmails.length;
  const payload = {
    category: "login_issue",
    message: "The submit button on the login screen is not responding to clicks.",
    name: "Dr. Anonymous Tester",
    email: "reporter@example.test",
    pageUrl: "/login",
    userAgent: "Mozilla/5.0 TestBrowser",
  };

  const res = await request(runtime.base, "/support/tickets", undefined, "POST", payload);
  assert.equal(res.status, 200);
  assert.ok(typeof res.body.referenceCode === "string");
  assert.match(res.body.referenceCode, /^SUP-[A-F0-9]{6}$/);

  // Verify in database
  const [stored] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.referenceCode, res.body.referenceCode))
    .limit(1);

  assert.ok(stored);
  assert.equal(stored.category, "login_issue");
  assert.equal(stored.message, payload.message);
  assert.equal(stored.name, payload.name);
  assert.equal(stored.email, payload.email);
  assert.equal(stored.userId, null);
  assert.equal(stored.status, "open");

  // Wait a tick for async email dispatch
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(sentEmails.length > initialSentCount);
  const sent = sentEmails[sentEmails.length - 1];
  assert.equal(sent.to, "therealgautam2004@gmail.com");
  assert.ok(sent.subject.includes(res.body.referenceCode));
  assert.ok(sent.subject.includes("login_issue"));
});

test("unauthenticated submit with non-login categories is rejected with 401", async () => {
  for (const cat of ["bug", "feature_request", "other"]) {
    const res = await request(runtime.base, "/support/tickets", undefined, "POST", {
      category: cat,
      message: "Trying to submit a non-login ticket without authenticating.",
    });
    assert.equal(res.status, 401, `Anonymous submit with category ${cat} must return 401`);
    assert.match(res.body.message, /sign in/i);
  }
});

test("invalid payloads rejected with 400", async () => {
  // Too short message (< 10 chars)
  const shortMsg = await request(runtime.base, "/support/tickets", undefined, "POST", {
    category: "login_issue",
    message: "Short",
  });
  assert.equal(shortMsg.status, 400);

  // Invalid category
  const badCategory = await request(runtime.base, "/support/tickets", undefined, "POST", {
    category: "hacked_category",
    message: "This is a valid length message for the ticket.",
  });
  assert.equal(badCategory.status, 400);

  // Invalid email format
  const badEmail = await request(runtime.base, "/support/tickets", undefined, "POST", {
    category: "login_issue",
    message: "This is a valid length message for the ticket.",
    email: "not-an-email",
  });
  assert.equal(badEmail.status, 400);
});

test("honeypot stores nothing and returns 200 with fake reference code", async () => {
  const countBefore = (await db.select().from(supportTicketsTable)).length;

  const res = await request(runtime.base, "/support/tickets", undefined, "POST", {
    category: "bug",
    message: "Spam bot message offering search engine optimization services.",
    honeypot: "http://spam-link.com",
  });

  assert.equal(res.status, 200);
  assert.ok(typeof res.body.referenceCode === "string");
  assert.match(res.body.referenceCode, /^SUP-[A-F0-9]{6}$/);

  // Verify nothing was saved in DB
  const countAfter = (await db.select().from(supportTicketsTable)).length;
  assert.equal(countAfter, countBefore);
});

test("signed-in submit sets user_id, invalid token works as anonymous", async () => {
  // 1. Valid signed in user (a.student0)
  const validUserRes = await request(runtime.base, "/support/tickets", a.student0, "POST", {
    category: "feature_request",
    message: "Please add an export button for clinical procedure logs.",
  });
  assert.equal(validUserRes.status, 200);

  const [storedStudentTicket] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.referenceCode, validUserRes.body.referenceCode))
    .limit(1);

  assert.ok(storedStudentTicket);
  assert.equal(storedStudentTicket.userId, a.student0.id);

  // 2. Malformed / expired token falls back to anonymous: non-login category gets 401
  const fakeTokenAccount = {
    ...a.student0,
    token: "invalid.token.payload",
  };
  const invalidTokenForbidden = await request(runtime.base, "/support/tickets", fakeTokenAccount, "POST", {
    category: "other",
    message: "General question about logbook submission deadlines.",
  });
  assert.equal(invalidTokenForbidden.status, 401);

  // Login issue category succeeds as anonymous even with malformed token
  const invalidTokenRes = await request(runtime.base, "/support/tickets", fakeTokenAccount, "POST", {
    category: "login_issue",
    message: "Cannot log in with my credentials.",
  });
  assert.equal(invalidTokenRes.status, 200);

  const [storedAnonTicket] = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.referenceCode, invalidTokenRes.body.referenceCode))
    .limit(1);

  assert.ok(storedAnonTicket);
  assert.equal(storedAnonTicket.userId, null);
  assert.equal(storedAnonTicket.category, "login_issue");
});

test("ticket is saved even when the mailer throws or fails", async () => {
  simulateFailure.enabled = true;
  try {
    const res = await request(runtime.base, "/support/tickets", undefined, "POST", {
      category: "login_issue",
      message: "Testing resilience when outgoing email provider is unavailable.",
    });
    assert.equal(res.status, 200);

    const [stored] = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.referenceCode, res.body.referenceCode))
      .limit(1);

    assert.ok(stored);
    assert.equal(stored.message, "Testing resilience when outgoing email provider is unavailable.");

    // Allow async failure handler to run
    await new Promise((r) => setTimeout(r, 100));
    const [updated] = await db
      .select()
      .from(supportTicketsTable)
      .where(eq(supportTicketsTable.id, stored.id))
      .limit(1);
    assert.equal(updated.emailStatus, "failed");
  } finally {
    simulateFailure.enabled = false;
  }
});

test("HTML characters in user input are escaped in outgoing email", async () => {
  const initialSentCount = sentEmails.length;
  const res = await request(runtime.base, "/support/tickets", undefined, "POST", {
    category: "login_issue",
    name: "Dr. <script>alert(1)</script>",
    message: "Danger <img src=x onerror=alert('xss')> & <tag>",
    pageUrl: "/login?a=<b>test</b>",
  });
  assert.equal(res.status, 200);

  // Wait a tick for async email dispatch
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(sentEmails.length > initialSentCount);
  const sent = sentEmails[sentEmails.length - 1];

  assert.doesNotMatch(sent.html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(sent.html, /<img src=x onerror=alert\('xss'\)>/);
  assert.ok(sent.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(sent.html.includes("&lt;img src=x onerror=alert(&#39;xss&#39;)&gt;"));
});

test("rate limit returns 429 after per-IP cap is reached", async () => {
  const extraHeaders = { "X-Forwarded-For": "198.51.100.99" };
  // Send 5 tickets (the max allowed per IP)
  for (let i = 0; i < 5; i++) {
    const res = await request(runtime.base, "/support/tickets", undefined, "POST", {
      category: "login_issue",
      message: `Rate limit test message number ${i + 1} with sufficient length.`,
    }, extraHeaders);
    assert.equal(res.status, 200);
  }

  // 6th ticket must be rate limited
  const blocked = await request(runtime.base, "/support/tickets", undefined, "POST", {
    category: "login_issue",
    message: "This 6th attempt should be blocked by the IP rate limiter.",
  }, extraHeaders);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get("Retry-After"), "3600");
});

test("admin-only access: AGENTS.md §11 evidence standard (401, 403, 200, 404)", async () => {
  // Create a known ticket to test PATCH
  const [ticket] = await db
    .insert(supportTicketsTable)
    .values({
      referenceCode: "SUP-TEST01",
      category: "bug",
      message: "Ticket created for §11 authorization tests.",
      status: "open",
    })
    .returning();

  // 1. Unauthenticated request -> 401
  const unauthList = await request(runtime.base, "/superadmin/support/tickets", undefined, "GET");
  assert.equal(unauthList.status, 401, "Unauthenticated GET /support/tickets must return 401");

  const unauthCount = await request(runtime.base, "/superadmin/support/tickets/count-open", undefined, "GET");
  assert.equal(unauthCount.status, 401, "Unauthenticated GET /support/tickets/count-open must return 401");

  const unauthPatch = await request(runtime.base, `/superadmin/support/tickets/${ticket.id}`, undefined, "PATCH", {
    status: "in_progress",
  });
  assert.equal(unauthPatch.status, 401, "Unauthenticated PATCH /support/tickets/:id must return 401");

  // 2. Authenticated, wrong role (non-admin: student, professor, hod) -> 403
  for (const account of [a.student0, a.faculty0, a.hod0]) {
    const forbiddenList = await request(runtime.base, "/superadmin/support/tickets", account, "GET");
    assert.equal(forbiddenList.status, 403, `Role ${account.role} must get 403 on GET /support/tickets`);

    const forbiddenCount = await request(runtime.base, "/superadmin/support/tickets/count-open", account, "GET");
    assert.equal(forbiddenCount.status, 403, `Role ${account.role} must get 403 on GET /support/tickets/count-open`);

    const forbiddenPatch = await request(runtime.base, `/superadmin/support/tickets/${ticket.id}`, account, "PATCH", {
      status: "in_progress",
    });
    assert.equal(forbiddenPatch.status, 403, `Role ${account.role} must get 403 on PATCH /support/tickets/:id`);
  }

  // 3. Authenticated, admin -> 200
  const adminList = await request(runtime.base, "/superadmin/support/tickets", admin, "GET");
  assert.equal(adminList.status, 200, "Admin GET /support/tickets must return 200");
  assert.ok(Array.isArray(adminList.body.tickets));
  assert.ok(adminList.body.total >= 1);

  const adminCount = await request(runtime.base, "/superadmin/support/tickets/count-open", admin, "GET");
  assert.equal(adminCount.status, 200, "Admin GET /support/tickets/count-open must return 200");
  assert.ok(typeof adminCount.body.count === "number");

  const adminPatch = await request(runtime.base, `/superadmin/support/tickets/${ticket.id}`, admin, "PATCH", {
    status: "resolved",
    adminNotes: "Investigated and resolved in test suite.",
  });
  assert.equal(adminPatch.status, 200, "Admin PATCH /support/tickets/:id must return 200");
  assert.equal(adminPatch.body.status, "resolved");
  assert.equal(adminPatch.body.adminNotes, "Investigated and resolved in test suite.");
  assert.ok(adminPatch.body.resolvedAt !== null);

  // 4. Authenticated, nonexistent row -> 404
  const nonexistentPatch = await request(runtime.base, "/superadmin/support/tickets/999999", admin, "PATCH", {
    status: "resolved",
  });
  assert.equal(nonexistentPatch.status, 404, "Admin PATCH non-existent ticket must return 404");
});
