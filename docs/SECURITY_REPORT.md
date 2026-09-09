# Security Report — Arogya Electronic LogBook

This is a plain-language account of a security audit and fix effort carried out on this
project, written for someone who was not part of the work. It is built entirely from two
sources: the working audit record, `.agents/SECURITY_AUDIT.md`, and the actual commits
made on this branch (commit range `bcbb109..HEAD`, plus one older commit, `ebd075e`,
investigated separately as part of this work). Nothing in this report is invented. Where
a detail was not written down anywhere in those sources, this report says "not recorded"
rather than guessing.

A few terms used throughout, explained once here:

- **Commit** — one saved, named snapshot of the code, identified by a short code called a
  **commit hash** (e.g. `ca77022`).
- **Branch** — a separate line of work, kept apart from the main version of the code until
  it is reviewed and merged in.
- **Status code** — the three-digit number a server sends back with every response. The
  ones that matter in this report: `200`/`201` (it worked), `401` (you are not logged in),
  `403` (you are logged in, but not allowed to do this), `404` (nothing matches that
  address), `429` (too many attempts, slow down), `500` (something broke on the server).
- **Route / endpoint** — one specific web address the server answers, e.g. the address the
  app calls to fetch a resident's leave records.
- **Frontend** — the part of the app that runs in the browser, drawing the screens a
  resident, professor, or HOD sees. **Backend** — the server that the frontend talks to,
  which holds the real data.
- **Fail closed / fail open** — when something needed to make a decision is missing, "fail
  closed" means block the action; "fail open" means allow it anyway. Failing open is the
  dangerous default.
- **Enumeration** — trying id after id (or address after address) and using the pattern of
  answers you get back to learn which ones are real, without permission to see any of them.

---

## 1. SUMMARY

**What was audited.** Every route, handler, middleware (a piece of code that runs before a
route to check something, like "is this person logged in"), hook, and component under
`artifacts/api-server/src`, `artifacts/mockup-sandbox/src`, `lib/db`, and
`lib/api-client-react` — in short, the whole running application, both server and browser
sides.

**When, and on what branch.** The audit itself ("Phase 1") is dated 2026-09-08, run against
commit `2f1204c`, on branch `security-audit-2026-09`. The fixes ("Phase 2") were committed
across 2026-09-08 22:15 through 2026-09-09 15:34, all on the same branch. This report is
being added as the next commit after `4193397`.

**Totals.** 37 findings in total. 21 are fixed. 16 are still open.

| Severity | Total | Fixed | Still open |
|---|---|---|---|
| Critical | 4 | 4 | 0 |
| High | 12 | 12 | 0 |
| Medium | 9 | 4 | 5 |
| Low | 12 | 1 | 11 |
| **All** | **37** | **21** | **16** |

Every Critical and every High finding is fixed. What remains open is Medium and Low —
mostly data-accuracy issues, dependency updates that need a separate decision, and small
hardening items, none of them a way for one person to read or change another person's
data. Section 3 covers each of the 16 by name.

---

## 2. WHAT WAS FIXED

One entry per finding, most serious first. All 21 fixed findings are listed — including
every Low one.

### Critical

#### SEC-01 — Critical
**Where:** `artifacts/api-server/src/routes/student.ts:326-334`, allowed through by
`artifacts/api-server/src/middlewares/student-access.ts:15-25`.
**What was wrong:** The address that returns a resident's leave records handed back the
whole record — including the written reason for the leave — to any professor in the same
department, not only the ones actually supervising that resident.
**What could have been reached:** Any professor account in the department could read every
resident's leave reasons, even residents they had never supervised. A leave reason can
reveal a health condition.
**How it was fixed:** Professors are now excluded from this route entirely (no supervisor
relationship exists on the leave table at all), leaving only the owning resident and the
department's HOD. The route reuses the exact same "forbidden" message text used elsewhere,
so a professor cannot tell a nonexistent resident id apart from a real one they are simply
blocked from seeing.
**Commit:** `ca77022`
**Evidence:** An automated test sent real requests and checked four cases: not logged in →
`401`; a professor in the same department who does not supervise this resident → `403`; a
different resident → `403`; the owning resident → `200`, with their real leave record found
in the response; the department HOD → `200`. A made-up resident id also returned `403`,
with the exact same response text as the "wrong owner" case. Full automated test suite
after the change: 39 of 39 tests passing.

#### SEC-02 — Critical
**Where:** `artifacts/api-server/src/routes/student.ts:98-99` and `:115` (the route runs
from `:38` to `:121`).
**What was wrong:** A resident's main dashboard page pulls in a short summary of their most
recent clinical entries. That summary fetched every column from those entries — including
the patient's hospital id and the actual medical text (chief complaint, exam findings,
diagnosis) — without checking whether the professor viewing it actually supervises that
resident. A closely related route already did this check correctly, which made the gap
here look like an oversight rather than a deliberate choice.
**What could have been reached:** Any professor in the department could read a resident's
most recent patient records — including entries the resident had already deleted — even
without ever supervising that resident.
**How it was fixed:** Applied the same supervisor check the related route already used, and
excluded soft-deleted entries (entries a resident marked as removed). Also narrowed exactly
which columns this summary fetches down to just an id, a date, and a status — the field
isn't even shown on the visible dashboard, so no clinical text needs to leave the server
for it at all.
**Commit:** `ca77022`
**Evidence:** Same test suite as SEC-01 — a supervising professor sees the entry; a
professor in the same department who does not supervise sees it filtered out; a
soft-deleted entry never appears; the response was checked field by field to confirm no
patient id, complaint, exam, or diagnosis text is present.

#### SEC-03 — Critical
**Where:** `artifacts/api-server/src/routes/student.ts:359`.
**What was wrong:** When saving a new leave application failed for any reason, the code
wrote the full error to the application's log file. Because of how the database library
this project uses reports errors, that error text includes the actual values being saved —
including the leave reason itself.
**What could have been reached:** Anyone able to read the application's logs (developers,
the hosting provider, anyone with server access) could see resident leave reasons, which
can reveal health information.
**How it was fixed:** The log line now records only the resident's id and the fact that it
failed (status `500`) — never the error object itself.
**Commit:** `f68c2bd`
**Evidence:** Verified by deliberately breaking the database for one request (a temporary
rule that always fails, added and removed within the same test), with a fake, easy-to-search
leave reason planted in that request. The actual log line produced was captured and searched
for that planted text, for the literal words "insert into" and "params:" (both of which
appear in the old, unsafe log line), and for a password-hash-shaped string — none were
found.

#### SEC-04 — Critical
**Where:** eight files — `lib/db/check_reetha.mjs`, `check_reetha_student.mjs`,
`check_schema.mjs`, `check_schema_exact.mjs`, `delete_reetha.mjs`, `query_tables.mjs`,
`query_reetha.mjs`, and a copy of `query_reetha.mjs` at the repository root — all at line 3.
**What was wrong:** Eight small utility scripts, left over from earlier debugging, had the
password to the real production database typed directly into the file as text. Six of them
were written to use that password automatically if a certain setting was left unset. Two of
them had no fallback at all — they always pointed at the real, live database no matter
what.
**What could have been reached:** Anyone who could read the code — including anyone who had
ever copied the repository — had the real database password for a system holding real
patient records. One of the eight scripts could delete data.
**How it was fixed:** All eight files were deleted. Before deleting, every reference to
them anywhere in the project was checked (every tracked file, every configuration file,
every workspace file) — none exist.
**Commit:** `bcbb109`
**Evidence:** The commit record states the exposed password had already been rotated
separately by the project's maintainer before this fix, so the old, exposed value is dead.
No password value appears in the commit, the diff, or this report. One caveat, covered
again in Section 6: the commit message also states that git history itself was left
untouched — the old files, and the now-dead password they contained, still exist in older
commits.

### High

#### SEC-05 — High
**Where:** `student.ts:205` (postings), `:365` (assessments), `:474` (thesis), `:502`
(certificates).
**What was wrong:** The same gap as SEC-01 and SEC-02, across four more routes: a
resident's ward postings, exam marks, thesis progress, and certificates. None of them
checked whether the professor viewing the data actually supervises that resident — only
that they are in the same department.
**What could have been reached:** Any professor could read any resident's postings, exam
marks, thesis progress, and certificates, whether or not they supervise that resident.
**How it was fixed:** Same supervisor check added to each of the four routes, matching the
working pattern already used elsewhere in the code.
**Commit:** `ca77022`
**Evidence:** Same test suite and same four-case evidence described under SEC-01, run
across all six routes fixed in this one commit.

#### SEC-06 — High
**Where:** `student.ts:272`, `:382`, `:448`.
**What was wrong:** Three places in the code checked whether a professor or HOD belonged
to the same department as a resident before showing sensitive data — but if that staff
member's own department value was missing (`null`), the code skipped the check completely
instead of blocking them. This is "failing open": when something needed to decide is
missing, letting the action through anyway.
**What could have been reached:** In practice, this exact situation could not happen — a
separate, unconditional rule mounted everywhere first guarantees a department value is
always present before these three checks run. But it was one accidental change — removing
that rule, or wiring up a new route that skips it — away from becoming real cross-department
access to leave balances and assessment data.
**How it was fixed:** Each of the three checks now rejects (`403`) whenever the department
value is missing, instead of skipping the comparison — "failing closed."
**Commit:** `ede73b0`
**Evidence:** Because this could not be triggered through a real request to the running app
(three separate protections already blocked it — the always-on department check itself; a
rule built into the database that makes "no department" an impossible value for these
account types in the first place; and a third check inside the department-matching code
that already rejects a missing department by ordinary comparison), it was tested at a
lower level: the three fixed pieces of code were pulled directly out of the running
program and called by hand with a made-up request carrying a missing department value, with
no server and none of the three usual protections present. All three returned `403`, and
none of them ever reached the database. To prove this test would actually catch a real
regression and wasn't just passing by accident, the fix was temporarily undone, the same
test was re-run and confirmed to fail with a clear message, then the fix was restored and
the test passed again. Full suite: 54 of 54 tests passing.

#### SEC-07 — High
**Where:** 25 separate spots across `student.ts`, `admin.ts`, `department.ts`, `logs.ts`,
and `professor.ts`.
**What was wrong:** 25 different places in the server code wrote the raw error straight to
the log whenever a database action failed — and, exactly as with SEC-03, that raw error can
contain the actual data being saved or read, including clinical text.
**What could have been reached:** Anyone reading the server logs could potentially see
whatever a failed database action was working with — the database query itself and, in the
worst case, real record contents.
**How it was fixed:** All 25 spots now log only the relevant id and the status code, never
the error object.
**Commit:** `619771c`
**Evidence:** After the change, all five affected files were searched for the exact unsafe
logging pattern — zero remained. Full suite: 43 of 43 tests passing, no regressions.

#### SEC-08 — High
**Where:** `admin.ts:222`.
**What was wrong:** One specific, especially serious case of SEC-07: when creating a new
professor account failed, the log line included the new professor's password — already
scrambled (hashed), but still a password hash — alongside their name and email.
**What could have been reached:** A failed professor-creation attempt would write a
scrambled password into the logs.
**How it was fixed:** Changed to log only the failure and its status code, same as the
general SEC-07 fix.
**Commit:** `f68c2bd`
**Evidence:** Fixed and tested together with SEC-03 — the captured log line for this route
was searched for a password-hash-shaped string and for a plaintext password marker; neither
was found.

#### SEC-09 — High
**Where:** `artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx:32-38`,
`:55-58`.
**What was wrong:** The page that prints a resident's official logbook for signing tries to
fetch five separate pieces of data. If any one of the five failed to load, the code quietly
filled in an empty placeholder for it and printed the document anyway — so a resident could
print, sign, and submit an official record that was silently missing whole sections, with
nothing on screen telling them so.
**What could have been reached:** Not an attack scenario — a data-integrity and compliance
risk: an official, signed document could go out incomplete without the person signing it
knowing.
**How it was fixed:** Removed every one of those quiet placeholders. The print action now
only happens after all five pieces of data have actually loaded successfully; if any one
fails, the page shows a clear error message with a retry button and prints nothing.
**Commit:** `1dbe79c`
**Evidence:** This project has no automated tool for testing the frontend (see Section 6),
so this was verified live in a real browser: all five requests were forced to fail, and the
print dialog never opened — the page showed the new error text instead, captured by both
the browser's own record of network activity and a screenshot.

#### SEC-10 — High
**Where:** `HODPortal.tsx:96,125,152` (a general error) and `:97,149` (an analytics-specific
error).
**What was wrong:** The HOD's main dashboard had two pieces of code meant to record an error
message whenever something failed to load — but nothing on the actual page ever displayed
either message. If the dashboard failed to load, the HOD would see what looked like a
normal, working dashboard, with no hint that anything was wrong. The project's own written
rules note that this exact file had already made this mistake twice before this fix.
**What could have been reached:** An HOD whose dashboard failed to load had no way to know
their view was broken or incomplete.
**How it was fixed:** The general error now replaces the entire dashboard with a clear
error screen and a retry button. The more specific analytics error now shows as a
dismissible banner near the top of the page, with its own retry button.
**Commit:** `1dbe79c`
**Evidence:** Verified live in a real browser — with a test account and the analytics
request forced to fail, the banner appeared with a working retry button, and no fabricated
numbers appeared anywhere on the page; with no one logged in at all, the normal dashboard
did not render at all — only "Not logged in / Try again" did. Both captured by screenshot.

#### SEC-11 — High
**Where:** `artifacts/api-server/src/routes/auth.ts:154`; `session.ts:22-28`;
`apiClient.ts:40-43`.
**What was wrong:** Clicking "log out" only cleared a browser cookie — but the app does not
actually use that cookie to stay logged in day to day; it uses a separate login token stored
elsewhere in the browser. Clearing the cookie did nothing to that token, so a token taken
before someone logged out (from a shared computer, a stolen device, or malicious code
running on the page) kept working for up to a full day, even after the person believed they
had signed out.
**What could have been reached:** Continued full account access using an old token, for up
to 24 hours past logout, from anything that had captured that token beforehand.
**How it was fixed:** The project already had a working way to invalidate every token
issued to an account at once (a counter on the account that, when increased, makes every
older token stop working), already used when someone changes their password. Logging out
now uses that same mechanism.
**Commit:** `9c51ea5`
**Evidence:** An automated test proved: a token worked before logout (`200`); logout
succeeded (`200`); the same token, reused, was then rejected (`401`); a freshly issued
token worked again — logging back in still works (`200`); even a different, brand-new
token for the same account did not bring the original, dead token back to life (`401`);
and logging out with no token at all was correctly rejected (`401`). Full suite: 43 of 43
tests passing.

#### SEC-12 — High
**Where:** `auth.ts:19-31`, keyed on the visitor's network address; no setting anywhere in
`app.ts` telling the server how to correctly read that address behind the site's load
balancer (a piece of infrastructure that sits in front of the real server and passes
traffic through to it).
**What was wrong:** The login page limits how many attempts can be made in a short window,
to slow down password guessing. But the server wasn't told how to correctly identify a
visitor's real address behind the load balancer, so every single visitor looked like they
were coming from the exact same one address. The limit was therefore shared by everyone at
once, not per attacker: there was effectively no real per-person brute-force limit, and one
attacker could lock every legitimate resident, professor, and HOD out of the login page for
15 minutes by using up that one shared limit.
**What could have been reached:** No meaningful protection against password-guessing, and a
way for a single attacker to lock every real user out of logging in for 15 minutes at a
time.
**How it was fixed:** The server was told to trust exactly one hop of network
infrastructure (the load balancer itself) when reading a visitor's address — not "trust
everything," which would let an attacker simply lie about their own address. This behaviour
was checked directly with a real test before being relied on, not assumed. A second,
separate protection was also added: ten failed password attempts against one specific
account locks that account out for 15 minutes, no matter which address the attempts come
from.
**Commit:** `d3dab84`
**Evidence:** An automated test proved: two different real visitors get two separate
limits, not a shared one; 100 requests where an attacker fakes a different "from" address
on each one but the real last hop stays the same are still all treated as one visitor (the
faked part is ignored) and get blocked on the 101st, while a genuinely different real
visitor is unaffected; one account driven to 10 failures from 10 different simulated
addresses gets locked out even with the correct password on the 11th attempt, while a
different account logs in normally; and a successful login below the failure threshold
clears the counter, proven by triggering the lockout again afterward. Full suite: 47 of 47
tests passing.

#### SEC-34 — High
**Where:** `logs.ts:45-48` versus `:51-54`.
**What was wrong:** When a professor or HOD reviews a submitted clinical log entry, the
system first checked whether the log's id existed at all — answering one specific way if
not — and only afterward, separately, checked whether that entry actually belonged to that
reviewer, answering a *different* way if not. Because those two situations produced two
different, distinguishable answers, anyone logged in could try id after id and learn — just
from which of the two answers came back — exactly which log entries exist in the system,
without permission to see any of them (this is what "enumeration" means, defined at the top
of this report).
**What could have been reached:** Any professor or HOD could map out which clinical log ids
exist system-wide by walking through ids and watching the response.
**How it was fixed:** The "does it exist" check and the "is it yours" check were combined
into one. A made-up id and a real id that isn't the reviewer's now produce the exact same
response — status `403`, message "Log not found or not assigned to you" — with no way to
tell the two situations apart.
**Commit:** `6508b19`
**Evidence:** Before making the change, every place in the app's own frontend code that
calls this route was checked to confirm nothing there treated the old two different
responses differently — the app already showed the same generic message either way, so
nothing a user sees was affected. After the change, an automated test confirmed all four
required cases: not logged in → `401`; a real entry belonging to a different professor →
`403`; the correct, owning professor → `200`; and a made-up id → `403`, with a response
checked to be identical, word for word, to the "wrong owner" response — not just the same
status number.

#### SEC-35 — High
**Where:** `professor.ts:43-46` versus `:48-51`.
**What was wrong:** The same pattern as SEC-34, on the page that shows an HOD which
submissions are waiting for a specific professor's review: a made-up professor id got one
answer, and a real professor in a different department got a different answer.
**What could have been reached:** An HOD could learn which professor and HOD user ids exist
across every department in the whole organisation, not only their own.
**How it was fixed:** Same approach as SEC-34 — one combined check, one identical response
(`403`, "Faculty member is outside your department") for both situations.
**Commit:** `6508b19`
**Evidence:** Same check that nothing in the app's own screens treated the two old
responses differently, plus the same four-case automated test: `401`, `403` (wrong
department), `200` (correct department), and `403` for a made-up id with a response
identical to the wrong-department case.

#### SEC-36 — High
**Where:** `admin.ts:76-79` vs `:80-83` (approving a pending student), `:122-125` vs
`:126-129` (rejecting one), `:154-157` vs `:158-161` (removing a user).
**What was wrong:** Three related HOD actions — approving a pending resident, rejecting
one, and removing a user from the roster — all had the same two-step, two-answer pattern as
SEC-34 and SEC-35.
**What could have been reached:** An HOD could learn which user ids exist in *other*
departments — residents and staff they have no legitimate reason to know about — from any
of these three actions.
**How it was fixed:** Same approach — one combined check per action, one identical response
for "doesn't exist" and "exists, but isn't yours to act on," matching a pattern another part
of the same file already used correctly.
**Commit:** `6508b19`
**Evidence:** Same breaking-change check plus an automated test for all three actions, each
confirming: `401` not logged in, `403` for a real user in a different department, `200` for
the correct action on a real, correctly-scoped user, and `403` — with a response identical
to the wrong-department case — for a made-up id.

#### SEC-37 — High
**Where:** `payments.ts:172` versus `:173`.
**What was wrong:** The step that confirms a payment is complete had the same pattern: a
made-up payment reference got one answer, and a real payment belonging to someone else got
a different one.
**What could have been reached:** Someone applying for an account could learn which payment
references are real — and by extension, which other applicants have a payment attempt in
progress — though the risk here is lower than the other three, since payment references are
long, random strings rather than easy-to-guess numbers.
**How it was fixed:** Same approach — one combined check, one response ("This payment does
not belong to your account", `403`) for both a made-up reference and a real one belonging
to someone else.
**Commit:** `6508b19`
**Evidence:** Same breaking-change check; an automated test confirmed all four cases, with
the "made-up reference" and "someone else's real payment" responses checked to be
identical, not merely the same status.

### Medium

#### SEC-14 — Medium
**Where:** `HODPortal.tsx:282-284`.
**What was wrong:** Three lines of code computed a set of fallback "zero" values for the
HOD dashboard's log-activity summary, ready to be shown if the real data failed to load —
but nothing on the actual page had ever been connected to display that summary. It was
calculated and then never used anywhere. It could not mislead anyone today, but it was
exactly the kind of leftover fake data this project's own written rules warn against, and
it would have become a real problem the moment someone wired that summary up to the page
without noticing the fallback.
**What could have been reached:** Nothing today — this code produced no visible output. If
connected later without anyone noticing the fallback, it would have shown made-up zeros as
if they were real numbers.
**How it was fixed:** The three lines were deleted outright. No error display was needed in
their place, since nothing displayed them.
**Commit:** `622a0e2`
**Evidence:** The whole file was searched for any other reference to these three values —
none exist anywhere else, confirming they truly were never used.

#### SEC-15 — Medium
**Where:** `HODPortal.tsx` roster tab (`:158-168`, `:329-331`, `:371`, `:427`).
**What was wrong:** The part of the HOD dashboard listing every resident and faculty member
in the department. If that list failed to load, the only signal was a small pop-up message
that fades after a few seconds — and the page underneath then showed "0 approved students,"
"0% average progress," "0 faculty," and "No students in this department" / "No faculty in
this department," exactly as if the department genuinely had no one in it. This is a second,
separate instance of the same mistake SEC-10 fixed in the analytics panel of this same file.
**What could have been reached:** After the pop-up faded, an HOD had no way to tell "the
page failed to load" apart from "this department really has zero people in it" — a serious,
misleading gap for someone managing real residents.
**How it was fixed:** Added a dedicated error state. When the list fails to load, the page
now shows a clear error message and a "Try again" button in place of the summary numbers
and both tables — never the zero or empty version.
**Commit:** `622a0e2`
**Evidence:** Verified live in a real browser, against a safe, disposable practice copy of
the app running on made-up test accounts — no real database was touched at any point. The
real network request behind this list was intentionally made to fail; the page was checked
to show only the error message and Try again button, with none of the old zero or empty
text anywhere — confirmed by both a screenshot and a full read of the page's visible text.
The request was then allowed to succeed again, and the page correctly showed the real
numbers (2 approved students, 2 faculty), proving the fix does not break the normal,
working case.

#### SEC-16 — Medium
**Where:** `AttendancePage.tsx:44-46`, `:73-76`.
**What was wrong:** A resident's leave-balance summary (how many days of casual and
academic leave they have used) started out, and stayed on failure, at "0 used." The
problem: the real system can legitimately return that exact same "0 used, not configured"
answer for a department that genuinely has not set up a leave allowance yet — so a resident
whose balance failed to load would see the same thing as a resident with a real, if
unconfigured, answer. A resident who had actually used leave could easily believe their
full allowance was still untouched.
**What could have been reached:** A resident could be misled into believing they had leave
available that they did not, purely because the balance failed to load rather than because
that was the real answer.
**How it was fixed:** Added a dedicated error state for the leave-balance panel
specifically. On failure it now shows a clear error message and a "Try again" button in
place of the two leave-balance summary cards. An unrelated, still-working "Pending
Approval" card on the same screen is left alone.
**Commit:** `622a0e2`
**Evidence:** Same live-browser method as SEC-15 — the leave-balance request was forced to
fail; the page showed the error message with Try again, and the page's full visible text
was checked and confirmed to contain none of the old fallback wording.

#### SEC-17 — Medium
**Where:** `AssessmentsPage.tsx:34-35`; `PostingsPage.tsx:58-59`.
**What was wrong:** Two pages — one listing a resident's assessment scores, one listing
their ward postings — both showed a friendly "you don't have any yet" message whenever the
real data failed to load, exactly the same message a resident with genuinely zero records
would see. The postings page went a step further and actively invited the resident to add a
new posting on that same failure screen, risking a duplicate entry if their real postings
existed but simply had not loaded.
**What could have been reached:** A resident with real assessment or posting records could
be shown "you have none" purely because of a failed request, and could be prompted to
re-enter data that already exists.
**How it was fixed:** Both pages now have a dedicated error state. On failure, each shows a
clear error message and a "Try again" button instead of the "you have none yet" message —
matching a pattern another page in the same project already used correctly.
**Commit:** `622a0e2`
**Evidence:** Same live-browser method — both requests were forced to fail in turn, and
both pages showed only the error message and Try again button, with the misleading "you
have none yet" wording confirmed absent from the page's visible text both times.

### Low

#### SEC-23 — Low
**Where:** `LoginProductPreview.tsx:32,33,52`.
**What was wrong:** The illustration shown on the login page — meant to be a generic
preview of the app — had the word "Pediatrics" hardcoded into it three times, alongside a
made-up resident's details (a fake registration number, a fake join date, a fake completion
date) that were not real data pulled from anywhere.
**What could have been reached:** Every visitor logging in for a department other than
Pediatrics saw the wrong department's name in the preview, and every visitor saw fabricated
personal details presented as if they were real.
**How it was fixed:** The fake resident details were replaced with a dash placeholder this
codebase already uses elsewhere to mean "no data" — no new made-up value was invented to
replace the old one. The three hardcoded "Pediatrics" occurrences were changed to neutral,
department-agnostic wording.
**Commit:** `1dbe79c`
**Evidence:** Verified live in a real browser — the login page's full visible text was
checked and confirmed to contain no occurrence of "Pediatrics" or the fake registration
number anywhere.

---

## 3. STILL OPEN

The 16 findings not fixed in this pass, in the same order and format as Section 2, minus
the "how it was fixed" and "evidence" lines (there is neither yet), with a note on why each
was left for later and what closing it would take.

### Medium

#### SEC-13 — Medium
**Where:** `lib/db/drop.mjs:5-8`.
**What's wrong:** A script exists in the codebase that permanently deletes three whole
tables of data (leave records, postings, assessments), with no confirmation prompt, no
safety check, and no way to undo it.
**What could be reached:** Anyone who ran this script while pointed at the real database
would destroy three tables of real resident records, with no backup path recorded anywhere
in the project.
**Why not fixed here, and what it would take:** It is a standalone script, not reachable by
any user of the running app, and not one of the routes or screens this pass focused on.
Fixing it means either deleting the script or adding an explicit check that refuses to run
outside a safe, non-production setting — a small change that simply was not scoped into
this pass.

#### SEC-18 — Medium
**Where:** `student.ts:79-81`, `:98-99`.
**What's wrong:** The resident dashboard's counts (how many logs are "pending," and so on)
and its "recent entries" list do not exclude entries the resident has already deleted, even
though the underlying tables track deletion and another part of the same file already
filters it out correctly.
**What could be reached:** A resident's dashboard numbers can be wrong — counting entries
they deleted, and occasionally showing a deleted entry as "recent."
**Why not fixed here, and what it would take:** A data-accuracy issue rather than an access
or leak issue, so it fell outside this pass's security-first scope. The fix is small — add
the same "exclude deleted" condition, already used correctly nearby, to four more queries.

#### SEC-19 — Medium
**Where:** `artifacts/mockup-sandbox/src/lib/session.ts:22-28`.
**What's wrong:** The user's login token is stored in a part of the browser that any script
running on the page can read, and is used from there, instead of relying on the safer,
script-inaccessible cookie the server also sets correctly.
**What could be reached:** Combined with SEC-11 (now fixed), this meant malicious code
running on the site could steal a fully working login token good for up to 24 hours. SEC-11
shortens how long a stolen token stays useful after a real logout; this finding is about
the token being readable by page scripts at all, which is a separate, deeper change.
**Why not fixed here, and what it would take:** Moving the frontend to rely on the
script-inaccessible cookie instead of browser storage is a larger, more structural change
to how the app authenticates — it needs its own dedicated pass and its own testing, not a
change bundled into this one.

#### SEC-20 — Medium
**Where:** `auth.ts:19-31`.
**What's wrong:** As originally written, nothing counted failed password attempts per
account at all — the only limiter was tied to the visitor's network address.
**What could be reached:** Password guessing against one specific, named account, spread
across many different network addresses to avoid an address-based limit.
**Why not fixed here, and what it would take:** SEC-12, fixed in this same pass, added a
real, database-backed lockout after 10 failed attempts against one account within 15
minutes — which speaks directly to this finding, though it was recorded and fixed under
SEC-12's own name, not this one. Whether that fix fully closes this finding, or whether a
longer-term, persisted counter with escalating delays is still wanted on top of it, is not
stated anywhere in the record — flagged here rather than assumed either way.

#### SEC-21 — Medium
**Where:** `artifacts/api-server/package.json` → `express` → `qs` (a small helper package
pulled in indirectly through `express`).
**What's wrong:** Two known security advisories exist in `qs`, both already patched in
newer versions the project has not yet moved to.
**What could be reached:** One of the two advisories is a way to make the server hang or
crash, reachable by anyone sending it an ordinary web request — no login required.
**Why not fixed here, and what it would take:** This is a dependency version change, not a
code fix, and every dependency change in this task was treated as its own decision needing
the project owner's explicit go-ahead, separate from code fixes. It would take upgrading
`express` to a version that pulls in a patched `qs`.

### Low

#### SEC-22 — Low
**Where:** `department.ts:106-118`.
**What's wrong:** The "total students" count shown to an HOD includes students whose
registration was rejected or is still pending, not only approved ones — a different,
correct query elsewhere in the same file filters this properly.
**What could be reached:** Nothing outside the HOD's own department — just an inflated,
inaccurate count, and rejected or pending students appearing as "Active" in one table.
**Why not fixed here, and what it would take:** A data-accuracy issue, not a security one,
and not one of the findings this pass focused on. The fix is a one-line addition of the
same status filter the correct query already uses.

#### SEC-24 — Low
**Where:** eight files: `HODPortal.tsx:133,141`; `layout/AppLayout.tsx:169`;
`pages/AttendancePage.tsx:74`; `pages/PrintableLogbook.tsx:52`;
`pages/AcademicLogsPage.tsx:77`; `pages/CaseLogsPage.tsx:98`; `pages/PostingsPage.tsx:68`;
`pages/ProcedureLogsPage.tsx:107`.
**What's wrong:** Nine places in the frontend print the entire error object to the
browser's developer console when something fails, instead of a short message.
**What could be reached:** Nothing today — the server's error responses are currently just
a generic message with no sensitive content — but this pattern would print whatever the
server ever starts returning in an error, without anyone deciding that on purpose.
**Why not fixed here, and what it would take:** A precaution against a possible future
change elsewhere, not a live issue today, so it was not prioritised in this pass. The fix
is mechanical — replace each with a short logged string and the status code.

#### SEC-25 — Low
**Where:** `student.ts:297`.
**What's wrong:** One place in the server code builds part of a database query using a raw
piece of text instead of the safer, structured method used everywhere else in the project.
**What could be reached:** Nothing today — it was specifically checked and confirmed that
the values going into it are handled safely, not pasted directly into the query. But it is
the only place written this way, which makes it an easy spot for a future edit to
accidentally introduce a real vulnerability.
**Why not fixed here, and what it would take:** Confirmed safe as written, so not urgent.
Rewriting it in the project's normal, safer style is a small, low-risk cleanup that was not
scoped into this pass.

#### SEC-26 — Low
**Where:** `artifacts/mockup-sandbox/src/components/ui/chart.tsx:78`.
**What's wrong:** One piece of unused, leftover library code builds a chunk of webpage
styling directly from data — a technique that can be dangerous if that data ever comes from
outside the app.
**What could be reached:** Nothing today — this component is not used anywhere in the app.
It would only become a real risk if someone later connected it to real, outside data
without noticing this pattern.
**Why not fixed here, and what it would take:** Dead code with no current exposure. Either
deleting the unused component, or strictly limiting what values it is allowed to accept,
would close this — a small change not included in this pass.

#### SEC-27 — Low
**Where:** `admin.ts:201`.
**What's wrong:** When an HOD creates a new professor account, that password is scrambled
using a weaker setting than every other password in the system uses.
**What could be reached:** If the database were ever stolen, these particular scrambled
passwords would be roughly four times easier to crack than everyone else's.
**Why not fixed here, and what it would take:** A one-line consistency fix (raising the
scrambling cost to match the rest of the app), not tied to any of the findings selected for
this pass.

#### SEC-28 — Low
**Where:** `artifacts/api-server/src/lib/validation.ts:23`.
**What's wrong:** When someone submits a form with a missing or invalid field, the error
message names the internal database field directly (for example, `patientUhid: Required`).
**What could be reached:** Someone probing the system without logging in could learn the
internal names of database fields — low value, since the same names are already visible in
the app's own downloadable code anyway.
**Why not fixed here, and what it would take:** Low-value information exposure, not
selected for this pass. Fixing it means returning a generic message to the caller while
still logging the real detail on the server.

#### SEC-29 — Low
**Where:** `.env.example` (an example configuration file showing what settings a new
deployment needs).
**What's wrong:** That example file is missing two of the most important settings — the
database connection and the login-token secret — even though the app refuses to even start
without them.
**What could be reached:** Nothing directly — but this exact gap is what historically led
someone to hardcode a real database password directly into scripts instead, which is
SEC-04.
**Why not fixed here, and what it would take:** Documentation only, not code. Adding the two
missing setting names (never actual values) to the template file would close this.

#### SEC-30 — Low
**Where:** `artifacts/api-server/build.mjs:104`.
**What's wrong:** The production build produces "source maps" — files that let someone
reconstruct the original, readable source code from the compiled version — and ships them
alongside the server.
**What could be reached:** These maps are not served over the web by the app itself, so
reaching them requires file or server access rather than just being a visitor — but if
someone ever got that access, this raises how much they could learn.
**Why not fixed here, and what it would take:** Low real-world exposure given it requires
prior access. Turning source maps off for production builds (or keeping them only for the
team's own error-tracking tool) would close this — a small build-configuration change not
included here.

#### SEC-31 — Low
**Where:** `pnpm-lock.yaml` (the file listing every package used to build and develop the
app).
**What's wrong:** Twelve known security advisories exist in packages used only to build and
develop the app — never in the code that actually runs for real users.
**What could be reached:** Nothing directly reachable by a normal user or attacker of the
live site — every one of these requires someone who can already influence the build
environment itself.
**Why not fixed here, and what it would take:** A dependency version change, treated
throughout this task as needing the project owner's own separate go-ahead. Refreshing the
development tools to their patched versions would close this.

#### SEC-32 — Low
**Where:** `artifacts/mockup-sandbox/src/lib/apiClient.ts:61`, `:81`.
**What's wrong:** If the server ever answers with something other than the expected data
format (for example, an unexpected error page from a network proxy), the first 200
characters of that raw response are shown to the user in a pop-up message.
**What could be reached:** A user could occasionally see a fragment of an unrelated error
page instead of a clean message — no application data is involved.
**Why not fixed here, and what it would take:** Minor and cosmetic. Replacing it with one
fixed, generic message would close this — not part of this pass.

#### SEC-33 — Low
**Where:** `artifacts/api-server/src/migrate.ts:10`.
**What's wrong:** The script that applies database structure changes prints the raw error
message when a failure does not come with a recognised error code.
**What could be reached:** The statements this script runs do not carry patient or resident
data, so the practical risk today is low — but the branch that prints the raw message is
not restricted to only safe cases by its own design.
**Why not fixed here, and what it would take:** Low current risk given what this script
actually touches. Restricting what gets printed, or only printing the error code, would
close this — not part of this pass.

---

## 4. HISTORICAL NOTE — commit `ebd075e`

Separately from the numbered findings above, this task investigated one specific historical
commit that had been named directly, because of a fallback of fabricated dashboard numbers
it was known to contain.

**The commit.** Full hash `ebd075e6b061ca0f4da21267030180e1239aa7a0`. Commit message:
"feat: complete end-to-end auth flow and fix bugs." Date: 2026-08-01, 00:56:41 (+05:30) —
about five weeks before this security audit began. **Author identity: `AI Bot
<bot@example.com>`.** This name and email do not match any developer or account referenced
anywhere else in this project's history or documentation. Nothing in the audit record
explains who or what this identity is — it is unexplained, and this report does not guess.

**Every item found in the scan of that commit, and its status today:**

1. **A fabricated dashboard summary in `HODPortal.tsx:113-115`** —
   `{totalStudents: 15, avgCompletion: 42, logStats: {pending:10, verified:45, rejected:2},
   topProcedures:[{name:"Intubation", count:20}]}`, with a comment reading "Keep analytics
   mocked or silent fail if endpoint missing." **Fixed today**, by commit `1dbe79c`
   (the same commit that fixed SEC-09, SEC-10, and SEC-23), which replaced it with a real
   error state instead of made-up numbers.
2. **A hardcoded fallback login-token secret**, in both
   `artifacts/api-server/src/middlewares/auth.ts:73` and `routes/auth.ts:305`:
   `const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-for-dev-only"`. **Fixed
   today**, by commit `76daae7` — a commit made before this security task began, which
   changed the app to refuse to start at all if this setting is missing, rather than
   silently using a fallback value.
3. **A hardcoded demo password**, in `LoginPage.tsx:99,212`: the password field pre-filled
   itself with `"Demo@2026"`, alongside "Demo account ready" text. **Fixed today.** Not
   recorded which commit removed it — it was already gone by the time this security task's
   audit began on 2026-09-08, and no earlier commit is named for it in the record.
4. **A fabricated university id**, in `RegistrationPage.tsx:55`: `` kuhsId:
   `KUHS-${form.registrationNumber}` `` with the comment "Mock KUHS ID for now" — inventing
   an id instead of asking the applicant to enter their real one. **Fixed today.** Not
   recorded which commit changed it — `kuhsId` is now a real, required form field; no
   commit is named in the record.
5. **A large seed script with fabricated data**, `artifacts/api-server/src/seed.ts` (over
   250 lines at the time), which printed messages like "Created Mock Case Log" and "Created
   Mock Leave Request," and printed demo login credentials to the console. **Fixed today.**
   Not recorded which commit reduced it — the file is now three lines, stating plainly "No
   demo users, passwords, or clinical records are inserted," and delegates to a different,
   already-checked provisioning script. No commit is named in the record.
6. **A permissive network-origin setting**, `app.ts:59`:
   `cors({ origin: true, credentials: true })` — this would accept a request from any
   website at all, while also allowing it to carry the user's login credentials, which this
   project's own standing rules forbid outright. This was not part of the fabricated-data
   scan's own three questions (it is not fake data or a silent failure), but was noticed and
   checked because it sat right next to the fallback secret in the same commit. **Fixed
   today.** The current file instead checks every request's origin against an explicit,
   named allow-list, and the app refuses to start if that list is not configured. The audit
   record ties this fail-closed behaviour, alongside the login-token secret fix, to the same
   commit: `76daae7`.
7. **One item removed by this commit, not added by it:** `student.ts` had, before this
   commit, contained a fabricated piece of clinical narrative text —
   `learningPoints: "Classified dehydration clinically and demonstrated ORS preparation."`
   This specific commit deleted that line. **Already fixed** — gone before this security
   task even began. It is not recorded which earlier commit had originally introduced it,
   and that was not investigated further, since it was already removed.

**Two more things noticed while reading this commit, neither of them fabricated data, and
neither tracked under any numbered finding:**

- `fix.js`, a leftover one-time script at the repository's top level, still present and
  unfixed today. It is not fabricated data or a silent failure — it is a throwaway tool that
  made a mechanical code change once — but it is dead clutter that was never cleaned up, and
  no finding number tracks it.
- A comment at `admin.ts:236`, on the route that lists pending leave requests: *"We should
  ideally filter by department, but for MVP HOD sees all leaves or leaves in their dept."*
  This is flagged in the record as the likely historical origin of the whole class of
  department-scoping problems that SEC-06 and other fixes in this task later addressed
  elsewhere in the code — but this specific comment, and the route it sits in, is not itself
  tracked under any finding number, and whether it still needs its own fix is not recorded.

---

## 5. WHAT CHANGED THAT USERS WILL NOTICE

Real, visible differences a resident, professor, or HOD may notice while using the app,
sourced from what the fixes above actually changed:

- **Logging out now signs you out everywhere, not just on the device you logged out from.**
  Before, logging out only cleared a browser cookie the app was not actually relying on. Now
  it invalidates every login token issued to that account — so if you are signed in on your
  phone and your laptop, logging out on one now also signs you out of the other. (SEC-11)
- **Several screens now show a clear error message with a "Try again" button, instead of
  blank, zeroed, or "you have none" content, when something fails to load:**
  - The official printable logbook now refuses to print at all, and shows an error instead,
    if any part of the data behind it failed to load — rather than printing a silently
    incomplete document. (SEC-09)
  - The HOD dashboard now shows a full error screen if it cannot load at all, and a
    dismissible banner if just the analytics panel fails, instead of looking like an
    ordinary, working dashboard. (SEC-10)
  - The HOD's roster tab (the list of residents and faculty) now shows an error and a retry
    button instead of "0 approved students, 0% progress, 0 faculty, no one in this
    department" when it fails to load. (SEC-15)
  - A resident's leave-balance summary now shows an error instead of "0 days used" when it
    fails to load. (SEC-16)
  - A resident's assessments page and postings page now show an error instead of "you have
    none yet" when they fail to load — the postings page no longer invites adding a new
    posting on a failed-load screen. (SEC-17)
- **Some actions now answer "forbidden" (`403`) in a case where they used to answer
  "not found" (`404`).** This applies to reviewing a submitted log entry, an HOD viewing a
  professor's review queue, an HOD approving, rejecting, or removing a user, and confirming
  a payment. This was checked directly before the change: in every one of these cases, the
  app's own screens already showed the exact same generic error message for both the old
  "not found" and "forbidden" answers, so this change was not found to alter what any user
  actually sees on screen — only the underlying number the server sends, which the app was
  not displaying to begin with. (SEC-34, SEC-35, SEC-36, SEC-37)
- **A professor who is in the same department as a resident, but not that resident's
  supervisor, can no longer see that resident's leave records or certificates at all** (a
  clear "forbidden" response, since no supervisor relationship exists on those two records
  at all) **and now sees an empty or filtered list, rather than the resident's full data,
  for that resident's postings, assessments, and thesis** — matching how the resident's
  clinical logs already behaved before this task. (SEC-01, SEC-02, SEC-05)
- **After 10 failed password attempts against one account within 15 minutes, that account
  is locked out for 15 minutes — even if the very next attempt uses the correct password.**
  A resident, professor, or HOD who mistypes their password many times in a row will now
  see a new "too many failed attempts for this account" message. (SEC-12)
- **The login page's illustration no longer shows a made-up resident from the Pediatrics
  department.** Anyone logging in for a department other than Pediatrics previously saw the
  wrong department's name on that screen; everyone saw a fabricated registration number and
  fabricated dates presented as if real. Both are gone. (SEC-23)

---

## 6. WHAT IS NOT COVERED

Stated plainly, as asked: **this project has no automated tool for testing the frontend at
all.** The backend has an automated test suite (60 tests, all passing as of the last
commit), and every backend fix above was verified by it. But every one of the frontend
fixes — SEC-09, SEC-10, SEC-23, and SEC-14 through SEC-17 — was verified only by manually
operating a real browser, one time, during this work: forcing a request to fail, taking a
screenshot, and reading the page's text. Nothing in the project will automatically re-check
any of these six screens the next time someone changes this code. If one of them is
accidentally broken again in the future, nothing will catch it until a person notices, the
same way this task caught it.

Other gaps in what this audit covers, stated plainly:

- **Scope was bounded by directory, not by the whole repository.** Only
  `artifacts/api-server/src`, `artifacts/mockup-sandbox/src`, `lib/db`, and
  `lib/api-client-react` were audited. Anything elsewhere in the project — other workspace
  folders, deployment configuration, and so on — was not part of this review.
- **There is no automated pipeline that re-runs anything.** The audit record notes this
  project has no CI (continuous integration — a system that automatically re-runs tests
  whenever code changes) workflow files at all. The 60 backend tests only run when a person
  chooses to run them.
- **The exposed database password from SEC-04 still exists in older commits.** The eight
  files were deleted going forward, and the exposed password was separately rotated so the
  old value is dead — but the commit that removed those files explicitly left git history
  itself untouched. The old, now-dead password string is still readable by anyone who looks
  at those older commits.
- **16 findings remain open** (Section 3) — none of them a way to read or change another
  person's data, but real gaps in accuracy, hardening, or dependency freshness that this
  pass did not close.
- **Two groups of dependency (third-party package) vulnerabilities are recorded but not
  acted on** — SEC-21 (reachable by the live app) and SEC-31 (build tools only). Both would
  require upgrading packages, which this task treated as a separate decision for the
  project owner to make, not something to change as a side effect of a different fix.
- **SEC-06's fix protects against a situation that cannot currently be reached through the
  running app at all** — three other, separate protections already block it. Its test had
  to call the affected code directly, bypassing the normal request path, because there is no
  way to reach it through an actual request today. That means this particular fix is a
  backstop for if those other three protections are ever weakened, not something that was —
  or could be — observed working end to end through the app itself.
- **The audit's own dependency-scanning tool substitution is worth knowing about:** the
  usual `npm audit` command could not run in this project (it uses a different package
  manager, `pnpm`), so `pnpm audit` was used instead. This does not change what SEC-21 and
  SEC-31 found, but it means the audit did not use the most commonly expected tool by name.
