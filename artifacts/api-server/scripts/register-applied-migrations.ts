import { pool } from "@workspace/db";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

async function main() {
  const connection = await pool.connect();
  const directory = fileURLToPath(new URL("../../../lib/db/migrations/", import.meta.url));
  const migrationsToRegister = [
    "0009_review_status.sql",
    "0010_quarterly_appraisal_scores.sql"
  ];

  try {
    for (const name of migrationsToRegister) {
      const sql = await readFile(resolve(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql.replaceAll("\r\n", "\n")).digest("hex");
      
      const { rows: existing } = await connection.query(
        "SELECT 1 FROM elogbook_migrations WHERE name = $1", 
        [name]
      );

      if (existing.length > 0) {
        console.log(`Migration ${name} is already registered.`);
      } else {
        await connection.query(
          "INSERT INTO elogbook_migrations (name, checksum) VALUES ($1, $2)",
          [name, checksum]
        );
        console.log(`Successfully registered ${name} with checksum ${checksum}`);
      }
    }
  } catch (error: any) {
    console.error("Failed to register migrations:", error);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
