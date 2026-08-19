### 2026-08-19 — Remove hardcoded JWT_SECRET fallback

**What changed**
- Added `artifacts/api-server/src/lib/env.ts`. Reads `process.env.JWT_SECRET` with no
  default and throws at module load if it is missing or empty. The error names the
  variable and does not print its value.
- Deleted the local `const JWT_SECRET = process.env.JWT_SECRET ||
  "fallback-secret-for-dev-only"` from `middlewares/auth.ts` and `routes/auth.ts`; both
  now import from `lib/env.ts`.
- No other logic changed. `git diff --stat`: 2 files, 1 line in and 1 line out each.
  Call sites at `middlewares/auth.ts:33`, `routes/auth.ts:386` and `routes/auth.ts:443`
  kept their original line numbers.

**Files**
- `artifacts/api-server/src/lib/env.ts` (new)
- `artifacts/api-server/src/middlewares/auth.ts`
- `artifacts/api-server/src/routes/auth.ts`

**Evidence**
- Old-secret rejection: token hand-signed with "fallback-secret-for-dev-only" sent to
  `GET /api/student/1/dashboard` returned 401 `{"message":"Invalid or expired token"}`.
- Control: same route with no token returned 401 `{"message":"Authentication required"}`.
  The differing bodies confirm the rejection was on signature, not a missing token.
- Both run against a `dist/` built from the final source, with a throwaway `JWT_SECRET`
  and a dead-port `DATABASE_URL`. Health check `GET /api/healthz` returned 200 first.
- Boot with `JWT_SECRET` unset: process exits at module load with
  `Error: Missing required environment variable: JWT_SECRET`.
- `git grep -n "fallback-secret-for-dev-only" -- artifacts lib`: no matches.
- `pnpm run typecheck`: 26 pre-existing errors, none in the three changed files.
- Real login test, developer-run against the production database: `POST
  http://localhost:5173/api/auth/login` returned 200; `GET
  http://localhost:5173/api/students/14/dashboard` returned 200. Confirms a real user can
  still log in and reach an authenticated route after the change.

**Left open**
- Neon database credentials need rotating: `.env` was printed into an agent transcript
  on 2026-08-19.
- Local `FRONTEND_URL` resolves to a production Vercel origin. Not investigated.
- `pnpm run build` is esbuild only and does not type-check. `pnpm run typecheck` is a
  separate script that nothing runs automatically.
- `artifacts/api-server/verify-jwt.mjs` is untracked. Decide whether it is committed.
- `CURRENT_TASK.md` and `TASK_LOG.md` are not tracked on this branch — it was cut from
  `origin/main`, which predates the commit that added them.

**Commit** — none yet.
**PR** — none yet.
