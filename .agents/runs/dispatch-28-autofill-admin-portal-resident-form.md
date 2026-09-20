# Antigravity dispatch 28 — Auto-fill defaults for superadmin's Add Resident form

job_id: 7b7182acaf4845d1b33d924623d92ead
workdir: D:\Electronic-LogBook-main
branch: fix/superadmin-add-resident-form-defaults (cut fresh off main @ b28e3b5)
model: Gemini 3.1 Pro (High)
allowed_paths:
- artifacts/mockup-sandbox/src/components/AdminPortal.tsx
- HANDOFF.md

Developer reported the same "registrationNumber/batch/dateOfJoining/kuhsId blank" 400 error
a second time after the HODPortal.tsx fix (PR #33) had already shipped. Root-caused from the
actual failing request URL in their report (/api/superadmin/departments/15/students) that
this is a completely different, pre-existing form in AdminPortal.tsx (addForm state,
addFormType === "resident", handleAddUser), never touched by the earlier fix since
AdminPortal.tsx was explicitly out of scope for every prior task this session. Applying the
identical auto-fill-defaults fix pattern here.

[Guard/Sandbox constraint/Context/Build/Do NOT touch/Hard stops/Report — same content as
sent to agy_start_edit above]
