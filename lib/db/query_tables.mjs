import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });

async function check() {
  await client.connect();
  const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
  console.log("Tables in neondb:", res.rows.map(r=>r.table_name));
  
  const colRes = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name IN ('case_logs', 'procedure_logs') AND column_name = 'deleted_at'`);
  console.log("Columns deleted_at in case_logs/procedure_logs:", colRes.rows);

  const studentRes = await client.query(`SELECT id, full_name, role FROM users WHERE full_name ILIKE '%reetha%'`);
  console.log("Reetha in neondb:", studentRes.rows);

  await client.end();
}

check().catch(console.error);
