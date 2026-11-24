import { Router } from "express";
import { departmentSettingUpdateSchema } from "@workspace/api-zod";
import { requireAuth, requireRole, requireDepartment } from "../middlewares/auth.js";
import { validate } from "../lib/validation.js";
import { DepartmentSettingError, getDepartmentSettings, setDepartmentSetting } from "../lib/department-settings.js";

const router = Router();
router.use(requireAuth, requireRole(["hod"]), requireDepartment);

// The department always comes from req.user, never from the URL or body.
router.get("/", async (req, res) => {
  try {
    res.json(await getDepartmentSettings(req.user!.departmentId!));
  } catch {
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error loading department settings");
    res.status(500).json({ message: "Could not load department settings" });
  }
});

router.patch("/:key", validate(departmentSettingUpdateSchema), async (req, res) => {
  try {
    // The actor is fixed here: a client can never pick it. Task 4 calls the service with "mochi".
    const result = await setDepartmentSetting({
      departmentId: req.user!.departmentId!, userId: req.user!.id, key: String(req.params.key),
      value: req.body.value, expectedValue: req.body.expectedValue, actor: "hod",
    });
    res.json(result);
  } catch (error) {
    if (error instanceof DepartmentSettingError) { res.status(error.status).json({ message: error.message }); return; }
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error saving department setting");
    res.status(500).json({ message: "Could not save department setting" });
  }
});

export default router;
