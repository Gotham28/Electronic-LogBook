const fs = require('fs');

let s = fs.readFileSync('artifacts/mockup-sandbox/src/components/pages/PostingsPage.tsx', 'utf8');

// Find the component start to inject isRadiology
s = s.replace(
  'const { department, config } = useDepartment();',
  'const { department, config } = useDepartment();\n  const isRadiology = department?.name?.toLowerCase().includes("radiology");'
);

s = s.replace(
  'Track your individual ward postings and rotations.',
  'Track your individual {isRadiology ? "postings" : "ward postings and rotations"}.'
);
s = s.replace(
  'Log a new ward posting or rotation.',
  'Log a new {isRadiology ? "posting" : "ward posting or rotation"}.'
);
s = s.replace(
  '<Label>Ward / Posting Unit</Label>',
  '<Label>{isRadiology ? "Posting" : "Ward / Posting Unit"}</Label>'
);
s = s.replace(
  'placeholder="Enter posting unit"',
  'placeholder={isRadiology ? "Enter posting" : "Enter posting unit"}'
);
s = s.replace(
  'Add your current ward or rotation and keep the timeline readable for review.',
  'Add your current {isRadiology ? "posting" : "ward or rotation"} and keep the timeline readable for review.'
);
s = s.replace(
  '<TableHead>Ward / Unit</TableHead>',
  '<TableHead>{isRadiology ? "Posting" : "Ward / Unit"}</TableHead>'
);

fs.writeFileSync('artifacts/mockup-sandbox/src/components/pages/PostingsPage.tsx', s);
