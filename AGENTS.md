# AGENTS.md — Arogya Electronic LogBook

**RECONSTRUCTED FILE — READ THIS FIRST.**

This file was rebuilt on 2026-09-06 from the project's standing rules after the original
`AGENTS.md` was found missing from the repository root. **Its section numbers do not match
the original.** Tooling or skills that cite `AGENTS.md §10`, `§12.2` or `§12.13` will not
resolve against this file. If the original can be recovered from git history
(`git log --all --oneline -- AGENTS.md`), recover it and discard this one.

---

## 0. What this project is

The Electronic LogBook is a module of the Arogya platform, built by GOTHOS.

Postgraduate medical residents log clinical cases, procedures and academic activities.
Professors review them. The Head of Department (HOD) oversees the department against
MCI-style training targets.

**This is production code in active pilot deployment** with the Pediatrics department at
Pariyaram Medical College. Real residents, real professors, real records.

It stores:
- Patient clinical detail — UHID, complaints, history, examination, diagnoses.
- Resident personal data — including leave reasons, which can disclose health conditions.

There is a test suite at `artifacts/api-server/tests/` — `access.test.ts`,
`migrations.test.ts`, `support.ts` and `database.ts`. `tests/migrations.test.ts` runs the
real migrations against in-process PGlite, so it requires no database and is safe to run.

There is still **no staging environment.** Mistakes are caught by people, late, and cannot
be rolled back. Every rule below exists because of that.

---

## 1. Pull before every task

Every agent task in this repository begins with:

```
git status
git stash list
git checkout main
git pull origin main
git log --oneline -5
```

Report the resulting commit hash before doing anything else.

- A **dirty working tree stops the task.** Report and halt.
- **Existing stashes do not stop the task**, but must be listed in the report. An agent
  must never apply, pop or drop a stash.
- Other people commit to this repository. A task started on a stale `main` is a task that
  will conflict or silently overwrite someone else's work.

---

## 2. `git push --force` is forbidden

Project-wide. Every branch. Every form, including `--force-with-lease` and
`push -f`. A force-push to `main` has already destroyed committed work on this
repository once.

An agent that believes a force-push is required must stop and ask.

---

## 3. Ownership before data

No caller reads or writes a row belonging to another student. No professor acts outside
their assignments. No HOD acts outside their department.

Every route touching `case_logs`, `procedure_logs`, `academic_logs`, `leave_records`,
`postings`, `research`, `assessments` or `attendance` must:

1. Carry `requireAuth`.
2. Resolve the row's actual owner from the database.
3. Return `403` on mismatch.

**A conditional filter is not a filter.** This is wrong:

```js
if (departmentId) {
  query = query.where(eq(table.departmentId, departmentId));
}
```

If `departmentId` is missing, that returns every department's rows. Missing scope must
**fail closed** — no scope means no data and an error, never all data.

---

## 4. The two ID systems are load-bearing

Two different tables have `id` columns, and they are not interchangeable.

| Value | Comes from |
|---|---|
| `/api/students/:studentId/*` route parameter | `studentsTable.id` |
| `supervisorId`, `reviewerId`, `professorId`, `req.user.id` | `usersTable.id` |

Comparing one to the other is a **silent authorization bypass**, not a 404. The numbers
collide, so the wrong record is returned with a `200` and nobody notices.

Check this on every route, every time. When a route needs both, resolve one from the other
explicitly through the database — never assume they match.

Client-supplied IDs are never trusted for ownership decisions. Resolve ownership from
`req.user.id` server-side.

---

## 5. No hardcoded department behaviour

Nothing branches on `departmentId === 1`. Nothing assumes Pediatrics. Nothing assumes a
Pediatrics-specific procedure list, target count, or posting name.

Per-department behaviour belongs in `department_configs` and `procedure_types`.

This system is intended for more than one department. Every hardcoded assumption is a bug
that will surface the day a second department is onboarded.

---

## 6. Schema changes are drafted, never pushed

`drizzle-kit push` alters the live schema with no history and no rollback. There is no
migration history in this project and no staging environment to catch a bad change.

An agent may **write** a migration or a schema diff. An agent may **never**:
- Run `drizzle-kit push`.
- Run `drizzle-kit migrate`.
- Run `psql`, or any other command that connects to a database — including read-only
  queries.

Stop and hand the drafted change to the developer.

Any evidence that an agent ran a command against a database must be reported immediately
and prominently, not buried in a summary.

---

## 7. No fabricated content, no fabricated data

- Never invent legal or medical wording. Not consent text, not clinical definitions, not
  MCI/NMC requirement wording, not privacy notices.
- Never render mock, placeholder or fallback numbers when a call fails. A failed call
  shows a **visible error state**. A dashboard that quietly shows `0` when the fetch threw
  is worse than a dashboard that shows nothing.

`HODPortal.tsx` has regressed on the fallback-numbers rule twice. Scrutinise it on every
diff that touches it.

---

## 8. Never log patient text or leave reasons

Log an id and a status code. Never log:
- Complaints, history, examination findings, diagnoses, UHID.
- Leave reasons — these can disclose a resident's health condition.

This applies to `console.log`, error objects, stack traces, third-party error reporting,
and any payload sent to an external service.

---

## 9. One feature per task, one feature per diff

If a task touches more than what was asked, **flag it — do not just do it.**

Do not silently restructure, rename, reformat, tidy or "improve" code that was not part of
the task. Report what you noticed and leave it alone.

Bundled diffs cannot be reviewed properly, and this project has no test suite to catch what
review misses.

---

## 10. Secrets

- Never hardcode credentials in source files.
- Never print, echo or repeat a secret **value** — key names only.
- Never write or overwrite `.env`. Append instructions for the developer to apply by hand.
- `.env` stays in `.gitignore`.
- Any secret that appears in a chat log, a prompt, or a commit is burned and must be
  rotated.

---

## 11. Evidence standard

For any ownership or authorization change, **"verified" means four cases shown
individually, with status codes:**

| Case | Expected |
|---|---|
| Unauthenticated request | `401` |
| Authenticated, wrong owner | `403` |
| Authenticated, correct owner | `200` |
| Authenticated, nonexistent row | `404` |

Anything less is an assertion, not a report. "It works", "tested and working", "the auth
check is in place" — all rejected.

Show the request and the response for each of the four. A summary claiming four cases
passed, without the four responses, does not meet this standard.

---

## 12. Reporting

Every agent report states:
- The commit hash worked from.
- Every file created or modified, with paths.
- Every command run — in full, including any that touched git or a database.
- Evidence per §11 where applicable.
- Anything noticed that was not asked about.
- Anything that contradicts the task instructions or this file.

If an instruction in a task conflicts with this file, **stop and say so.** Do not pick one.

---

## 13. Committed credentials

Seven tracked scripts in `lib/db/` hardcode a production database connection string as a
`||` fallback: `check_reetha.mjs`, `check_reetha_student.mjs`, `check_schema.mjs`,
`check_schema_exact.mjs`, `delete_reetha.mjs`, `query_reetha.mjs`, `query_tables.mjs`.

They entered history at commit `10bbd69` and are on `origin/main`.

The pattern **fails open**: with `DATABASE_URL` unset they silently target production. One
of them is named `delete_reetha.mjs`. `phase0.js` at the repository root also reads
`DATABASE_URL`.

Removing these scripts and purging the credential from history is an open task.


---

## 14. Execution model

### 14.1 Antigravity writes, Claude Code reasons

Claude Code does not write implementation code in this repo. Every change to
source, tests, config, or docs is dispatched to Antigravity. There is no
small-change exception. A guard hook enforces this.

Claude Code still runs, in its own shell: reads, `git` commands, and test,
lint, and typecheck runs used to verify a claim. Running a test is
verification. Editing the test is a dispatch.

### 14.2 The loop

1. **Scope** — `.agents/CURRENT_TASK.md` is written in Claude Chat. One
   feature per task, per §9.
2. **Dispatch** — Claude Code turns the `## Agent` bucket into one
   Antigravity prompt. It does not write code.
3. **Build** — Antigravity works, and returns a branch plus `HANDOFF.md`.
4. **Review** — Claude Code reviews the diff through dispatched reviewers,
   and produces the report in §14.6.
5. **Decide** — the developer accepts, rejects, or asks for changes, in
   Claude Chat.
6. **Close** — commit, push, open the PR. Never automated end to end.

No pull request is opened before step 5. A PR opened early points automated
review at unreviewed code.

### 14.3 Routes

Exactly one route per task, named in `.agents/CURRENT_TASK.md`.

| Route | Meaning |
|---|---|
| **A** | Purely manual. Credentials, approvals, merges. Nothing to dispatch. |
| **B** | Default. Claude Code drives Antigravity, halts per §14.5, reviews at the end. |
| **C** | Antigravity alone. Every file and line already named, no judgement anywhere. |

Route C requires all of: nothing left to decide; no §15 Opus trigger
expected; nothing irreversible; no open item under
`## Blocked on developer input`; no edit to a code path enforcing §3 or §4;
and verification that needs only a diff and an exit code.

**When in doubt, route B.** Route B costs a halt. A wrong route C costs an
unreviewed change to a clinical table.

Close-out is never route C.

### 14.4 Mechanical work

Route C is for work with no judgement in it: formatting, a rename inside one
file, docs wording, regenerating a snapshot. If a step turns out to need a
decision, the agent stops and reports rather than deciding.

### 14.5 Halt conditions

Stop and hand the decision to the developer when any of these appear. Do not
work around them, and do not decide them.

- Any change to a route or query touching the clinical tables, or to
  anything resolving ownership server-side (§3).
- Any place `studentsTable.id` and `usersTable.id` could be conflated (§4).
- Any schema change, migration, or backfill (§6).
- Any new department-specific behaviour that should be configuration (§5).
- Anything that puts patient text or leave reasons near a log, error, or
  audit trail (§8).
- Any secret, credential, or `.env` value (§10, §13).
- The task turning out to be more than one feature (§9).
- Any value the agent would otherwise guess or invent.

### 14.6 The review report

A completed review produces, in this order: scope adherence; rule violations
by section number; evidence check; blast radius; what was expanded beyond
scope; what was skipped; and a verdict of accept, accept with changes, or
reject.

The evidence check is decided by §11, not by the agent's summary. An
ownership or authorization change without all four cases pasted individually
is recorded as unverified, whatever the report claims.

### 14.7 No MASTER_PLAN.md

This repo has no roadmap document. A task that is not part of planned work is
recorded in its own `.agents/CURRENT_TASK.md` under `## Plan reference` as
unplanned, with one line of why. This project is not roadmap-driven. Unplanned work is recorded in the task
file, not in a separate plan document.

### 14.8 The task file

`.agents/CURRENT_TASK.md` holds the current task, not history. It is
overwritten each task, never appended to. Reset it to idle at close-out.

`.agents/runs/` holds one file per dispatch, append-only.

---

## 15. Review tiers

### 15.1 Set at scoping time

The tier is chosen when the task is scoped, before code exists, so it can be
cross-checked against what the agent layer names later. A *lower* tier coming
back is itself a finding.

### 15.2 Triggers

| Tier | Effort | Fires when the task touches |
|---|---|---|
| Opus | high | Ownership resolution or the clinical tables (§3); the two ID systems (§4); schema, migration, or backfill (§6); patient text or leave reasons near a log (§8); secrets or credentials (§10, §13) |
| Sonnet | medium | Ordinary feature work, bugfixes, UI, config fields, new routes on non-clinical tables |
| Haiku | low | Docs, formatting, comments, test names, dependency bumps |

### 15.3 Default down, not up

Sonnet is the default. Opus is for the five triggers above and nothing else.
Ordinary feature work reaching Opus is a scoping error, not caution.

Never `max` effort. A task appearing to need it should have been split under
§9.

### 15.4 A tier is never lowered

Not by the agent, not mid-task, not because the diff turned out smaller than
expected. It can be raised.

---

## 16. Rule map

Tooling written against a different project cites section numbers that mean
other things here. This table is authoritative. A citation resolving through
this table is **not** a numbering mismatch, and is not grounds to stop.

| Cited as | In this repo |
|---|---|
| §5.1 — the boundary | §3 Ownership before data, and §4 the two ID systems |
| §5.2 — customer-specific behaviour | §5 No hardcoded department behaviour |
| §5.4 — irreversible change | §6 Schema changes are drafted, never pushed |
| §5.6 — sensitive data near logs | §8 Never log patient text or leave reasons |
| §5.8 — one feature per task | §9 One feature per task, one feature per diff |
| §5.10 — evidence | §11 Evidence standard |
| §6.4 — task file overwritten | §14.8 |
| §9 — MASTER_PLAN append | Does not apply. See §14.7 |
| §10 — review tiers | §15. **§10 in this file is Secrets** |
| §12.2 — the loop | §14.2 |
| §12.3 — mechanical work | §14.4 |
| §12.5 — halt conditions | §14.5 |
| §12.9 — tier never lowered | §15.4 |
| §12.13 — the review report | §14.6 |

Project tooling was authored against a differently-numbered rule set. This
table records where each concept actually lives in this file. A citation not
in this table, and not matching a real section here, does not resolve.
---

## Known gaps in this reconstruction

The original `AGENTS.md` contained at least the following sections, referenced by project
tooling but not recoverable from the project rules:

§10 — Opus trigger conditions were referenced by project tooling but not
recoverable from history. Reconstructed as §15 on 2026-09-09 from this
file's own rules (§3, §4, §6, §8, §10, §13) rather than recovered. Treat as
a reasonable reconstruction, not the original.
- **§12.2 step 6 — end-of-task review step** (cited by the `code-review` workflow).
- **§12.13 — the seven-section review report format** (cited by the `code-review`
  workflow).

These must be restored from git history or rewritten before those workflows will behave
correctly.
