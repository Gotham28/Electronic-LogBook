const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
const BASE = 'http://localhost:3000/api';

async function login(username, password) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Login failed ${username}: ${JSON.stringify(d)}`);
  const token = r.headers.get('set-cookie')?.match(/token=([^;]+)/)?.[1];
  return token;
}

async function req(method, path, token, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json', Cookie: `token=${token}` } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const text = await r.text();
  let d; try { d = JSON.parse(text); } catch { d = text; }
  return { status: r.status, data: d };
}

async function run() {
  // --- STEP 2: Delete test-fixture students ---
  console.log('=== STEP 2: Deleting fixtures ===');
  const fixtureStudents = [5, 6, 7, 8, 9];
  const fixtureUsers = [7, 9, 10, 11, 12];
  
  for (const sid of fixtureStudents) {
    const cl = await pool.query('SELECT COUNT(*) FROM case_logs WHERE student_id = $1', [sid]);
    const pl = await pool.query('SELECT COUNT(*) FROM procedure_logs WHERE student_id = $1', [sid]);
    const al = await pool.query('SELECT COUNT(*) FROM academic_logs WHERE student_id = $1', [sid]);
    const as = await pool.query('SELECT COUNT(*) FROM assessments WHERE student_id = $1', [sid]);
    const po = await pool.query('SELECT COUNT(*) FROM postings WHERE student_id = $1', [sid]);
    const lr = await pool.query('SELECT COUNT(*) FROM leave_records WHERE student_id = $1', [sid]);
    const sum = parseInt(cl.rows[0].count) + parseInt(pl.rows[0].count) + parseInt(al.rows[0].count) + 
                parseInt(as.rows[0].count) + parseInt(po.rows[0].count) + parseInt(lr.rows[0].count);
    if (sum !== 0) {
      console.log(`STOP: Non-zero count for student_id ${sid}`);
      pool.end(); return;
    }
  }
  
  console.log(`Counts 0 for all. Deleting students: ${fixtureStudents} and users: ${fixtureUsers}`);
  await pool.query('DELETE FROM students WHERE id = ANY($1)', [fixtureStudents]);
  await pool.query('DELETE FROM users WHERE id = ANY($1)', [fixtureUsers]);
  console.log('Deleted successfully.');


  // --- STEP 3: Test approve/reject end-to-end as HOD ---
  console.log('\\n=== STEP 3: HOD verifies a case log ===');
  // 1. Create a real test case_log
  const insertQuery = `
    INSERT INTO case_logs (student_id, supervisor_id, date, patient_uhid, patient_age, patient_gender, diagnosis_provisional, diagnosis_final, status)
    VALUES (14, 4, '2026-08-03', 'UHID-999', '5 months', 'Male', 'Test Diagnosis HOD Verify', 'Final Diagnosis Test', 'pending')
    RETURNING id
  `;
  const insertRes = await pool.query(insertQuery);
  const logId = insertRes.rows[0].id;
  console.log('Created test case_log id:', logId);

  // Print before status
  const beforeRes = await pool.query('SELECT id, status FROM case_logs WHERE id = $1', [logId]);
  console.log('Before DB state:', beforeRes.rows[0]);

  // 2. HOD login & hit verify route
  const hodToken = await login('hod@elogbook.com', 'password123');
  const verifyRes = await req('PATCH', `/logs/case/${logId}/review`, hodToken, {
    status: 'verified', reviewerId: 3 // HOD's id is 3
  });
  console.log('API PATCH status:', verifyRes.status);
  console.log('API response:', verifyRes.data);

  // 3. Print after status
  const afterRes = await pool.query('SELECT id, status FROM case_logs WHERE id = $1', [logId]);
  console.log('After DB state:', afterRes.rows[0]);

  // 4. Cleanup
  await pool.query('DELETE FROM case_logs WHERE id = $1', [logId]);
  console.log('Cleaned up test case_log.');


  // --- STEP 4: Confirm professor.ts changes ---
  console.log('\\n=== STEP 4: Professor fetches review queue ===');
  const profToken = await login('prof@elogbook.com', 'password123');
  const profQueueRes = await req('GET', '/professors/4/review-queue', profToken);
  console.log('API GET status:', profQueueRes.status);
  console.log('assignedMentees.length:', profQueueRes.data?.assignedMentees?.length);
  console.log('pendingReviews.length:', profQueueRes.data?.pendingReviews?.length);
  
  if (profQueueRes.data?.assignedMentees?.length) {
    console.log('Example assignedMentee:', profQueueRes.data.assignedMentees[0]);
  }

  pool.end();
}

run().catch(console.error);
