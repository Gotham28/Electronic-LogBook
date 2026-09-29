const fs = require('fs');

let s = fs.readFileSync('artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx', 'utf8');
s = s.replace(
  'const { data, fetch: refetch } = useDepartment();',
  'const { data, fetch: refetch } = useDepartment();\n  const isRadiology = data.department?.name?.toLowerCase().includes("radiology");'
);
s = s.replace(
  '["posting", "Ward / posting"],',
  '["posting", isRadiology ? "Posting" : "Ward / posting"],'
);
s = s.replace(
  'Wards, academic activities and the other lists residents choose from.',
  '{isRadiology ? "Postings" : "Wards"}, academic activities and the other lists residents choose from.'
);
fs.writeFileSync('artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx', s);
