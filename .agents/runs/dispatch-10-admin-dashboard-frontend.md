# Antigravity dispatch 10 — Admin dashboard frontend (task 2 of 2)

## Guard
This prompt is for the project at `Electronic-LogBook` (Arogya Electronic LogBook), task file
`CURRENT_TASK.md` at the repo root, dated 2026-09-14. If this is not that repo, stop, say
which repo this is, and wait.

## Sandbox constraint
Do not call `run_command`, or any shell tool, at all, for any reason — not even a single
read-only orientation command like `git status`. If you are tempted to run one, don't; use
file-reading tools instead (view a file, list a directory, search file contents). A denied
shell call is not something to work around and continue past — some environments do not
recover cleanly from one and simply stop the task instead of falling back. Do the entire
task using only file-reading and file-editing tools.

## Read first
- `AGENTS.md` — §3 ownership, §4 the two ID systems, §5 no hardcoded department behaviour,
  §7 no fabricated data, §14.3 routes, §14.5 halt conditions
- `CURRENT_TASK.md` — the confirmed scope for this task
- `HANDOFF.md` — task 1's report, documenting the exact `/api/superadmin/*` request/response
  shapes this frontend must call
- `artifacts/mockup-sandbox/src/components/HODPortal.tsx` — the pattern to follow: wouter for
  navigation state, plain `useState`, `apiGet`/`apiPost`/`apiPatch`/`apiDelete` from
  `@/lib/apiClient`, shadcn/ui components (`Badge`, `Button`, `Card`, `Table`, `Tabs`, `Input`,
  `Label`)
- `artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx` — `RoleType` (line 61) and
  `navigationForRole()` (line 97)
- `artifacts/mockup-sandbox/src/App.tsx` — `activeRole` derivation (~132-136) and the
  role-gated conditional render block (~208-213)

## Build
- [ ] `artifacts/mockup-sandbox/src/components/AdminPortal.tsx` (new) — the admin page,
      implementing every element below from the approved mockup:
  - Topbar: brand mark "EL" + "E-Logbook / Admin console" label, "+ New department" primary
    button.
  - Hero: eyebrow "College administration", H1 "Departments, faculty and HODs,
    college-wide", subtext noting resident approval stays with each department's HOD — this
    page only creates the resident account, it never approves one.
  - Four summary stat tiles, computed from live data (never hardcoded or mocked): Departments
    (count + "N without a HOD" warning state, or "All departments staffed"); Faculty (count +
    "Across N departments"); Residents (count + "Enrolled college-wide"); Awaiting HOD
    approval (count + "Handled by each department's HOD", warning state if > 0).
  - "New department" panel, toggled by the topbar button: inputs for department name,
    department code, HOD full name, HOD email; "Create department + HOD" button (calls
    `POST /api/superadmin/departments`); Cancel button; client-side check that all four
    fields are filled before submit.
  - Two-column grid (stacks to one column under ~860px):
    - Left (340px): department list — each row shows dept name + code, HOD name (or a red
      "No HOD appointed" state when there is none), faculty count, resident count. Clicking a
      row selects it and loads its detail (`GET /api/superadmin/departments/:id/roster`).
    - Right: detail panel for the selected department:
      a. HOD strip: avatar with initials, HOD name + email + "HOD, {dept name}"; "Replace
         HOD" button — or, when there is no HOD, an empty-state avatar and "Appoint HOD"
         button instead.
      b. Replace-HOD inline panel (hidden until the button is clicked): single input
         "Existing faculty email to promote", "Confirm swap" + "Cancel" buttons. Calls
         `POST /api/superadmin/departments/:id/replace-hod` and surfaces that endpoint's own
         validation/error response (e.g. no matching approved faculty) — do not replicate any
         client-side "is this an approved faculty email" check; let the real API decide.
      c. Tabs: "Faculty (N)" / "Residents (N)", toggling which roster table is shown.
      d. Roster table: columns Name, Email, Status badge (HOD / Pending HOD review /
         Approved), right-aligned Action column with a "Deactivate" button
         (`POST /api/superadmin/users/:id/deactivate`) — except the HOD's own row, which must
         show "Use 'Replace HOD' above" instead of a working Deactivate button. This mirrors
         the backend's own 403-on-hod-target rule; the UI must not offer an action the API
         will refuse. Pending residents show a small note under their name: "Awaiting the
         {dept} HOD's approval".
      e. Callout shown only on the Residents tab: "Approval stays with the HOD. A resident
         added here appears in {dept}'s own pending queue — this console never approves a
         resident directly."
      f. "+ Add faculty/resident to {dept}" expandable section: Full name + Email inputs,
         "Create account" button. Adding faculty calls
         `POST /api/superadmin/departments/:id/faculty` (lands approved); adding a resident
         calls `POST /api/superadmin/departments/:id/students` (lands pending).
  - Toast notifications (bottom-right, auto-dismiss) confirming every action: department
    created, HOD swapped, faculty/resident added, deactivated, or a validation/API error
    message.
  - Any failed request (network error or non-2xx response) must render a visible error state
    in the affected part of the UI — never blank, never fake/placeholder data, per
    `AGENTS.md` §7.
  - Visual system: match the approved mockup's teal/cyan palette, Roboto for headings /
    Plus Jakarta Sans for body, card corner radius, pill-shaped status badges — using this
    app's existing Tailwind/shadcn tokens (see "Do NOT touch" below), not a parallel design
    system.
- [ ] `artifacts/mockup-sandbox/src/lib/apiClient.ts` — add typed calls for the 7
      `/api/superadmin/*` endpoints listed in `HANDOFF.md` (list departments, create
      department, replace-hod, roster, create faculty, create student, deactivate user),
      following the file's existing `apiGet`/`apiPost`/`apiPatch`/`apiDelete` conventions.
- [ ] `artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx` — add an admin member to
      `RoleType` (line 61) and its entry in `navigationForRole()` (line 97).
- [ ] `artifacts/mockup-sandbox/src/App.tsx` — extend the `activeRole` derivation (~132-136)
      to map `role === "admin"` to the new type, and add the conditional-render branch
      (~208-213) rendering `AdminPortal`. Follow the existing HOD/professor pattern
      (role-gated conditional render) — do not add a new `wouter` path route for this; only
      the Student role uses path-based `<Route>` entries in this file.

## Do NOT touch
- `artifacts/api-server/**` — the entire backend. Task 1 already built and merged this API.
  No route, schema, or migration edits of any kind.
- `HODPortal.tsx`, `ProfessorPortal.tsx`, `DepartmentSettings.tsx`, `Dashboard.tsx`,
  `LoginPage.tsx` — read for pattern reference only. Do not edit any of them.
- `.env` / `.env.example` — no new environment variables are needed for this task.
- Shared Tailwind config or global `src/index.css` design tokens used by other portals — use
  existing utility classes/tokens to approximate the mockup's palette; if you find you
  genuinely cannot without adding a new shared token, stop and report it in `HANDOFF.md`
  rather than editing shared config.
- `lib/api-client-react`, `lib/api-zod`, `lib/api-spec/openapi.yaml` — these are unused
  generated-client stubs. Do not wire them up; use `apiClient.ts` like every other portal
  does.
- Any shell command whatsoever (restates the Sandbox constraint above — redundancy here is
  intentional, not filler).
- Anything not named under Build above.

## Hard stops — stop and report, do not decide
- Any change to a route, query, or ownership-resolution logic on the backend (`AGENTS.md`
  §3) — this task is frontend-only; the backend is already built and reviewed.
- Any place this frontend could conflate `studentsTable.id` and `usersTable.id`
  (`AGENTS.md` §4) — the roster endpoint returns only `usersTable.id`; forward that value to
  the deactivate call unchanged, never derive or substitute a different id.
- Any hardcoded department-specific behaviour (`AGENTS.md` §5) — this page must work
  identically for every department, including one with zero faculty/residents and one with
  no HOD.
- Any migration, backfill, deploy, or other irreversible step.
- Any value you would otherwise guess or invent — including any client-side "is this a valid
  faculty email" check for the HOD-replace flow; let the real API's response decide that.

## Report
Write `HANDOFF.md` at the repo root:
- What changed, per file, and why
- Anything you skipped, and why (including any step you could not do because it would have
  required a shell command)
- Anything you expanded beyond the Build list, and why

A claim without file:line evidence is recorded as unverified. Do not open a pull request.
Do not run `git commit` or `git push`.

## Model
Claude Sonnet 4.6 (Thinking)
