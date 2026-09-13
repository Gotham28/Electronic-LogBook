# Antigravity dispatch 03 — apply approved documentation fixes from HANDOFF.md

## Guard
This prompt is for the project at Gotham28/Electronic-LogBook (checked out at
`D:\Electronic-LogBook-main`). `HANDOFF.md` at the repo root is the findings report from
the prior audit dispatch — already reviewed and approved by the developer. This dispatch
applies its "Proposed edits" section, nothing more and nothing less. If this is not that
repo, stop, say which repo this is, and wait.

**Sandbox limitation: do not call `run_command` / any shell tool at all, for any reason.**
Every shell command is auto-denied in this environment, confirmed repeatedly. Do the entire
task using only file-reading and file-editing tools (view a file, list a directory, edit/
write a file). Do not attempt `git`, `gh`, `pnpm`, or any other CLI tool. Where a step below
would normally call for a shell command to verify something, either it has already been
verified for you (marked "CONFIRMED FACT" below) or it can be verified by reading a file
directly (e.g. counting files in a directory via `list_dir`) — do that instead.

## CONFIRMED FACTS — use these, do not attempt to re-derive them
- `lib/db/migrations/0003_subscriptions_payments.sql` **is** applied in production, per the
  developer's direct confirmation. Treat this as settled. Do not connect to any database or
  run any migration command (impossible here anyway — no shell access).
- PR #4, "Razorpay subscription: backend and migration", branch `feat/razorpay-subscription`,
  was merged 2026-09-06T18:58:40Z.
- PR #5, "feat(payment): add Razorpay payment step to registration and login", branch
  `feat/razorpay-subscription`, was merged 2026-09-06T19:54:37Z.
  (Both confirmed today via `gh pr list --state all` by Claude Code, which has shell access;
  you do not need to and cannot re-verify this.)
- The correct citation for SEC-22's "properly filtered comparison query" is
  `artifacts/api-server/src/routes/department.ts:60-80` (the `GET /:departmentId/professors`
  handler), which filters `eq(usersTable.status, "approved")` at line 78 — confirmed by
  direct read just now. Do not cite `admin.ts:428` — that route has never filtered by status.
- Fix-commit hashes for every FIXED SEC finding are already listed in a reconciliation table
  at `.agents/SECURITY_AUDIT.md` (around lines 158-170) — read that table rather than
  attempting `git blame` (impossible here anyway).

## Hard rules
1. You may edit ONLY these files: `AGENTS.md`, `TASK_LOG.md`, `docs/SECURITY_REPORT.md`,
   `docs/SECURITY_FIXES.md`, `.agents/SECURITY_AUDIT.md`, `.env.example`, `replit.md`. No
   other file — not `CURRENT_TASK.md`, not any `.ts`/`.js`/`.mjs`/`.sql`/`.json` file, not
   `pr-body.md` or `PR_DESCRIPTION.md`.
2. Do NOT delete any file, including `pr-body.md`, `PR_DESCRIPTION.md`, or `replit.md`
   itself. Edits only.
3. Do NOT run any database command, migration, or `drizzle-kit` command (moot — no shell).
4. Do NOT run `git commit`, `git push`, or any git command at all (moot — no shell; the
   developer will commit and push themselves after reviewing the diff).
5. Do NOT touch commit `6718461` already on this branch in any way (moot — no shell means
   no git operation of any kind is possible; this is stated for the record).
6. For `.env.example`: variable **names only**, empty values (`NAME=` with nothing after
   the `=`). Never write a real secret, connection string, or credential into any file.

## Build

### 1. `AGENTS.md` — 5 edits

**(a) Section 0, the test-suite sentence** (currently, verbatim):
> There is a test suite at `artifacts/api-server/tests/` — `access.test.ts`,
> `migrations.test.ts`, `support.ts` and `database.ts`. `tests/migrations.test.ts` runs the
> real migrations against in-process PGlite, so it requires no database and is safe to run.

Replace the first sentence so it does not name specific filenames (they will keep
drifting). Before writing the replacement, use `list_dir` on
`artifacts/api-server/tests/` and count the files yourself — do not just copy a count from
`HANDOFF.md` without re-checking. Something like: "There is a test suite at
`artifacts/api-server/tests/`, run via `pnpm test` from that directory." Keep the second
sentence about `migrations.test.ts` as-is (it's still true and useful).

**(b) Section 9, the "no test suite" sentence** (currently, verbatim):
> Bundled diffs cannot be reviewed properly, and this project has no test suite to catch
> what review misses.

This directly contradicts section 0 and is false. Reword to something accurate, e.g.:
"Bundled diffs cannot be reviewed properly, and even a passing test suite will not catch
everything review would." Keep the point (large diffs are hard to review) without the false
claim.

**(c) Section 13** (currently, verbatim):
> Seven tracked scripts in `lib/db/` hardcode a production database connection string as a
> `||` fallback: `check_reetha.mjs`, `check_reetha_student.mjs`, `check_schema.mjs`,
> `check_schema_exact.mjs`, `delete_reetha.mjs`, `query_reetha.mjs`, `query_tables.mjs`.
>
> They entered history at commit `10bbd69` and are on `origin/main`.
>
> The pattern **fails open**: with `DATABASE_URL` unset they silently target production. One
> of them is named `delete_reetha.mjs`. `phase0.js` at the repository root also reads
> `DATABASE_URL`.
>
> Removing these scripts and purging the credential from history is an open task.

Update to reflect that deletion is done. Commit `bcbb109` ("fix(security): delete eight
scripts carrying a hardcoded database credential") deleted all 8 — the 7 listed above plus
an 8th copy of `query_reetha.mjs` at the repository root. Rewrite so the section says these
8 scripts *were* deleted (name the commit), correct "seven" to "eight" where the count is
stated, and narrow the closing sentence so only "purging the credential from git history"
remains open (the scripts themselves are gone from the working tree). Keep the
`phase0.js` sentence — it's unrelated (that file never hardcoded a credential; it reads
`DATABASE_URL` cleanly with no fallback) but is still true and worth keeping as context —
or move it to its own sentence if the paragraph reads oddly after the edit; use your
judgement on flow, just don't lose the accurate information.

**(d) Four citations to `.agents/CURRENT_TASK.md`** — this path doesn't exist; the real
file is `CURRENT_TASK.md` at the repo root. Find and fix all four (do not assume these are
the only ones — search the whole file for the literal string `.agents/CURRENT_TASK.md` and
fix every occurrence you find, there should be exactly 4):
- Section 14.2 ("The loop"), item 1: `` `.agents/CURRENT_TASK.md` is written in Claude Chat.``
- Section 14.3 ("Routes"): `Exactly one route per task, named in \`.agents/CURRENT_TASK.md\`.`
- Section 14.7 ("No MASTER_PLAN.md"): `...recorded in its own \`.agents/CURRENT_TASK.md\` under...`
- Section 14.8 ("The task file"): `` `.agents/CURRENT_TASK.md` holds the current task, not history.``

Change each `.agents/CURRENT_TASK.md` to `CURRENT_TASK.md`. Do NOT move the actual
`CURRENT_TASK.md` file anywhere — only fix these citations in `AGENTS.md`'s prose.

**(e) Lines 1-9, the reconstruction notice** (currently, verbatim):
> **RECONSTRUCTED FILE — READ THIS FIRST.**
>
> This file was rebuilt on 2026-09-06 from the project's standing rules after the original
> `AGENTS.md` was found missing from the repository root. **Its section numbers do not match
> the original.** Tooling or skills that cite `AGENTS.md §10`, `§12.2` or `§12.13` will not
> resolve against this file. If the original can be recovered from git history
> (`git log --all --oneline -- AGENTS.md`), recover it and discard this one.

Remove the last sentence's instruction to try to recover it — this has already been checked
(by Claude Code, with shell access) and confirmed impossible: `git log --all --oneline --
AGENTS.md` returns only 4 commits, all part of this same reconstruction, and the oldest
commit's own message states the original was never committed to any branch. Replace that
sentence with something stating plainly that no earlier version exists in git history (this
has been checked), so a future reader doesn't waste time re-checking. Keep everything else
in this section (the §10/§12.2/§12.13 numbering-mismatch warning is still accurate and
still needed — the rule map in §16 is what resolves it, don't remove that pointer).

### 2. `TASK_LOG.md`

Find the `### 2026-09-06 — Razorpay subscription backend` entry.

**(a)** It currently states, in its "Evidence" bullets:
> - AGENTS.md §11 evidence standard has NOT been produced. The migration has not been
>   applied to any database and no endpoint has been executed. No request has been made
>   against any of this code.
> - `0003_subscriptions_payments.sql` has never run anywhere, not even against PGlite.

Do not rewrite these lines — they were true when written and `TASK_LOG.md` is a historical
log. Instead, add a new dated note directly after them (e.g. "**Update, 2026-09-13:**
`0003_subscriptions_payments.sql` is now applied in production, per the developer's direct
confirmation.") so the log shows both what was true then and what's true now.

**(b)** The same entry's closing line says `**PR** — none opened.` This is now stale — add
a note (don't delete the original line) that PR #4 ("Razorpay subscription: backend and
migration") and PR #5 ("feat(payment): add Razorpay payment step to registration and
login") were opened and merged the same day (2026-09-06), using the confirmed facts above.

**(c)** Under "Left open" for this same entry:
> - PGlite migration test not yet run. `tests/migrations.test.ts:15` asserts 2 ledger rows
>   and will fail at 3 until that number is corrected.

This is itself now stale — `tests/migrations.test.ts:15` already asserts 3 rows (confirm by
reading that file directly before editing this line). Update this bullet to say so, or
remove it if it no longer represents an open item (your judgement — but don't just delete
it silently; if you remove it, say so isn't needed in the doc itself, just don't leave a
false "not yet run" claim standing).

**(d)** The earlier `### 2026-08-19 — Remove hardcoded JWT_SECRET fallback` entry cites
`middlewares/auth.ts:33`, `routes/auth.ts:386` and `routes/auth.ts:443` as call sites. Read
`artifacts/api-server/src/routes/auth.ts` and `middlewares/auth.ts` to check whether these
line numbers still hold (the file has since grown from later fixes, e.g. SEC-11, SEC-12).
If they've drifted, either update them to the correct current lines or reword to reference
the file generally without a specific line number that will drift again — your call based
on how far off they are.

### 3. Security documents

**(a) SEC-05 in `docs/SECURITY_REPORT.md`** (find the `#### SEC-05 — High` entry, around
line 160): it currently describes one uniform fix across all four routes (postings,
assessments, thesis, certificates). Add a clarifying note that the certifications route
specifically uses a flat professor-ban (return 403 for any professor caller) rather than a
supervisor-relationship filter, because no supervisor/assessor/guide-style relationship
exists on that table — unlike the other three routes, which do filter by the caller's
specific supervisory relationship.

**(b) SEC-18 in `docs/SECURITY_REPORT.md`** (find the `#### SEC-18 — Medium` entry, around
line 531, currently:)
> **Where:** `student.ts:79-81`, `:98-99`.
> **What's wrong:** The resident dashboard's counts (how many logs are "pending," and so
> on) and its "recent entries" list do not exclude entries the resident has already
> deleted, even though...

Read `artifacts/api-server/src/routes/student.ts` around both cited ranges to confirm
current behavior yourself before editing. If (as `HANDOFF.md` states) the `:98-99` /
"recent entries" part was already fixed incidentally by the SEC-02 commit and only the
dashboard counts (`:79-81`) still lack the soft-delete filter, narrow this entry to describe
only the counts as still open, and note that the recent-entries list was fixed alongside
SEC-02.

**(c) SEC-22 citation in `.agents/SECURITY_AUDIT.md`** (find the SEC-22 table row, around
line 78, currently containing the phrase `unlike the roster query at \`admin.ts:428\``):
change `admin.ts:428` to `department.ts:60-80` (the `GET /:departmentId/professors` route,
which does filter `eq(usersTable.status, "approved")`) — see CONFIRMED FACTS above. Do not
change anything else in that row.

**(d) SEC-20 in `docs/SECURITY_REPORT.md`** (find the `#### SEC-20 — Medium` entry, around
line 557, currently containing:)
> SEC-12, fixed in this same pass, added a real, database-backed lockout after 10 failed
> attempts against one account within 15 minutes

Remove "database-backed" — read `artifacts/api-server/src/routes/auth.ts` to confirm the
lockout counter is an in-memory `Map`, not persisted to any database, before editing.
Reword to something accurate, e.g. "added a real, per-process in-memory lockout after 10
failed attempts..." Keep the rest of the entry (the open question about whether a
longer-term persisted counter is still wanted) — that part is still accurate.

**(e) SEC-07 heading in `.agents/SECURITY_AUDIT.md`**: find wherever the SEC-07 entry's
heading or summary states "23 sites" — correct it to "25 sites", matching what the entry's
own listed sites actually total, and matching what `docs/SECURITY_FIXES.md` and
`docs/SECURITY_REPORT.md` (which already say "25 separate spots" — see line 204) already
say. Confirm the actual count by reading the SEC-07 entry's full site list in
`.agents/SECURITY_AUDIT.md` before writing "25" — don't just trust this instruction's
number without checking.

**(f) Scope note in `docs/SECURITY_FIXES.md`**: this document only ever covered SEC-01
through SEC-12 and SEC-23 (Batches A through roughly the point covering those findings) — it
does not mention SEC-14–17 or SEC-34–37 at all, which were fixed later and are documented
only in `.agents/SECURITY_AUDIT.md` and `docs/SECURITY_REPORT.md`. Add one short note near
the top of the document (after the existing header block, e.g. after the "Source of
findings" / "Read AGENTS.md" lines) stating that this document's scope is SEC-01–12 and
SEC-23 only, and that SEC-14–17 and SEC-34–37 were fixed later and are documented in the
other two files. Do not rewrite the rest of the document or add entries for those findings
here — the note alone is sufficient.

**(g) New finding — nodemailer vulnerabilities**: add one new entry documenting a
production-dependency vulnerability that isn't tracked under any existing SEC number,
found via `pnpm audit` against `artifacts/api-server`'s dependencies (run today by Claude
Code, which has shell access — you don't need to and cannot re-run this yourself):
  - Package: `nodemailer`, added as a dependency by commit `b4b3233` (2026-09-10, for
    account-creation emails), **after** the original audit closed.
  - 1 high-severity advisory: GHSA-2x7j-588g-ccc2 (quadratic-time complexity in
    `addressparser`, remote denial of service via a crafted address list).
  - 4 moderate-severity advisories: GHSA-8m3c-c648-2xjj (a `resolveContent()` bypass of
    `disableFileAccess`/`disableUrlAccess` under a legacy call signature),
    GHSA-wmmp-3585-3rmp (IDN/Punycode domain allow-list bypass),
    GHSA-cc9r-2j5m-2m83 (recipient-domain validation bypass via RFC 5322 comment
    mis-parsing), and one more IDN/domain-validation-related advisory.
  - Give it the next available number (SEC-38, unless the documents already use a
    different number for something — check first) or a clearly-dated addendum, matching
    each document's own existing style. Add it to **both** `docs/SECURITY_REPORT.md` (in
    whatever section lists still-open findings) and `.agents/SECURITY_AUDIT.md` (in its
    findings table) — these are the two documents that track individual SEC numbers;
    `docs/SECURITY_FIXES.md` does not need this entry (see (f) above, it only covers
    SEC-01-12/23 and is a batch runbook, not a findings catalog).
  - Mark it **OPEN**. Suggest severity **Medium**, matching how this project already rated
    SEC-21 (the other dependency-level vulnerability, `qs` via `express`) — that finding is
    also reachable only indirectly, not via direct unauthenticated exploitation of this
    app's own routes, and was rated Medium rather than by the raw upstream CVE severity.
    Use your judgement if you think a different rating fits this project's existing
    convention better, but explain why in the entry if you deviate.
  - Do NOT attempt to fix the vulnerability (no dependency upgrade, no code change) — this
    task documents it, nothing more.

**(h) Fix-commit-hash citation pass**: `.agents/SECURITY_AUDIT.md` already has a
reconciliation table listing the fix commit for every FIXED finding, around lines 158-170.
Check whether `docs/SECURITY_REPORT.md`'s individual "How it was fixed" entries already
name their commit hash (spot-check a few, e.g. SEC-01, SEC-11) — if they already do (which
appears to be the case), this step needs no further action; do not duplicate or restate
hashes that are already present. If you find a FIXED finding in either document that is
missing its commit hash entirely, add it by cross-referencing the table already in
`.agents/SECURITY_AUDIT.md` (do not attempt `git blame` — no shell access). Do not change
any finding's fixed/open status while doing this — citation-quality only.

### 4. `.env.example`

Add these variable names with empty values (`NAME=` with nothing after the `=`), grouped
sensibly near related existing entries rather than dumped at the end in one block:
`DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`, `FRONTEND_URL`, `LOG_LEVEL`, `PGSSLMODE`,
`PGSSLROOTCERT`, `DEPARTMENT_SETUP_FILE`, `HOD_INITIAL_PASSWORD`, `BASE_PATH`, `REPL_ID`,
`VITE_DEMO_FACULTY_PIN`, `VITE_DEMO_HOD_PIN`. Add a one-line comment above each (or above
each small group) explaining what it's for and whether it's required, matching the style of
the existing entries in the file. Never write an actual value for any of these.

### 5. `replit.md` — minimum safe fix only

Find the line: `- \`pnpm --filter @workspace/db run push\` — push DB schema changes (dev
only)`. Strike it or comment it out (e.g. prefix with a note that this command is
prohibited by `AGENTS.md` §6 and must never be run) — it directly contradicts `AGENTS.md`'s
absolute ban on `drizzle-kit push`. Do not otherwise rewrite, populate, or delete this file
— whether to properly fill it in or delete it is a separate decision the developer hasn't
made yet.

## Do NOT touch
- Any file not named in "Hard rules" item 1 above.
- Any `.ts`, `.js`, `.mjs`, `.sql`, `.json` file.
- `pr-body.md`, `PR_DESCRIPTION.md` — do not edit or delete either.
- `CURRENT_TASK.md`.
- Any shell command whatsoever — file-reading and file-editing tools only.
- Any secret or credential value — names only, in `.env.example`, never a value.
- Anything not named under Build above.

## Report
Write a short `HANDOFF.md` update (append a new dated section rather than replacing the
existing audit content) noting: every edit made, file by file, one line each; anything from
this Build list you deliberately skipped and why; anything you found while editing that
contradicts what the Build list assumed (e.g. a citation that was already correct, a count
that had already changed again). Do not open a pull request. Do not run git commit.
