import { Router, type Request, type Response } from "express";
import {
  isDepartmentLabelKey, departmentLabelPatchSchema, departmentLabelDeleteSchema,
} from "@workspace/api-zod";
import { requireAuth, requireRole, requireDepartment } from "../middlewares/auth.js";
import { DepartmentLabelError, listDepartmentLabels, setDepartmentLabel } from "../lib/department-labels.js";

// Per-department wording overrides. One label per request, so a person (or an assistant acting for
// them) changes exactly one thing at a time. The department is always the caller's own
// (req.user.departmentId); it is never read from the URL, body or query. Label values are display
// wording, not patient data, but they are still never logged: only the key, department id and status.
// The work is in lib/department-labels.ts, which Mochi also calls (with actor "mochi").
const router = Router();
router.use(requireAuth, requireRole(["hod"]), requireDepartment);

router.get("/", async (req, res) => {
  try {
    res.json(await listDepartmentLabels(req.user!.departmentId!));
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
    // The actor is fixed here: a client can never pick it.
    const change = await setDepartmentLabel({ departmentId: req.user!.departmentId!, userId: req.user!.id, key,
      value: action === "set" ? body.value! : null, revision: body.revision, actor: "hod" });
    res.json(action === "reset" ? { reset: change.reset, ...change.view } : change.view);
  } catch (error) {
    if (error instanceof DepartmentLabelError) {
      res.status(error.status).json({ message: error.message });
      return;
    }
    req.log.error({ departmentId: req.user!.departmentId, key: isDepartmentLabelKey(String(req.params.key)) ? req.params.key : undefined, status: 500 }, "Error saving department label");
    res.status(500).json({ message: "Could not save department wording" });
  }
}

router.patch("/:key", (req, res) => writeLabel(req, res, "set"));
router.delete("/:key", (req, res) => writeLabel(req, res, "reset"));
export default router;
