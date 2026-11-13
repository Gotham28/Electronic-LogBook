// Test-only module alias; never imported by the production build.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
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

export async function getTestCollegeId(): Promise<number> {
  const [college] = await db.select({ id: schema.collegesTable.id }).from(schema.collegesTable)
    .where(eq(schema.collegesTable.code, "kannur-medical-college")).limit(1);
  if (!college) throw new Error("Test college fixture is missing");
  return college.id;
}
