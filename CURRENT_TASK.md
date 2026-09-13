# Current Task

## Feature
Documentation-accuracy audit of the repo's 14 Markdown files against the actual codebase.
Read/report only — no code, test, config, or Markdown-content change is in scope for this
dispatch. Verify every factual claim (file path, table name, route, command, env var,
migration, test file, section number) in each document, classify it ACCURATE / STALE / WRONG
/ UNVERIFIABLE with evidence, and confirm or refute 8 specific discrepancies the developer
identified by inspection. Output is a findings report in `HANDOFF.md`; no document is edited
in this pass. A follow-up task will apply developer-approved edits once this report is
reviewed.

## Route
B — Claude Code drives Antigravity, halts per §14.5 (this repo's rule map, §16, resolves
tooling's "§12.5" to §14.5), and reviews the returned findings before compiling the report
handed to the developer.

## Files audited (all Markdown, read-only)
- AGENTS.md
- CURRENT_TASK.md (this file; already reset to idle by Claude Code directly before this
  dispatch existed — that reset is not part of this dispatch and needs no re-verification)
- PR_DESCRIPTION.md
- TASK_LOG.md
- pr-body.md
- replit.md
- docs/SECURITY_FIXES.md
- docs/SECURITY_REPORT.md
- .agents/SECURITY_AUDIT.md
- .agy-jobs/373b76b660354a47a88686401e2a8375/TASK.md
- .agy-jobs/ac43ff09e5d9485aab73cff89e1144ae/TASK.md
- .agy-jobs/d2e68206e5da47478354fd79e20a0716/TASK.md
- .agy-jobs/e194489c3f644f679264790b3d69cefc/TASK.md
- .agy-jobs/e4bf7ea928c74ec892575faf44113255/TASK.md

## Agent
- [ ] For every Markdown file listed above, go claim by claim through every factual statement
      (file path, table name, route, command, env var, migration, test file, section number)
      and classify it ACCURATE / STALE / WRONG / UNVERIFIABLE, citing file:line for both the
      document's claim and the current source evidence.
- [ ] Confirm or refute these 8 discrepancies specifically:
  1. AGENTS.md declares itself a RECONSTRUCTED FILE (rebuilt 2026-09-06) whose section
     numbers do not match an original that tooling cites. Run
     `git log --all --oneline -- AGENTS.md` and report whether an earlier version is
     recoverable from history.
  2. AGENTS.md's own section 0 claims a test suite exists at `artifacts/api-server/tests/`
     naming `access.test.ts`, `migrations.test.ts`, `support.ts`, `database.ts`. Other
     project documentation states there is no automated test suite. List every file actually
     present in that directory and confirm whether `pnpm run test` (run inside
     `artifacts/api-server`) currently passes — this uses in-process PGlite only, no real
     database, and is safe to run as verification.
  3. `CURRENT_TASK.md` lives at the repo root. AGENTS.md's own text repeatedly cites
     `.agents/CURRENT_TASK.md`. Report which path actually exists on disk and which path
     every document in the repo references.
  4. There is no `README.md`, `STATUS.md`, or `MASTER_PLAN.md` in this repository. Confirm
     their absence and list every document, if any, that references them.
  5. Find every document asserting that `lib/db/migrations/0003_subscriptions_payments.sql`
     has never run anywhere. The developer says it has now been run against production — do
     not verify or change that claim yourself, only find every document asserting the old
     "never run" state and list them for the developer to update.
  6. Both `pr-body.md` and `PR_DESCRIPTION.md` exist at the repo root. Report what each
     contains verbatim, whether either matches an actual GitHub PR (`gh pr list --state all`
     is available read-only, no auth changes), and whether they duplicate each other.
  7. `replit.md` exists alongside `vercel.json` and `.replit`. Report whether `replit.md`'s
     content still describes the actual deployment target, and what `.replit` and
     `vercel.json` actually configure.
  8. `.env.example` documents `ALLOWED_ORIGINS`, `VITE_API_URL`, `RAZORPAY_KEY_ID`,
     `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `EMAIL_USER`, `EMAIL_APP_PASSWORD`.
     Grep the codebase for every `process.env.*` read and report every variable the code uses
     that `.env.example` does not document. Never write a real secret value anywhere — names
     only.
- [ ] The three security documents (`docs/SECURITY_REPORT.md`, `docs/SECURITY_FIXES.md`,
      `.agents/SECURITY_AUDIT.md`) describe a 37-item security audit numbered SEC-01 through
      SEC-37. Go finding by finding, verify every file:line citation against current source,
      and flag any place the three documents disagree with each other about the same
      finding's severity, fixed/open status, or supporting evidence.
- [ ] Note anything noticed that was not asked about, and anything that contradicts another
      document or this file.

## Do NOT touch
- Any `.ts`, `.js`, `.mjs`, `.sql`, `.json`, `.yaml`, or other config file — read-only.
- Do not run any command against any database: no `drizzle-kit push`/`migrate`, no `psql`, no
  migrate/seed/provision script, no query against production or any live database, including
  read-only queries.
- Do not run `git push` or `git push --force` in any form.
- Do not delete any file. If a file looks dead or superseded, list it as a deletion candidate
  in the report instead.
- Do not edit, create, or overwrite any Markdown file with new claims — this dispatch
  produces a findings report only (`HANDOFF.md`), not document edits.
- Do not invent or guess any claim that cannot be verified from the repo — mark it
  UNVERIFIABLE and state exactly what evidence is missing.

## Blocked on developer input
None.

## Plan reference
Unplanned — one-off developer-requested documentation audit, recorded here per §14.7 (this
repo has no MASTER_PLAN.md).

## Suggested Antigravity model
Sonnet (§15.3 default). This is investigative verification requiring judgement — spotting
cross-document contradictions and stale citations — not mechanical formatting, so it does not
fit the Haiku bucket in §15.2 despite touching only docs. No §15.2 Opus trigger applies:
nothing here touches ownership, the two ID systems, schema/migration state, logging of
patient data, or secrets — it is a read-only report.
