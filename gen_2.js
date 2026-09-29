const fs = require('fs');
const r = JSON.parse(fs.readFileSync('artifacts/api-server/scripts/department-templates/radiology.json', 'utf8'));

let sql = 'INSERT INTO department_catalog (department_id, kind, name, value, parent_value) VALUES\n';
const rows = [];
const depts = [18, 19];

for (const d of depts) {
  for (const item of r.catalog) {
    if (item.kind === 'clinical_work_category' || item.kind === 'clinical_work_subtype') {
      const parent = item.parentValue ? `'${item.parentValue.replace(/'/g, "''")}'` : 'NULL';
      rows.push(`(${d}, '${item.kind}', '${item.name.replace(/'/g, "''")}', '${item.name.replace(/'/g, "''")}', ${parent})`);
    }
  }
}

sql += rows.join(',\n') + '\nON CONFLICT (department_id, kind, value) DO NOTHING;';
fs.writeFileSync('generate_missing.sql', sql);
