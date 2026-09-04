import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });

async function check() {
  await client.connect();
  const query = `
    SELECT table_name, column_name 
    FROM information_schema.columns 
    WHERE table_name IN ('case_logs', 'procedure_logs') 
    AND column_name = 'deleted_at';
  `;
  const res = await client.query(query);
  console.table(res.rows);
  await client.end();
}

check().catch(console.error);
