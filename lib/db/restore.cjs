const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  try {
    console.log('Restoring User 5...');
    await pool.query('INSERT INTO users (id, full_name, email, role, department_id, password_hash, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, status = EXCLUDED.status', [5, 'Anilkumar A', 'student@elogbook.com', 'professor', 2, '$2b$10$vz3Au01fm2X69OKdm.MhE.4VrHSviWFl7WaVjkZODoEC3PawL/Qa.', 'approved', '2026-07-31T13:20:29.776Z']);
    const caseLogs = await pool.query('SELECT id FROM case_logs WHERE id = 6');
    console.log('case_logs id=6 count:', caseLogs.rows.length);
    const students = await pool.query('SELECT id FROM students WHERE id = 15');
    console.log('students id=15 count:', students.rows.length);
    const users = await pool.query('SELECT * FROM users WHERE id = 5');
    console.log('users id=5:', users.rows[0]);
  } catch(e) { console.error(e); } finally { pool.end(); }
}
run();
