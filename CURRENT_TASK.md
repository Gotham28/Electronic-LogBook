# Current Task

## Feature
Read JWT_SECRET from one shared module with no fallback default, so the server fails at
boot instead of silently signing tokens with a publicly-known string.

## Plan reference
MASTER_PLAN.md and STATUS.md no longer exist — dropped by developer decision on 2026-08-19
in favour of TASK_LOG.md. TASK_LOG.md state at time of scoping: empty, no entries yet.
This task supersedes the earlier CURRENT_TASK.md that scoped middlewares/auth.ts line 4
only; that scope missed the second fallback in routes/auth.ts.

## MASTER_PLAN.md update
- [ ] None — MASTER_PLAN.md does not exist and is not being created.

## Files/areas in scope
- `artifacts/api-server/src/lib/env.ts` — NEW file. Reads `process.env.JWT_SECRET` with no
  default. Throws a clear error at module load if the value is missing or empty. Exports
  the secret as a named export.
- `artifacts/api-server/src/middlewares/auth.ts` — line 4 only: delete the local
  `const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-for-dev-only";` and import
  from `lib/env.ts` instead. Line 33's `jwt.verify(token, JWT_SECRET)` keeps working
  unchanged.
- `artifacts/api-server/src/routes/auth.ts` — line 10 only: same deletion and same import.
  Lines 386 and 443 keep working unchanged.

## Explicitly out of scope
- Rotating or choosing the secret value — developer action, already done on Render.
- Token expiry, refresh tokens, cookie flags, `sameSite`, `secure`.
- The vercel.json same-origin rewrite (cookie fix). Next task, its own diff.
- The unauthenticated routes in `student.ts` and `department.ts`.
- The `sessionStorage` `isAuthenticated` flag in `App.tsx`.
- Moving `CURRENT_TASK.md` / `TASK_LOG.md` into `.agents/`, and updating `AGENTS.md` §4 to
  match. Separate chore task.
- Any other environment variable. `lib/env.ts` handles `JWT_SECRET` only in this task.

## Do NOT touch
- Any logic in `middlewares/auth.ts` other than the constant on line 4 and the new import
  line. `requireAuth` and `requireRole` bodies stay byte-identical.
- Any logic in `routes/auth.ts` other than the constant on line 10 and the new import line.
  Login, register, OTP and password-reset behaviour stays byte-identical.
- `app.ts`, CORS, `FRONTEND_URL`.
- Anything under `lib/db/src/schema/`.
- Any `.env` file — do not read secrets out of it, do not write values into it, do not
  print its contents. The developer sets local values by hand.
- Any `vercel.json`.

## Manual (developer does)
- [x] Set `JWT_SECRET` on Render — done 2026-08-19.
- [ ] Confirm the Render service restarted cleanly after that change: `GET /api/healthz`
      returns 200. Paste the status code.
- [ ] Set a `JWT_SECRET` in the local `.env` with a DIFFERENT random value from Render's,
      before Antigravity starts any server.
- [ ] Read the local `.env`'s `DATABASE_URL` and tell Antigravity, in words, whether it
      points at the production Neon database or somewhere else. Do not paste the string.
- [ ] Deploy this change only after the two boot tests below have passed locally.
- [ ] Approve the TASK_LOG.md entry wording before it is written.

## Antigravity (does on its own, once scope is confirmed)
- [ ] Create `artifacts/api-server/src/lib/env.ts` with no fallback default and a
      module-load guard that throws when `JWT_SECRET` is missing or empty. The error message
      must name the variable and must NOT print its value.
- [ ] Replace the local constant in `middlewares/auth.ts` with an import from `lib/env.ts`.
- [ ] Replace the local constant in `routes/auth.ts` with an import from `lib/env.ts`.
- [ ] Run `git grep -n "fallback-secret-for-dev-only"` and confirm zero results.
- [ ] Run `git grep -n "JWT_SECRET" artifacts lib` and confirm the only occurrences are in
      `lib/env.ts` plus the two import sites and their existing usages.
- [ ] Draft the TASK_LOG.md entry for this task. Draft only — do not write it to the file
      until the developer approves the wording.

## Blocked on developer input
- [ ] Starting the server for the boot and login tests — waiting on: the developer's stated
      answer about what local `DATABASE_URL` points at. If it points at production,
      Antigravity must not perform the login test; the developer performs it with their own
      account and pastes the result.
- [ ] Writing the TASK_LOG.md entry — waiting on: explicit approval of the drafted wording.

## Verification required before this is considered done
- [ ] Paste `git grep -n "fallback-secret-for-dev-only"` output showing zero results.
- [ ] Paste `git grep -n "JWT_SECRET" artifacts lib` output in full.
- [ ] Start the server with `JWT_SECRET` unset. Paste the actual terminal output showing it
      refuses to boot, and the error message text.
- [ ] Start the server with `JWT_SECRET` set. Paste the output showing it boots normally.
- [ ] Login still works: paste the response status code from a login request. Who runs this
      depends on the DATABASE_URL answer above.
- [ ] Old-secret rejection — this is the proof the hole is closed. Sign a token by hand using
      the string "fallback-secret-for-dev-only", send it to any route carrying requireAuth,
      and paste the status code. It must be 401.
- [ ] Same route with a token issued by the running server: paste the status code. It must
      not be 401.
- [ ] Confirm no file outside the three listed in "Files/areas in scope" was modified. Paste
      `git status --short`.

## Flags (AGENTS.md rule triggers)
- §5.3 — this restructures: a new module, and a constant moved out of two existing files.
  Chosen deliberately by the developer on 2026-08-19 so a third copy of the secret cannot
  quietly appear later. Recorded so it is not a silent restructure.
- §5.6 — the guard's error message must never print the secret value. Neither may any log
  line added by this task.
- §9 — verification needs a running server, and local `DATABASE_URL` may point at the
  production database. Gated in the Blocked bucket above.
- §10 Opus trigger — edits `middlewares/auth.ts`; also touches JWT handling and moves code
  between modules.
- Context: `JWT_SECRET` was confirmed MISSING on Render on 2026-08-19, meaning production
  was signing and accepting tokens with the hardcoded string until it was set that day.
  This code change prevents that state from ever recurring silently; it is not what closed
  the hole.

## Suggested review tier (set at scoping time)
- Opus 5, xhigh effort — §10 escalation: the diff edits `middlewares/auth.ts`, and three
  Opus triggers fire together (auth middleware, JWT handling, code moved between modules).

## Suggested Antigravity model
- The most deliberate model in your selector. This diff sits directly under every
  authorization check in the system; a wrong import path takes the whole API down at boot.
  Pick the nearest equivalent if the exact name isn't listed.