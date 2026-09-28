const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  const r = await pool.query('SELECT id, full_name, email, role FROM users WHERE id IN (3,4)');
  console.log('Accounts:', r.rows);
  // Sync the professor account name to match HOD
  await pool.query("UPDATE users SET full_name = 'Dr. Mohammed MTP' WHERE id = 4");
  console.log('Name synced on id=4');
  pool.end();
}
run().catch(console.error);
