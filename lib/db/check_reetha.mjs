import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });

async function check() {
  await client.connect();
  const res = await client.query(`SELECT id, full_name, email, role, status FROM users WHERE full_name ILIKE '%reetha%'`);
  console.table(res.rows);
  await client.end();
}

check().catch(console.error);
