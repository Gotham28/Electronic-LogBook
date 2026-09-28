import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, departmentsTable, departmentConfigsTable, departmentCatalogTable, departmentPostingScheduleTable } from "@workspace/db";
import { recomputeCatalogRequirements } from "./department-requirements.js";

const templateKinds = ["posting", "academic", "case_category", "clinical_work_category"] as const;

export const departmentTemplateSchema = z.object({
  features: z.record(z.string(), z.boolean()).default({}),
  catalog: z.array(z.object({ kind: z.enum(templateKinds), name: z.string().trim().min(1).max(160),
    required: z.number().int().min(0).max(100000).default(0) }).strict()).default([]),
  postingSchedule: z.array(z.object({ trainingYear: z.number().int().positive(), posting: z.string().trim().min(1).max(160),
    months: z.number().int().positive() }).strict()).default([]),
}).strict().superRefine((template, ctx) => {
  const postings = new Set(template.catalog.filter((item) => item.kind === "posting").map((item) => item.name));
  template.postingSchedule.forEach((row, index) => {
    if (!postings.has(row.posting)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["postingSchedule", index, "posting"], message: `"${row.posting}" is not a posting in this template` });
    }
  });
});
export type DepartmentTemplate = z.infer<typeof departmentTemplateSchema>;

export type ApplyTemplateOptions = {
  departmentId: number;
  expectName: string;
  template?: DepartmentTemplate;
  set?: Record<string, boolean>;
  apply: boolean;
};

export type ApplyTemplateResult = {
  departmentName: string;
  applied: boolean;
  featuresBefore: Record<string, boolean>;
  featuresAfter: Record<string, boolean>;
  catalogAdded: number;
  catalogAlreadyPresent: number;
  scheduleRowsWritten: number;
};

class DryRun extends Error {}

// Adds what is missing and merges feature flags; never deletes or replaces existing rows or flags.
export async function applyDepartmentTemplate(options: ApplyTemplateOptions): Promise<ApplyTemplateResult> {
  const { departmentId, expectName, template, set = {}, apply } = options;
  let result: ApplyTemplateResult | undefined;
  try {
    await db.transaction(async (tx) => {
      const [department] = await tx.select({ name: departmentsTable.name, configSourceDepartmentId: departmentsTable.configSourceDepartmentId })
        .from(departmentsTable).where(eq(departmentsTable.id, departmentId)).limit(1);
      if (!department) throw new Error(`Department ${departmentId} does not exist`);
      if (department.name !== expectName) {
        throw new Error(`Department ${departmentId} is named "${department.name}", not "${expectName}". Nothing was changed.`);
      }
      if (department.configSourceDepartmentId !== null) {
        throw new Error(`Department ${departmentId} is a test department that mirrors another department's settings. Apply the template to the real department instead.`);
      }

      const flags = { ...(template?.features ?? {}), ...set };
      const [existing] = await tx.select({ enabledFeatures: departmentConfigsTable.enabledFeatures })
        .from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, departmentId)).limit(1);
      const featuresBefore = (existing?.enabledFeatures ?? {}) as Record<string, boolean>;
      if (existing) {
        await tx.update(departmentConfigsTable)
          .set({ enabledFeatures: sql`COALESCE(${departmentConfigsTable.enabledFeatures}, '{}'::jsonb) || ${JSON.stringify(flags)}::jsonb` })
          .where(eq(departmentConfigsTable.departmentId, departmentId));
      } else {
        await tx.insert(departmentConfigsTable).values({ departmentId, enabledFeatures: { procedureExperience: true, ...flags } });
      }
      const [after] = await tx.select({ enabledFeatures: departmentConfigsTable.enabledFeatures })
        .from(departmentConfigsTable).where(eq(departmentConfigsTable.departmentId, departmentId)).limit(1);

      let catalogAdded = 0;
      for (const item of template?.catalog ?? []) {
        const inserted = await tx.insert(departmentCatalogTable)
          .values({ departmentId, kind: item.kind, name: item.name, value: item.name, required: item.required, period: "total" })
          .onConflictDoNothing({ target: [departmentCatalogTable.departmentId, departmentCatalogTable.kind, departmentCatalogTable.value] })
          .returning({ id: departmentCatalogTable.id });
        catalogAdded += inserted.length;
      }

      let scheduleRowsWritten = 0;
      for (const [index, row] of (template?.postingSchedule ?? []).entries()) {
        const [posting] = await tx.select({ id: departmentCatalogTable.id }).from(departmentCatalogTable).where(and(
          eq(departmentCatalogTable.departmentId, departmentId), eq(departmentCatalogTable.kind, "posting"),
          eq(departmentCatalogTable.value, row.posting))).limit(1);
        if (!posting) throw new Error(`Posting "${row.posting}" is not in this department's catalog`);
        const written = await tx.insert(departmentPostingScheduleTable)
          .values({ departmentId, trainingYear: row.trainingYear, postingValue: row.posting, months: row.months, sortOrder: index })
          .onConflictDoUpdate({
            target: [departmentPostingScheduleTable.departmentId, departmentPostingScheduleTable.trainingYear, departmentPostingScheduleTable.postingValue],
            set: { months: row.months, sortOrder: index },
          }).returning({ id: departmentPostingScheduleTable.id });
        scheduleRowsWritten += written.length;
      }

      result = {
        departmentName: department.name, applied: apply, featuresBefore,
        featuresAfter: (after?.enabledFeatures ?? {}) as Record<string, boolean>,
        catalogAdded, catalogAlreadyPresent: (template?.catalog.length ?? 0) - catalogAdded, scheduleRowsWritten,
      };
      if (!apply) throw new DryRun();
    });
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  // The department totals are sums of catalog targets. Without this, a department set up from a
  // template keeps an empty total, which the HOD page showed as "Not tracked".
  if (apply) await recomputeCatalogRequirements(departmentId);
  return result!;
}
