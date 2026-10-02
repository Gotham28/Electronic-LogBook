# Antigravity dispatch 75 — send-back: two test defects in the "Send HOD email" task

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root (there is no
`.agents/CURRENT_TASK.md` and no `.agents/AGENTS.md`; `AGENTS.md` is also at the repository root),
dated 2026-09-30, base commit `4f5c26d`, working branch `feat/admin-send-hod-welcome-email`
(already checked out; you cannot run git to confirm this). This is a send-back of dispatch 74:
the four source files already contain that dispatch's work, uncommitted. If this is not that
repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

This means you cannot run `pnpm test` or `pnpm typecheck`. Claude Code runs both after you
return. Write the code so it will pass them, and say in `HANDOFF.md` which checks you could not run.

## Read first
- `AGENTS.md` (repo root) — §9, §11. §16 is a rule map; §10 in that file is Secrets.
- `CURRENT_TASK.md` (repo root) — `## Tests — superadmin.test.ts` under `## Agent`, and `## Do NOT touch`.
- `artifacts/api-server/tests/superadmin.test.ts` — read in full before editing. The lines cited
  below are current as of this prompt; re-locate them by content if they have moved.
- `artifacts/api-server/tests/support.ts` — read only. `simulateFailure` is exported at line 14;
  the fixture accounts are built in `setup()` (lines 40–81), keyed `kind + departmentIndex`
  (`hod0`, `hod1`, `faculty0`, `faculty1`, `student0`, `student1`, ...).
- `HANDOFF.md` (repo root) — the file you wrote for dispatch 74; you will extend it.

## Build
Claude Code ran the suite after dispatch 74. Two of the tests you added fail. Both are in
`artifacts/api-server/tests/superadmin.test.ts`. Fix exactly these two and nothing else.

- [ ] **Defect 1 — `simulateFailure` is used but never imported.** The 502 test ("returns 502 when email fails, but password still resets", uses `simulateFailure.enabled` at about lines 772+) throws `ReferenceError: simulateFailure is not defined`. Line 3 currently reads `import { setup, request, accounts as a, departmentIds, password } from "./support.js";`. Add `simulateFailure` to that import list, and change nothing else on the line. Do not edit `support.ts` (it already exports it).
- [ ] **Defect 2 — the new 403 test authenticates as a `student0` that an earlier test has deactivated.** The test "POST /superadmin/departments/:id/hod/welcome-email with HOD, professor, student tokens returns 403" (about lines 702–707) loops over `["hod0", "faculty0", "student0"]` and fails with `401 !== 403` at the `assert.equal(res.status, 403)` line. Cause: the earlier test "deactivating a student retains their existing logs/records" (about lines 333–358) deactivates `student0` through the admin route (`/superadmin/users/<student0.id>/deactivate` → status `rejected`), so by the time this test runs at the end of the file, `student0`'s token is no longer accepted. The existing 403 test at the top of the file passes only because it runs first. Fix: in the new 403 test, use `student1` instead of `student0`. `student1` is unused anywhere else in the file. Role gating on this route is by role only (router-level `requireRole(["admin"])`), so the student's department does not matter. Leave `hod0` and `faculty0` as they are — neither is mutated by any other test in the file. Leave the `assert.equal(res.status, 403)` line and the test title unchanged, except: add a failure message to that assert in the same form the top-of-file 403 test uses (`` `${role} on POST ... should be 403, got ${res.status}` ``), so a future failure names the role. This is the one addition beyond the swap, and only because the current assert reports no role.
- [ ] `HANDOFF.md` (repo root) — append a section titled `## Dispatch 75 — send-back` describing the two edits with `file:line`. Do not rewrite or delete anything already in the file. Keep the "NOT RUN by this dispatch" list; add `pnpm test` and both typechecks to it again for this dispatch.

## Do NOT touch
- Everything under `artifacts/api-server/src/`, and all of `artifacts/mockup-sandbox/` — dispatch 74's route, client function and UI stand as they are.
- `artifacts/api-server/tests/support.ts`, `artifacts/api-server/src/lib/mailer.ts`, `artifacts/api-server/src/lib/department-provisioning.ts`, `lib/db/`.
- Any other test in `superadmin.test.ts` — including the existing top-of-file 403 test, and every test not named above. Do not "fix" the fact that other tests deactivate `student0`; that is existing behaviour and out of scope.
- The 200, 401, 404 tests, and any assertion inside the tests named above other than the two edits described.
- `.env`, `AGENTS.md`, anything else under `.agents/`, `package.json` files, `pnpm-lock.yaml`, all git stashes.
- The untracked files `.agents/runs/dispatch-71-*.md`, `dispatch-72-*.md`, `dispatch-73-*.md`, `dispatch-74-*.md`, `dispatch-75-*.md`, `.agy-jobs/` and `CURRENT_TASK.md`.
- No reformatting, renaming or tidying of any line outside the two defects (§9).
- git in any form.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any need to edit a file other than `superadmin.test.ts` and `HANDOFF.md`.
- Any reason to believe the diagnosis above is wrong (for example `student1` is used by another test, or `simulateFailure` is already imported some other way). Report what you found and stop; do not choose a different fix.
- Any password, email address, name or error object placed near a log call (§8) — none is expected in this task.
- Any secret, credential or `.env` value (§10).
- Any value you would otherwise guess or invent.

## Verification (file reads only)
After editing, re-read `superadmin.test.ts` and confirm, citing line numbers in `HANDOFF.md`:
- line 3 imports `simulateFailure` from `./support.js` and no other import changed;
- the new 403 test loops over `["hod0", "faculty0", "student1"]` and no longer mentions `student0`;
- no other line of the file changed (compare against your dispatch 74 edits).

## Report
Append to `HANDOFF.md` as described under Build. A claim without `file:line` evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Claude Sonnet 4.6 (Thinking)` is quota-blocked (429, resets in about 45 hours) — dispatch 74 already fell back; this uses `Gemini 3.1 Pro (High)` under the standing fallback. Never Opus.
