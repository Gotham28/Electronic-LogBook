const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  const r = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'leave_records'");
  console.log('Columns:', r.rows);
  
  const typeValues = await pool.query("SELECT DISTINCT leave_type FROM leave_records");
  console.log('Distinct leave_type values:', typeValues.rows);

  const statusValues = await pool.query("SELECT DISTINCT status FROM leave_records");
  console.log('Distinct status values:', statusValues.rows);

  const sample = await pool.query("SELECT * FROM leave_records LIMIT 1");
  console.log('Sample record:', sample.rows[0]);

  pool.end();
}
run().catch(console.error);
