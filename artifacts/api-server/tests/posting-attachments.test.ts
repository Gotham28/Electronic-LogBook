import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { accounts, departmentIds, request, setup, type Account } from "./support.js";
import { db, engine, departmentConfigsTable, postingAttachmentCleanupTable, postingsTable } from "./database.js";
import { setFileStorageForTests, type FileStorage } from "../src/lib/file-storage.js";
import { cleanUpPostingAttachments, postingAttachmentKey } from "../src/lib/posting-attachment-storage.js";

const objects = new Map<string, { bytes: Buffer; contentType: string }>();
let failDelete = false;
let failPut = false;
const storage: FileStorage = {
  async put(key, bytes, contentType) {
    objects.set(key, { bytes, contentType });
    if (failPut) throw new Error("Test R2 upload failure after write");
  },
  async get(key) { return objects.get(key) ?? null; },
  async delete(key) {
    if (failDelete) throw new Error("Test R2 delete failure");
    objects.delete(key);
  },
};
const pdf = Buffer.from("%PDF-1.4\n%%EOF\n");
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
const noSuchFile = "00000000-0000-4000-8000-000000000000";
let runtime: Awaited<ReturnType<typeof setup>>;

before(async () => {
  setFileStorageForTests(storage);
  runtime = await setup();
  await db.update(departmentConfigsTable).set({ enabledFeatures: { freeTextPostingUnit: true, postingAttachments: true } })
    .where(eq(departmentConfigsTable.departmentId, departmentIds[0]));
});

after(async () => {
  setFileStorageForTests(undefined);
  if (runtime) await new Promise<void>((done) => runtime.server.close(() => done()));
  await engine.close();
});

async function createPosting(options: Partial<typeof postingsTable.$inferInsert> = {}) {
  const [posting] = await db.insert(postingsTable).values({
    studentId: accounts.student0.studentId!, supervisorId: accounts.faculty0.id,
    ward: "Synthetic posting", startDate: "2026-01-01", endDate: "2026-01-05",
    ...options,
  }).returning();
  return posting;
}

function pathFor(posting: { id: number; studentId: number }) {
  return `/students/${posting.studentId}/postings/${posting.id}/attachments`;
}

async function upload(path: string, account: Account | undefined, bytes = pdf, name = "report.pdf", origin?: string) {
  const response = await fetch(runtime.base + "/api" + path, {
    method: "POST", body: new Uint8Array(bytes),
    headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(name),
      ...(account ? { Authorization: `Bearer ${account.token}` } : {}), ...(origin ? { Origin: origin } : {}) },
  });
  return { status: response.status, body: await response.json() as any };
}

async function download(path: string, account?: Account) {
  return fetch(runtime.base + "/api" + path, { headers: account ? { Authorization: `Bearer ${account.token}` } : {} });
}

test("posting attachments require authentication, actual ownership and the assigned reviewer", async (t) => {
  const posting = await createPosting();
  const path = pathFor(posting);
  for (const [who, expected] of [[undefined, 401], [accounts.student20, 403], [accounts.student0, 200]] as const) {
    const result = await request(runtime.base, path, who);
    t.diagnostic(`GET /api${path} as ${who?.email ?? "unauthenticated"} → ${result.status} ${JSON.stringify(result.body)}`);
    assert.equal(result.status, expected);
  }
  const missing = pathFor({ ...posting, id: 999999 });
  const result = await request(runtime.base, missing, accounts.student0);
  t.diagnostic(`GET /api${missing} as the owner → ${result.status} ${JSON.stringify(result.body)}`);
  assert.equal(result.status, 404);
  assert.equal((await request(runtime.base, path, accounts.faculty0)).status, 200);
  assert.equal((await request(runtime.base, path, accounts.faculty20)).status, 403);
  assert.equal((await request(runtime.base, path, accounts.hod0)).status, 200);
  assert.equal((await request(runtime.base, path, accounts.hod1)).status, 403);

  // Supplying your own ID in the URL cannot grant access to somebody else's posting.
  const otherPosting = await createPosting({ studentId: accounts.student20.studentId! });
  assert.equal((await request(runtime.base, pathFor({ ...otherPosting, studentId: posting.studentId }), accounts.student0)).status, 403);
  for (const [url, who, expected] of [
    [path, undefined, 401], [path, accounts.student20, 403], [path, accounts.faculty0, 403],
    [missing, accounts.student0, 404], [path, accounts.student0, 201],
  ] as const) {
    const response = await upload(url, who);
    t.diagnostic(`POST /api${url} as ${who?.email ?? "unauthenticated"} → ${response.status} ${JSON.stringify(response.body)}`);
    assert.equal(response.status, expected);
  }
});

test("the department toggle gates uploads, and only PDFs and JPEGs within the size limit are accepted", async () => {
  const disabled = await createPosting({ studentId: accounts.student1.studentId!, supervisorId: accounts.faculty1.id });
  assert.equal((await upload(pathFor(disabled), accounts.student1)).status, 403);
  const setting = "/admin/department/config/settings/postingAttachments";
  assert.equal((await request(runtime.base, setting, accounts.student1, "PATCH", { value: true, expectedValue: null })).status, 403);
  assert.equal((await request(runtime.base, setting, accounts.hod1, "PATCH", { value: true, expectedValue: null })).status, 200);
  assert.equal((await upload(pathFor(disabled), accounts.student1)).status, 201);

  const path = pathFor(await createPosting());
  assert.equal((await upload(path, accounts.student0, pdf, "report.pdf", "https://untrusted.example.test")).status, 403);
  assert.equal((await upload(path, accounts.student0, Buffer.from("<html>"), "photo.jpg")).status, 415);
  const file = await upload(path, accounts.student0, jpeg, "../../image.pdf");
  assert.equal(file.status, 201);
  assert.deepEqual(file.body, { id: file.body.id, fileName: "image.jpg", contentType: "image/jpeg", byteSize: jpeg.length });
  for (let slot = 1; slot < 5; slot++) assert.equal((await upload(path, accounts.student0)).status, 201);
  assert.equal((await upload(path, accounts.student0)).status, 409);
});

test("JPEGs have a 1 MB limit and PDFs have a 3 MB limit", async () => {
  const path = pathFor(await createPosting());
  for (const [fixture, name, limitMb] of [[jpeg, "posting.jpg", 1], [pdf, "posting.pdf", 3]] as const) {
    const limit = limitMb * 1024 * 1024;
    const bytes = Buffer.alloc(limit + 1);
    fixture.copy(bytes);
    const atLimit = await upload(path, accounts.student0, bytes.subarray(0, limit), name);
    assert.equal(atLimit.status, 201);
    assert.equal(atLimit.body.byteSize, limit);
    assert.equal((await upload(path, accounts.student0, bytes, name)).status, 413);
  }
});

test("downloads stay private and removal queues retryable R2 cleanup", async (t) => {
  const posting = await createPosting();
  const path = pathFor(posting);
  const uploaded = await upload(path, accounts.student0);
  assert.equal(uploaded.status, 201);
  const filePath = `${path}/${uploaded.body.id}`;
  const missing = `${path}/${noSuchFile}`;
  for (const [url, who, expected] of [
    [filePath, undefined, 401], [filePath, accounts.student20, 403],
    [filePath, accounts.student0, 200], [missing, accounts.student0, 404],
  ] as const) {
    const response = await download(url, who);
    const bytes = Buffer.from(await response.arrayBuffer());
    t.diagnostic(`GET /api${url} as ${who?.email ?? "unauthenticated"} → ${response.status} ${expected === 200 ? `${bytes.length} PDF bytes` : bytes.toString()}`);
    assert.equal(response.status, expected);
    if (expected === 200) {
      assert.deepEqual(bytes, pdf);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.match(response.headers.get("content-disposition") ?? "", /^attachment;/);
    }
  }
  const reviewerCopy = await download(filePath, accounts.faculty0);
  assert.equal(reviewerCopy.status, 200);
  assert.deepEqual(Buffer.from(await reviewerCopy.arrayBuffer()), pdf);
  const differentPosting = pathFor(await createPosting());
  const mismatched = await download(`${differentPosting}/${uploaded.body.id}`, accounts.student0);
  assert.equal(mismatched.status, 404);
  await mismatched.arrayBuffer();
  for (const [url, who, expected] of [
    [filePath, undefined, 401], [filePath, accounts.student20, 403],
    [missing, accounts.student0, 404], [filePath, accounts.student0, 200],
  ] as const) {
    const response = await request(runtime.base, url, who, "DELETE");
    t.diagnostic(`DELETE /api${url} as ${who?.email ?? "unauthenticated"} → ${response.status} ${JSON.stringify(response.body)}`);
    assert.equal(response.status, expected);
  }
  assert.equal((await download(filePath, accounts.student0)).status, 404);

  const key = postingAttachmentKey(uploaded.body.id);
  failDelete = true;
  try { await cleanUpPostingAttachments(); } finally { failDelete = false; }
  assert.ok(objects.has(key), "failed cleanup leaves the object queued");
  await db.update(postingAttachmentCleanupTable).set({ readyAt: new Date(0) }).where(eq(postingAttachmentCleanupTable.id, uploaded.body.id));
  await cleanUpPostingAttachments();
  assert.ok(!objects.has(key));

  const another = await upload(path, accounts.student0);
  assert.equal(another.status, 201);
  await db.delete(postingsTable).where(eq(postingsTable.id, posting.id));
  await cleanUpPostingAttachments();
  assert.ok(!objects.has(postingAttachmentKey(another.body.id)), "parent deletion queues cleanup too");
});

test("reviewed postings stay locked and a failed upload never becomes visible", async () => {
  const reviewed = await createPosting({ status: "verified" });
  assert.equal((await upload(pathFor(reviewed), accounts.student0)).status, 409);
  const autoVerified = await createPosting({ status: "verified", supervisorId: null });
  const path = pathFor(autoVerified);
  const before = new Set(objects.keys());
  failPut = true;
  try { assert.equal((await upload(path, accounts.student0)).status, 500); } finally { failPut = false; }
  const failedKey = [...objects.keys()].find((key) => !before.has(key))!;
  assert.ok(failedKey);
  assert.deepEqual((await request(runtime.base, path, accounts.student0)).body, []);
  await db.update(postingAttachmentCleanupTable).set({ readyAt: new Date(0) });
  await cleanUpPostingAttachments();
  assert.ok(!objects.has(failedKey));
  assert.equal((await upload(path, accounts.student0)).status, 201);
});
