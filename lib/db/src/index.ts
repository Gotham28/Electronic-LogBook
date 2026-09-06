import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { readFileSync } from "node:fs";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const databaseUrl = new URL(process.env.DATABASE_URL);
const sslMode = process.env.PGSSLMODE || databaseUrl.searchParams.get("sslmode");
const useTls = sslMode ? sslMode !== "disable" : process.env.NODE_ENV === "production";
if (!useTls && process.env.NODE_ENV === "production") throw new Error("Database TLS is required in production");
// pg connection-string SSL options otherwise override the verified TLS configuration below.
for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) databaseUrl.searchParams.delete(key);
const ca = process.env.PGSSLROOTCERT ? readFileSync(process.env.PGSSLROOTCERT, "utf8") : undefined;

export const pool = new Pool({ 
  connectionString: databaseUrl.toString(),
  ssl: useTls ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : undefined,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
