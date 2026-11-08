import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { setup, accounts as a, password } from '../api-server/tests/support.ts';
import { engine, db, paymentsTable, subscriptionPlansTable } from '../api-server/tests/database.ts';
const require = createRequire(new URL('../api-server/package.json', import.meta.url));
const { eq } = require('drizzle-orm');
process.env.RAZORPAY_KEY_ID = 'local-test-only-key-id';
process.env.RAZORPAY_KEY_SECRET = 'local-test-only-key-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'local-test-only-webhook-secret';
const interceptedFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => { if (url === 'https://api.resend.com/emails') return interceptedFetch(url, options); throw new Error('Network disabled by reproduction harness'); };
const runtime = await setup();
const { default: payments } = await import('../api-server/src/routes/payments.ts');
const { default: webhook } = await import('../api-server/src/routes/payments-webhook.ts');
const { default: auth } = await import('../api-server/src/routes/auth.ts');
const { default: admin } = await import('../api-server/src/routes/admin.ts');
const evidence = [];
// Actual handlers and route-local validation; router-level auth is an injected precondition.
async function invoke(router, path, supplied = {}) {
  const route = router.stack.find(layer => layer.route?.path === path)?.route;
  assert.ok(route, path);
  const req = { body: {}, headers: {}, params: {}, log: { error() {}, info() {}, warn() {} }, ...supplied };
  const res = { statusCode: 200, body: undefined,
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; },
    sendStatus(code) { this.statusCode = code; this.body = String(code); return this; }, cookie() { return this; }, setHeader() { return this; } };
  async function step(index) {
    const handle = route.stack[index]?.handle;
    if (!handle) return;
    let next;
    await handle(req, res, error => { if (error) throw error; next = step(index + 1); });
    if (next) await next;
  }
  await step(0);
  return { status: res.statusCode, body: res.body };
}
const row = async order => (await db.select().from(paymentsTable).where(eq(paymentsTable.razorpayOrderId, order)))[0];
const verifyBody = (order, payment) => ({ razorpay_order_id: order, razorpay_payment_id: payment, razorpay_signature: crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${order}|${payment}`).digest('hex') });
const capture = (order, payment) => {
  const body = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: payment, order_id: order, amount: 140000 } } } }));
  return { body, headers: { 'x-razorpay-signature': crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex') } };
};
const login = account => invoke(auth, '/login', { body: { username: account.email, password } });
const approve = account => invoke(admin, '/students/:id/approve', { params: { id: String(account.id) }, user: a.hod0 });
try {
  const [plan] = await db.select().from(subscriptionPlansTable).limit(1);
  await db.insert(paymentsTable).values({ userId: a.pending0.id, planId: plan.id, razorpayOrderId: 'order_local_retry', amountPaise: 140000, currency: 'INR', status: 'failed' });
  const verification = await invoke(payments, '/verify', { paymentUser: { id: a.pending0.id }, body: verifyBody('order_local_retry', 'pay_local_success') });
  assert.equal(verification.status, 409);
  assert.equal((await row('order_local_retry')).status, 'failed');
  const unpaidLogin = await login(a.pending0);
  const approval = await approve(a.pending0);
  assert.equal(unpaidLogin.status, 402);
  assert.equal(approval.status, 402);
  evidence.push({ scenario: 'Valid signed checkout after earlier failed attempt', verification, localPaymentStatus: 'failed', login: { status: unpaidLogin.status, message: unpaidLogin.body.message }, approval });
  const recovery = await invoke(webhook, '/webhook', capture('order_local_retry', 'pay_local_success'));
  assert.equal(recovery.status, 200);
  assert.equal((await row('order_local_retry')).status, 'paid');
  const accepted = await approve(a.pending0);
  assert.equal(accepted.status, 200);
  evidence.push({ scenario: 'Control: captured webhook repairs failed row', webhook: recovery, localPaymentStatus: 'paid', approval: accepted });
  await db.insert(paymentsTable).values({ userId: a.pending1.id, planId: plan.id, razorpayOrderId: 'order_local_db_error', amountPaise: 140000, currency: 'INR', status: 'created' });
  const originalUpdate = db.update;
  let acknowledged;
  try {
    db.update = () => { throw new Error('Synthetic transient storage failure'); };
    acknowledged = await invoke(webhook, '/webhook', capture('order_local_db_error', 'pay_local_captured'));
  } finally { db.update = originalUpdate; }
  assert.equal(acknowledged.status, 200);
  assert.equal((await row('order_local_db_error')).status, 'created');
  const stillUnpaid = await login(a.pending1);
  assert.equal(stillUnpaid.status, 402);
  evidence.push({ scenario: 'Captured webhook while database write throws', webhook: acknowledged, localPaymentStatus: 'created', login: { status: stillUnpaid.status, message: stillUnpaid.body.message } });
  const { hardDeleteUserCascade } = await import('../api-server/src/lib/hard-delete-user.ts');
  await db.transaction(tx => hardDeleteUserCascade(tx, a.pending1.id, 'student', a.hod1.id));
  assert.equal(await row('order_local_db_error'), undefined);
  const afterDelete = await invoke(webhook, '/webhook', capture('order_local_db_error', 'pay_local_captured'));
  assert.equal(afterDelete.status, 200);
  assert.equal(await row('order_local_db_error'), undefined);
  evidence.push({ scenario: 'Hard deletion removes order before capture reconciliation', webhook: afterDelete, localPaymentRow: null });
  await writeFile(new URL('./payment-reproduction-results.json', import.meta.url), JSON.stringify({ method: 'Direct handler calls against in-memory PGlite; not HTTP integration', evidence }, null, 2));
  console.log(JSON.stringify({ method: 'Direct handler/PGlite reproductions', passed: evidence.length, evidence }, null, 2));
} finally {
  await new Promise(done => runtime.server.close(() => done()));
  await engine.close();
}
