import { Router, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, departmentsTable, departmentLabelOverridesTable } from "@workspace/db";
import {
  DEPARTMENT_LABELS, DEPARTMENT_LABEL_KEYS, isDepartmentLabelKey, departmentLabelPatchSchema, departmentLabelDeleteSchema,
  defaultDepartmentLabel, type DepartmentLabelKey, type DepartmentLabelContext,
} from "@workspace/api-zod";
import { requireAuth, requireRole, requireDepartment } from "../middlewares/auth.js";
import { resolveConfigDepartmentId } from "../lib/department-config-source.js";
import { getDepartmentFeatures } from "../lib/department-features.js";

// Per-department wording overrides. One label per request, so a person (or an assistant acting for
// them) changes exactly one thing at a time. The department is always the caller's own
// (req.user.departmentId); it is never read from the URL, body or query. Label values are display
// wording, not patient data, but they are still never logged: only the key, department id and status.
const router = Router();
router.use(requireAuth, requireRole(["hod"]), requireDepartment);

class Conflict extends Error {}

// The milestone defaults follow the same effective wording flag the catalog uses (getDepartmentFeatures
// applies the same defaults for a department that has not set it). No department name is checked here.
async function labelContext(departmentId: number): Promise<DepartmentLabelContext> {
  const { features } = await getDepartmentFeatures(departmentId);
  return { useThesisAndMandatoryCertificationsLabel: Boolean(features.useThesisAndMandatoryCertificationsLabel) };
}

const label = (key: DepartmentLabelKey, override: { value: string; revision: number } | undefined, context: DepartmentLabelContext) => ({
  key,
  value: override?.value ?? defaultDepartmentLabel(key, context),
  default: defaultDepartmentLabel(key, context),
  override: override?.value ?? null,
  revision: override?.revision ?? 0,
  group: DEPARTMENT_LABELS[key].group,
});

router.get("/", async (req, res) => {
  try {
    const departmentId = req.user!.departmentId!;
    const sourceId = await resolveConfigDepartmentId(departmentId);
    const rows = await db.select().from(departmentLabelOverridesTable).where(eq(departmentLabelOverridesTable.departmentId, sourceId));
    const byKey = new Map(rows.map((row) => [row.key, row]));
    const context = await labelContext(departmentId);
    res.json({
      labels: DEPARTMENT_LABEL_KEYS.map((key) => ({ ...label(key, byKey.get(key), context),
        description: DEPARTMENT_LABELS[key].description, maxLength: DEPARTMENT_LABELS[key].maxLength })),
      readOnly: sourceId !== departmentId,
    });
  } catch {
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error loading department labels");
    res.status(500).json({ message: "Could not load department wording" });
  }
});

async function writeLabel(req: Request, res: Response, action: "set" | "reset") {
  try {
    const key = String(req.params.key);
    if (!isDepartmentLabelKey(key)) { res.status(404).json({ message: "Unknown wording key" }); return; }
    const parsed = (action === "set" ? departmentLabelPatchSchema : departmentLabelDeleteSchema).safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.issues.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; ") });
      return;
    }
    const body = parsed.data as { value?: string; revision?: number };
    const departmentId = req.user!.departmentId!;
    if (await resolveConfigDepartmentId(departmentId) !== departmentId) {
      res.status(403).json({ message: "Test departments cannot modify mirrored settings" }); return;
    }
    const context = await labelContext(departmentId);
    const result = await db.transaction(async (tx) => {
      // The department row lock serialises label edits for this department.
      await tx.select({ id: departmentsTable.id }).from(departmentsTable).where(eq(departmentsTable.id, departmentId)).for("update");
      const [current] = await tx.select().from(departmentLabelOverridesTable)
        .where(and(eq(departmentLabelOverridesTable.departmentId, departmentId), eq(departmentLabelOverridesTable.key, key))).limit(1);
      const currentRevision = current?.revision ?? 0;
      if (action === "reset") {
        if (!current) return { reset: false, ...label(key, undefined, context) };
        if (body.revision !== undefined && body.revision !== currentRevision) throw new Conflict();
        await tx.delete(departmentLabelOverridesTable).where(eq(departmentLabelOverridesTable.id, current.id));
        return { reset: true, ...label(key, undefined, context) };
      }
      if (body.revision !== undefined && body.revision !== currentRevision) throw new Conflict();
      const value = body.value!;
      const [saved] = current
        ? await tx.update(departmentLabelOverridesTable).set({ value, revision: current.revision + 1, updatedBy: req.user!.id, updatedAt: new Date() })
          .where(eq(departmentLabelOverridesTable.id, current.id)).returning()
        : await tx.insert(departmentLabelOverridesTable).values({ departmentId, key, value, updatedBy: req.user!.id }).returning();
      return label(key, saved, context);
    });
    res.json(result);
  } catch (error) {
    if (error instanceof Conflict) { res.status(409).json({ message: "This wording changed in another session. Reload before saving." }); return; }
    req.log.error({ departmentId: req.user!.departmentId, key: isDepartmentLabelKey(String(req.params.key)) ? req.params.key : undefined, status: 500 }, "Error saving department label");
    res.status(500).json({ message: "Could not save department wording" });
  }
}

router.patch("/:key", (req, res) => writeLabel(req, res, "set"));
router.delete("/:key", (req, res) => writeLabel(req, res, "reset"));
export default router;
