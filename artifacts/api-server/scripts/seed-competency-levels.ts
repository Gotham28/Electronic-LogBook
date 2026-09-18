import { db, departmentsTable, departmentCatalogTable } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Starting competency level seed migration...");
  
  const departments = await db.select({ id: departmentsTable.id }).from(departmentsTable);
  console.log(`Found ${departments.length} departments.`);

  const defaultLevels = [
    { name: "Observed", value: "observed" },
    { name: "Assisted", value: "assisted" },
    { name: "Performed under supervision", value: "performed_under_supervision" },
    { name: "Performed independently", value: "performed_independently" }
  ];

  let insertedCount = 0;

  for (const dept of departments) {
    for (const level of defaultLevels) {
      // Insert with ON CONFLICT DO NOTHING to ensure idempotency
      const result = await db.execute(sql`
        INSERT INTO ${departmentCatalogTable} (department_id, kind, name, value)
        VALUES (${dept.id}, 'competency_level', ${level.name}, ${level.value})
        ON CONFLICT (department_id, kind, value) DO NOTHING
      `);
      if (result.rowCount && result.rowCount > 0) {
        insertedCount += result.rowCount;
      }
    }
  }

  console.log(`Seed complete. Inserted ${insertedCount} competency_level rows.`);
  process.exit(0);
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
