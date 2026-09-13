Create exactly one new file in this repository: `artifacts/api-server/department-setup-test.json`

Its content must be EXACTLY this, byte for byte, and nothing else added:

{
  "name": "Test Department",
  "code": "TEST",
  "description": "Internal QA/testing department. Not a real clinical department.",
  "hod": {
    "fullName": "Test HOD",
    "email": "testhod@elogbook.com"
  }
}

Rules:
- Do not create, modify, or delete any other file.
- Do not touch `src/lib/department-provisioning.ts`, `provision-department.ts`, any schema or migration file, `.env`, or any drizzle config.
- Do not run any command. Do not run any database command of any kind, including read-only ones.
- Do not run git. Do not commit. Do not open a pull request.
- This is mechanical, fully-specified work with no judgement calls. If anything about this spec is ambiguous or you believe a decision is required, stop and report that instead of deciding or guessing.
- When the file is created, stop. Do not do anything further.

## Files you may touch
- artifacts/api-server/department-setup-test.json