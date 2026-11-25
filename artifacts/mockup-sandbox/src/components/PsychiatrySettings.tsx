import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDepartment } from "@/lib/department-context";
import { apiGet, apiPatch } from "@/lib/apiClient";

const settingsPath = "/api/admin/department/config/settings";

export function PsychiatrySettings() {
  const department = useDepartment();
  const enabled = department.config?.enabledFeatures.psychiatryWorkspace === true;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const settings = await apiGet<Array<{ key: string; value: boolean | null }>>(settingsPath);
      const setting = settings.find(({ key }) => key === "psychiatryWorkspace");
      if (!setting || Boolean(setting.value) !== enabled) {
        await department.refresh();
        setError("The setting changed. Review its current value and try again.");
        return;
      }
      await apiPatch(`${settingsPath}/psychiatryWorkspace`, { value: !enabled, expectedValue: setting.value });
      if (!await department.refresh()) setError("The setting was saved. Reload to see the updated value.");
    } catch {
      setError("Unable to save the Psychiatry setting. Reload and try again.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-3">
    <p className="text-sm text-slate-600">Enables the Psychiatry workspace and the WHO ICD-11 Chapter 06 diagnosis picker for this department.</p>
    <Button variant="outline" disabled={saving || department.readOnlyConfig} onClick={() => void save()}>{enabled ? "Disable Psychiatry workspace" : "Enable Psychiatry workspace"}</Button>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>;
}
