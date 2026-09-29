const fs = require('fs');

let s = fs.readFileSync('artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx', 'utf8');

s = s.replace(
  '["competency_level", "Experience level"]',
  '["competency_level", "Competency level"]'
);
s = s.replace(
  'title="Experience levels"',
  'title="Competency levels"'
);
s = s.replace(
  'emptyText="No experience levels configured."',
  'emptyText="No competency levels configured."'
);
s = s.replace(
  'procedure experience levels',
  'competency levels'
);

fs.writeFileSync('artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx', s);

let s2 = fs.readFileSync('artifacts/mockup-sandbox/src/components/pages/ProcedureLogsPage.tsx', 'utf8');
s2 = s2.replace(
  'No procedure experience levels are set up',
  'No competency levels are set up'
);
fs.writeFileSync('artifacts/mockup-sandbox/src/components/pages/ProcedureLogsPage.tsx', s2);
