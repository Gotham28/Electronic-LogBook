// Comprehensive final verification script
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
const BASE = 'http://localhost:3000/api';

async function get(path, token) {
  const r = await fetch(BASE + path, { headers: { Cookie: 'token=' + token } });
  return { status: r.status, data: await r.json() };
}
async function post(path, token, body) {
  const r = await fetch(BASE + path, { method:'POST', headers:{'Content-Type':'application/json', Cookie:'token='+token}, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
async function login(email, pw) {
  const r = await fetch(BASE + '/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username:email, password:pw}) });
  const cookie = r.headers.get('set-cookie');
  if (!cookie) { console.log('  LOGIN FAILED for', email); return null; }
  return cookie.match(/token=([^;]+)/)[1];
}

async function run() {
  console.log('===========================================');
  console.log('   FINAL SYSTEM VERIFICATION REPORT');
  console.log('===========================================\n');

  // ---- DATABASE STATE ----
  console.log('--- [DB] Users ---');
  const users = await pool.query("SELECT id, full_name, email, role FROM users ORDER BY id");
  users.rows.forEach(u => console.log(`  id=${u.id} | ${u.full_name} | ${u.email} | ${u.role}`));

  console.log('\n--- [DB] department_configs ---');
  const cfg = await pool.query("SELECT * FROM department_configs WHERE department_id = '2'");
  console.log(' ', JSON.stringify(cfg.rows[0]));

  console.log('\n--- [DB] leave_records (all) ---');
  const leaves = await pool.query("SELECT id, student_id, leave_type, start_date, end_date, status FROM leave_records ORDER BY id");
  if (leaves.rows.length === 0) console.log('  (none)');
  leaves.rows.forEach(l => console.log(`  id=${l.id} | student=${l.student_id} | ${l.leave_type} | ${l.start_date}->${l.end_date} | ${l.status}`));

  console.log('\n--- [DB] assessments (all) ---');
  const asmt = await pool.query("SELECT id, student_id, exam_name, marks FROM assessments ORDER BY id");
  if (asmt.rows.length === 0) console.log('  (none)');
  asmt.rows.forEach(a => console.log(`  id=${a.id} | student=${a.student_id} | ${a.exam_name} | marks=${a.marks}`));

  console.log('\n--- [DB] case_logs count per student ---');
  const caseCounts = await pool.query("SELECT student_id, COUNT(*) FROM case_logs GROUP BY student_id ORDER BY student_id");
  caseCounts.rows.forEach(r => console.log(`  student_id=${r.student_id}: ${r.count} case logs`));

  // ---- STUDENT ROLE ----
  console.log('\n--- [AUTH] Student login (Aravind P) ---');
  const studentToken = await login('aravind@elogbook.com', 'password123');
  console.log('  Token obtained:', !!studentToken);

  if (studentToken) {
    const dash = await get('/students/14/dashboard', studentToken);
    console.log('\n--- [API] Student dashboard (id=14) ---');
    console.log('  Status:', dash.status);
    dash.data.categories?.forEach(c => console.log(`  ${c.id}: logged=${c.logged} required=${c.required} verified=${c.verified}`));

    const balance = await get('/students/14/leave-balance', studentToken);
    console.log('\n--- [API] Leave balance (student own) ---');
    console.log('  Status:', balance.status, '| data:', JSON.stringify(balance.data));

    const leaveRec = await get('/students/14/leave-records', studentToken);
    console.log('\n--- [API] Leave records response shape ---');
    console.log('  Status:', leaveRec.status, '| wrapped in {data:[]}:', Array.isArray(leaveRec.data?.data), '| count:', leaveRec.data?.data?.length ?? 0);

    const assessments = await get('/students/14/assessments', studentToken);
    console.log('\n--- [API] Assessments (student view) ---');
    console.log('  Status:', assessments.status, '| count:', Array.isArray(assessments.data) ? assessments.data.length : assessments.data);
  }

  // ---- PROFESSOR ROLE ----
  console.log('\n--- [AUTH] Professor login (Dr. Mohammed) ---');
  const profToken = await login('prof@elogbook.com', 'password123');
  console.log('  Token obtained:', !!profToken);

  if (profToken) {
    const queue = await get('/professors/4/review-queue', profToken);
    console.log('\n--- [API] Professor review-queue (id=4) ---');
    console.log('  Status:', queue.status, '| items:', Array.isArray(queue.data) ? queue.data.length : JSON.stringify(queue.data).slice(0,80));

    const asmtPost = await post('/students/14/assessments', profToken, { examName:'FinalVerificationTest', marks:99, type:'quarterly', date:'2026-08-03', studentId:14 });
    console.log('\n--- [API] Professor create assessment (should 201) ---');
    console.log('  Status:', asmtPost.status, asmtPost.status === 201 ? 'PASS' : 'FAIL');
    if (asmtPost.status === 201) {
      // Clean up test assessment immediately
      await pool.query("DELETE FROM assessments WHERE exam_name = 'FinalVerificationTest'");
      console.log('  Test assessment cleaned up.');
    }
  }

  // ---- HOD ROLE ----
  console.log('\n--- [AUTH] HOD login ---');
  const hodToken = await login('hod@elogbook.com', 'password123');
  console.log('  Token obtained:', !!hodToken);

  if (hodToken) {
    const roster = await get('/admin/roster', hodToken);
    console.log('\n--- [API] HOD roster (dept-scoped) ---');
    console.log('  Status:', roster.status, '| students:', roster.data?.students?.length, '| professors:', roster.data?.professors?.length);

    const hodQueue = await get('/professors/3/review-queue', hodToken);
    console.log('\n--- [API] HOD review-queue access ---');
    console.log('  Status:', hodQueue.status, Array.isArray(hodQueue.data) ? `| items: ${hodQueue.data.length}` : '');
  }

  // ---- CLEANUP CHECK ----
  console.log('\n--- [DB] Stray test data check ---');
  const testCase = await pool.query("SELECT COUNT(*) FROM case_logs WHERE diagnosis_final = 'Asthma' AND date = '2026-08-03'");
  console.log('  Asthma test case log (should be 0):', testCase.rows[0].count, testCase.rows[0].count === '0' ? 'PASS' : 'FAIL');
  const testLeaveR = await pool.query("SELECT COUNT(*) FROM leave_records WHERE reason LIKE 'Test Leave'");
  console.log('  Test leave records (should be 0):', testLeaveR.rows[0].count, testLeaveR.rows[0].count === '0' ? 'PASS' : 'FAIL');

  console.log('\n===========================================');
  console.log('   VERIFICATION COMPLETE');
  console.log('===========================================');

  pool.end();
}
run().catch(console.error);
