const fs = require('fs');

let s = fs.readFileSync('artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx', 'utf8');
s = s.replace(
  'const { department, config, academics } = useDepartment();',
  'const { department, config, academics } = useDepartment();\n  const isRadiology = department?.name?.toLowerCase().includes("radiology");'
);
s = s.replace(
  '<Th>Ward / Unit</Th>',
  '<Th>{isRadiology ? "Posting" : "Ward / Unit"}</Th>'
);
fs.writeFileSync('artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx', s);
