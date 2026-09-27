import { pool } from "@workspace/db";

async function main() {
  const connection = await pool.connect();
  try {
    console.log("Querying elogbook_migrations table...");
    const { rows } = await connection.query(
      "SELECT name, applied_at, checksum FROM elogbook_migrations ORDER BY name;"
    );
    
    if (rows.length === 0) {
      console.log("No migrations found in the tracking table.");
    } else {
      console.table(rows);
    }
  } catch (error: any) {
    console.error("Failed to query migrations:", error);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
