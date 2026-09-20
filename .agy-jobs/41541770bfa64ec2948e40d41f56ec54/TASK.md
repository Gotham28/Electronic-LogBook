# Antigravity dispatch 05 — AGENTS.md §6 test-database carve-out

## Guard
This prompt is for the project at Gotham28/Electronic-LogBook (checked out at
`D:\Electronic-LogBook-main`), on branch `main`. This repo's task file lives at the repo
root as `CURRENT_TASK.md` — **not** `.agents/CURRENT_TASK.md`, which does not exist on disk
(a known, already partially-fixed discrepancy in this repo's tooling). If this is not that
repo, stop, say which repo this is, and wait.

## Read first
- `AGENTS.md` (repo root) — §6 "Schema changes are drafted, never pushed" in full, and §16
  "Rule map" if you need to resolve any differently-numbered citation.
- `CURRENT_TASK.md` (repo root) — after you write it in Step 1, re-read it as the confirmed
  scope for Step 2.

## Build

### Step 1 — Write CURRENT_TASK.md
`CURRENT_TASK.md` currently reads:
```
# Current Task

None. No task is in progress.
```
(the previous task was just closed out). Replace its entire contents with exactly the text
between the `---BEGIN CURRENT_TASK.md---` / `---END CURRENT_TASK.md---` markers below (do
not include the marker lines themselves, do not alter a single character inside them):

---BEGIN CURRENT_TASK.md---
# Current Task

## Feature
Amend AGENTS.md §6 to add a narrow, explicit carve-out permitting an agent to run
database-connecting commands only against a verified non-production test database, under
four stated conditions — everything else in §6 stays exactly as strict as it is today.

## Plan reference
Unplanned — one-off developer-requested rule amendment, needed before a downstream task
(standing up a separate test database with an HOD/professor/student and filler data) can be
scoped. Recorded here per §14.7 (this repo has no MASTER_PLAN.md).

## MASTER_PLAN.md update
- [ ] None — this repo has no MASTER_PLAN.md (§14.7).

## Files/areas in scope
- `AGENTS.md` — §6 only: add a new subsection immediately after the existing "may never"
  list, stating the carve-out.

## Explicitly out of scope
- Any other AGENTS.md section (§14.5 halt conditions, §15 review tiers, etc.) — no
  cross-reference updates unless review finds one is factually broken by this change.
- The actual test-database setup, migration run, account creation, or filler data (that is
  a separate, blocked downstream task — do not scope it until this one is reviewed and
  accepted).
- Any `.ts`, `.js`, `.mjs`, `.sql`, `.json`, or other source/config file.

## Do NOT touch
- Do not run any command that connects to a database as part of this task — this task edits
  policy text only, it does not exercise the policy.
- Do not touch the existing four-line "may never" list's wording (drizzle-kit push/migrate,
  psql, production, read-only queries) — it must remain exactly as strict.
- Do not touch any file other than `AGENTS.md` (and `CURRENT_TASK.md` itself, in step 1).
- Do not run `git push` in any form. Do not open a PR. Do not run `git commit`.

## Execution route
- B — Claude Code loop
- Why: route-test point 2 fails for route C — §15.2's Opus trigger ("schema, migration, or
  backfill (§6)") is expected to fire because the task's entire subject is §6 itself. A
  wrongly-worded carve-out could silently widen database access beyond intent, which is not
  mechanical work.
- Close-out: route B — never automated

## Manual (developer does)
- [ ] Final review and explicit approval of the exact carve-out wording before it's treated
      as active policy (via `review-skill`, once Antigravity's diff comes back).

## Agent (does on its own, once scope is confirmed)
- [ ] Add a new subsection to AGENTS.md §6 (e.g. "§6.1 — Test-database exception") stating:
      an agent may run a database-connecting command, including via `src/migrate.ts`, only
      when ALL of: (1) `DATABASE_URL` points at a separate database created specifically for
      testing, never the project's production database; (2) the host portion of
      `DATABASE_URL` is verified and printed before every connecting command, and any
      mismatch against the known test host halts immediately; (3) migrations run only
      through the project's own `src/migrate.ts`, never `drizzle-kit push` or
      `drizzle-kit migrate`; (4) no schema-altering DDL is hand-written outside existing
      migration files.
- [ ] Leave every other word of §6 unchanged.
- [ ] Show the full diff of AGENTS.md in the handoff.

## Blocked on developer input
None — the four conditions were fully specified by the developer.

## Order
### Steps inside this task
1. Antigravity edits AGENTS.md §6 per the Agent bucket above.
2. Claude Code reviews the diff (dispatched lens reviewers per §14.6).
3. Developer decides via `review-skill`.

### Where this task sits
- Before this: nothing.
- After this: unblocks scoping the test-database + test-accounts task (currently on hold).

## Verification required before this is considered done
- [ ] `git diff AGENTS.md` shows changes confined to §6 (a new subsection added, nothing
      else in the file touched) — paste the full diff.
- [ ] `git diff --stat` shows exactly one file changed: `AGENTS.md` (plus CURRENT_TASK.md
      from step 1, which is scoping scaffolding, not the reviewed change itself).
- [ ] The new subsection contains all four conditions, each independently checkable (not
      merged into vague prose).
- [ ] The existing "may never" list's four items (drizzle-kit push, drizzle-kit migrate,
      psql, any other DB command / read-only queries) are byte-for-byte unchanged.

## Flags (AGENTS.md rule triggers)
- §6 — this task's entire subject.
- §15.2 Opus trigger — "schema, migration, or backfill (§6)" fires because the edit is to
  §6 itself, even though no migration is actually run.
- §14.5 halt condition — "Any schema change, migration, or backfill (§6)" — treated as
  triggered out of caution; developer sign-off required before the new rule is relied on.
- §9 one-feature-per-task — satisfied, this is a single rule amendment.

## Suggested review tier (set at scoping time)
- Opus 5, high effort — §15.2's §6 trigger (schema/migration policy), given a
  wrongly-scoped carve-out could weaken database-access policy beyond what's intended.

## Suggested Antigravity model
- The slowest, most deliberate model available in Antigravity's selector (nearest
  equivalent to Claude Opus) — per the Opus review tier above.
---END CURRENT_TASK.md---

### Step 2 — Amend AGENTS.md §6
Add a new subsection to AGENTS.md §6, placed inside §6 (after the existing "may never" list
and the "Stop and hand the drafted change to the developer." line, before the `---` divider
that starts §7). Use a heading or bolded lead-in consistent with the rest of the document's
style — it must read as a clearly distinct subsection, not blended into the surrounding
paragraph.

The new text must state, as an explicit, independently-checkable list, that an agent may run
a database-connecting command (including via `src/migrate.ts`) ONLY when ALL four of the
following hold:
1. `DATABASE_URL` points at a separate database created specifically for testing — never the
   project's production database.
2. The host portion of `DATABASE_URL` is verified and printed before every connecting
   command, and any mismatch against the known test host halts immediately.
3. Migrations run only through the project's own `src/migrate.ts` — never `drizzle-kit push`
   or `drizzle-kit migrate`.
4. No schema-altering DDL is hand-written outside existing migration files.

Do not weaken, rephrase, or remove any word of the existing four-line "may never" list
(drizzle-kit push, drizzle-kit migrate, psql, any other DB command including read-only
queries). That list stays exactly as strict as it is today — the new subsection is an
exception carved out beneath it, not a replacement for it.

## Do NOT touch
- Any file other than `CURRENT_TASK.md` (Step 1) and `AGENTS.md` (Step 2).
- Any `.ts`, `.js`, `.mjs`, `.sql`, `.json`, `.yaml` file.
- The existing "may never" list's wording in §6 — byte-for-byte unchanged.
- Any other AGENTS.md section (§14.5, §15, etc.) — no cross-reference updates.
- Any command that connects to a database, or any shell command at all — this is a pure text
  edit to two Markdown files.
- `git commit`, `git push`, or opening a pull request.

## Hard stops — stop and report, do not decide
- If wording the carve-out would require inventing a condition the developer didn't specify
  — stop and ask, do not guess.
- If §6's existing "may never" list would need to change in any way to fit the new
  subsection in — stop and report, do not edit it.
- Any value you would otherwise guess or invent.

## Verification — run these and paste the real output
- [ ] View the full contents of `AGENTS.md` §6 after the edit and paste it, confirming
      inline that the four "may never" bullets are unchanged from before.
- [ ] View the full contents of `CURRENT_TASK.md` after Step 1 and paste it, confirming it
      matches the provided text exactly.

(No shell access needed for either verification — both are plain file-content checks.)

## Report
Write `HANDOFF.md` at the repo root, containing:
- The full text of AGENTS.md §6 before and after the edit, so the change is visible without
  git.
- The full text written to `CURRENT_TASK.md`, confirming it matches the provided text
  verbatim.
- Anything you skipped, and why.
- Anything you expanded beyond the Build list above, and why.

A claim without pasted output is recorded as unverified. Do not open a pull request. Do not
commit. Do not run any shell or database command.

## Model
The slowest, most deliberate model available in Antigravity's selector (nearest equivalent
to Claude Opus) — per the Opus review tier set at scoping time (§15.2's §6 trigger).


## Files you may touch
- CURRENT_TASK.md
- AGENTS.md
- HANDOFF.md