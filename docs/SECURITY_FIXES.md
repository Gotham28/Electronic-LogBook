# SECURITY_FIXES.md — Batches B through H

Arogya Electronic LogBook. Branch: `security-audit-2026-09`.
Source of findings: `.agents/SECURITY_AUDIT.md` (Phase 1 audit, commit `2f1204c`).
Batch A (SEC-04) is already complete at commit `bcbb109`.

Read `AGENTS.md` and `.agents/SECURITY_AUDIT.md` before starting.

This is a live pilot at Pariyaram Medical College. Real residents, real professors,
real patient records. No staging environment. No migration history. No rollback.

---

## 0. HOW TO RUN THIS FILE

Run Batches B through H **in order, in one session, without stopping for me between
batches** — provided every gate passes.

After each batch you must run that batch's Evidence Gate. The gate is not optional
and it is not a formality.

- **Gate passes** → commit, update `.agents/SECURITY_AUDIT.md`, continue to the next batch.
- **Gate fails, or you cannot run a case, or anything is ambiguous** → **STOP the entire
  run.** Do not continue to the next batch. Do not attempt a workaround. Report where
  you stopped and why, and wait for me.

A later batch may sit on top of an earlier one. A broken earlier batch that is carried
forward turns seven clean commits into one tangled diff. That is why a failed gate
halts everything, not just the current batch.

Batch B is the highest-risk batch in this file. It changes shared authorization logic
that later batches depend on. If Batch B's gate does not pass cleanly, stop there.

---

## 1. STANDING RULES — apply to every batch in this file

### Write access

Write access has been widened for this task **only**, to:

- `artifacts/api-server/src/`
- `artifacts/api-server/tests/`
- `artifacts/mockup-sandbox/src/`

Do not write anywhere else. If a correct fix requires a file outside those three
paths, **STOP and tell me**.

`docs/` and `.agents/` remain writable for reports only.

### Forbidden — entire task, all batches

- `drizzle-kit push`, `drizzle-kit generate`, or **any** command that touches a real database
- `psql` or any database client, read or write
- `git push` in any form, `git reset --hard`, `git rebase`, any history rewriting
- `git rm`, `rm`, `mv`, or shell redirects that delete or overwrite tracked files
- Installing, upgrading, or removing any dependency
- Editing any config or `.env` file, **except** the single trust-proxy line in Batch G
- Editing the guard hook, or routing around it

If you believe one of these is needed, **STOP and tell me**. Do not do it.

### Always

- One batch, one commit. Never bundle two batches into one commit.
- Do not rename, reformat, tidy, or restructure anything outside the batch you are on.
  If a correct fix genuinely requires touching something outside it, **STOP and tell me
  first**. Do not just do it.
- Schema change needed? Draft the SQL and the drizzle schema edit, show me, and **STOP**.
  Never push a schema change. Never touch a live database.
- Never log patient text, clinical fields, or leave reasons. Record id and status code only.
- Never render mock, fallback, or default numbers when a call fails. A failure shows a
  visible error state.
- Do not branch on `departmentId === 1`. Do not hardcode Pediatrics-specific values.
  Per-department behaviour belongs in `department_configs` / `procedure_types`.
- Commit locally after each batch. **Never push.** I push.
- After each batch, update `.agents/SECURITY_AUDIT.md`: mark the finding **FIXED** with
  its commit hash. Leave everything else **OPEN**.

### Evidence standard — non-negotiable

- Tests go in `artifacts/api-server/tests/`, using in-process PGlite. Never point a test
  at a real database.
- Paste the **real** test runner output, not a summary of it.
- Never write "verified", "works", or "tested" without the status codes shown.
- If a case cannot be run, say so plainly, mark it **unverified**, and **STOP the run**.

### Design fact — confirmed, do not change

Residents choose their own `supervisorId` (`student.ts:29`). This is intended.
`supervisorId` is therefore the correct basis for professor scoping. Do not change how
supervisors are assigned anywhere in this file.

---

## 1b. PREFLIGHT — confirm the 403 collapse is uniform. Read-only. Do this first.

Your Batch B probe showed that on `/logs`, three different situations all return **403**
with the same body: nonexistent `studentId`, wrong owner in the same department, and
cross-department. That is correct and deliberate — it stops anyone enumerating which
student ids exist. This preflight confirms it holds everywhere, not just there.

**Read-only. Write no application code. Run no probe that modifies anything.**

List every route in the API that accepts a row identifier — `:studentId`,
`:professorId`, `:id`, or a record id in the path or query. For each, state:

| Route | Nonexistent row returns | Wrong owner returns | Same response body? |
|---|---|---|---|

Then answer three questions directly:

1. Does **any** route return 404 where a different caller would get 403? Name it.
2. Does any route return the same status but a **different message or body** for the two
   cases? A different body leaks the same information a different status code would.
3. Do any of the six Batch B routes behave differently from `/logs`?

**What to do with the answers:**

- If a discrepancy exists on a route **outside** Batch B: record it in
  `.agents/SECURITY_AUDIT.md` as a **new finding**, severity High, with the route and the
  two status codes. Do **not** fix it — it is outside this task. Then continue to Batch B.
- If a discrepancy exists on **any of the six Batch B routes**: **stop the run** and tell
  me. Batch B's gate assumes they behave alike.

---

## 2. BATCH B — SEC-01, SEC-02, SEC-05 — the ownership bug

**Root cause.** `studentAccess` (`middlewares/student-access.ts:15-25`) narrows only the
`student` role to self. Faculty get the entire department with **no assignment check**.

**Pattern to mirror.** The scoping at `student.ts:165-173` already does this correctly.
Mirror it. Do not invent a new authorization pattern. Do not rewrite the middleware into
something new.

**Routes to fix**

| Location | Route | Required behaviour |
|---|---|---|
| `student.ts:326-334` | `/leave-records` | Owning student and department HOD only |
| `student.ts:38-121` | `/recentLogs` | Professor scoping + `isNull(deletedAt)`; stop selecting every column — return only the fields the caller needs |
| `student.ts:205` | `/postings` | Owner / supervising professor only |
| `student.ts:365` | `/assessments` | Owner / supervising professor only |
| `student.ts:474` | `/thesis` | Owner / supervising professor only |
| `student.ts:502` | `/certifications` | Owner / supervising professor only |

Every scope check must **fail closed**. If the caller's owning id cannot be resolved,
return 403. Never fall through to an unfiltered query.

### Evidence Gate B — CORRECTED

An earlier version of this gate required a **404** for a nonexistent row. That was wrong,
and your probe was right to stop the run over it. These six routes sit behind
`studentAccess`, which resolves existence and access in one query and returns 403 for
both. That collapse is deliberate: if the two cases returned different codes, anyone with
a faculty login could walk through student ids and learn which residents exist. Splitting
them would make the app less secure, not more.

So case 4 is **inverted**, not dropped. It now proves the two cases are
**indistinguishable**, which is the property that actually protects the roster.

Six routes, four cases each — **24 status codes**:

1. unauthenticated → **401**
2. authenticated, wrong owner → **403**
3. authenticated, correct owner → **200**
4. authenticated, **nonexistent** `studentId` → **403**, with a response body byte-identical
   to case 2

Case 4 fails if the status differs from case 2, **or** if the body differs in any way —
message text, error code, field order, anything a caller could compare. Assert equality of
the full body, not just the status.

Additional required cases:

- For `/leave-records` and `/recentLogs`, "wrong owner" **must** include a professor in
  the **same department** who does **not** supervise that student. That is the actual bug.
- For `/recentLogs`, prove a soft-deleted log is not returned.

Do **not** add an existence check, a 404 path, or any new branch to `studentAccess` to
satisfy this gate. The rule in §1 stands: mirror what works, invent nothing.

Gate fails if any of the 24 codes is wrong, missing, or unverified. **If it fails, stop
the entire run here.**

---

## 3. BATCH C — SEC-03, SEC-08 — the two worst log leaks

**Mechanism.** drizzle-orm wraps a failed query in `DrizzleQueryError` whose *message*
contains the SQL plus every bound parameter. Pino serialises that message. So
`req.log.error(error, ...)` writes the bound parameters into the log.

| Location | What leaks |
|---|---|
| `student.ts:359` | A resident's leave `reason` |
| `admin.ts:222` | A new professor's `passwordHash` |

Replace both with an id and a status code only, matching the existing pattern at
`app.ts:96`.

**Touch no other log site.** The remaining sites are Batch F.

### Evidence Gate C

Force a query failure on each of the two routes. Show the captured log output contains:

- no free text
- no SQL
- no bound parameters
- no password hash

Gate fails if either route still emits any of the above.

---

## 4. BATCH D — SEC-11 — logout does not invalidate the token

**Problem.** Logout (`auth.ts:154`) only calls `res.clearCookie`, but the frontend
authenticates with a Bearer token from `sessionStorage` (`session.ts:22-28`,
`apiClient.ts:40-43`). The JWT (`auth.ts:148`, `expiresIn: "1d"`) stays valid for 24
hours after logout.

**Fix.** Bump `sessionVersion` in the logout handler. That mechanism already exists and
already works — set at `auth.ts:169,182` and `admin.ts:19,131,169`, checked at
`auth.ts:51`.

Do **not** build a token blocklist. Do **not** change token expiry. Use what exists.

### Evidence Gate D

1. Capture a valid token, call logout, reuse the token → **401**
2. A freshly issued token after logout still works → **200** (proves login is not broken)

Gate fails if the old token still returns 200, or if fresh login breaks.

---

## 5. BATCH E — SEC-09, SEC-10, SEC-23 — showing the user something untrue

### SEC-09 — `PrintableLogbook.tsx:32-38, 55-58`

All five fetches carry `.catch(() => <empty>)` and `window.print()` fires unconditionally
in `finally`. A resident can print, sign and submit a **blank official logbook** with no
indication anything is missing.

Remove the fallbacks. `print()` fires **only** when all five fetches succeed. On any
failure: visible error, no print.

### SEC-10 — `HODPortal.tsx`

`error` is set at `:96,125,152` and `analyticsError` at `:97,149`. Neither is ever
rendered. The spinner clears at `:261` and the portal renders normally, so an HOD whose
dashboard load failed sees an ordinary-looking portal.

Render both states, with a retry control. AGENTS.md §7: this file has regressed on this
twice. No mock numbers, no placeholder counts, no default zeros standing in for a failed
call.

### SEC-23 — `LoginProductPreview.tsx:32,33,52`

Hardcodes "Pediatrics" three times plus a fabricated resident profile
`PG2024-PAED-187` on a public login screen that real residents use daily.

Remove the fabricated resident. Replace the hardcoded department with neutral wording or
a value from `department_configs`. **Do not substitute a different fake identifier.**

### Evidence Gate E

Show, with DOM assertions or screenshots:

1. `PrintableLogbook` renders a visible error when a fetch fails
2. `print()` does **not** fire on failure
3. `HODPortal` shows an error state rather than a normal-looking portal when the load fails
4. No fabricated identifier remains anywhere on the login page

Gate fails if any of the four is missing or shown only as an assertion.

---

## 6. BATCH F — SEC-07 — the remaining log sites

### Step 1 — reconcile the count BEFORE changing anything

The SEC-07 entry says **23 sites** but lists **25**:

```
student.ts:118,199,226,251,321,418,469,630,667          (9)
admin.ts:57,101,136,178,260,296,313,356,373,401,475     (11)
department.ts:55,84,227                                  (3)
logs.ts:98                                               (1)
professor.ts:232                                         (1)
```

State the true number. List the exact set you will change. Confirm that
`student.ts:359` and `admin.ts:222` are **excluded** because Batch C already fixed them.

If the discrepancy cannot be resolved cleanly, **stop the run** — do not guess.

### Step 2 — fix them

Record id and status code only. This is a mechanical change. Change nothing else in
those files. If any individual site needs restructuring to fix safely, **skip it, list
it, and tell me** rather than restructuring.

### Evidence Gate F

After the change, grep every `req.log.error` and `console.error` in those five files and
show that none passes an error object, a whole request object, or a whole row object.

Gate fails if any site still passes a whole object.

---

## 7. BATCH G — SEC-12 — rate limiting

**Problem.** `auth.ts:19-31` keys the limiter on `req.ip` (`:23`), and `app.ts` sets no
trust proxy. Behind Render's load balancer every request appears to come from the proxy,
so the per-key bucket becomes **one shared global bucket** of 100 POSTs / 15 min.

Two effects: no per-attacker brute-force limit on login at all, and one attacker can
exhaust the bucket and lock every resident, professor and HOD out of login for 15 minutes.

### CRITICAL — the trust proxy value

Set `app.set("trust proxy", 1)` — **exactly one hop**.

Do **not** use `true`. With `true`, an attacker forges `X-Forwarded-For` and mints a
fresh rate-limit bucket per request, which is **worse** than the bug being fixed.

If one hop is wrong for Render's actual setup, **STOP and tell me the correct hop count**.
Do not guess upward.

### Then

- Key the limiter on the resolved client IP.
- Add a per-account failure counter on login, so exhausting one IP's bucket cannot lock
  out other users.

### Evidence Gate G

1. Two different client IPs get two separate buckets — show the status codes
2. A request with a forged `X-Forwarded-For` does **not** get a fresh bucket
3. Exhausting one account's failure counter does not block a different account

Gate fails if the forged-header case creates a new bucket.

---

## 8. BATCH H — SEC-06 — fail-open conditionals

**Problem.** `student.ts:272`, `:382`, `:448` use department scoping that fails **open**:
`if (caller.departmentId !== null) { ...check... }` with no `else`, and
`professorDeptId !== null && ...`. Exactly the shape AGENTS.md §3 prohibits.

Currently unreachable because `requireDepartment` (`middlewares/auth.ts:72-78`) is mounted
unconditionally at `student.ts:14`. It is one middleware removal from live cross-department
reads.

**Fix.** Invert each so a null `departmentId` returns **403** instead of skipping the check.

Keep `requireDepartment` mounted at `student.ts:14`. Do **not** remove it as part of this —
it is currently the only thing making these unreachable.

### Evidence Gate H

Four status codes per affected route, including a caller with a null `departmentId`
receiving **403** rather than data.

Gate fails if a null `departmentId` reaches any query.

---

## 9. FINAL REPORT — print this at the end of the run

1. One line per batch: batch letter, finding IDs, commit hash, gate PASSED or FAILED
2. Every status code produced, grouped by batch — the actual runner output
3. Anything skipped, and why
4. Anything you could not verify
5. Any place you stopped and why
6. Confirmation that nothing was pushed, no database command was run, no dependency
   changed, and no file outside the three widened paths was written

Then stop. I review and I push.
