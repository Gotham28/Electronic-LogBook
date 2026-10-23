import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq, sum } from "drizzle-orm";
import { db, departmentsTable, departmentCatalogTable, departmentConfigsTable, departmentLogbookSectionsTable } from "@workspace/db";
import { logbookSectionSettingsSchema, type LogbookSectionSettings } from "@workspace/api-zod";
import { requireAuth, requireRole, requireDepartment } from "../middlewares/auth.js";
import { validate } from "../lib/validation.js";
import { resolveConfigDepartmentId } from "../lib/department-config-source.js";
import { getLogbookSectionConfiguration } from "../lib/academic-logbook.js";

const router = Router();
router.use(requireAuth, requireRole(["hod"]), requireDepartment);

router.get("/", async (req, res) => {
  try {
    const sourceId = await resolveConfigDepartmentId(req.user!.departmentId!);
    const { sections, categories } = await getLogbookSectionConfiguration(sourceId);
    res.json({ sections, categories, readOnly: sourceId !== req.user!.departmentId });
  } catch {
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error loading logbook section settings");
    res.status(500).json({ message: "Could not load logbook sections" });
  }
});

const updateSchema = z.object({ definition: logbookSectionSettingsSchema, revision: z.number().int().min(0) }).strict();
class Conflict extends Error {}

async function saveSection(req: Request, res: Response, create: boolean) {
  try {
    const departmentId = req.user!.departmentId!;
    if (await resolveConfigDepartmentId(departmentId) !== departmentId) {
      res.status(403).json({ message: "Test departments cannot modify mirrored settings" }); return;
    }
    const value = create ? `logbook-${randomUUID()}` : String(req.params.value);
    const definition: LogbookSectionSettings = create ? req.body : req.body.definition;
    const result = await db.transaction(async (tx) => {
      await tx.select({ id: departmentsTable.id }).from(departmentsTable).where(eq(departmentsTable.id, departmentId)).for("update");
      // The lock serializes edits, including first overrides of built-in sections.
      const { sections, categories } = await getLogbookSectionConfiguration(departmentId, tx);
      const current = sections.find((section) => section.value === value);
      if (!create && !current) {
        const [other] = await tx.select({ id: departmentLogbookSectionsTable.id }).from(departmentLogbookSectionsTable)
          .where(eq(departmentLogbookSectionsTable.value, value)).limit(1);
        return { error: other ? 403 : 404, message: other ? "Section is outside your department" : "Section not found" };
      }
      if (!create && current!.revision !== req.body.revision) throw new Conflict();
      if (!categories.some((category) => category.id === definition.categoryId)) return { error: 400, message: "Choose a logbook navigation group" };
      if (sections.some((section) => section.value !== value && section.name.toLowerCase() === definition.name.toLowerCase())) return { error: 400, message: "A section with this name already exists" };
      if (create && sections.length >= 200) return { error: 400, message: "A department can have at most 200 logbook sections" };
      const [saved] = current?.revision
        ? await tx.update(departmentLogbookSectionsTable).set({ definition, revision: current.revision + 1, updatedAt: new Date() })
          .where(and(eq(departmentLogbookSectionsTable.departmentId, departmentId), eq(departmentLogbookSectionsTable.value, value), eq(departmentLogbookSectionsTable.revision, current.revision))).returning()
        : await tx.insert(departmentLogbookSectionsTable).values({ departmentId, value, definition }).onConflictDoNothing().returning();
      if (!saved) throw new Conflict();
      await tx.insert(departmentCatalogTable).values({ departmentId, kind: "academic", value, name: definition.name,
        required: definition.archived ? 0 : definition.required, period: definition.period })
        .onConflictDoUpdate({ target: [departmentCatalogTable.departmentId, departmentCatalogTable.kind, departmentCatalogTable.value],
          set: { name: definition.name, required: definition.archived ? 0 : definition.required, period: definition.period } });
      const [total] = await tx.select({ required: sum(departmentCatalogTable.required) }).from(departmentCatalogTable)
        .where(and(eq(departmentCatalogTable.departmentId, departmentId), eq(departmentCatalogTable.kind, "academic"), eq(departmentCatalogTable.period, "total")));
      const requiredAcademic = total?.required == null ? null : Number(total.required);
      await tx.insert(departmentConfigsTable).values({ departmentId, requiredAcademic })
        .onConflictDoUpdate({ target: departmentConfigsTable.departmentId, set: { requiredAcademic } });
      return { value, revision: saved.revision };
    });
    if ("error" in result) { res.status(result.error!).json({ message: result.message }); return; }
    res.status(create ? 201 : 200).json(result);
  } catch (error) {
    if (error instanceof Conflict) { res.status(409).json({ message: "This section changed in another session. Reload the sections before saving." }); return; }
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error saving logbook section settings");
    res.status(500).json({ message: "Could not save logbook section" });
  }
}

router.post("/", validate(logbookSectionSettingsSchema), (req, res) => saveSection(req, res, true));
router.patch("/:value", validate(updateSchema), (req, res) => saveSection(req, res, false));
export default router;
