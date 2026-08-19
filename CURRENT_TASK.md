# Current Task

## Feature
Serve the API from the same origin as the frontend via a Vercel rewrite, so the `token`
cookie is first-party and is no longer dropped by browsers that block third-party cookies.

## Plan reference
MASTER_PLAN.md — does not exist yet (carried forward from the previous CURRENT_TASK.md).
STATUS.md state at time of scoping: STATUS.md is NOT attached to the planning Project —
sequence against the roadmap could not be checked. Confirm before starting.

## MASTER_PLAN.md update
- [ ] None — MASTER_PLAN.md does not exist yet. Do not create it as part of this task.

## Files/areas in scope
- `vercel.json` (repo root) — add one rewrite rule mapping `/api/:path*` to
  `https://elogbook-api.onrender.com/api/:path*`, placed BEFORE the existing
  `/(.*)` → `/index.html` catch-all. Vercel matches rewrites in order; if the catch-all
  comes first, every API call returns the HTML page instead.
- `artifacts/mockup-sandbox/vercel.json` — apply the identical rule, in the identical
  order. Both files exist and it is not known which one Vercel reads.

## Explicitly out of scope
- `artifacts/mockup-sandbox/src/lib/apiClient.ts` — no code change needed. With
  `VITE_API_URL` empty, `API_BASE_URL` becomes `""` and calls go to `/api/...` on the
  same origin, which is exactly what this task wants. The `console.error` guard will
  print a now-inaccurate warning; that is cosmetic and gets its own task.
- Deleting or consolidating the duplicate `vercel.json`. Separate cleanup task.
- The hardcoded `FRONTEND_URL` fallback in `app.ts`. Separate task.
- Cookie flags in `auth.ts` — `NODE_ENV=production` is confirmed set on Render, so the
  cookie already goes out as `SameSite=None; Secure`. Nothing to change.
- The `sessionStorage`-based `isAuthenticated` flag in `App.tsx`. Separate task.
- The unauthenticated routes in `student.ts` and `department.ts`. Separate task.

## Do NOT touch
- Any file under `artifacts/api-server/`.
- Any file under `lib/db/`.
- `FRONTEND_URL` on Render — leave it exactly as it is.
- The existing `/(.*)` → `/index.html` rewrite rule. Add above it; do not edit or remove it.
- Any `.env` file.

## Manual (developer does)
- [ ] Confirm the Vercel project's Root Directory setting and report it, so we know which
      `vercel.json` is live.
- [ ] Copy the exact current value of `VITE_API_URL` from Vercel's env vars and paste it
      here verbatim, before Antigravity writes the rewrite destination.
- [ ] After the branch deploys as a Vercel Preview: set `VITE_API_URL` to empty for the
      **Preview environment only**, redeploy the preview, and test there first.
- [ ] Set up a keep-warm ping to `GET /api/healthz` every 10 minutes, OR move Render off
      the free tier, BEFORE switching Production over. Vercel's rewrite proxy times out
      around 30s; Render free-tier cold start is 30–90s.
- [ ] Only after the preview test passes: clear `VITE_API_URL` for Production and redeploy.
- [ ] Do not merge to main until the preview test evidence below is collected.

## Antigravity (does on its own, once scope is confirmed)
- [ ] Add the `/api/:path*` rewrite as the FIRST entry in `vercel.json` at the repo root.
- [ ] Add the identical entry, in the identical position, to
      `artifacts/mockup-sandbox/vercel.json`.
- [ ] Paste the full before-and-after contents of both files in the task report.
- [ ] Confirm by `grep -rn "vercel.json" .` that no third `vercel.json` exists anywhere in
      the repo. Paste the output.
- [ ] Nothing else. No TypeScript file is touched by this task.
- [ ] Draft the .agents/TASK_LOG.md entry for this task using the format at the top of that
      file. Draft only — do not write it to the file until I approve the wording.

## Blocked on developer input
- [ ] The rewrite destination URL — waiting on: the exact `VITE_API_URL` string copied from
      the Vercel dashboard. `https://elogbook-api.onrender.com` is unconfirmed and must not
      be assumed.
- [ ] Permission to overwrite this file — waiting on: confirmation that the previous
      CURRENT_TASK.md (JWT_SECRET fallback removal) has shipped or been parked.
- [ ] Writing the TASK_LOG.md entry — waiting on: my explicit approval of the drafted
      wording, after the verification evidence has been reviewed.

## Verification required before this is considered done
- [ ] On the Preview URL, browser DevTools → Network: the login request's URL is the
      Vercel origin `/api/auth/login`, NOT the onrender.com host. Paste the request URL.
- [ ] Same request: response carries `Set-Cookie: token=...` and Application → Cookies now
      lists `token` under the Vercel origin. Paste the cookie's domain and SameSite value.
- [ ] A protected route called immediately after login returns 200, not 401. Name the route
      and paste the status code.
- [ ] On Android Chrome with third-party cookies set to **Blocked**: log in, then open a
      page that previously showed the auth error. Paste what happened.
- [ ] SPA routing not broken: hard-refresh a deep link on the preview (not the root path)
      and confirm the app loads rather than 404ing. Name the path used.
- [ ] Rewrite ordering correct: request a nonexistent API path such as
      `/api/zzz-does-not-exist` and confirm the API's JSON 404 comes back, not the HTML of
      `index.html`. Paste the first 100 characters of the response body.

## Flags (AGENTS.md rule triggers)
- §5.4 — this is a deployment-configuration change on a live pilot with no staging. Nothing
  is pushed to production until the preview evidence above is collected.
- §5.3 — two `vercel.json` files exist. Both are being edited; neither is being removed.
  The duplication itself is flagged, not fixed, in this task.
- §9 — this task touches a non-local environment (Vercel). Antigravity edits files only;
  every dashboard and deploy action is in the Manual bucket.
- §6.4 — this file overwrites a previous CURRENT_TASK.md whose blocked item is still open.
- §10 Opus trigger — "touches CORS, FRONTEND_URL, DATABASE_URL, or any deployment
  configuration".

## Suggested review tier (set at scoping time)
- Opus 5, high effort — §10 trigger: deployment configuration. Not escalated to xhigh: only
  one Opus trigger fires and the diff contains no code. If `apiClient.ts` or `auth.ts` ends
  up in the diff, that is scope creep and the tier becomes xhigh.

## Suggested Antigravity model
- The most deliberate model in your selector — this is an Opus-tier task where a wrong
  rewrite order takes the live pilot down. Pick the nearest equivalent if the exact name
  isn't listed.