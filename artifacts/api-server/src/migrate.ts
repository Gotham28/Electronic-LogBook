import { pool } from "@workspace/db";
import { applyMigrations } from "../../../lib/db/src/migrations.js";

const connection = await pool.connect();
try {
  await applyMigrations(connection, process.argv.includes("--adopt-existing"));
  console.log("Database migrations completed.");
} catch (error: any) {
  // P0001 is an operator-facing preflight message, not SQL parameters or credentials.
  console.error(error?.code === "P0001" || !error?.code ? error.message : "Migration failed (" + error.code + "). Check schema compatibility and the deployment guide.");
  process.exitCode = 1;
} finally {
  connection.release();
  await pool.end();
}
