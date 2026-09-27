import { pool } from "@workspace/db";

async function main() {
  const connection = await pool.connect();
  try {
    const { rows } = await connection.query(
      "SELECT department_id, enabled_features FROM department_configs WHERE department_id = 15;"
    );
    console.log("Final enabledFeatures state for Dermatology (dept 15):");
    console.dir(rows[0]?.enabled_features, { depth: null });
  } catch (error: any) {
    console.error("Failed to query config:", error);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
