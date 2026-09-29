const fs = require('fs');
let s = fs.readFileSync('artifacts/mockup-sandbox/src/components/pages/ProcedureLogsPage.tsx', 'utf8');

s = s.replace(
  '<Field label="Procedure experience">',
  '<Field label="Competency level">'
);

s = s.replace(
  '<TableHead>Experience</TableHead>',
  '<TableHead>Competency level</TableHead>'
);

s = s.replace(
  '<p className="rounded-xl border border-teal-100 bg-teal-50 p-3 text-[11px] leading-5 text-teal-800">\n                Verified competency is not self-selected. It is assigned by a faculty member during procedure review.\n              </p>',
  ''
);

fs.writeFileSync('artifacts/mockup-sandbox/src/components/pages/ProcedureLogsPage.tsx', s);
