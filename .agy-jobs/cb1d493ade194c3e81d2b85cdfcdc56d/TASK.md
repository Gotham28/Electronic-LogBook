# Antigravity dispatch 01 — documentation audit

## Guard
This prompt is for the project at Gotham28/Electronic-LogBook (checked out at
`D:\Electronic-LogBook-main`), task file `CURRENT_TASK.md` at the **repo root** dated
2026-09-13. Note: this repo's task file and rule file live at the repo root, **not**
`.agents/CURRENT_TASK.md` / `.agents/AGENTS.md` — `AGENTS.md`'s own text cites the
`.agents/` path repeatedly, but that path does not exist for either file on disk. This
mismatch is itself one of the things this task investigates (discrepancy 3 below); until
that's resolved, read the two files at the repo root. If this is not that repo, stop, say
which repo this is, and wait.

## Read first
- `AGENTS.md` (repo root, 412 lines) — read it in full. It declares itself a reconstructed
  file with non-matching section numbers, and its own §16 "Rule map" is the authoritative
  translation from the section numbers this prompt cites (written against the numbering
  tooling expects) to what actually exists in this file. Resolve every citation through §16
  before treating it as a mismatch.
- `CURRENT_TASK.md` (repo root) — the confirmed scope for this dispatch, in full.

## Build
This dispatch produces a report, not a code change. Treat each item below as a deliverable
in `HANDOFF.md`, not a file edit.

- [ ] Go claim-by-claim through every Markdown file listed in `CURRENT_TASK.md`'s
      "## Files audited" section (14 files total). For every factual statement — file path,
      table name, route, command, env var, migration, test file, section number — classify it
      ACCURATE / STALE / WRONG / UNVERIFIABLE, citing file:line for both the document's claim
      and the current source evidence you checked it against.
- [ ] Confirm or refute the 8 discrepancies listed in `CURRENT_TASK.md`'s "## Agent" section
      (items 1–8), each with evidence.
- [ ] Audit the 37 SEC-01 through SEC-37 findings across `docs/SECURITY_REPORT.md`,
      `docs/SECURITY_FIXES.md`, and `.agents/SECURITY_AUDIT.md`: verify every file:line
      citation against current source, and flag any place the three documents disagree with
      each other about the same finding's severity, fixed/open status, or supporting
      evidence.
- [ ] Note anything found that was not asked about, and anything that contradicts another
      document or `CURRENT_TASK.md` itself.

## Do NOT touch
- Any `.ts`, `.js`, `.mjs`, `.sql`, `.json`, `.yaml`, or other config file — read-only.
- Any command against any database: no `drizzle-kit push`/`migrate`, no `psql`, no
  migrate/seed/provision script, no query against production or any live database, including
  read-only queries.
- `git push` or `git push --force`, in any form.
- Deleting any file. If a file looks dead or superseded, list it as a deletion candidate in
  `HANDOFF.md` instead.
- Editing, creating, or overwriting any Markdown file with new claims. This dispatch produces
  `HANDOFF.md` only — no document in the repo is edited in this pass.
- Inventing or guessing any claim that cannot be verified from the repo. Mark it
  UNVERIFIABLE and state exactly what evidence is missing.
- Anything not named under Build above.

## Hard stops — stop and report, do not decide
- Anything that would require touching a route or query on the clinical tables, or resolving
  ownership server-side, to verify a claim — this task makes no code changes; if a
  verification step seems to need one, stop and report instead.
- Any place `studentsTable.id` and `usersTable.id` could be conflated in what you're
  reading — report it, do not fix it.
- Any schema change, migration, or backfill — never run one. If confirming discrepancy 5
  (the subscriptions/payments migration's run status) seems to require running or connecting
  to anything, stop instead of doing it; report what you found from static evidence only.
- Any secret or credential value — names only, in the report, never a value.
- Anything that would put patient text or leave reasons into the report itself.
- Any value you would otherwise guess or invent.

## Verification — run these and paste the real output
- [ ] `git log --all --oneline -- AGENTS.md` — expect the commit list showing whether a
      pre-reconstruction original is recoverable.
- [ ] List of files actually present under `artifacts/api-server/tests/`.
- [ ] `cd artifacts/api-server && pnpm run test` — expect a pass/fail count at current HEAD.
      This runs against in-process PGlite only; no real database is touched.
- [ ] A search of every `process.env.<NAME>` read across `artifacts/`, `lib/`, and `scripts/`
      source files, reduced to a unique variable list.
- [ ] `gh pr list --state all --limit 50` — expect the real PR list, to check `pr-body.md`
      and `PR_DESCRIPTION.md` against actual PR bodies.
- [ ] `diff pr-body.md PR_DESCRIPTION.md` — expect confirmation of whether they duplicate
      each other.

## Report
Write `HANDOFF.md` at the repo root, containing:
- A per-file, per-claim findings table: file, claim, classification, evidence.
- The 8 discrepancies, confirmed or refuted, each with evidence.
- The SEC-01..SEC-37 audit table and any cross-document contradictions found.
- Contradictions between documents generally, stated as "X says A, Y says B".
- Candidates for deletion, with reasoning.
- Anything skipped, and why.
- Anything expanded beyond the Build list, and why.

A claim without pasted command output next to it is recorded as unverified, whatever the
narrative says. Do not open a pull request.

## Model
Sonnet


## Files you may touch
- HANDOFF.md

## Commands you may run
- git log
- git show
- git status
- git branch
- git diff
- gh pr list
- gh pr view
- pnpm run test
- pnpm test
- diff