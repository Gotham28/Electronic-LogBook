const fs = require('fs');

let s3 = fs.readFileSync('artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx', 'utf8');
s3 = s3.replace(
  'const { config, clinicalWorkCategories, clinicalWorkSubtypes, competencyLevels, department } = useDepartment();\n  const isRadiology = department?.name?.toLowerCase().includes("radiology");',
  'const { config, clinicalWorkCategories, clinicalWorkSubtypes, competencyLevels, department: dept } = useDepartment();\n  const isRadiology = dept?.name?.toLowerCase().includes("radiology");'
);
fs.writeFileSync('artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx', s3);
