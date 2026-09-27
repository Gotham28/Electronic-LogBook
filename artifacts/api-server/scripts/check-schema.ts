import { pool } from "@workspace/db";

async function main() {
  const connection = await pool.connect();
  try {
    const tables = [
      "awards"
    ];

    for (const table of tables) {
      console.log(`\n--- Schema for table: ${table} ---`);
      const { rows } = await connection.query(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY column_name;",
        [table]
      );
      
      if (rows.length === 0) {
        console.log(`Table '${table}' not found or has no columns.`);
      } else {
        console.table(rows);
      }
    }

  } catch (error: any) {
    console.error("Failed to query schema:", error);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
