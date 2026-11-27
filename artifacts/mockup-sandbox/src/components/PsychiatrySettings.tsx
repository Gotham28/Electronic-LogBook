import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDepartment } from "@/lib/department-context";
import { apiGet, apiPatch } from "@/lib/apiClient";

const settingsPath = "/api/admin/department/config/settings";
const workspaceSettings = [
  ["psychiatryWorkspace", "Psychiatry workspace"],
  ["freeTextPostingUnit", "free-text posting names"],
  ["freeTextPostingSupervisor", "optional posting supervisors"],
] as const;
type SettingKey = typeof workspaceSettings[number][0];

export function PsychiatrySettings() {
  const department = useDepartment();
  const enabled = department.config?.enabledFeatures.psychiatryWorkspace === true;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(key: SettingKey, current: boolean) {
    setSaving(true);
    setError("");
    try {
      const settings = await apiGet<Array<{ key: string; value: boolean | null }>>(settingsPath);
      const setting = settings.find((item) => item.key === key);
      if (!setting || Boolean(setting.value) !== current) {
        await department.refresh();
        setError("The setting changed. Review its current value and try again.");
        return;
      }
      await apiPatch(`${settingsPath}/${key}`, { value: !current, expectedValue: setting.value });
      if (!await department.refresh()) setError("The setting was saved. Reload to see the updated value.");
    } catch {
      setError("Unable to save the Psychiatry setting. Reload and try again.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-3">
    <p className="text-sm text-slate-600">Enables the Psychiatry workspace and the WHO ICD-11 Chapter 06 diagnosis picker for this department.</p>
    <div className="flex flex-wrap gap-2">{workspaceSettings.map(([key, title]) => {
      if (key !== "psychiatryWorkspace" && !enabled) return null;
      const current = department.config?.enabledFeatures[key] === true;
      return <Button key={key} variant="outline" disabled={saving || department.readOnlyConfig} onClick={() => void save(key, current)}>
        {current ? "Disable" : "Enable"} {title}
      </Button>;
    })}</div>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
  </div>;
}
