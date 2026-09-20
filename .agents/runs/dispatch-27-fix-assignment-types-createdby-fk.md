# Antigravity dispatch 27 — Fix a bug introduced by dispatch 26's assignment_types fix

job_id: cdc95c739cfe48a29dfbc758ceac2fc2
workdir: D:\Electronic-LogBook-main
branch: feature/hard-delete-students-faculty
model: Gemini 3.1 Pro (High)
allowed_paths:
- artifacts/api-server/src/routes/admin.ts
- artifacts/api-server/tests/hard-delete.test.ts
- HANDOFF.md

Claude Code ran the full suite after dispatch 26 and got a NEW failure (409 where 200 was
expected) on the professor-delete test. Root-caused directly by writing a throwaway
diagnostic test that called the DB transaction outside the route's error-swallowing catch
block: assignmentTypesTable.createdBy is NOT NULL, references usersTable.id, and dispatch
26's fix ("stop deleting assignment_types, leave them in place") left that FK pointing at
the professor about to be deleted, which Postgres correctly refuses. This dispatch fixes it
by reassigning createdBy to the deleting HOD (req.user!.id) instead of leaving it untouched,
mirroring the existing studentsTable.mentorId-nulling pattern but with a valid replacement
value since this column can't be null. Diagnostic scratch file was written, run, and deleted
— confirmed via git status it left no trace.

[Guard/Sandbox constraint/Context/Build/Do NOT touch/Hard stops/Report — same content as
sent to agy_start_edit above]
