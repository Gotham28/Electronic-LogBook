Two fixes to this repository, from a completed code review (dispatch 05 review). Read
AGENTS.md at the repo root and HANDOFF.md at the repo root before doing anything else.
=============================================================================
CONTEXT
A prior dispatch added a new §6.1 to AGENTS.md — a conditional exception permitting
database-connecting commands against a separate test database. A review of that dispatch
found two problems, both being fixed now:

1. §6.1's opening clause is worded more broadly than its four listed conditions actually
constrain, and could be read as permitting plain read-only queries (e.g. psql) against a
verified test host — which §6's original "may never" list explicitly still forbids,
"including read-only queries."
2. The same dispatch overwrote HANDOFF.md instead of appending to it, destroying the prior
documentation-audit findings report. The old content is recoverable from git history.

=============================================================================
HARD RULES

1. You may edit ONLY these two files: AGENTS.md, HANDOFF.md. Touch nothing else — no .ts,
.js, .sql, .json, or any other file.
2. Do NOT run any database command, any migration, any drizzle-kit command, any command
against any database, real or test.
3. Do NOT run git push or git push --force in any form. Do NOT commit unless explicitly
asked in a later message.
4. Do NOT touch the local commit 6718461 already on this branch — no amend, no rebase, no
reset.
5. Report which model you are running as, by name, at the start of your final report. This
task requires your highest-effort/most careful model tier — if your environment lets you
select one, choose the most deliberate option available and name it. Do not leave this
unspecified.

=============================================================================
STEP 1 — Restore HANDOFF.md
a) Run: git show HEAD:HANDOFF.md
Paste the full output. This is the pre-overwrite version (332 lines, per the prior
review) — the complete documentation-audit findings report.
b) Read the CURRENT on-disk HANDOFF.md (231 lines per the prior review — verify the actual
current line count yourself, don't assume it's still 231).
c) Merge them: the restored file should contain the FULL original audit content from
step (a) first, followed by the current dispatch-05 report (the §6.1 addition report)
as a clearly separated, appended section with its own heading — something like
"## Addendum: AGENTS.md §6.1 test-database exception (dispatch 05)". Do not summarize,
shorten, or paraphrase either part. Do not drop any section from either version.
d) Confirm the restored file's line count is at least as long as the original 332 lines
plus the appended section, and report the new total.
=============================================================================
STEP 2 — Show me §6.1 before changing it
Quote the CURRENT full text of AGENTS.md §6.1 verbatim, with line numbers, in your report.
Also quote the adjacent §6 "may never" list it sits next to, verbatim, with line numbers.
Do this before making any edit, so both versions (before/after) are visible in your final
report.
=============================================================================
STEP 3 — Narrow §6.1's wording
Rewrite §6.1 so that its permission attaches ONLY to invoking src/migrate.ts against a
verified separate test database — not to database-connecting commands in general. Concretely:
a) The opening clause must name the specific permitted action (running src/migrate.ts, and
only src/migrate.ts) rather than the general category "a database-connecting command."
b) Keep all four existing conditions from the current §6.1 (separate test DB, host
verification, however conditions 3 and 4 are currently worded) — do not remove any
condition, only narrow what the whole clause is permission FOR.
c) After your rewrite, explicitly re-read §6's "may never" list (the one including "no
command against any database... including read-only queries") and confirm in your report
that a plain psql read-only query, or any command other than running src/migrate.ts
itself, is NOT permitted under your new §6.1 wording. If you cannot make that guarantee
with your rewrite, stop and report why instead of shipping wording you're not sure about.
d) Do not change the heading style (leave the em-dash issue from the prior review alone —
cosmetic, out of scope for this task).
e) Do not weaken, remove, or add exceptions to any other part of §6.
=============================================================================
STEP 4 — Report
Run git diff (not staged, not committed) and paste the complete diff for both files.
Then report:

* The model you ran as (per the hard rules above)
* HANDOFF.md's before/after line counts
* §6.1's before/after text, side by side
* Your own confirmation from step 3(c), explicitly

Then STOP. Do not commit. Do not push. The developer reviews this diff before anything is
committed.


## Files you may touch
- AGENTS.md
- HANDOFF.md