import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });

async function check() {
  await client.connect();
  console.log("Deleting student profile...");
  await client.query(`DELETE FROM students WHERE user_id = 14`);
  console.log("Deleting user account...");
  await client.query(`DELETE FROM users WHERE id = 14`);
  console.log("Deleted Reetha G (student) successfully!");
  await client.end();
}

check().catch(console.error);
