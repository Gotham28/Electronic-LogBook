# Antigravity dispatch 07 — fix dispatch-05 review findings (§6.1 wording + HANDOFF.md restore)

## Guard
This prompt is for the project at Gotham28/Electronic-LogBook (`D:\Electronic-LogBook-main`),
branch `main`. Two fixes from a completed code review of dispatch 05. A separate attempt at
this exact task (from a different, unrelated tool installation) crashed without making any
progress — this dispatch supersedes it and starts from the current on-disk state fresh.

**Sandbox note: avoid `run_command` if at all possible — use file-reading and file-editing
tools (`view_file`, `list_dir`, `grep_search`, `replace_file_content`, `write_to_file`) for
everything in this task.** Everything needed is achievable through file operations alone.

## CONTEXT
A prior dispatch added a new §6.1 to `AGENTS.md` — a conditional exception permitting
database-connecting commands against a separate test database. A review of that dispatch
found two problems, both being fixed now:

1. §6.1's opening clause is worded more broadly than its four listed conditions actually
   constrain, and could be read as permitting plain read-only queries (e.g. `psql`) against
   a verified test host — which §6's original "may never" list explicitly still forbids,
   "including read-only queries."
2. The same dispatch overwrote `HANDOFF.md` instead of appending to it, destroying the prior
   documentation-audit findings report. The old content is recoverable — it has already been
   recovered by Claude Code (via `git show HEAD:HANDOFF.md`, since this dispatch has no
   reliable shell access) and staged for you at
   `.agents/runs/handoff-original-332-lines-recovered.md` (332 lines, verbatim, byte-for-byte
   identical to the git-history version).

## HARD RULES
1. You may edit ONLY these two files: `AGENTS.md`, `HANDOFF.md`. Touch nothing else — no
   `.ts`, `.js`, `.sql`, `.json`, or any other file. (You may **read**
   `.agents/runs/handoff-original-332-lines-recovered.md` — that's the staged recovery
   source, not a file to edit.)
2. Do NOT run any database command, any migration, any `drizzle-kit` command, any command
   against any database, real or test.
3. Do NOT run `git push` or `git push --force` in any form. Do NOT commit.
4. Do NOT touch the local commit `6718461` already on this branch — no amend, no rebase, no
   reset. (Moot if you have no shell access; stated for the record.)
5. **Report which model you are running as, by name, at the start of your final report.**
   This task requires your highest-effort/most careful model tier — if your environment lets
   you select one, choose the most deliberate option available and name it. Do not leave
   this unspecified.

## STEP 1 — Restore HANDOFF.md
a) Read `.agents/runs/handoff-original-332-lines-recovered.md` in full — this is the
   pre-overwrite version (332 lines), recovered by Claude Code from `git show
   HEAD:HANDOFF.md`. It is the complete documentation-audit findings report, verbatim.
b) Read the CURRENT on-disk `HANDOFF.md` in full (231 lines as of this writing — verify the
   actual current line count yourself by reading it, don't assume it hasn't changed).
c) Write `HANDOFF.md` as: the FULL original audit content from step (a) first, byte-for-byte
   as recovered, followed by a clearly separated new section with its own heading —
   `## Addendum: AGENTS.md §6.1 test-database exception (dispatch 05)` — followed by the
   FULL current dispatch-05 report content from step (b), verbatim. Do not summarize,
   shorten, or paraphrase either part. Do not drop any section from either version. The
   dispatch-05 report's own top-level `# HANDOFF.md — ...` title line and its section
   numbers (1-5) should be kept as-is, nested under the addendum heading.
d) Confirm the restored file's line count is at least 332 + the appended section, and report
   the new total.

## STEP 2 — Show §6.1 before changing it
Quote the CURRENT full text of `AGENTS.md` §6.1 verbatim, with line numbers, in your report.
Also quote the adjacent §6 "may never" list it sits next to, verbatim, with line numbers.
For your reference, as read directly by Claude Code moments ago, the current text is:

```
126: ## 6. Schema changes are drafted, never pushed
127:
128: `drizzle-kit push` alters the live schema with no history and no rollback. There is no
129: migration history in this project and no staging environment to catch a bad change.
130:
131: An agent may **write** a migration or a schema diff. An agent may **never**:
132: - Run `drizzle-kit push`.
133: - Run `drizzle-kit migrate`.
134: - Run `psql`, or any other command that connects to a database — including read-only
135:   queries.
136:
137: Stop and hand the drafted change to the developer.
138:
139: Any evidence that an agent ran a command against a database must be reported immediately
140: and prominently, not buried in a summary.
141:
142: ### 6.1 — Test-database exception
143:
144: An agent may run a database-connecting command, including via `src/migrate.ts`, only when
145: ALL four of the following hold:
146: 1. `DATABASE_URL` points at a separate database created specifically for testing — never the
147:    project's production database.
148: 2. The host portion of `DATABASE_URL` is verified and printed before every connecting
149:    command, and any mismatch against the known test host halts immediately.
150: 3. Migrations run only through the project's own `src/migrate.ts` — never `drizzle-kit push`
151:    or `drizzle-kit migrate`.
152: 4. No schema-altering DDL is hand-written outside existing migration files.
153:
154: ---
```

Re-read the file yourself to confirm this still matches before editing — line numbers may
have drifted if anything else changed it since.

## STEP 3 — Narrow §6.1's wording
Rewrite §6.1 so that its permission attaches ONLY to invoking `src/migrate.ts` against a
verified separate test database — not to database-connecting commands in general.
Concretely:

a) The opening clause must name the specific permitted action (running `src/migrate.ts`,
   and only `src/migrate.ts`) rather than the general category "a database-connecting
   command." For example (adapt as needed, this is guidance not mandated wording): "An
   agent may run `src/migrate.ts` — and only `src/migrate.ts` — against a database, only
   when ALL four of the following hold:"
b) Keep all four existing conditions from the current §6.1 (separate test DB, host
   verification, condition 3 and 4 as currently worded) — do not remove any condition, only
   narrow what the whole clause is permission FOR. Condition 3 currently also mentions
   "Migrations run only through the project's own `src/migrate.ts`" — now that the opening
   clause itself names `src/migrate.ts` as the only permitted action, reword condition 3 so
   it doesn't redundantly re-state the same restriction in a confusing way, without deleting
   its substance (never `drizzle-kit push`/`migrate`).
c) After your rewrite, explicitly re-read §6's "may never" list (the one including "no
   command against any database... including read-only queries") and confirm in your report
   that a plain `psql` read-only query, or any command other than running `src/migrate.ts`
   itself, is NOT permitted under your new §6.1 wording. If you cannot make that guarantee
   with your rewrite, stop and report why instead of shipping wording you're not sure about.
d) Do not change the heading style (the em-dash issue from the prior review is cosmetic,
   out of scope for this task — leave `### 6.1 — Test-database exception` as-is).
e) Do not weaken, remove, or add exceptions to any other part of §6.

## Do NOT touch
- Any file other than `AGENTS.md` and `HANDOFF.md`.
- Any `.ts`, `.js`, `.mjs`, `.sql`, `.json` file.
- Any database command, real or test.
- `git commit`, `git push`, or opening a pull request.

## Report
Run `git diff` if you have shell access; if not, present the complete before/after text of
both changed sections/files directly from what you read and wrote. Report:
- The model you ran as (per Hard Rule 5)
- `HANDOFF.md`'s before/after line counts
- §6.1's before/after text, side by side
- Your explicit confirmation from Step 3(c)

Do not commit. Do not push. The developer reviews this diff before anything is committed.
