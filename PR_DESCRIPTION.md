## What changed

Adds `POST /api/payments/webhook` so a payment is recorded even if the applicant's browser
dies before calling `/api/payments/verify`. Today, nothing marks a payment `'paid'` except
that browser call - on live keys, that means Razorpay can take money from a real resident
and the database says `'created'` forever.

- [`artifacts/api-server/src/routes/payments-webhook.ts`](artifacts/api-server/src/routes/payments-webhook.ts) (new file): verifies
  `X-Razorpay-Signature` as an HMAC-SHA256 over the raw request body bytes, keyed with a
  separate `RAZORPAY_WEBHOOK_SECRET` (not the same secret `/verify` uses, and not the same
  HMAC construction). Looks up the `payments` row by `razorpay_order_id` from the
  signature-verified payload and uses that row's own `userId` - a `userId` is never read from
  the request body or trusted from the payload. Handles `payment.captured` and
  `payment.failed`; every other event gets a `200` with nothing written, so Razorpay never
  retries an event this endpoint doesn't act on. Writes are idempotent UPDATEs gated on the
  row's current status (`created`/`failed` -> `paid` on capture; `created` -> `failed` on
  failure), so replayed or out-of-order webhook deliveries are no-ops. Compares the captured
  amount against the stored `amountPaise` before writing `'paid'`. The database lookup and
  both updates are wrapped in try/catch so a database error can never surface as a non-2xx to
  Razorpay.
- [`artifacts/api-server/src/app.ts`](artifacts/api-server/src/app.ts): the global `express.json()` parser is mounted
  ahead of the router and applies to every path, including this one - it would otherwise
  consume the request body before the raw bytes needed for signature verification are
  available. `/api/payments/webhook` alone is now excluded from `express.json()` and given
  its own `express.raw({ type: "application/json" })` parser mounted ahead of it. No other
  route's body handling changes.
- [`artifacts/api-server/src/routes/index.ts`](artifacts/api-server/src/routes/index.ts): the webhook is mounted as its own
  router, ahead of the existing payments router. The existing payments router
  (`payments.ts:12`) gates every route it owns behind `requirePaymentToken`, which an
  unauthenticated Razorpay webhook call can never satisfy - mounting the webhook there would
  make it permanently unreachable. Every other `/payments/*` path is unaffected and still
  falls through to the existing router.
- [`.env.example`](.env.example): documents `RAZORPAY_WEBHOOK_SECRET` and states plainly that it is not
  the same value as `RAZORPAY_KEY_SECRET`.
- [`artifacts/api-server/tests/payments-webhook.test.ts`](artifacts/api-server/tests/payments-webhook.test.ts) (new file): 13 tests, listed
  under Evidence below.

## Why

Razorpay debits the payer as soon as the card is charged, independent of whether the
browser ever calls back. A closed tab, a lost connection, or a crash between "card charged"
and "call /verify" leaves Razorpay holding the money and this application's `payments` row
stuck at `'created'` with no path to `'paid'`. A server-to-server webhook is the only channel
that doesn't depend on the applicant's browser surviving the redirect back from checkout.

Two follow-up fixes were made to the first version of this endpoint, both because Razorpay's
actual behavior didn't match the first draft's assumptions:

- Razorpay allows retrying payment against the same `order_id`. A declined card followed by
  a successful one produces `payment.failed` then `payment.captured` for the *same*
  `order_id`. The first version only moved a row from `'created'` to `'paid'`; the second
  webhook call matched zero rows and silently did nothing, leaving a paid order marked
  `'failed'` permanently. The update now also accepts `'failed'` as a starting state (never
  `'paid'`, never `'refunded'`).
- Razorpay treats any non-2xx response as a failed delivery, retries with backoff for 24
  hours, and then disables the webhook entirely. A database connection blip or a constraint
  violation inside the handler would have taken the webhook offline for every future payment,
  not just the one that failed. The handler now catches any database error, still responds
  `200`, and leaves the row at its previous status rather than risk the webhook being
  disabled.

## Evidence

All 13 webhook test cases below were run against `tests/payments-webhook.test.ts`, executing
against an in-process PGlite database (`tests/database.ts`) - **not production, and not any
real Postgres instance.** These are fixture tests proving the route's own logic (signature
check, event routing, ownership lookup, amount check, idempotent and retry-safe writes,
error handling). **They do not prove the raw-body middleware wiring in `app.ts` survives
real Razorpay HTTP traffic** (real chunked/streamed bodies, real header casing, a live
`RAZORPAY_WEBHOOK_SECRET`) - that has not yet been tested against a live Razorpay test
webhook.

| # | Case | Status |
|---|---|---|
| 1 | Missing `X-Razorpay-Signature` header | `400`, row unchanged |
| 2 | Wrong signature | `400`, row unchanged |
| 3 | `payment.captured`, known order at `created` | `200`, row -> `paid`, `razorpay_payment_id` stored |
| 4 | Same request replayed a second time | `200`, row still `paid`, unchanged |
| 5 | `payment.captured`, unknown order id | `200`, no row created |
| 6 | Unhandled event `subscription.charged` | `200`, nothing written |
| 7 | `payment.failed` on a `created` row | `200`, row -> `failed` |
| 8 | `payment.failed` on a row already `paid` | `200`, row still `paid` |
| 9 | `payment.captured`, amount mismatch | `200`, row still `created` |
| 10 | `payment.failed` then `payment.captured` on the same order id | `200`, row ends at `paid` with the captured event's payment id |
| 11 | `payment.captured` against a row already `refunded` | `200`, row still `refunded`, `razorpay_payment_id` unchanged |
| 12 | `RAZORPAY_WEBHOOK_SECRET` unset | `400`, row unchanged |
| 13 | Second `created` row for a user who already has a `paid` row, then `payment.captured` for it | `200`, second row still `created` (unique violation caught and logged, not raised) |

Full suite (32 tests: 19 pre-existing + 13 webhook) passes; typecheck is clean.

## What this does NOT do

- Does not touch `routes/auth.ts`, `routes/admin.ts`, the login `402` path, the HOD payment
  gate, `/api/payments/create-order`, `/api/payments/verify`, or `HODPortal.tsx`.
- Does not add a boot-time guard for `RAZORPAY_WEBHOOK_SECRET`. A missing value is discovered
  only when a webhook actually arrives.
- Does not implement refunds. `refundStatus` / `refundedAt` / `refundNote` remain unused by
  this endpoint.
- Does not add, change, or touch any migration, schema definition, or constraint - including
  `payments_one_paid_per_user`.
- Does not add any automatic reconciliation, alerting, or refund path for the duplicate-paid
  scenario described below - it only makes that scenario visible in the logs.

## Known limitations

- **`payments_one_paid_per_user` (a partial unique index on `user_id` WHERE `status = 'paid'`,
  defined at `lib/db/migrations/0003_subscriptions_payments.sql:39` and
  `lib/db/src/schema/payments.ts:25`) allows exactly one `'paid'` row per user, but a user can
  legitimately end up with more than one payments row in the first place.**
  `/api/payments/create-order` (`payments.ts:40`, `REUSE_WINDOW_MS`) only reuses an existing
  `'created'` order within a 30-minute window; once that window lapses, a fresh
  `create-order` call creates a second, independent row for the same user without deleting or
  reconciling the first. If both orders are later captured by Razorpay, the second
  `UPDATE ... SET status = 'paid'` throws a Postgres `23505` unique violation, which this
  handler catches and answers `200` for - meaning the user was charged twice by Razorpay, only
  one of the two charges is recorded as `'paid'` in this database, and the second row is left
  behind at whatever status it was in before (`'created'` or `'failed'`). This now logs a
  distinct `"...MANUAL RECONCILIATION REQUIRED"` error-level message when it happens, so it is
  findable rather than indistinguishable from a transient database error - but no automatic
  reconciliation, alerting beyond the log line, or refund exists. Finding and resolving an
  occurrence today means reading the logs.
- **Any other database error inside the handler (a connection blip, a timeout, anything not a
  `23505`) is deliberately swallowed and answered `200`.** This is by design: Razorpay retries
  a non-2xx response for 24 hours and then disables the webhook outright, and losing one
  delivery is preferable to losing the webhook for every future payment. The row stays at its
  previous status in this case, and the browser `/verify` path remains the only way that
  payment gets recorded as `'paid'`.
- **There is no boot-time guard on `RAZORPAY_WEBHOOK_SECRET`.** If it is unset or empty in a
  deployed environment, the server still starts normally, and the absence is only discovered
  when an actual webhook delivery arrives and gets rejected with `400` (logged at error level
  with a message naming the missing variable, not conflated with a forged-signature warning).
- **This webhook has not been tested end to end against a real Razorpay test webhook.** Every
  test above runs against PGlite with a synthetic secret and a hand-built payload/signature
  pair; the raw-body middleware ordering in `app.ts`, real HTTP header casing, and Razorpay's
  actual request framing have not been exercised.
