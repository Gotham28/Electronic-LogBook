const fs = require('fs');

// 1. Update department-template.ts
let templateTs = fs.readFileSync('artifacts/api-server/src/lib/department-template.ts', 'utf8');
templateTs = templateTs.replace(
  'name: z.string().trim().min(1).max(160),',
  'name: z.string().trim().min(1).max(160), value: z.string().trim().min(1).max(160).optional(),'
);
templateTs = templateTs.replace(
  'name: item.name, value: item.name,',
  'name: item.name, value: item.value || item.name,'
);
fs.writeFileSync('artifacts/api-server/src/lib/department-template.ts', templateTs);

// 2. Update radiology.json to set the unique values
let radJson = fs.readFileSync('artifacts/api-server/scripts/department-templates/radiology.json', 'utf8');
let rad = JSON.parse(radJson);

for (const item of rad.catalog) {
  if (item.kind === 'clinical_work_subtype') {
    item.value = item.parentValue + ' - ' + item.name;
  }
}

fs.writeFileSync('artifacts/api-server/scripts/department-templates/radiology.json', JSON.stringify(rad, null, 2));
