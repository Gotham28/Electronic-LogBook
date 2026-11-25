import * as React from "react";
import { ArrowDown, ArrowUp, Lock, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPatch } from "@/lib/apiClient";
import { applyNavOrder } from "@/lib/academic-navigation";
import { useDepartment } from "@/lib/department-context";
import { navigationForRole } from "@/components/layout/AppLayout";

type SettingEntry = { key: string; value: unknown };

export function NavOrderSettings() {
  const department = useDepartment();
  const { config, academicLogbook, label, labels, readOnlyConfig, refresh } = department;
  const [storedOrder, setStoredOrder] = React.useState<string[] | null>(null);
  const [draftOrder, setDraftOrder] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [saveError, setSaveError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const studentItems = React.useMemo(
    () =>
      navigationForRole("Student", undefined, false, config, false, academicLogbook, department.department, label, labels)
        .map((item) => (item.href === "/academics" && academicLogbook ? { ...item, title: academicLogbook.title } : item)),
    [config, academicLogbook, department.department, label, labels],
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const settings = await apiGet<SettingEntry[]>("/api/admin/department/config/settings");
      const entry = Array.isArray(settings) ? settings.find((item) => item.key === "studentNavOrder") : undefined;
      const value = Array.isArray(entry?.value) ? (entry.value as string[]) : null;
      setStoredOrder(value);
      setDraftOrder(value ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load menu order settings");
    } finally {
      setLoading(false);
    }
  }, [department.department.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const orderedItems = React.useMemo(() => applyNavOrder(studentItems, draftOrder), [studentItems, draftOrder]);
  const dashboardItem = orderedItems.find((item) => item.href === "/");
  const movableItems = orderedItems.filter((item) => item.href !== "/");

  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= movableItems.length) return;
    const next = [...movableItems];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    setDraftOrder(next.map((item) => item.href));
    setNotice("");
    setSaveError("");
  };

  const saveValue = async (nextValue: string[]) => {
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      await apiPatch("/api/admin/department/config/settings/studentNavOrder", {
        value: nextValue,
        expectedValue: storedOrder,
      });
      setStoredOrder(nextValue);
      setDraftOrder(nextValue);
      const refreshed = await refresh();
      if (!refreshed) {
        setSaveError("Menu order saved, but the sidebar could not refresh automatically. Reload this page to see the updated order.");
      } else {
        setNotice(nextValue.length ? "Residents' menu order saved." : "Residents' menu order reset to default.");
      }
    } catch (error: any) {
      if (error?.status === 409) {
        setSaveError("This order changed since you opened it. Reload and try again.");
        await load();
      } else {
        setSaveError(error instanceof Error ? error.message : "Could not save residents' menu order");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p role="status" className="text-sm text-slate-500">Loading menu order…</p>;
  if (loadError) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p>{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Residents' menu order</h3>
          <p className="text-sm text-slate-500">
            Arrange the pages shown in residents' sidebar and mobile bar. Dashboard always stays first.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnlyConfig || saving}
            onClick={() => void saveValue([])}
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset to default
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={readOnlyConfig || saving}
            onClick={() => void saveValue(movableItems.map((item) => item.href))}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save order"}
          </Button>
        </div>
      </div>

      {readOnlyConfig && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This test department mirrors its parent department configuration. Menu order is read-only here.
        </p>
      )}
      {saveError && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {saveError}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {dashboardItem && (
          <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-600 bg-slate-50/70">
            <div>
              <span className="font-medium text-slate-900">{dashboardItem.title}</span>
              <span className="ml-2 text-xs text-slate-400">{dashboardItem.href}</span>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Pinned first
            </span>
          </li>
        )}
        {movableItems.map((item, index) => (
          <li key={item.href} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <span className="font-medium text-slate-900">{item.title}</span>
              <span className="ml-2 text-xs text-slate-400">{item.href}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Move ${item.title} up`}
                disabled={readOnlyConfig || saving || index === 0}
                onClick={() => moveItem(index, -1)}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Move ${item.title} down`}
                disabled={readOnlyConfig || saving || index === movableItems.length - 1}
                onClick={() => moveItem(index, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
