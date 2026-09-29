import postgres from 'postgres';
import fs from 'fs';
const sql = postgres(process.env.DATABASE_URL);
async function run() {
  const query = fs.readFileSync('generate_missing.sql', 'utf8');
  await sql.unsafe(query);
  console.log('Successfully ran the SQL script.');
  process.exit(0);
}
run();
