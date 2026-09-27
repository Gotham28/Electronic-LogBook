import { pool } from "@workspace/db";

async function main() {
  const connection = await pool.connect();
  try {
    console.log("Checking department_catalog for 'competency_level' rows...");
    const { rows } = await connection.query(
      "SELECT department_id, kind, name, value FROM department_catalog WHERE kind = 'competency_level' ORDER BY department_id, value;"
    );
    
    if (rows.length === 0) {
      console.log("No competency_level rows found in department_catalog.");
    } else {
      console.table(rows);
    }
  } catch (error: any) {
    console.error("Failed to query catalog:", error);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
