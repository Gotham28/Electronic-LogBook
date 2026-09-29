import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function run() {
  try {
    const updates = [
      ["Seminar / Symposium (1/wk)", "Seminar / Symposium"],
      ["Group discussion (2/wk)", "Group discussion"],
      ["Journal club (1-2/wk)", "Journal club"],
    ];

    for (const [oldName, newName] of updates) {
      await db.execute(sql.raw(`
        UPDATE department_catalog
        SET name = '${newName}', value = '${newName}'
        WHERE kind = 'academic' AND name = '${oldName}' AND department_id IN (18, 19)
      `));
    }
    
    // Fix CPC specifically using LIKE because of the broken characters
    await db.execute(sql.raw(`
      UPDATE department_catalog
      SET name = 'CPC - Clinico-Pathological Conference', value = 'CPC - Clinico-Pathological Conference'
      WHERE kind = 'academic' AND name LIKE 'CPC %' AND department_id IN (18, 19)
    `));

    console.log("Successfully ran the DB fix script for academics.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
