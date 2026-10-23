# Physiology sidebar task

## Feature
- Organise the 22 existing Physiology logbook sections into five navigation categories while preserving existing assessments, postings, thesis, certifications and leave features.

## Current state
- CLOSE-OUT 2026-10-23: accepted Physiology-only commit 38d6c103bd0a1f415bd669c169116a798cce1857 published on codex/physiology-sidebar; PR #141 open against main: https://github.com/Gotham28/Electronic-LogBook/pull/141. User explicitly approved public publication. Source matches accepted review; all59 Cloudflare protected files unchanged. CodeRabbit skipped automatic review because the repository has fewer than10 stars; manual trigger awaits developer approval. No merge or production deployment.
- Implementation and required local verification complete; four independent review lenses returned. Source/test snapshot frozen in docs/PHYSIOLOGY_SIDEBAR_HANDOFF.md.
- Approved minor academic-assistant context fix implemented and independently reviewed with no findings. Developer ACCEPTED 2026-10-23 ("accept"). Verification evidence is in the separate handoff. Ready for close-task in a fresh chat; no close-out/deployment performed.
- Cloudflare CURRENT_TASK.md, HANDOFF.md and all 59 pre-existing files remain unchanged.

## Approval
- PUBLIC PUBLICATION APPROVED 2026-10-23: user explicitly answered "yes" to publishing the eleven reviewed Physiology files to the public https://github.com/Gotham28/Electronic-LogBook repository on codex/physiology-sidebar and opening a PR against main. This resolves the automatic approval rejection; no merge, production deployment or Cloudflare publication authorised.
- CLOSE-OUT AUTHORISED 2026-10-23: after accepting the completed review, user said "do that here" to close-out. Use isolated codex/physiology-sidebar from verified origin/main670b761; commit/publish only this task's eleven named files, leaving Cloudflare's branch/task/handoff and all its dirty files intact. Merge and production deployment remain developer actions. Task-specific close-out state stays in these two Physiology documents; do not create STATUS.md or reset Cloudflare's CURRENT_TASK.md.
- REVIEW ACCEPTED 2026-10-23: user said "accept" to the completed sidebar changes and fix-round review. This records implementation acceptance; close-out remains a separate stage and Cloudflare protection persists.
- FIX ROUND APPROVED 2026-10-23: user said "proceed" to correcting the reviewed minor Arogya context mapping on category URLs. Limit the fix to the existing frontend mapper and behavioural browser verification, then repeat the same independent review. Cloudflare protection and all no-publication boundaries remain.
- APPROVED 2026-10-23: user approved the eight-item navigation proposal, prioritised implementation now in this conversation, and explicitly required preserving the unfinished Cloudflare task.
- Scoped exception: use this separate task and docs/PHYSIOLOGY_SIDEBAR_HANDOFF.md; do not replace CURRENT_TASK.md or HANDOFF.md. Work in this chat on the existing dirty branch, preserving all pre-existing changes. No checkout/pull, commit, push, PR or deployment.

## Plan reference
- Unplanned UI navigation work. No STATUS.md found. No MASTER_PLAN.md per AGENTS.md 14.7.

## Files/areas in scope
- lib/api-zod/src/academic-logbook.ts: optional profile navigation configuration types only.
- lib/api-zod/src/logbook-profiles/physiology.ts: the approved category configuration only; preserve section wording, fields and year rules.
- artifacts/mockup-sandbox/src/lib/academic-navigation.ts: category lookup/filtering and navigation helpers.
- artifacts/mockup-sandbox/src/components/layout/AppLayout.tsx: profile-driven student sidebar and active item handling.
- artifacts/mockup-sandbox/src/components/layout/MobileBottomNav.tsx: matching mobile category shortcuts and active state.
- artifacts/mockup-sandbox/src/components/pages/AcademicLogsPage.tsx: category-specific sections, forms, records, counts and links to existing features.
- artifacts/mockup-sandbox/src/App.tsx: client-side category route only.
- artifacts/mockup-sandbox/tests/academic-navigation.test.ts: focused category/navigation regression checks.
- docs/PHYSIOLOGY_SIDEBAR_TASK.md and docs/PHYSIOLOGY_SIDEBAR_HANDOFF.md: portable scope and evidence; optional local browser verification script alongside tests.

## Approved navigation
- Dashboard.
- Teaching & Learning: department lectures; allied-department lectures; Biostatistics and Research Methodology lectures; PG teaching; UG teaching; UG practical classes; microteaching; seminars; journal club; symposium.
- Practicals & Postings: practical procedures/classes; District Residency Programme; allied-department postings. Link existing Postings & Rotations.
- Research & Events: thesis topic selection; papers presented/published; conferences, workshops and webinars. Link existing thesis and conference records.
- Assessments & Appraisal: formative assessment; test paper marks; internal assessment; student appraisal. Link existing Assessments.
- Daily Record & Attendance: daily activity record; attendance. Keep attendance distinct from leave records.
- Certifications: existing certifications page.
- Leave Records: existing leave page.

## Explicitly out of scope / Do NOT touch
- CURRENT_TASK.md, HANDOFF.md and every pre-existing Cloudflare modification/untracked artifact.
- API route/query/authentication/ownership behaviour, IDs, schema, migrations, database connections, secrets and .env.
- Other departments' navigation and Faculty/HOD menus.
- Existing record storage, assessment/review workflows, clinical/medical wording and training-year rules.
- AGENTS.md, dependencies, lockfiles, production/deployment settings and unrelated UI redesign.
- Do not delete old records or merge different record types; grouping changes navigation and presentation only.

## Execution route
- B - Codex loop; UI integration needs judgement and verification.
- Close-out: B, only after independent review and developer acceptance; no close-out in this execution.

## Executor
- Codex direct; surgical changes need local verification.
- Antigravity model: n/a.
- Same-chat exception: explicitly requested by the user above.

## Manual
- Developer accepts or requests changes after independent review. Publishing is outside this task.

## Agent
- Save protected-file hashes, implement profile-driven navigation and filtering, and preserve all 22 sections exactly once.
- Keep existing feature pages reachable through the relevant categories and preserve direct links.
- Verify types, build, category coverage/year filtering/record isolation and mobile navigation; capture exact command output in the separate handoff.
- Run four independent read-only code-review lenses, then stop for developer acceptance.

## Blocked on developer input
- None.

## Order
- Before: none; the user prioritised this over unfinished Cloudflare qualification without cancelling it.
- Implement optional category configuration, helper, client routing and filtered page; integrate sidebar/mobile navigation.
- Verify and record evidence in the separate handoff, then independent review.
- After: developer decision; Cloudflare can resume from unchanged CURRENT_TASK.md/HANDOFF.md.

## Verification required
- pnpm --filter @workspace/mockup-sandbox run typecheck.
- pnpm --filter @workspace/mockup-sandbox run build.
- pnpm --dir artifacts/api-server exec tsx --test ../mockup-sandbox/tests/academic-navigation.test.ts.
- All 22 sections occur once across five groups; year restrictions retained; grouped records/forms/counts do not include another category; existing links and mobile selection work; profiles without categories retain existing menus.
- Browser smoke against local-only intercepted synthetic responses if an installed browser runner is available; no real database or production service.
- Compare SHA256 of all pre-existing dirty/untracked files, especially CURRENT_TASK.md and HANDOFF.md; all must match.

## Flags
- AGENTS.md 5: department behaviour is optional profile configuration, with no numeric department-ID checks.
- AGENTS.md 3/4/6/8/10: no server ownership/query/schema/secret/logging edits are permitted. Stop if any becomes necessary.
- AGENTS.md 9: this is one navigation feature; Cloudflare changes remain separate and protected.
- AGENTS.md 14.1/14.2 retain stale executor/chat wording; global exceptions apply. Follow-up only, do not edit the rules.

## Suggested review tier
- Sonnet / standard / medium effort under AGENTS.md 15.2: ordinary UI/configuration work, with no high-risk server paths changed. Preserve four independent review lenses.
