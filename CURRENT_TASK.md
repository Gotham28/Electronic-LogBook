# Current Task

## Feature
Remove committed credentials from the working tree: delete the 16 tracked scripts that hardcode a database connection string or a shared test password, stop tracking the frontend `.env.local`, and make `.gitignore` cover `.env.*` (audit findings SEC-2611-01, -05, -06).

## Plan reference
Unplanned (AGENTS.md §14.7 — no MASTER_PLAN.md). Why: first fix from the security audit of 2026-11-14 (`.agents/SECURITY_AUDIT_2026-11-14.md`, git-ignored, on disk).
STATUS.md state at time of scoping: no `STATUS.md` exists in the repo.

## Previous task
- Security audit (2026-11-14/15): finished, report and `HANDOFF.md` written, **code-review skipped by developer decision 2026-11-15**. Not committed. Checkout left on detached `origin/main` `9dec1c9`; `stash@{0}` ("security-audit task file 2026-11-14") present and must stay.

## MASTER_PLAN.md update
- [ ] None — does not apply (AGENTS.md §14.7).

## Files/areas in scope
Delete (16 files, all tracked at `9dec1c9`):
- `artifacts/api-server/run.mjs`
- `lib/db/cleanup_test.cjs`, `lib/db/dedup.cjs`, `lib/db/final_check.cjs`, `lib/db/leave_test.cjs`, `lib/db/merge_accounts.cjs`, `lib/db/merge_accounts_2.cjs`, `lib/db/rename_user.cjs`, `lib/db/reset_pass.cjs`, `lib/db/reset_radhamani.cjs`, `lib/db/restore.cjs`, `lib/db/schema_test.cjs`, `lib/db/sync_mohammed.cjs`, `lib/db/test.cjs` — hardcoded Neon connection string (SEC-2611-01).
- `lib/db/investigate_print.cjs`, `lib/db/verify_print.cjs` — shared weak test password (SEC-2611-06).

Delete and stop tracking:
- `artifacts/mockup-sandbox/.env.local` — tracked env file holding `VITE_DEMO_STUDENT_EMAIL`, `VITE_DEMO_STUDENT_PASSWORD`, `VITE_DEMO_FACULTY_EMAIL`, `VITE_DEMO_FACULTY_PASSWORD`, `VITE_DEMO_HOD_EMAIL`, `VITE_DEMO_HOD_PASSWORD`, `VITE_DEMO_FACULTY_PIN`, `VITE_DEMO_HOD_PIN` (key names only; SEC-2611-05).

Edit:
- `.gitignore` — directly under line 3 (`.env`) add two lines: `.env.*` and `!.env.example`. Nothing else in the file changes.
- `AGENTS.md` §13 — append one paragraph, facts only: a second set of 14 scripts (the list above) hardcoding a different connection string entered history at commit `5f700f9` (2026-09-28) and was deleted by this task; two further scripts carried a shared test password; `artifacts/mockup-sandbox/.env.local` was tracked and has been removed; purging both credentials from history remains open. No commit hash for this task's own commit (close-out backfills it).
- `HANDOFF.md` — overwritten with this task's handoff.

## Explicitly out of scope
- Rotating any credential, and any check against production — developer only.
- Purging history (`git filter-repo`, BFG) — separate decision; would need a force-push, which is forbidden (§2).
- Rewriting the scripts to read `DATABASE_URL` — they are deleted, not repaired.
- Other loose scripts (`run_sql.mjs`, `upd*.js`, `gen*.js`, `fix_db.ts`, `run_sql_2.ts`, `create_table.mjs`, …) — not shown by the audit to hold a credential.
- Adding a secret scanner to CI — separate task.
- Every other audit finding (see queue below).

## Do NOT touch
- Any database: no `drizzle-kit`, `psql`, `src/migrate.ts`, nothing that reads `DATABASE_URL`. **Never execute any of the scripts being deleted.**
- Secret values: never print, quote or copy one — not the connection string, not the test password, not any `.env.local` value. Do not open `.env.local` except with a values-stripped read (`cut -d= -f1`).
- `.env`, `.env.example`, any application source, tests, migrations, `package.json`, lockfile.
- `.agents/SECURITY_AUDIT.md`, `.agents/SECURITY_AUDIT_2026-11-14.md`, `artifacts/security-audit-20261026/**`.
- Local branch `main` and its two unpushed commits (`a6eacd7`, `c0dad8f`). The stash — never apply, pop or drop. Untracked `.playwright-mcp/` logs.
- No `git push --force` in any form, no `git restore`, `git clean`, `git reset --hard`, `git checkout --`. No pull request (close-task opens it after review).

## Execution route
- B — Agent loop.
- Why: route-C test point 2 fails — the §15 secrets trigger fires, so it cannot be Antigravity alone, even though every file is named.
- Close-out: route B — never route C; project permissions and approvals apply.

## Manual (developer does)
- [ ] **Rotate the Neon password from SEC-2611-01 now.** Deleting the files does not help: the value stays in git history and on the remote. Do not wait for this task.
- [ ] Check production for accounts using the shared test password (SEC-2611-06) and for the demo accounts named in `.env.local` (SEC-2611-05); reset or remove them.
- [ ] If the demo logins are wanted for local development, recreate `artifacts/mockup-sandbox/.env.local` by hand afterwards — it will be git-ignored.
- [ ] Decide separately whether to purge history.

## Agent (does on its own, once scope is confirmed)
- [ ] `git fetch origin`, then create branch `fix/remove-committed-credentials` from the `origin/main` tip (`git checkout -b fix/remove-committed-credentials origin/main`). Do **not** check out or pull local `main` — it diverges from `origin/main`. Carry the modified `CURRENT_TASK.md` across; if git refuses, halt.
- [ ] Re-confirm before dispatch that nothing references the 16 scripts or any `VITE_DEMO_` key (search `*.ts`, `*.tsx`, `*.json`, `*.sh`, `*.yml`, `vercel.json`, vite config). Scoping found no reference. Any hit: halt.
- [ ] Pre-flight `agy_list_jobs`; cancel a stale job only if its process is dead.
- [ ] One Antigravity dispatch: the 17 deletions, the `.gitignore` edit, the `AGENTS.md` §13 paragraph. The prompt forbids `run_command` and every shell tool unconditionally, forbids opening or quoting the contents of any file being deleted, and restates `## Do NOT touch`.
- [ ] If Antigravity cannot delete files with its own tools, halt and report — do not delete through this session's shell (see fallback under Blocked).
- [ ] Verify in own shell (list below) and write `HANDOFF.md`.

## Blocked on developer input
- RESOLVED (2026-11-15, dispatch 01 job 87aea34c…): Antigravity has no file-delete tool, so the 17 deletions were done by the developer with `git rm` per the pre-answered fallback below. Antigravity made the `.gitignore` and `AGENTS.md` §13 edits. Verification run and `HANDOFF.md` written; waiting for `code-review`.
- Pre-answered: if Antigravity cannot delete files, the execution session stops and hands the developer one command to run themselves (`git rm` of the 17 paths), then resumes with the two edits.

## Order
### Steps inside this task
1. Branch from `origin/main`.
2. Reference re-check.
3. Dispatch to Antigravity.
4. Verify; write `HANDOFF.md`.
5. Stop for `code-review`.

### Where this task sits
- Before this: nothing. Credential rotation is urgent and independent.
- After this — the fix queue the developer asked for ("do all"), one task each, scoped in turn after this one closes:
  1. SEC-2611-02 — https-only validation and render guard for conference `certificateUrl`.
  2. SEC-2611-03 — test-department accounts: predictable credentials and unrestricted login (needs developer design choices).
  3. SEC-2611-04 — professor hard-delete destroying residents' logs (needs developer decision; may need a schema change, §6).
  4. Medium and Low findings, grouped by area; the 16 failing tests (SEC-2611-22); the `pnpm audit` advisories.
- Standing instruction for the whole queue (developer, 2026-11-15): purely mechanical work goes to Antigravity on a small model.

## Verification required before this is considered done
- [ ] `git ls-files` for the 17 paths returns nothing; command and output pasted.
- [ ] A count-only search of the tracked tree for `postgres(ql)?://user:pass@` patterns returns 0 files; command and output pasted (no values).
- [ ] `git ls-files | grep -E '(^|/)\.env'` shows only `.env.example`.
- [ ] `git check-ignore -v artifacts/mockup-sandbox/.env.local` reports the new `.env.*` rule, and `git check-ignore .env.example` reports nothing.
- [ ] `git diff --stat origin/main` shows exactly: 17 deletions, `.gitignore`, `AGENTS.md`, `HANDOFF.md`, `CURRENT_TASK.md` — nothing else.
- [ ] `pnpm test` in `artifacts/api-server` (PGlite, `DATABASE_URL` unset): totals pasted and unchanged from the audit baseline of 363 pass / 16 fail of 379.
- [ ] Frontend typecheck or build command for `artifacts/mockup-sandbox` run once, exit code pasted.
- [ ] A secret-pattern search over `HANDOFF.md` and the `AGENTS.md` diff returns no match.
- [ ] AGENTS.md §11 four-case evidence: not applicable — no route or authorization code changes.

## Flags (AGENTS.md rule triggers)
- §10 / §13 Secrets — **fires.** The files being deleted contain live-format credentials; values must never be printed, including by the dispatched agent.
- §9 One feature — three findings, one feature: committed credentials out of the tree. The rest of the audit is queued, not bundled.
- §6 Schema — none. Several deleted scripts are database write scripts; they are deleted unread and unrun.
- §2 Force-push — history purge excluded for this reason.
- §1 Pull before every task — replaced, with reason: local `main` diverges from `origin/main`, so the branch is cut from `origin/main` directly. Approval of this file approves that.
- §7 — the `AGENTS.md` paragraph states only facts established by the audit and this task.
- Stale AGENTS.md (follow-up, not edited here beyond §13): §14.1 and §14.2 still route work through Claude Chat and Antigravity-only.
- Noticed: `.gitignore:76` ignores `*.md`, so the audit report is not committed.

## Suggested review tier (set at scoping time)
- High assurance — legacy label **Opus, high effort**. Trigger: §15.2 "secrets or credentials (§10, §13)". The diff is small (deletions plus two short edits), so the review itself should be short. Never lowered (§15.4).

## Executor
- Antigravity
- Why: Antigravity-test point 3 — the developer asked on 2026-11-15 for mechanical work to go to Antigravity on a small model; point 2 also holds (no in-loop verification needed).
- Antigravity model: `Gemini 3.8 Flash (Low)` — the global rules' choice for genuinely mechanical work. Confirm the bridge accepts that exact name before dispatch; if it is rejected, use the nearest Gemini Flash Low name from the rejection list. Never an Opus model.
- Execution session: a fresh agent session on Sonnet.

## Approval
- Status: APPROVED 2026-11-15 — planning session. Execute in a fresh agent session (model per the global rules for your tool).
- Open blocked items at approval: none.
