const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });
async function run() {
  // Re-assign reviewers
  await pool.query('UPDATE case_logs SET reviewed_by = 3 WHERE reviewed_by = 4');
  await pool.query('UPDATE procedure_logs SET reviewed_by = 3 WHERE reviewed_by = 4');
  await pool.query('UPDATE academic_logs SET reviewed_by = 3 WHERE reviewed_by = 4');
  
  console.log('Reviewer dependencies re-assigned to id=3');

  // Now delete user 4
  await pool.query('DELETE FROM users WHERE id = 4');
  console.log('User id=4 deleted.');
  
  pool.end();
}
run().catch(console.error);
