// Certificate file uploads (private R2 object, proxied through the API).
// Storage is an in-memory fake; no real credentials exist or are needed.
// AGENTS.md §11: PUT and GET each prove 401 / 403 / 200 / 404 individually, plus the §4 ID-collision case.
import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { setup, request, accounts as a, type Account } from "./support.js";
import { engine, db, certificationsTable, studentsTable, usersTable } from "./database.js";

// Dummy values only; the module fails closed at import, so these must exist before it loads.
process.env.R2_ACCOUNT_ID = "test-account";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.R2_BUCKET_NAME = "test-bucket";
const storageModule = await import("../src/lib/file-storage.js");

const objects = new Map<string, { bytes: Buffer; contentType: string }>();
const deleted: string[] = [];
// Concurrency hook: the next put() stores its object, signals, then waits for the gate.
let gate: Promise<void> | null = null;
let onGateEntered: (() => void) | null = null;
const fake = {
  async put(key: string, bytes: Buffer, contentType: string) {
    objects.set(key, { bytes, contentType });
    if (gate) { const wait = gate; gate = null; onGateEntered?.(); await wait; }
  },
  async get(key: string) { return objects.get(key) ?? null; },
  async delete(key: string) { deleted.push(key); objects.delete(key); },
};

let runtime: Awaited<ReturnType<typeof setup>>;
before(async () => { storageModule.setFileStorageForTests(fake); runtime = await setup(); });
after(async () => {
  storageModule.setFileStorageForTests(undefined);
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

const JPEG = (size = 2048) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size - 4, 1)]);
const PNG = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 2)]);
const WEBP = () => Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x10, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(32, 3)]);
const PDF = (size = 2048) => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(size - 9, 0x20)]);

async function newCert(studentId: number, status: "pending" | "verified" | "rejected" = "pending") {
  const [row] = await db.insert(certificationsTable).values({ studentId, title: "BLS", issueDate: new Date("2026-01-01"),
    expiryDate: new Date("2027-01-01"), status }).returning();
  return row.id;
}

async function keyOf(certId: string) {
  const [row] = await db.select({ key: certificationsTable.certificateFileKey }).from(certificationsTable).where(eq(certificationsTable.id, certId));
  return row?.key ?? null;
}

async function putFile(path: string, who: Account | undefined, bytes: Buffer, headers: Record<string, string> = {}) {
  const response = await fetch(runtime.base + "/api" + path, { method: "PUT", body: new Uint8Array(bytes),
    headers: { "Content-Type": "application/octet-stream", ...(who ? { Authorization: "Bearer " + who.token } : {}), ...headers } });
  const body = await response.json().catch(() => null) as any;
  console.log(`PUT ${path} (${bytes.length} bytes) as ${who ? who.email : "nobody"} -> ${response.status} ${JSON.stringify(body)?.slice(0, 160)}`);
  return { status: response.status, body };
}

async function getFile(path: string, who?: Account) {
  const response = await fetch(runtime.base + "/api" + path, { headers: who ? { Authorization: "Bearer " + who.token } : {} });
  const bytes = Buffer.from(await response.arrayBuffer());
  let json: any = null;
  if ((response.headers.get("content-type") ?? "").includes("application/json")) json = JSON.parse(bytes.toString());
  console.log(`GET ${path} as ${who ? who.email : "nobody"} -> ${response.status} content-type=${response.headers.get("content-type")} nosniff=${response.headers.get("x-content-type-options")} bytes=${bytes.length}${json ? " " + JSON.stringify(json) : ""}`);
  return { status: response.status, headers: response.headers, bytes, body: json };
}

const filePath = (studentId: number, certId: string) => `/students/${studentId}/certifications/${certId}/file`;
const NO_SUCH_CERT = "00000000-0000-4000-8000-000000000000";

test("POST certification without a link is accepted (certificateUrl is optional)", async () => {
  const created = await request(runtime.base, `/students/${a.student0.studentId}/certifications`, a.student0, "POST",
    { title: "ACLS", provider: "Test body", issueDate: "2026-01-01", expiryDate: "2027-01-01" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.certificateUrl, null);
  const withLink = await request(runtime.base, `/students/${a.student0.studentId}/certifications`, a.student0, "POST",
    { title: "ACLS", provider: "Test body", issueDate: "2026-01-01", expiryDate: "2027-01-01", certificateUrl: "https://example.test/c" });
  assert.equal(withLink.status, 201);
  const http = await request(runtime.base, `/students/${a.student0.studentId}/certifications`, a.student0, "POST",
    { title: "ACLS", provider: "Test body", issueDate: "2026-01-01", expiryDate: "2027-01-01", certificateUrl: "http://example.test/c" });
  assert.equal(http.status, 400, "a link must still be HTTPS");
});

test("PUT file — four cases: 401, 403, 200, 404", async () => {
  const studentId = a.student0.studentId!;
  const certId = await newCert(studentId);
  const path = filePath(studentId, certId);

  const unauthenticated = await putFile(path, undefined, JPEG());
  assert.equal(unauthenticated.status, 401, "unauthenticated");

  await db.update(studentsTable).set({ mentorId: a.faculty0.id }).where(eq(studentsTable.id, studentId));
  for (const who of ["student20", "faculty0", "hod0", "hod1"] as const) {
    const denied = await putFile(path, a[who], JPEG());
    assert.equal(denied.status, 403, `${who} must not upload to another resident's certificate`);
  }
  assert.equal(objects.size, 0, "no object stored by any rejected call");

  const ok = await putFile(path, a.student0, JPEG(), { "X-File-Name": encodeURIComponent("my cert.png") });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.certificateFileType, "image/jpeg");
  assert.equal(ok.body.certificateFileSize, 2048);
  assert.equal(ok.body.certificateFileName, "my cert.png");
  assert.equal("certificateFileKey" in ok.body, false, "storage key must not be in the PUT response");
  const storedKey = await keyOf(certId);
  assert.match(storedKey!, /^certificates\/[0-9a-f-]{36}$/);
  assert.ok(objects.has(storedKey!));

  const missing = await putFile(filePath(studentId, NO_SUCH_CERT), a.student0, JPEG());
  assert.equal(missing.status, 404, "nonexistent certificate");
});

test("GET file — four cases: 401, 403, 200 (owner, mentor, same-department HOD), 404", async () => {
  const studentId = a.student0.studentId!;
  await db.update(studentsTable).set({ mentorId: a.faculty0.id }).where(eq(studentsTable.id, studentId));
  const certId = await newCert(studentId);
  const bytes = PDF(4096);
  const put = await putFile(filePath(studentId, certId), a.student0, bytes, { "X-File-Name": "proof.pdf" });
  assert.equal(put.status, 200);
  const path = filePath(studentId, certId);

  assert.equal((await getFile(path)).status, 401, "unauthenticated");
  for (const who of ["student20", "faculty20", "hod1"] as const) {
    assert.equal((await getFile(path, a[who])).status, 403, `${who} must be refused`);
  }
  for (const who of ["student0", "faculty0", "hod0"] as const) {
    const ok = await getFile(path, a[who]);
    assert.equal(ok.status, 200, `${who} may view`);
    assert.equal(ok.headers.get("content-type"), "application/pdf");
    assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
    assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.match(ok.headers.get("content-disposition") ?? "", /^inline; filename="proof\.pdf"/);
    assert.ok(ok.bytes.equals(bytes), "bytes round-trip");
  }

  assert.equal((await getFile(filePath(studentId, NO_SUCH_CERT), a.student0)).status, 404, "nonexistent certificate");
  const noFile = await newCert(studentId);
  assert.equal((await getFile(filePath(studentId, noFile), a.student0)).status, 404, "certificate without a file");
  const otherStudentCert = await newCert(a.student20.studentId!);
  assert.equal((await getFile(filePath(studentId, otherStudentCert), a.student0)).status, 404, "certificate belonging to another student");
});

test("§4 — a caller whose users.id equals another student's students.id is still refused", async () => {
  // Fixture: target student with students.id = 900001, and a different student whose USER id is 900001.
  const [targetUser] = await db.insert(usersTable).values({ fullName: "Collision Target", email: "collision-target@example.test",
    role: "student", status: "approved", departmentId: a.student0.departmentId, passwordHash: "x" }).returning();
  const [target] = await db.insert(studentsTable).values({ id: 900001, userId: targetUser.id, batch: "2026",
    registrationNumber: "COLL-T", kuhsId: "COLL-T", specialty: "Test", dateOfJoining: "2026-01-01" }).returning();
  const [callerUser] = await db.insert(usersTable).values({ id: 900001, fullName: "Collision Caller", email: "collision-caller@example.test",
    role: "student", status: "approved", departmentId: a.student0.departmentId, passwordHash: "x" }).returning();
  await db.insert(studentsTable).values({ userId: callerUser.id, batch: "2026", registrationNumber: "COLL-C", kuhsId: "COLL-C",
    specialty: "Test", dateOfJoining: "2026-01-01" });
  const caller: Account = { id: callerUser.id, email: callerUser.email, role: "student", departmentId: callerUser.departmentId!,
    token: jwt.sign({ id: callerUser.id, sessionVersion: 0 }, process.env.JWT_SECRET!, { expiresIn: "1h" }) };
  assert.equal(caller.id, target.id, "fixture: ids collide numerically");

  const certId = await newCert(target.id);
  const before = objects.size;
  assert.equal((await putFile(filePath(target.id, certId), caller, JPEG())).status, 403);
  assert.equal(objects.size, before, "nothing stored");
  assert.equal((await getFile(filePath(target.id, certId), caller)).status, 403);
});

test("size limits, real type detection, editability and replacement", async () => {
  const studentId = a.student0.studentId!;
  const certId = await newCert(studentId);
  const path = filePath(studentId, certId);

  assert.equal((await putFile(path, a.student0, JPEG(Math.round(1.1 * 1024 * 1024)))).status, 413, "image over 1 MB");
  assert.equal((await putFile(path, a.student0, PDF(Math.round(2.1 * 1024 * 1024)))).status, 413, "PDF over 2 MB");
  const html = await putFile(path, a.student0, Buffer.from("<html><script>alert(1)</script></html>"), { "Content-Type": "application/pdf" });
  assert.equal(html.status, 415, "HTML claiming to be a PDF");
  assert.equal((await putFile(path, a.student0, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).status, 415, "SVG");
  assert.equal((await putFile(path, a.student0, Buffer.alloc(0))).status, 400, "empty body");

  const png = await putFile(path, a.student0, PNG());
  assert.equal(png.status, 200);
  assert.equal(png.body.certificateFileType, "image/png");
  assert.equal(png.body.certificateFileName, "certificate.png", "fallback display name");
  assert.equal("certificateFileKey" in png.body, false);
  const firstKey = (await keyOf(certId))!;

  const webp = await putFile(path, a.student0, WEBP(), { "X-File-Name": encodeURIComponent("../../evil.webp") });
  assert.equal(webp.status, 200);
  assert.equal(webp.body.certificateFileType, "image/webp");
  assert.equal(webp.body.certificateFileName, "evil.webp", "path components stripped");
  const secondKey = (await keyOf(certId))!;
  assert.notEqual(secondKey, firstKey);
  assert.ok(deleted.includes(firstKey), "replacing a file deletes the old object");
  assert.equal(objects.has(firstKey), false);
  assert.ok(objects.has(secondKey));

  // Same statuses as PATCH (pending only): verified and rejected are both refused, nothing stored.
  for (const status of ["verified", "rejected"] as const) {
    const locked = await newCert(studentId, status);
    const before = objects.size;
    const refused = await putFile(filePath(studentId, locked), a.student0, JPEG());
    assert.equal(refused.status, 400, `${status} certificate is not editable`);
    assert.equal(objects.size, before, `nothing stored for a ${status} certificate`);
  }
});

test("no response carries the internal storage key: list, POST, PATCH, PUT, review", async () => {
  const studentId = a.student0.studentId!;
  await db.update(studentsTable).set({ mentorId: a.faculty0.id }).where(eq(studentsTable.id, studentId));
  const created = await request(runtime.base, `/students/${studentId}/certifications`, a.student0, "POST",
    { title: "Key strip", provider: "Test body", issueDate: "2026-01-01", expiryDate: "2027-01-01" });
  assert.equal(created.status, 201);
  assert.equal("certificateFileKey" in created.body, false, "POST");
  const certId = created.body.id as string;
  const put = await putFile(filePath(studentId, certId), a.student0, JPEG());
  assert.equal(put.status, 200);
  assert.equal("certificateFileKey" in put.body, false, "PUT");
  assert.equal(put.body.certificateFileType, "image/jpeg", "type stays so the client can tell a file exists");
  const stored = (await keyOf(certId))!;

  const patched = await request(runtime.base, `/students/${studentId}/certifications/${certId}`, a.student0, "PATCH", { title: "Key strip 2" });
  assert.equal(patched.status, 200);
  assert.equal("certificateFileKey" in patched.body, false, "PATCH");

  const list = await request(runtime.base, `/students/${studentId}/certifications`, a.student0);
  assert.equal(list.status, 200);
  assert.ok(list.body.some((row: any) => row.id === certId));
  assert.equal(list.body.some((row: any) => "certificateFileKey" in row), false, "GET list");
  const asProfessor = await request(runtime.base, `/students/${studentId}/certifications`, a.faculty0);
  assert.equal(asProfessor.body.some((row: any) => "certificateFileKey" in row), false, "GET list as professor");

  const reviewed = await request(runtime.base, `/students/${studentId}/certifications/${certId}/review`, a.faculty0, "PATCH", { status: "verified" });
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
  assert.equal("certificateFileKey" in reviewed.body, false, "review");
  assert.equal(JSON.stringify([created.body, put.body, patched.body, list.body, reviewed.body]).includes(stored), false, "key value appears nowhere");
});

test("two concurrent uploads to one certificate: the loser deletes its own object and gets 409", async () => {
  const studentId = a.student0.studentId!;
  const certId = await newCert(studentId);
  const path = filePath(studentId, certId);
  const before = new Set(objects.keys());
  let release!: () => void;
  gate = new Promise<void>((resolve) => { release = resolve; });
  let entered!: () => void;
  const enteredPut = new Promise<void>((resolve) => { entered = resolve; });
  onGateEntered = entered;
  const slow = putFile(path, a.student0, JPEG(3000));
  await enteredPut; // the first upload has stored its object but not yet updated the row
  const fast = await putFile(path, a.student0, PNG());
  assert.equal(fast.status, 200);
  release();
  const lost = await slow;
  assert.equal(lost.status, 409, "the stale upload must lose");
  const winnerKey = (await keyOf(certId))!;
  const added = [...objects.keys()].filter((key) => !before.has(key));
  assert.deepEqual(added, [winnerKey], "only the winner's object remains; the loser's was deleted");
});

test("a failed row update after the object was stored deletes the new object", async () => {
  const studentId = a.student0.studentId!;
  const certId = await newCert(studentId);
  const before = objects.size;
  const originalUpdate = db.update;
  (db as any).update = () => { throw new Error("forced update failure"); };
  let response;
  try { response = await putFile(filePath(studentId, certId), a.student0, JPEG()); }
  finally { (db as any).update = originalUpdate; }
  assert.equal(response.status, 500);
  assert.equal(objects.size, before, "the orphaned object was removed");
  assert.equal(await keyOf(certId), null);
});

test("deleteStoredFilesBestEffort: failures are counted, never keyed, and never thrown", async () => {
  const logged: object[] = [];
  const failing = { ...fake, async delete() { throw new Error("secret-storage-error-body certificates/abc"); } };
  storageModule.setFileStorageForTests(failing);
  try {
    await storageModule.deleteStoredFilesBestEffort(["certificates/key-one", "certificates/key-two"], { error: (obj) => { logged.push(obj); } });
  } finally { storageModule.setFileStorageForTests(fake); }
  assert.deepEqual(logged, [{ failed: 2, total: 2 }]);
  assert.equal(JSON.stringify(logged).includes("certificates/"), false);
});

test("a malformed certificate id is a 404", async () => {
  assert.equal((await putFile(`/students/${a.student0.studentId}/certifications/not-a-uuid/file`, a.student0, JPEG())).status, 404);
});

test("storage guard: refuses new uploads past 8 GB with 507", async () => {
  const ids: string[] = [];
  for (let i = 0; i < 5; i++) {
    const id = await newCert(a.student20.studentId!);
    await db.update(certificationsTable).set({ certificateFileSize: 2147483647 }).where(eq(certificationsTable.id, id));
    ids.push(id);
  }
  try {
    const certId = await newCert(a.student0.studentId!);
    const objectsBefore = objects.size;
    const response = await putFile(filePath(a.student0.studentId!, certId), a.student0, JPEG());
    assert.equal(response.status, 507);
    assert.equal(objects.size, objectsBefore, "storage received nothing on 507");
  } finally {
    for (const id of ids) await db.update(certificationsTable).set({ certificateFileSize: null }).where(eq(certificationsTable.id, id));
  }
});

test("storage config fails closed, naming the missing variable and never a value", () => {
  for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]) {
    const env = { R2_ACCOUNT_ID: "x", R2_ACCESS_KEY_ID: "x", R2_SECRET_ACCESS_KEY: "x", R2_BUCKET_NAME: "x", [name]: "" };
    assert.throws(() => storageModule.loadStorageConfig(env), (error: Error) => error.message === `Missing required environment variable: ${name}`);
  }
  assert.doesNotThrow(() => storageModule.loadStorageConfig({ R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "b", R2_SECRET_ACCESS_KEY: "c", R2_BUCKET_NAME: "d" }));
});

test("startup: importing the storage module with one variable missing throws naming it", () => {
  for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]) {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env[name];
    const run = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "await import('./src/lib/file-storage.ts')"],
      { env, encoding: "utf8", cwd: new URL("..", import.meta.url) });
    assert.notEqual(run.status, 0, `${name} missing must stop startup`);
    assert.ok(run.stderr.includes(`Missing required environment variable: ${name}`), run.stderr.slice(0, 400));
    for (const dummy of ["test-account", "test-access-key", "test-secret-key", "test-bucket"]) {
      assert.equal(run.stderr.includes(dummy), false, `stderr must not contain the value of a configured variable (${dummy})`);
    }
  }
});
