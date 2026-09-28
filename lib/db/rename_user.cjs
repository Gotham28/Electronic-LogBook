const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  const r = await pool.query("SELECT id, full_name, email, role FROM users WHERE full_name ILIKE '%anil%'");
  console.log('Found:', r.rows);

  if (r.rows.length > 0) {
    const id = r.rows[0].id;
    const update = await pool.query("UPDATE users SET full_name = 'Dr Anilkumar' WHERE id = $1 RETURNING id, full_name", [id]);
    console.log('Updated:', update.rows[0]);
  }
  pool.end();
}
run().catch(console.error);
