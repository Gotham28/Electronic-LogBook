# Antigravity dispatch 07 — fix dispatch-05 review findings (§6.1 wording + HANDOFF.md restore)

## Guard
Project: Gotham28/Electronic-LogBook (`D:\Electronic-LogBook-main`), branch `main`. Two
fixes from a completed code review of dispatch 05. A separate attempt at this exact task
crashed with zero progress — this dispatch supersedes it, starting fresh from current disk
state.

Prefer file-reading/file-editing tools over `run_command` for this task if possible.

## CONTEXT
A prior dispatch added §6.1 to `AGENTS.md` (a conditional exception permitting
database-connecting commands against a separate test database). Review found two problems:

1. §6.1's opening clause is worded more broadly than its four conditions actually
   constrain — it could be read as permitting plain read-only `psql` queries against a
   verified test host, which §6's "may never" list still forbids ("including read-only
   queries").
2. That dispatch overwrote `HANDOFF.md` instead of appending, destroying the prior
   documentation-audit findings report. It's recovered and staged at
   `.agents/runs/handoff-original-332-lines-recovered.md` (332 lines, verbatim from git
   history).

## HARD RULES
1. Edit ONLY `AGENTS.md` and `HANDOFF.md`. You may read (not edit) the staged recovery file.
2. No database/migration/drizzle-kit commands, ever.
3. No `git push`/`git commit`.
4. Don't touch commit `6718461`.
5. Report which model you're running as, by name, at the top of your report. Use the most
   deliberate/highest-effort model tier your environment offers and name it explicitly.

## STEP 1 — Restore HANDOFF.md
a) Read `.agents/runs/handoff-original-332-lines-recovered.md` in full (332 lines, the
   pre-overwrite audit report).
b) Read the current on-disk `HANDOFF.md` in full — verify its actual current line count
   yourself.
c) Write `HANDOFF.md` = full content of (a) verbatim, then a new heading
   `## Addendum: AGENTS.md §6.1 test-database exception (dispatch 05)`, then the full
   content of (b) verbatim underneath it. Do not summarize, shorten, paraphrase, or drop
   any section of either part.
d) Report the new total line count (should be at least 332 + the appended section).

## STEP 2 — Show §6.1 before changing it
Read `AGENTS.md` §6 and §6.1 yourself. Quote both verbatim with line numbers in your report,
before making any edit.

## STEP 3 — Narrow §6.1's wording
Rewrite §6.1 so its permission attaches ONLY to invoking `src/migrate.ts` against a verified
test database — not database-connecting commands in general.

a) The opening clause must name the specific permitted action (running `src/migrate.ts`,
   and only that) rather than the general category "a database-connecting command."
b) Keep all four existing conditions (separate test DB, host verification, migrate-only,
   no hand-written DDL) — narrow what the clause is permission FOR, don't remove a
   condition. Reword condition 3 if it now redundantly restates the opening clause, without
   losing its substance (never `drizzle-kit push`/`migrate`).
c) Re-read §6's "may never" list after your rewrite and explicitly confirm in your report
   that a plain `psql` read-only query, or any command other than running `src/migrate.ts`,
   is NOT permitted under the new wording. If you can't guarantee that, stop and report why
   instead of shipping uncertain wording.
d) Leave the heading style (`### 6.1 — Test-database exception`) unchanged — cosmetic,
   out of scope.
e) Don't touch any other part of §6.

## Do NOT touch
Any file other than `AGENTS.md`/`HANDOFF.md`. Any `.ts`/`.js`/`.mjs`/`.sql`/`.json` file.
Any database command. `git commit`/`push`/PR.

## Report
Present the complete before/after text of both changed files/sections. Report: the model
you ran as; HANDOFF.md's before/after line counts; §6.1's before/after text side by side;
your explicit confirmation from Step 3(c). Do not commit or push.


## Files you may touch
- AGENTS.md
- HANDOFF.md