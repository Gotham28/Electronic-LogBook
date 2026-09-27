import { db, departmentCatalogTable, departmentConfigsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";

async function main() {
  console.log("Starting Dermatology (dept 15) config seed...");
  
  const departmentId = 15;
  const newCategories = [
    { name: "Long Case", value: "long_case" },
    { name: "Short Case", value: "short_case" },
    { name: "HD Case", value: "hd_case" },
    { name: "STD Case", value: "std_case" }
  ];

  let insertedCount = 0;
  for (const cat of newCategories) {
    const result = await db.execute(sql`
      INSERT INTO ${departmentCatalogTable} (department_id, kind, name, value)
      VALUES (${departmentId}, 'case_category', ${cat.name}, ${cat.value})
      ON CONFLICT (department_id, kind, value) DO NOTHING
    `);
    if (result.rowCount && result.rowCount > 0) {
      insertedCount += result.rowCount;
    }
  }

  console.log(`Inserted ${insertedCount} new case categories for Dermatology.`);

  const conferenceLevels = [
    { name: "Regional", value: "regional" },
    { name: "State", value: "state" },
    { name: "National", value: "national" },
    { name: "International", value: "international" }
  ];

  let insertedConferenceLevelsCount = 0;
  for (const level of conferenceLevels) {
    const result = await db.execute(sql`
      INSERT INTO ${departmentCatalogTable} (department_id, kind, name, value, required)
      VALUES (${departmentId}, 'conference_level', ${level.name}, ${level.value}, 0)
      ON CONFLICT (department_id, kind, value) DO NOTHING
    `);
    if (result.rowCount && result.rowCount > 0) {
      insertedConferenceLevelsCount += result.rowCount;
    }
  }

  console.log(`Inserted ${insertedConferenceLevelsCount} new conference levels for Dermatology.`);

  // Update the config features to use the new labels
  const [config] = await db.select().from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, departmentId));
  
  if (config) {
    const enabledFeatures = (config.enabledFeatures as Record<string, boolean>) || {};
    enabledFeatures.useCaseTypeLabel = true;
    enabledFeatures.useThesisAndPublicationsLabel = true;
    enabledFeatures.awards = true;
    enabledFeatures.hideConferenceLocation = true;
    enabledFeatures.conferenceLevels = true;
    enabledFeatures.academicActivityExtras = true;
    enabledFeatures.freeTextPostingUnit = true;
    
    await db.update(departmentConfigsTable)
      .set({ enabledFeatures })
      .where(eq(departmentConfigsTable.departmentId, departmentId));
      
    console.log("Updated enabledFeatures for Dermatology with scoped labels.");
  } else {
    console.log("No config found for Dermatology, skipping enabledFeatures update.");
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
