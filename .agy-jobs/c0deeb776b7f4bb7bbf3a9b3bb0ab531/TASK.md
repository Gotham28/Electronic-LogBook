# Antigravity dispatch 71 — Registration OTP: move email to Resend, fail cleanly

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated
2026-09-30, `main` @ `eb1e37c`. If this is not that repo, stop, say which repo this is, and
wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

This means you cannot run tests, typecheck, `pnpm install` or grep. Claude Code runs all of
those after you return. Write the code so it will pass them, and say in `HANDOFF.md` which
checks you could not run.

## Read first
- `AGENTS.md` (repo root) — read §3, §8, §9, §10, §12 and §14.5. Note §16 is a rule map:
  citations of the form "§5.x" in tooling resolve through it.
- `CURRENT_TASK.md` (repo root) — the confirmed scope. Read every section, especially
  `## Findings`, `## Files/areas in scope`, `## Do NOT touch`, `## Agent`, and
  `## Cutover runbook — source text` (including the "Pinger schedule" subsection under it).
- Before editing any file, read the whole file, plus the dependents listed below.

## Build
Copy of the task file's `## Agent` bucket, plus two test files added to scope at dispatch time
(developer confirmed 2026-09-30; see `## Files/areas in scope` in the task file).

- [ ] `artifacts/api-server/src/lib/mailer.ts`: replace the nodemailer transport with plain
  `fetch` to `https://api.resend.com/emails` (`Authorization: Bearer ${RESEND_API_KEY}`). Keep
  every exported signature identical. Send `text` and `html` exactly as today. Build `from` as
  `"E-LogBook" <${process.env.EMAIL_FROM}>` (`EMAIL_FROM` = bare address). Read env at call
  time. Remove `import nodemailer` (`:1`), `createTransporter()` (`:3-11`), and the four
  `const transporter = createTransporter();` lines (`:72`, `:98`, `:130`, `:234`); replace the
  four `transporter.sendMail({...})` calls (`:88`, `:114`, `:218`, `:267`). Call the global
  `fetch` at call time (write `fetch(...)`, or `globalThis.fetch(...)`) — never capture it into
  a module-level constant, because the test harness swaps `globalThis.fetch`.
- [ ] `artifacts/api-server/src/lib/mailer.ts`: on a non-2xx response, throw. **The thrown error
  carries the HTTP status only — never the request body, recipient, OTP, password, or the
  provider's response body (§8, §10).** No `logger.*` / `console.*` anywhere in `mailer.ts`.
- [ ] `artifacts/api-server/src/routes/auth.ts:118`: wrap `await flow.mail(email, otp)` in
  try/catch. On failure:
  - delete the row just issued for this email from `flow.table` (so an immediate retry is not
    blocked by the 60 s cooldown);
  - `req.log.error({ purpose: flow.purpose }, "Verification email failed")` — **no email
    address, no OTP, no error object** (§8; mirrors the comment at `auth.ts:173`);
  - `res.status(503).json({ message: "We couldn't send the verification code right now. Please try again in a few minutes." })`
    and stop the handler so the success response is not also sent.
  Applies to both registration and password-reset flows (same loop). Success path unchanged.
  Delete only the row just issued for this email, not other emails' rows. Do not change the
  transaction at `:108-116`, the cooldown check at `:112`, or anything else in this file.
- [ ] `artifacts/api-server/src/index.ts:4-13`: boot check becomes
  `["RESEND_API_KEY", "EMAIL_FROM"]`; update the comment naming "Nodemailer EAUTH". Keep
  warn-and-continue — log an error naming the variable, never throw or exit.
- [ ] `artifacts/api-server/tests/support.ts`: replace the `nodemailer.createTransport` patch
  with an interception of the new transport (e.g. wrap `globalThis.fetch` for
  `https://api.resend.com/emails` only, passing other URLs through). **The `mail` Map contract
  must not change** (key = `message.to`, value = first 6-digit code in `message.text`, else
  `"SENT"`). Must work with `RESEND_API_KEY` unset, or set an obviously fake placeholder inside
  `support.ts` only. Add an exported switch that makes the intercepted send return a non-2xx.
  Dependents that must keep working unedited: `tests/access.test.ts:227-228, 264-271`,
  `tests/auto-provision.test.ts:72-74`, `tests/rate-limit.test.ts:22`. Read all of them first.
- [ ] `artifacts/api-server/tests/access.test.ts`: new test — with the failure switch on,
  `POST /auth/send-otp` for a fresh email returns `503` with the message above and nothing is
  captured in `mail`; switch off, immediately retry the same email → `200` (not `429`) and a
  code is captured. Reset the switch in a `finally`/`afterEach` so a failure cannot leak into
  other tests.
- [ ] `artifacts/api-server/tests/auto-provision.test.ts:7, 118-131` (added to scope): the test
  "a failed HOD welcome email is logged without the HOD's email address" swaps
  `nodemailer.createTransport` to a throwing stub. Remove the `nodemailer` import and migrate it
  to the failure switch exported from `support.ts`, restoring the switch in `finally`. What the
  test asserts must not change.
- [ ] `artifacts/api-server/tests/mailer-escaping.test.ts:5-9` (added to scope): replaces
  `nodemailer.createTransport` with a stub that pushes each message onto a local `sent` array;
  the assertions read `message.html` and `message.text`. Remove the `nodemailer` import and
  migrate to the new seam. Each captured message must still expose `html` and `text`. This file
  does not currently import `support.ts`; if importing it would drag in database setup this test
  does not need, install a small local `globalThis.fetch` wrapper in this file instead. Report
  which you chose and why. What the test asserts must not change.
- [ ] `artifacts/api-server/package.json`: remove `nodemailer` (`:27`) and `@types/nodemailer`
  (`:39`). Re-confirm by reading `src/` and `tests/` that no importer remains.
  `artifacts/api-server/test-direct.mjs` also imports it — do NOT edit or delete it (see Do NOT
  touch). Confirm the deployed Node runtime has global `fetch` from files only: check
  `engines` in every `package.json`, any `.node-version` / `.nvmrc`, `render.yaml`,
  `Dockerfile`, and the `@types/node` version. Do not change any Node or engines config. Report
  exactly what you found and where; if the files do not establish a Node version, say so plainly
  rather than assuming.
- [ ] `.env.example:45-50`: replace the Gmail block with `RESEND_API_KEY=` and `EMAIL_FROM=`,
  empty values, comment matching warn-and-continue.
- [ ] Create `docs/RENDER_FREE_PLAN_CUTOVER.md` (the `docs/` directory does not exist yet;
  creating the file creates it) as a markdown checklist from `## Cutover runbook — source text`
  in `CURRENT_TASK.md`, keeping every step, warning and number, including the "Pinger schedule"
  subsection. No new facts, values or secrets.

## Do NOT touch
- The other three mailer call sites: `artifacts/api-server/src/routes/admin.ts`,
  `artifacts/api-server/src/routes/superadmin.ts`,
  `artifacts/api-server/src/lib/department-provisioning.ts`. Exported signatures in `mailer.ts`
  must stay identical so none needs an edit.
- `artifacts/api-server/src/routes/auth.ts` beyond the send-failure try/catch at `:117-119` — in
  particular the `/register` handler, the verify loop, and the zod schemas.
- `wrapEmail()`, `escapeHtml()` and every `textTemplate`/`htmlTemplate` in `mailer.ts`.
- `artifacts/api-server/build.mjs:52` — `"nodemailer"` in a stock esbuild-externals list;
  harmless, leave it (§9).
- `artifacts/api-server/test-direct.mjs` — a tracked stray script that imports nodemailer.
  Developer decided 2026-09-30 to leave it. Recorded as a follow-up.
- `.env` — never written by an agent (§10). `.env.example` is the only env file you edit.
- `lib/db/` and any database-connecting command (§6). No schema, migration or backfill.
- `pnpm-lock.yaml` — regenerated by the developer.
- `artifacts/api-server/src/app.ts` (including its global error handler), CORS config, auth
  middleware, `artifacts/api-server/src/lib/env.ts`, the frontend (`artifacts/mockup-sandbox`).
- `AGENTS.md`, `CURRENT_TASK.md`, and every file under `.agents/`.
- All git stashes — never apply, pop or drop. Do not touch git at all.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any secret, credential or `.env` value (§10, §13): never write a real API key or address-book
  value anywhere. `support.ts` may hold an obviously fake placeholder only if needed.
- Anything that puts patient text, leave reasons, an OTP, a password, or a recipient address near
  a log, an error message, or a thrown error (§8): the mailer's thrown error and the new `auth.ts`
  log line carry the HTTP status / `purpose` only.
- Any change to a route or query touching the clinical tables, or to anything resolving
  ownership server-side (§3), or any place `studentsTable.id` and `usersTable.id` could be
  conflated (§4). This task touches neither; if you find yourself near one, stop.
- Any migration, backfill, schema change or database-connecting step (§6).
- The task turning out to be more than one feature (§9), or a need to edit any file outside the
  Build list.
- Removing the row in `auth.ts` cannot be done without changing the transaction structure, the
  cooldown query, or another row's data.
- Any value you would otherwise guess or invent (a Resend response shape you rely on, an
  environment name, a Node version).

## Report
Write `HANDOFF.md` at the repo root:
- What changed, per file, and why
- The name of the exported failure switch in `support.ts`, and how each of the three test files
  uses it
- The Node/`fetch` evidence you found, with file paths and line numbers
- Anything you skipped, and why (including every check you could not run because it would have
  required a shell command — expect: tests, typecheck, `pnpm install`, grep)
- Anything you expanded beyond the Build list, and why
- Anything you noticed but did not fix

A claim without file:line evidence is recorded as unverified. Do not open a pull request. Do not
run `git commit` or `git push`.

## Model
Claude Sonnet 4.6 (Thinking)


## Files you may touch
- artifacts/api-server/src/lib/mailer.ts
- artifacts/api-server/src/routes/auth.ts
- artifacts/api-server/src/index.ts
- artifacts/api-server/tests/support.ts
- artifacts/api-server/tests/access.test.ts
- artifacts/api-server/tests/auto-provision.test.ts
- artifacts/api-server/tests/mailer-escaping.test.ts
- artifacts/api-server/package.json
- .env.example
- docs/RENDER_FREE_PLAN_CUTOVER.md
- HANDOFF.md