import { Router } from "express";
import { departmentSettingKeySchema, departmentSettingUpdateSchemaFor } from "@workspace/api-zod";
import { requireAuth, requireRole, requireDepartment } from "../middlewares/auth.js";
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

router.patch("/:key", async (req, res) => {
  const parsedKey = departmentSettingKeySchema.safeParse(String(req.params.key));
  if (!parsedKey.success) { res.status(400).json({ message: "Unknown setting" }); return; }
  const parsedBody = departmentSettingUpdateSchemaFor(parsedKey.data).safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ message: parsedBody.error.issues[0]?.message || "Invalid request" });
    return;
  }
  try {
    // The actor is fixed here: a client can never pick it. Task 4 calls the service with "mochi".
    const result = await setDepartmentSetting({
      departmentId: req.user!.departmentId!, userId: req.user!.id, key: parsedKey.data,
      value: parsedBody.data.value, expectedValue: parsedBody.data.expectedValue, actor: "hod",
    });
    res.json(result);
  } catch (error) {
    if (error instanceof DepartmentSettingError) { res.status(error.status).json({ message: error.message }); return; }
    req.log.error({ departmentId: req.user!.departmentId, status: 500 }, "Error saving department setting");
    res.status(500).json({ message: "Could not save department setting" });
  }
});

export default router;
