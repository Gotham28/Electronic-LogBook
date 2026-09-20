# Antigravity dispatch 25 — Fix assignment/assignment_types/assignment_recipients fixtures

job_id: fc9456628e8942c2ae14fccccdacede2
workdir: D:\Electronic-LogBook-main
branch: feature/hard-delete-students-faculty
model: Gemini 3.1 Pro (High)
allowed_paths:
- artifacts/api-server/tests/hard-delete.test.ts
- HANDOFF.md

Follow-up to dispatch 24 (fixed case_logs fixtures, student-delete test now passes: 85/86).
Remaining failure: professor-delete test's assignment_types/assignments/assignment_recipients
inserts also use wrong field names/values (missing NOT NULL description/instructions,
dueDate instead of dueAt, invalid status enum value "pending"), confirmed against the real
schema at lib/db/src/schema/assignments.ts read directly by Claude Code.

[same Guard/Sandbox constraint/Context/Build/Do NOT touch/Report content as sent to agy_start_edit]
