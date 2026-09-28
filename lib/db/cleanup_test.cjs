const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
const BASE = 'http://localhost:3000/api';

async function req(method, path, token, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json', Cookie: 'token=' + token } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  const data = await r.json();
  return data;
}

async function run() {
  // 1. SELECT the row
  console.log('--- 1. Finding test row ---');
  const selRes = await pool.query("SELECT id, student_id, diagnosis_final, date FROM case_logs WHERE student_id = 14 AND diagnosis_final = 'Asthma' AND date = '2026-08-03'");
  console.log('Found rows:', selRes.rows);
  
  if (selRes.rows.length === 1) {
    const rowId = selRes.rows[0].id;
    console.log('\\n--- 2. Deleting row with id: ' + rowId + ' ---');
    await pool.query('DELETE FROM case_logs WHERE id = $1', [rowId]);
    
    // 3. Follow up select
    console.log('\\n--- 3. Verifying deletion ---');
    const checkRes = await pool.query('SELECT COUNT(*) FROM case_logs WHERE id = $1', [rowId]);
    console.log('Remaining count:', checkRes.rows[0].count);
    
    // 4. Checking dashboard API
    console.log('\\n--- 4. Checking API Badge Count ---');
    const r = await fetch(BASE + '/auth/login', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({username:'aravind@elogbook.com', password:'password123'})
    });
    const token = r.headers.get('set-cookie').match(/token=([^;]+)/)[1];
    
    const d = await req('GET', '/students/14/dashboard', token);
    const cCat = d.categories.find(c => c.id === 'cases');
    console.log('Case Logs count from API:', cCat.logged, '/', cCat.required);
  } else {
    console.log('Row not found or multiple found, aborting delete.');
  }

  pool.end();
}
run().catch(console.error);
