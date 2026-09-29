const fs = require('fs');

// Fix DepartmentSettings.tsx
let s = fs.readFileSync('artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx', 'utf8');
s = s.replace(
  'const data = useDepartment();\n  const features = data.config?.enabledFeatures ?? {};',
  'const data = useDepartment();\n  const isRadiology = data.department?.name?.toLowerCase().includes("radiology");\n  const features = data.config?.enabledFeatures ?? {};'
);
fs.writeFileSync('artifacts/mockup-sandbox/src/components/DepartmentSettings.tsx', s);

// Fix PostingsPage.tsx
let s2 = fs.readFileSync('artifacts/mockup-sandbox/src/components/pages/PostingsPage.tsx', 'utf8');
s2 = s2.replace(
  'const { user } = useAuth();\n  const [loading, setLoading] = React.useState(true);',
  'const { user } = useAuth();\n  const { department, config } = useDepartment();\n  const isRadiology = department?.name?.toLowerCase().includes("radiology");\n  const [loading, setLoading] = React.useState(true);'
);
fs.writeFileSync('artifacts/mockup-sandbox/src/components/pages/PostingsPage.tsx', s2);

// Fix PrintableLogbook.tsx
let s3 = fs.readFileSync('artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx', 'utf8');
s3 = s3.replace(
  'const { department, config } = useDepartment();\n  const isRadiologyFields',
  'const { department, config } = useDepartment();\n  const isRadiology = department?.name?.toLowerCase().includes("radiology");\n  const isRadiologyFields'
);
fs.writeFileSync('artifacts/mockup-sandbox/src/components/pages/PrintableLogbook.tsx', s3);
