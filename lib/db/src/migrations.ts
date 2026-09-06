import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

interface MigrationConnection {
  query(sql: string, values?: any[]): Promise<{ rows: any[] }>;
}

// The caller supplies one dedicated connection. Never use a pool-level query for transactions.
export async function applyMigrations(connection: MigrationConnection, adoptExisting = false) {
  const directory = fileURLToPath(new URL("../migrations/", import.meta.url));
  const files = ["0001_baseline.sql", "0002_departments_assignments.sql"];
  await connection.query("BEGIN");
  try {
    await connection.query("SELECT pg_advisory_xact_lock(hashtext('elogbook-schema-migrations'))");
    await connection.query("CREATE TABLE IF NOT EXISTS elogbook_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const name of files) {
      const sql = await readFile(resolve(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql.replaceAll("\r\n", "\n")).digest("hex");
      const { rows: applied } = await connection.query("SELECT checksum FROM elogbook_migrations WHERE name = $1", [name]);
      if (applied.length) {
        if (applied[0].checksum !== checksum) throw new Error("Applied migration checksum differs: " + name);
        continue;
      }
      const { rows: existing } = await connection.query("SELECT to_regclass('public.users') AS users");
      if (name === files[0] && existing[0].users) {
        if (!adoptExisting) throw new Error("Legacy schema found. Back up and inspect it, then rerun with --adopt-existing.");
        // Adoption is explicit. The upgrade fails and rolls back on an incompatible schema.
      } else {
        await connection.query(sql);
      }
      await connection.query("INSERT INTO elogbook_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
    }
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  }
}
