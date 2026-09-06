// Test-only module alias; never imported by the production build.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../../lib/db/src/schema/index.js";
export const engine = new PGlite();
export const db = drizzle(engine, { schema });
// PGlite.query uses extended query protocol; migration batches use its simple protocol.
export const migrationConnection = (database: PGlite) => ({
  query: async (sql: string, values?: any[]) => values
    ? database.query(sql, values)
    : ((await database.exec(sql)).at(-1) || { rows: [] }),
});
export const pool = { end: () => engine.close() };
export * from "../../../lib/db/src/schema/index.js";
