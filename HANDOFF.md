# HANDOFF — Remove committed credentials (SEC-2611-01, -05, -06)

Branch `fix/remove-committed-credentials`, cut from `origin/main` `9dec1c9`. Nothing committed, no PR. Executor: Antigravity (`Gemini 3.8 Flash (Low)`, no shell). Dispatch prompts in `.agents/runs/` (`dispatch-01-…`); jobs: 01 `87aea34c…` (edits), 02 `60283199…` (wording fix), 03 `c6c53bc7…` (review fix round). No secret value appears in this file.

## What changed
- `.gitignore` — `.env.*` and `!.env.example` added under line 3 (Antigravity).
- `AGENTS.md` §13 — one paragraph appended, one insertion, no commit hash (Antigravity, rewritten in dispatch 03; see below).
- 17 deletions, staged: `artifacts/api-server/run.mjs`; 13 `.cjs` in `lib/db/` (`cleanup_test`, `dedup`, `final_check`, `leave_test`, `merge_accounts`, `merge_accounts_2`, `rename_user`, `reset_pass`, `reset_radhamani`, `restore`, `schema_test`, `sync_mohammed`, `test`); `lib/db/investigate_print.cjs`, `lib/db/verify_print.cjs`; `artifacts/mockup-sandbox/.env.local`. **Done by the developer with `git rm`** (pre-answered fallback: Antigravity has no delete tool). Files never opened or executed by this session or by Antigravity.
- `CURRENT_TASK.md`, `HANDOFF.md` — task bookkeeping.

## Review fix round (dispatch 03)
Finding (a), verified first. By count only (script comparing a fingerprint of the shared test password taken from the two print scripts at `origin/main` against `git show origin/main:<path>`; nothing printed), the same literal occurs in: `investigate_print.cjs` 1, `verify_print.cjs` 1, `run.mjs` 3, `cleanup_test.cjs` 1, `reset_pass.cjs` 1, `reset_radhamani.cjs` 2, `artifacts/mockup-sandbox/.env.local` 3. Confirmed, so the §13 paragraph now says: the shared test password appeared in four of the 14 scripts (`run.mjs`, `cleanup_test.cjs`, `reset_pass.cjs`, `reset_radhamani.cjs`) plus the two print scripts; `.env.local` held demo account passwords and PINs; purging the connection string, the shared test password and the demo credentials from history remains open. The earlier fix (dispatch 02) is kept: "whether it targets production was not tested". Stray blank line before `---` removed: the `AGENTS.md` diff is now `@@ -253,0 +254 @@` (a single added line).
Note: `.env.local` holds the password as a demo-account value; only its occurrence count is stated, not what it belongs to.

## Skipped / expanded
Expanded: nothing. Antigravity's bridge reports were checked against the diff, not trusted.

## Verification (this round; literal commands, output from this run)
Item 1 — `git ls-files -- <the 17 paths from "What changed"> | wc -l`
```
0
```
Item 2 — `git grep -lIE 'postgres(ql)?://[^/[:space:]:@]+:[^@[:space:]]+@' | wc -l`
```
0
```
Item 3 and 4 (unchanged from the previous round, not re-run): only `.env.example` is tracked; `.gitignore:4:.env.*` ignores `artifacts/mockup-sandbox/.env.local`; `.env.example` is not ignored.

Item 5 — `git diff --stat origin/main` (working tree and index against `origin/main`; git's two CRLF warnings omitted)
```
 .gitignore                          |   2 +
 AGENTS.md                           |   1 +
 CURRENT_TASK.md                     | 118 +++++++++++++++++-
 HANDOFF.md                          | 230 ++++++------------------------------
 artifacts/api-server/run.mjs        |  69 -----------
 artifacts/mockup-sandbox/.env.local |   8 --
 lib/db/cleanup_test.cjs             |  46 --------
 lib/db/dedup.cjs                    |  89 --------------
 lib/db/final_check.cjs              | 121 -------------------
 lib/db/investigate_print.cjs        |  38 ------
 lib/db/leave_test.cjs               |  67 -----------
 lib/db/merge_accounts.cjs           |  23 ----
 lib/db/merge_accounts_2.cjs         |  17 ---
 lib/db/rename_user.cjs              |  14 ---
 lib/db/reset_pass.cjs               |  10 --
 lib/db/reset_radhamani.cjs          |  11 --
 lib/db/restore.cjs                  |  15 ---
 lib/db/schema_test.cjs              |  18 ---
 lib/db/sync_mohammed.cjs            |  11 ----
 lib/db/test.cjs                     | 100 ----------------
 lib/db/verify_print.cjs             |  77 ------------
 21 files changed, 155 insertions(+), 930 deletions(-)
```
That is the 17 deletions plus `.gitignore`, `AGENTS.md`, `HANDOFF.md`, `CURRENT_TASK.md` and nothing else.

Item 6 — `cd artifacts/api-server && env -u DATABASE_URL pnpm test` (exit 1, because of the 16 known failures; identical to the audit baseline 363 pass / 16 fail of 379)
```
ℹ tests 379
ℹ suites 10
ℹ pass 363
ℹ fail 16
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 327343.4435
```

Item 7 — `cd artifacts/mockup-sandbox && pnpm typecheck; echo "exit=$?"`
```
$ tsc -p tsconfig.json --noEmit
exit=0
```
(No `vite build` run.)

Item 8 — run after the final write of this file. Pattern P = `postgres(ql)?://[^[:space:]]*:[^[:space:]]*@|np[g]_|password[[:space:]]*[:=]` (case-insensitive).
- `grep -cEi 'P' HANDOFF.md` → `0`
- `git diff origin/main -- AGENTS.md | grep -cEi 'P'` → `0`
- Fingerprint of the shared test password (compared in a script, value never printed): occurrences in `HANDOFF.md` → `0`, in the `AGENTS.md` diff → `0`.

Item 9 — AGENTS.md §11 four-case evidence: not applicable, no route or authorization code changed.

## Rule notes
§13/§10: no secret value read or printed in the session transcript or in Antigravity's prompts; the password check above reports counts only. §6: no database command. §2: no push. Review tier Opus/high (§15.2), not lowered. Manual items for the developer remain: rotate the connection-string credential, check production for the shared test password and demo accounts, decide on history purge.
