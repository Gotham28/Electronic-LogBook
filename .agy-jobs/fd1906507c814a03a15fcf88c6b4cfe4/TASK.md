# Antigravity dispatch 73 — Arogya panel uses apiPost (send token, show server error)

## Guard
This prompt is for the project at `Electronic-LogBook-main` (Arogya Electronic LogBook, repo
`Gotham28/Electronic-LogBook`), task file `CURRENT_TASK.md` at the repository root (there is no
`.agents/CURRENT_TASK.md` and no `.agents/AGENTS.md`; `AGENTS.md` is also at the repository root),
dated 2026-09-30, base commit `613bb93`, working branch `fix/arogya-panel-api-client`. If this is
not that repo, stop, say which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

This means you cannot run `pnpm typecheck`, `pnpm build`, `git grep` or `git diff`. Claude Code
runs all of those after you return. Write the code so it will pass them, and say in `HANDOFF.md`
which checks you could not run.

## Read first
- `AGENTS.md` (repo root) — §7, §9, §10, §14.5. §16 is a rule map; §10 in that file is Secrets.
- `CURRENT_TASK.md` (repo root) — especially `## Root cause`, `## Files/areas in scope`,
  `## Explicitly out of scope` and `## Do NOT touch`.
- `artifacts/mockup-sandbox/src/lib/apiClient.ts` — read only. `apiPost` and `ApiError` are
  defined here.
- `artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx` — read in full before editing.
- `artifacts/mockup-sandbox/src/components/QuarterlyAppraisalSection.tsx:144-147` — read only,
  the existing pattern for reading `err.data.error`.

## Build
- [ ] `artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx` — the only source file that changes. Three edits:
  1. Import `apiPost` from `@/lib/apiClient`. Replace the three raw `fetch` calls (currently `:85`, `:108`, `:131`) with `apiPost("/api/arogya/ask", { question })`, `apiPost("/api/arogya/progress-coach", {})`, `apiPost("/api/arogya/department-report", { type })`. `apiPost` returns parsed JSON and throws `ApiError` on non-2xx, so the `res.json()` and `if (!res.ok) throw` lines are removed.
  2. In all three `catch` blocks (`handleAsk`, `handleProgressCoach`, `handleDepartmentReport`) the message shown is `err?.data?.error ?? "Arogya couldn't answer right now."`. Do **not** fall back to `err.message`: `apiClient.ts:77` puts raw response text into it for non-JSON replies. (`QuarterlyAppraisalSection.tsx:144-147` is the existing pattern for reading `err.data.error`; this differs only in dropping the `err.message` fallback.) The `error: true` flag and `setCharacterState("error")` stay as they are.
  3. A success body of the wrong shape takes the same error path instead of rendering an empty bubble: `reply` not a string (ask, department-report) or `tips` not an array (progress-coach). Needed because demo mode (`src/lib/demoData.ts` `handleDemoRequest`, final `return { success: true, id: Date.now() }`) now intercepts these calls and returns no `reply`. You choose how to express the guard, but it must run before `setCharacterState("talking")` and before anything is appended to `messages`, and it must reach the same `catch` (so the user sees the fixed "Arogya couldn't answer right now." text, not an empty bubble and not an invented reply). In `handleAsk`, `setQuestion("")` stays on the success path only, as today.
- [ ] `HANDOFF.md` (repo root) — overwrite the existing file (it belongs to a previous task) with this task's handoff, per `## Report` below. The file you overwrite is untracked and is not to be committed.

## Do NOT touch
- Any file under `artifacts/api-server/` — no route, middleware, or `lib/arogya.ts` edit.
- `artifacts/mockup-sandbox/src/lib/apiClient.ts`, `artifacts/mockup-sandbox/src/lib/demoData.ts`, `artifacts/mockup-sandbox/src/lib/session.ts`.
- `vercel.json`, `artifacts/mockup-sandbox/vercel.json`, `vite.config.ts`.
- `.env` and `.env.example`.
- Anything else in `ArogyaPanel.tsx`: the notification handlers (`handleWhatsDue`, `handlePendingReviews`), the JSX, the wording at `:213-215`, formatting, whitespace-only lines, imports not needed for this change.
- The untracked files `.agents/runs/dispatch-71-resend-mailer-clean-failure.md`, `.agents/runs/dispatch-72-resend-mailer-review-fixes.md`, `.agy-jobs/` and `CURRENT_TASK.md`.
- `AGENTS.md`, anything else under `.agents/`, `pnpm-lock.yaml`, and all git stashes.
- Out of scope, each its own task (§9), do not fix and do not touch: the `max_tokens` parameter in `artifacts/api-server/src/lib/arogya.ts`; the number check in that file; server-side logging of the 503 cause; the `/api/*` rewrite in the two `vercel.json` files; adding Arogya replies to demo mode; the `/ask` 400 body using `message` in `routes/arogya.ts`.
- git in any form.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is intentional, not filler)
- Anything not named under Build above

## Hard stops — stop and report, do not decide
- Any need to edit a file under `artifacts/api-server/`, or any file not named under Build.
- The change growing past one source file (`ArogyaPanel.tsx`).
- Any value you would otherwise guess or invent — in particular a demo-mode or fallback reply: a failed or malformed response must show the visible error state, never an empty or invented reply (§7).
- Any secret, credential or `.env` value (§10): do not read, print or write `OPENAI_API_KEY` or any other key.
- Anything that puts patient text, a question the user typed, or an error body near a `console.*` call or any log. Do not add logging.
- Any change to a code path enforcing the §3 / §4 boundary (none is expected — this task edits one client component).
- Any migration, backfill, deploy, or other irreversible step.

## Verification (file reads only)
After editing, re-read `ArogyaPanel.tsx` and confirm, citing line numbers in `HANDOFF.md`:
- no `fetch(` call remains in the file;
- exactly three `apiPost(` calls, with the three paths and bodies given under Build;
- `apiPost` is imported from `@/lib/apiClient` and no other import was added or removed;
- all three `catch` blocks show `err?.data?.error ?? "Arogya couldn't answer right now."` and none reads `err.message`;
- each of the three handlers has the shape guard ahead of `setCharacterState("talking")`.

## Report
Write `HANDOFF.md` at the repo root (overwrite):
- The base commit (`613bb93`) and branch (`fix/arogya-panel-api-client`), stated as given in this prompt — you cannot run git to confirm them.
- What changed, per file, with `file:line` for every claim, and why
- How you expressed the shape guard, and why that way
- Anything you skipped, and why (including every check you could not run because it needs a shell: `pnpm typecheck` and `pnpm build` in `artifacts/mockup-sandbox`, `git grep -n 'fetch("/api' -- artifacts/mockup-sandbox/src`, `git diff --stat main...fix/arogya-panel-api-client`). List each as NOT RUN by this dispatch; do not write "passes" for any of them.
- Anything you expanded beyond the Build list, and why
- Anything you noticed that was not asked about (list only; do not fix)

A claim without `file:line` evidence is recorded as unverified. Do not open a pull request. Do not run `git commit` or `git push`.

## Model
`Claude Sonnet 4.6 (Thinking)`; if quota-blocked, `Gemini 3.1 Pro (High)` under the standing fallback. Never Opus.


## Files you may touch
- artifacts/mockup-sandbox/src/components/arogya/ArogyaPanel.tsx
- HANDOFF.md