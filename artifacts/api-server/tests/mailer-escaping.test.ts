// Registration is public, so a self-registered name reaches the HOD's inbox inside an email
// sent from the application's own address. Markup in that name must arrive as text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sendAccountCreatedEmail, sendHODApprovalRequestEmail, sendHODAppointmentEmail, sendStudentApprovalEmail } from "../src/lib/mailer.js";

process.env.RESEND_API_KEY = "test-only-resend-key";
process.env.EMAIL_FROM = "noreply@elogbookgothos.test";

const sent: Array<{ to: string; subject: string; text: string; html: string }> = [];

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url: string | URL | Request, options?: RequestInit) => {
  if (url === "https://api.resend.com/emails") {
    const body = JSON.parse(options?.body as string);
    sent.push(body);
    return { ok: true, status: 200 } as Response;
  }
  return originalFetch ? originalFetch(url, options) : Promise.reject(new Error("fetch not found"));
};

const injected = `Asha <a href="https://phish.example/login">Your session expired - sign in again</a>`;

test("HOD approval email renders a registrant's name and registration number as text, not markup", async () => {
  sent.length = 0;
  await sendHODApprovalRequestEmail("hod@example.test", "Test HOD", injected, `REG-1"><img src=x>`, "Test Department");
  const [message] = sent;
  assert.ok(!message.html.includes(`<a href="https://phish.example`), "registrant markup reached the HTML body");
  assert.ok(!message.html.includes(`<img src=x>`), "registration number markup reached the HTML body");
  assert.ok(message.html.includes("&lt;a href=&quot;https://phish.example/login&quot;&gt;"));
  // The plain-text part is not HTML, so it keeps the value as typed.
  assert.ok(message.text.includes(injected));
});

test("account-created email escapes the name, email and password in the HTML body", async () => {
  sent.length = 0;
  await sendAccountCreatedEmail("new@example.test", injected, "pa<ss>&word", "student", "Test <b>Department</b>");
  const [message] = sent;
  assert.ok(!message.html.includes(`<a href="https://phish.example`));
  assert.ok(!message.html.includes("<b>Department</b>"));
  assert.ok(message.html.includes("pa&lt;ss&gt;&amp;word"), "the password must still be shown, escaped");
  assert.ok(message.text.includes("pa<ss>&word"));
});

test("HOD appointment and student approval use the shared mail form and escape user content", async () => {
  sent.length = 0;
  await sendHODAppointmentEmail("hod@example.test", injected, "Test <b>Department</b>");
  await sendStudentApprovalEmail("student@example.test", injected, "Test <b>Department</b>");
  assert.equal(sent.length, 2);
  assert.equal(sent[0].subject, "You Have Been Appointed HOD in E-LogBook");
  assert.equal(sent[1].subject, "Your E-LogBook Account Has Been Approved");
  for (const message of sent) {
    assert.ok(!message.html.includes(`<a href="https://phish.example`));
    assert.ok(!message.html.includes("<b>Department</b>"));
    assert.ok(message.html.includes("&lt;a href=&quot;https://phish.example/login&quot;&gt;"));
    assert.ok(message.html.includes("E-Logbook Support Team"));
  }
  assert.match(sent[0].text, /existing account/);
  assert.match(sent[1].text, /has been approved/);
});

test("mail transport rejects missing config and provider errors without exposing response bodies", async () => {
  const key = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "";
  await assert.rejects(() => sendStudentApprovalEmail("student@example.test", "Test Student", "Test Department"), /not configured/);
  process.env.RESEND_API_KEY = key;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => "private provider response" } as Response);
  try {
    await assert.rejects(
      () => sendStudentApprovalEmail("student@example.test", "Test Student", "Test Department"),
      (error: Error) => error.message === "Email provider rejected request (503)" && !error.message.includes("private provider response"),
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
