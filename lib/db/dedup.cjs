const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });

async function queryCount(table, col, ids) {
  try {
    const res = await pool.query('SELECT COUNT(*) FROM ' + table + ' WHERE ' + col + ' = ANY($1)', [ids]);
    return parseInt(res.rows[0].count);
  } catch(e) { 
    if (e.code === '42703' && col === 'reviewed_by') {
      return queryCount(table, 'supervisor_id', ids);
    }
    return 0; 
  }
}

async function run() {
  try {
    console.log('--- STEP 1 ---');
    const logs = ['case_logs', 'procedure_logs', 'academic_logs'];
    
    let total3 = 0, total22 = 0;
    
    for (const table of logs) {
      total3 += await queryCount(table, 'reviewed_by', [3]);
      total22 += await queryCount(table, 'reviewed_by', [22]);
    }
    
    total3 += await queryCount('leave_records', 'reviewed_by', [3]);
    total22 += await queryCount('leave_records', 'reviewed_by', [22]);
    
    total3 += await queryCount('assessments', 'assessor_id', [3]);
    total22 += await queryCount('assessments', 'assessor_id', [22]);
    
    total3 += await queryCount('postings', 'supervisor_id', [3]);
    total22 += await queryCount('postings', 'supervisor_id', [22]);
    
    console.log('ID 3 Activity Total:', total3);
    console.log('ID 22 Activity Total:', total22);
    
    const dates = await pool.query('SELECT id, email, created_at FROM users WHERE id IN (3, 22)');
    console.log('Created dates:', dates.rows);
    
    let winner, loser;
    if (total3 > total22) { winner = 3; loser = 22; }
    else if (total22 > total3) { winner = 22; loser = 3; }
    else {
      const u3 = dates.rows.find(u => u.id === 3);
      const u22 = dates.rows.find(u => u.id === 22);
      if (new Date(u3.created_at) < new Date(u22.created_at)) { winner = 3; loser = 22; }
      else { winner = 22; loser = 3; }
    }
    
    console.log('Winner:', winner, '| Loser:', loser);
    
    // Check if reassignment is needed
    let reassigned = false;
    const loserTotal = (loser === 3 ? total3 : total22);
    if (loserTotal > 0) {
      console.log('Reassigning', loserTotal, 'logs from loser to winner...');
      for (const table of logs) {
        try { await pool.query('UPDATE ' + table + ' SET reviewed_by = $1 WHERE reviewed_by = $2', [winner, loser]); } catch(e) {
          try { await pool.query('UPDATE ' + table + ' SET supervisor_id = $1 WHERE supervisor_id = $2', [winner, loser]); } catch(e2) {}
        }
      }
      try { await pool.query('UPDATE leave_records SET reviewed_by = $1 WHERE reviewed_by = $2', [winner, loser]); } catch(e){}
      try { await pool.query('UPDATE assessments SET assessor_id = $1 WHERE assessor_id = $2', [winner, loser]); } catch(e){}
      try { await pool.query('UPDATE postings SET supervisor_id = $1 WHERE supervisor_id = $2', [winner, loser]); } catch(e){}
      reassigned = true;
    }
    
    await pool.query('DELETE FROM users WHERE id = $1', [loser]);
    console.log('Deleted duplicate HOD (id:', loser, ')');
    
    console.log('--- STEP 2 ---');
    const stray = [1, 8, 20];
    let strayCount = 0;
    for (const table of logs) {
      strayCount += await queryCount(table, 'reviewed_by', stray);
    }
    if (strayCount > 0) {
      console.log('STOP: Stray accounts have', strayCount, 'logs tied to them!');
    } else {
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [stray]);
      console.log('Deleted stray accounts:', stray);
    }
    
  } catch(e) { console.error(e); } finally { pool.end(); }
}
run();
