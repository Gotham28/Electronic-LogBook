const fs = require('fs');

let s2 = fs.readFileSync('artifacts/mockup-sandbox/src/components/pages/PostingsPage.tsx', 'utf8');
s2 = s2.replace(
  'const { postings: postingOptions, config, postingSchedule } = useDepartment();',
  'const { postings: postingOptions, config, postingSchedule, department } = useDepartment();\n  const isRadiology = department?.name?.toLowerCase().includes("radiology");'
);
fs.writeFileSync('artifacts/mockup-sandbox/src/components/pages/PostingsPage.tsx', s2);

let s3 = fs.readFileSync('artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx', 'utf8');
s3 = s3.replace(
  'const { config, clinicalWorkCategories, clinicalWorkSubtypes, competencyLevels } = useDepartment();',
  'const { config, clinicalWorkCategories, clinicalWorkSubtypes, competencyLevels, department } = useDepartment();\n  const isRadiology = department?.name?.toLowerCase().includes("radiology");'
);
fs.writeFileSync('artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx', s3);
