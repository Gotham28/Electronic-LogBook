import { db, departmentsTable, departmentConfigsTable, departmentLogbookSectionsTable, departmentCatalogTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { physiologyLogbook, defaultLogbookCategories, logbookSectionSettingsSchema,
  type AcademicLogbookProfile, type ManagedLogbookSection } from "@workspace/api-zod";

// Specialty-specific content is declarative configuration. Resolve the real
// department, so test departments inherit exactly the same forms and validation.
const profiles: AcademicLogbookProfile[] = [physiologyLogbook];

// The profile comes from the department's stored configuration (department_configs.academic_logbook_profile),
// never from its name or code. An unknown or missing value means no profile.
export function academicLogbookForDepartment(config: { academicLogbookProfile?: string | null } | null | undefined): AcademicLogbookProfile | null {
  const profileId = config?.academicLogbookProfile;
  return profileId ? profiles.find((profile) => profile.id === profileId) ?? null : null;
}

export async function getLogbookSectionConfiguration(configSourceId: number, database: Pick<typeof db, "select"> = db) {
  const [[department], [config], overrides, catalog] = await Promise.all([
    database.select({ id: departmentsTable.id }).from(departmentsTable).where(eq(departmentsTable.id, configSourceId)).limit(1),
    database.select({ academicLogbookProfile: departmentConfigsTable.academicLogbookProfile }).from(departmentConfigsTable)
      .where(eq(departmentConfigsTable.departmentId, configSourceId)).limit(1),
    database.select().from(departmentLogbookSectionsTable).where(eq(departmentLogbookSectionsTable.departmentId, configSourceId)),
    database.select().from(departmentCatalogTable).where(and(eq(departmentCatalogTable.departmentId, configSourceId), eq(departmentCatalogTable.kind, "academic"))),
  ]);
  if (!department) throw new Error("Department not found");
  const base = academicLogbookForDepartment(config);
  const categories = structuredClone(base?.navigationCategories ?? defaultLogbookCategories);
  const sections: ManagedLogbookSection[] = (base?.sections ?? []).map((section, index) => {
    const option = catalog.find((item) => item.value === section.value);
    return { ...section, name: section.name || section.value, multilineTopic: !!section.multilineTopic,
      categoryId: categories.find((category) => category.sectionValues.includes(section.value))?.id ?? categories[0].id,
      sortOrder: index, archived: false, required: option?.required ?? 0, period: option?.period ?? "total", revision: 0 };
  });
  for (const row of overrides) {
    const definition = logbookSectionSettingsSchema.parse(row.definition);
    const option = catalog.find((item) => item.value === row.value);
    const section = { ...definition, value: row.value, revision: row.revision,
      ...(!definition.archived && option ? { required: option.required, period: option.period } : {}) };
    const index = sections.findIndex((item) => item.value === row.value);
    if (index === -1) sections.push(section); else sections[index] = section;
  }
  sections.sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value));
  return { base, overrides, catalog, sections, categories };
}

export async function getAcademicLogbook(configSourceId: number): Promise<AcademicLogbookProfile | null> {
  const { base, overrides, catalog, sections, categories } = await getLogbookSectionConfiguration(configSourceId);
  if (!overrides.length) return base;
  for (const category of categories) category.sectionValues = sections.filter((section) => section.categoryId === category.id).map((section) => section.value);
  // Keep existing generic academic options reachable when a department first adds a structured logbook.
  if (!base) categories[0].sectionValues.push(...catalog.filter((item) => !sections.some((section) => section.value === item.value)).map((item) => item.value));
  return { ...(base ?? { id: "department", title: "Department logbook" }),
    sections: sections.map(({ categoryId, sortOrder, required, period, revision, ...section }) => section),
    navigationCategories: categories, legacySections: base?.sections };
}
