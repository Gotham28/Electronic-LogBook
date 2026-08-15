import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });

async function check() {
  await client.connect();
  const caseRes = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'case_logs' AND column_name = 'deleted_at'");
  console.log("case_logs table deleted_at:", caseRes.rows);

  const procRes = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'procedure_logs' AND column_name = 'deleted_at'");
  console.log("procedure_logs table deleted_at:", procRes.rows);
  
  await client.end();
}

check().catch(console.error);
