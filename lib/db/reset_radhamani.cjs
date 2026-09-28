const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
const bcrypt = require('bcryptjs');

async function run() {
  const hash = await bcrypt.hash('password123', 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, 'radhamani@elogbook.com']);
  console.log('Password reset to password123 for radhamani@elogbook.com');
  pool.end();
}
run().catch(console.error);
