const fs = require('fs');

let s = fs.readFileSync('artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx', 'utf8');
s = s.replace(/const data = useDepartment\(\);/g, 'const data = useDepartment();\n  const isRadiology = data.department?.name?.toLowerCase().includes("radiology");');
fs.writeFileSync('artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx', s);

let s2 = fs.readFileSync('artifacts/mockup-sandbox/src/components/pages/PostingsPage.tsx', 'utf8');
s2 = s2.replace(/const \{ department, config \} = useDepartment\(\);/g, 'const { department, config } = useDepartment();\n  const isRadiology = department?.name?.toLowerCase().includes("radiology");');
fs.writeFileSync('artifacts/mockup-sandbox/src/components/pages/PostingsPage.tsx', s2);

let s3 = fs.readFileSync('artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx', 'utf8');
s3 = s3.replace(/const \{ department, config, academics \} = useDepartment\(\);/g, 'const { department, config, academics } = useDepartment();\n  const isRadiology = department?.name?.toLowerCase().includes("radiology");');
fs.writeFileSync('artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx', s3);
