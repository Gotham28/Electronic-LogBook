import { db, departmentsTable, departmentCatalogTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

async function main() {
  const allDepts = await db.select().from(departmentsTable);
  let totalInserted = 0;

  for (const dept of allDepts) {
    const existingLeaveTypes = await db.select().from(departmentCatalogTable)
      .where(and(eq(departmentCatalogTable.departmentId, dept.id), eq(departmentCatalogTable.kind, "leave_type")));

    if (existingLeaveTypes.length === 0) {
      await db.insert(departmentCatalogTable).values([
        { departmentId: dept.id, kind: "leave_type", name: "Casual Leave", value: "casual", required: 0, period: "total" },
        { departmentId: dept.id, kind: "leave_type", name: "Academic Leave", value: "academic", required: 0, period: "total" },
        { departmentId: dept.id, kind: "leave_type", name: "Medical Leave", value: "medical", required: 0, period: "total" },
        { departmentId: dept.id, kind: "leave_type", name: "Maternity / Paternity Leave", value: "maternity_paternity", required: 0, period: "total" }
      ]);
      totalInserted += 4;
    } else {
      console.log(`Department ${dept.name} already has ${existingLeaveTypes.length} leave types. Skipping.`);
    }
  }

  console.log(`Done. Seeded ${totalInserted} leave types.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error seeding leave types:", err);
  process.exit(1);
});
