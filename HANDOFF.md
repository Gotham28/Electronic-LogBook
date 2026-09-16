# Antigravity dispatch 21 — Fix review finding: missing import in access.test.ts

## Changes Made
- Modified `artifacts/api-server/tests/access.test.ts` to include `studentsTable` in the destructured import list from `./database.js`.

## Why
- A newly added test ("HOD-created students are bound to their HOD's department and require no payment; duplicate emails are rejected") was using `studentsTable`, which was missing from the imports, causing a `ReferenceError` when running the test suite.

## Verification
- Checked the rest of the file to verify all other identifiers used in the test block (like `test`, `assert`, `password`, `call`, `departmentIds`, `db`, `eq`, `paymentsTable`) are correctly imported or declared. No other missing identifiers were found.
- Ensured no test logic or assertions were modified, only the import statements.
- Adhered strictly to the Sandbox constraint: no shell commands were executed during this fix.
