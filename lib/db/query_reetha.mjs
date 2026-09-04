import pg from 'pg';
const { Client } = pg;
const client = new Client({ connectionString: 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });

async function run() {
  await client.connect();

  const usersRes = await client.query(`SELECT * FROM users WHERE full_name ILIKE '%Reetha%'`);
  console.log("Users:", JSON.stringify(usersRes.rows, null, 2));

  for (const user of usersRes.rows) {
    const studentsRes = await client.query(`SELECT * FROM students WHERE user_id = $1`, [user.id]);
    console.log(`Students for user ${user.id}:`, JSON.stringify(studentsRes.rows, null, 2));

    for (const student of studentsRes.rows) {
       const cases = await client.query(`SELECT * FROM case_logs WHERE student_id = $1`, [student.id]);
       console.log(`Case Logs for student ${student.id}:`, cases.rows.length, 'records');
       
       const procedures = await client.query(`SELECT * FROM procedure_logs WHERE student_id = $1`, [student.id]);
       console.log(`Procedure Logs for student ${student.id}:`, procedures.rows.length, 'records');

       const academic = await client.query(`SELECT * FROM academic_logs WHERE student_id = $1`, [student.id]);
       console.log(`Academic Logs for student ${student.id}:`, academic.rows.length, 'records');

       const leave = await client.query(`SELECT * FROM leave_records WHERE student_id = $1`, [student.id]);
       console.log(`Leave Records for student ${student.id}:`, leave.rows.length, 'records');
    }
  }

  await client.end();
}

run().catch(console.error);
