import pg from 'pg';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_t7ABFJElCLc4@ep-misty-voice-az3z4ls8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require' });

async function run() {
  try {
    // Delete hod.ts
    const hodTsPath = path.join(__dirname, 'src', 'routes', 'hod.ts');
    if (fs.existsSync(hodTsPath)) {
      fs.unlinkSync(hodTsPath);
      console.log('Deleted hod.ts');
    }

    const depts = await pool.query('SELECT id, name, code FROM departments ORDER BY id');
    console.log('--- Step 1 ---');
    console.log('Departments:', depts.rows);
    const paedDept = depts.rows.find(d => d.code === 'PAED');
    const deptId = paedDept ? paedDept.id : 2;
    console.log('Resolved Pediatrics department ID:', deptId);

    // Update user 5 to department_id
    await pool.query('UPDATE users SET department_id = $1 WHERE id = 5', [deptId]);
    console.log('Updated user 5 to department_id:', deptId);

    // Step 2: reset user 5 password
    const hash = await bcrypt.hash('password123', 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = 5', [hash]);
    console.log('--- Step 2 ---');
    console.log('Reset password for user id 5 to password123.');

    console.log('--- Step 5 ---');
    // Check hod@elogbook.com
    const existingHod = await pool.query('SELECT * FROM users WHERE email = \'hod@elogbook.com\'');
    if (existingHod.rows.length > 0) {
      await pool.query('UPDATE users SET full_name = $1, department_id = $2 WHERE id = $3', ['Dr. Mohammed MTP', deptId, existingHod.rows[0].id]);
      console.log('Renamed hod@elogbook.com to Dr. Mohammed MTP (id:', existingHod.rows[0].id, ')');
    } else {
      await pool.query('INSERT INTO users (full_name, email, role, department_id, password_hash, status) VALUES ($1, $2, $3, $4, $5, $6)', ['Dr. Mohammed MTP', 'mohammed.mtp@elogbook.com', 'hod', deptId, hash, 'approved']);
      console.log('Inserted Dr. Mohammed MTP as HOD.');
    }

    const professors = [
      'Radhamani K V', 'Reetha G', 'Urmila K V', 'Kavitha Pavithran', 
      'Ambili Susan Jacob', 'Jijesh A', 'Ravikumar P', 'Radhakrishnan V V'
    ];

    for (const p of professors) {
      const email = p.split(' ')[0].toLowerCase() + '@elogbook.com';
      // Check if exists
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length === 0) {
        await pool.query('INSERT INTO users (full_name, email, role, department_id, password_hash, status) VALUES ($1, $2, $3, $4, $5, $6)', [p, email, 'professor', deptId, hash, 'approved']);
        console.log('Inserted Professor:', p, '| Email:', email, '| Password: password123');
      } else {
        console.log('Professor already exists:', p, '| Email:', email);
      }
    }

  } catch(e) { console.error(e); } finally { pool.end(); }
}
run();
