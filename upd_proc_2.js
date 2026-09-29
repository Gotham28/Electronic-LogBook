const fs = require('fs');
let s = fs.readFileSync('artifacts/mockup-sandbox/src/components/pages/ProcedureLogsPage.tsx', 'utf8');

s = s.replace(
  /<p className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-\[11px\] leading-5 text-teal-800">\s*Verified competency is not self-selected. It is assigned by a faculty member during procedure review.\s*<\/p>/,
  ''
);

fs.writeFileSync('artifacts/mockup-sandbox/src/components/pages/ProcedureLogsPage.tsx', s);
