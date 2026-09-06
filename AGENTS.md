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

There is still **no staging environment and no database migration
history.** Mistakes are caught by people, late, and cannot be rolled back. Every rule below
exists because of that.

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

## 11. Committed credentials

Seven tracked scripts in `lib/db/` hardcode a production database connection string as a
`||` fallback: `check_reetha.mjs`, `check_reetha_student.mjs`, `check_schema.mjs`,
`check_schema_exact.mjs`, `delete_reetha.mjs`, `query_reetha.mjs`, `query_tables.mjs`.

They entered history at commit `10bbd69` and are on `origin/main`.

The pattern **fails open**: with `DATABASE_URL` unset they silently target production. One
of them is named `delete_reetha.mjs`. `phase0.js` at the repository root also reads
`DATABASE_URL`.

Removing these scripts and purging the credential from history is an open task.

---

## 12. Evidence standard

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

## 13. Reporting

Every agent report states:
- The commit hash worked from.
- Every file created or modified, with paths.
- Every command run — in full, including any that touched git or a database.
- Evidence per §12 where applicable.
- Anything noticed that was not asked about.
- Anything that contradicts the task instructions or this file.

If an instruction in a task conflicts with this file, **stop and say so.** Do not pick one.

---

## Known gaps in this reconstruction

The original `AGENTS.md` contained at least the following sections, referenced by project
tooling but not recoverable from the project rules:

- **§10 — Opus trigger conditions** (cited by the `review-skill` workflow).
- **§12.2 step 6 — end-of-task review step** (cited by the `code-review` workflow).
- **§12.13 — the seven-section review report format** (cited by the `code-review`
  workflow).

These must be restored from git history or rewritten before those workflows will behave
correctly.
