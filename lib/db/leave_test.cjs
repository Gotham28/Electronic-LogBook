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
  console.log('=== Final Verification ===');
  
  // Pick real student
  // 'aravind@elogbook.com' is a student, let's login
  const studentToken = await login('aravind@elogbook.com', 'password123');
  // His studentProfileId is 14
  const studentProfileId = 14;

  // Let's create an approved casual leave for this student.
  const insertQuery = `
    INSERT INTO leave_records (student_id, leave_type, start_date, end_date, reason, status, reviewed_by, reviewed_at, created_at)
    VALUES ($1, 'casual', '2026-08-01', '2026-08-05', 'Test Leave', 'approved', 3, NOW(), NOW())
    RETURNING id
  `;
  const insertRes = await pool.query(insertQuery, [studentProfileId]);
  const leaveId = insertRes.rows[0].id;
  console.log(`Created 5-day test casual leave record (id: ${leaveId}).`);

  // Verify the route returns 5 for casual used
  console.log('Fetching /leave-balance via API...');
  const balanceRes = await req('GET', `/students/${studentProfileId}/leave-balance`, studentToken);
  console.log('Status:', balanceRes.status);
  console.log('Balance data:', balanceRes.data);

  // Assert casual used is at least 5
  if (balanceRes.data?.casual?.used >= 5) {
    console.log('Success: Casual used is computed correctly (>= 5 days).');
  } else {
    console.log('Failed: Casual used is', balanceRes.data?.casual?.used);
  }

  // Cleanup
  console.log(`Deleting test leave record (id: ${leaveId})...`);
  await pool.query('DELETE FROM leave_records WHERE id = $1', [leaveId]);

  // Verify it's gone
  const checkRes = await pool.query('SELECT COUNT(*) FROM leave_records WHERE id = $1', [leaveId]);
  console.log(`Remaining count for leave_id ${leaveId}:`, checkRes.rows[0].count);

  pool.end();
}
run().catch(console.error);
