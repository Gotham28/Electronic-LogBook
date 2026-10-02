# Antigravity dispatch 72 — Registration OTP / Resend: round-1 review fixes (FIX-ONLY)

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root, dated
2026-09-30, base commit `eb1e37c`. The round-1 work (dispatch 71) is uncommitted in the working
tree; you are editing on top of it. If this is not that repo, stop, say which repo this is, and
wait.

FIX-ONLY dispatch. The task is BLOCKED on review findings: no other task work, no push, no PR,
no commit until these are closed and re-reviewed.

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
- `AGENTS.md` (repo root) — §8, §9, §10, §12 and §14.5. §16 is a rule map.
- `CURRENT_TASK.md` (repo root) — especially `## Do NOT touch`, `## Review outcome` and the
  Blocked-on-developer-input items answered 2026-09-30 (10-second timeout, hardening).
- Read each file in full before editing it.

Verify each finding against the codebase before acting on it. If one is wrong for this
codebase, push back with technical reasoning rather than implementing it. Do not agree
performatively. Fix it and show the code.

## Build
- [ ] 1. `artifacts/api-server/tests/auto-provision.test.ts:124` — restore the original predicate `w.includes("welcome email")`. Remove `|| w.includes("email failed")`. Nothing else in this file.
- [ ] 2. `docs/RENDER_FREE_PLAN_CUTOVER.md` — delete lines 1-2 (the "Cutover runbook — source text" heading and the sentence addressed to Antigravity). Add a plain title. Turn the nine numbered steps and the three pinger options into `- [ ]` checklist items. Replace "this task's PR" with "the pull request that moves email to Resend". Keep every step, warning and number. No new facts, values or secrets.
- [ ] 3. `artifacts/api-server/tests/support.ts` — restore the comment deleted from above the mail interception, reworded only as far as needed to stay true for the fetch seam.
- [ ] 4. Remove the whitespace-only lines at `artifacts/api-server/src/lib/mailer.ts:89,125,239,298` and `artifacts/api-server/tests/access.test.ts:289` and `:298-299`.
- [ ] 5. `artifacts/api-server/tests/access.test.ts:293` — assert the captured value for that email matches `/^\d{6}$/` instead of only `mail.has`.
- [ ] 6. `artifacts/api-server/src/lib/mailer.ts` — give each of the four fetch calls a 10-second timeout (the developer chose 10 seconds). Exported signatures stay identical.
- [ ] 7. `artifacts/api-server/src/lib/mailer.ts` — wrap each fetch so that a rejection (network failure or timeout) rethrows a fixed-message error with no `cause` and nothing copied from the original error. Non-2xx still throws an error whose message is the HTTP status only. No `logger.*` / `console.*` anywhere in `mailer.ts`. Do not touch `wrapEmail()`, `escapeHtml()`, any template or any subject line.
- [ ] 8. `artifacts/api-server/src/routes/auth.ts`, the catch added around `flow.mail(email, otp)` (currently `:120-125`) — delete only the row this request issued, by matching a value already in scope at the catch in addition to the email. The value in scope is `otpHash` (`:107`, a bcrypt hash with a per-call salt, inserted at `:114`): use `and(eq(flow.table.email, email), eq(flow.table.otpHash, otpHash))`. `and` and `eq` are already imported and used in this file (`:134`). Do NOT change the transaction at `:108-116`, the cooldown check at `:112`, or any other line in this file. If the row cannot be identified without changing the transaction, STOP and report; do not decide.
- [ ] 9. Same catch — add the provider's numeric HTTP status to the existing log line: `req.log.error({ purpose: flow.purpose, status }, "Verification email failed")`. `status` is a number, set only when the caught error's message is exactly three digits; otherwise leave it out. Never log the error object, its message as text, the email address or the code. The 503 response body is unchanged.
- [ ] 10. `HANDOFF.md` (repo root) — rewrite for this dispatch. State the commit worked from (`eb1e37c`). Replace the Node/fetch section with: no file in the repo pins a Node version; the deployed runtime is unconfirmed; `src/routes/payments.ts` already calls global fetch (cite the line after reading it). Correct the round-1 statements about test assertions, scope expansion, and which rows the `auth.ts` catch deletes. List every check you could not run.

## Do NOT touch
- Everything under `## Do NOT touch` in `CURRENT_TASK.md`, restated: the other three mailer call sites (`routes/admin.ts`, `routes/superadmin.ts`, `lib/department-provisioning.ts`); `routes/auth.ts` beyond the send-failure try/catch (in particular the `/register` handler, the verify loop, the zod schemas, the transaction at `:108-116` and the cooldown check at `:112`); `wrapEmail()`, `escapeHtml()` and every `textTemplate`/`htmlTemplate` in `mailer.ts`; `artifacts/api-server/build.mjs`; `.env`; `lib/db/` and any database command; `app.ts`, CORS config, auth middleware, the frontend; all git stashes.
- `pnpm-lock.yaml`
- `artifacts/api-server/test-direct.mjs`
- `artifacts/api-server/test-email.ts`
- The 16 failing tests and their fixtures
- `AGENTS.md`, `CURRENT_TASK.md`, anything under `.agents/`
- git in any form
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy is intentional)
- Anything not named in Build items 1-10

## Hard stops — stop and report, do not decide
- Any secret or `.env` value.
- Anything that puts an OTP, password, recipient address or error text near a log or thrown error.
- Any need to edit a file not named above.
- Any change to a code path enforcing the §3 / §4 boundary.
- Any migration, backfill, deploy, or other irreversible step.
- Any value you would otherwise guess.

## Report
Write `HANDOFF.md` at the repo root, per file, with `file:line` for every claim:
- What changed, per file, and why
- Anything you skipped, and why (including any step you could not do because it would have required a shell command)
- Anything you expanded beyond the Build list, and why

A claim without `file:line` evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Claude Sonnet 4.6 (Thinking)`; if quota-blocked, `Gemini 3.1 Pro (High)` under the standing fallback. Never Opus.
