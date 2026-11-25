import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPatch } from "@/lib/apiClient";
import { useDepartment } from "@/lib/department-context";
import { logCustomFieldDefinitionsSchema, type LogCustomFieldDefinition } from "@/lib/log-custom-fields";

type CaseLogFieldsResponse = {
  readOnlyConfig: boolean;
  fields: LogCustomFieldDefinition[];
};

const selectClass =
  "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

export function CaseLogFieldsCard() {
  const { department, readOnlyConfig, refresh } = useDepartment();
  const [fields, setFields] = React.useState<LogCustomFieldDefinition[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [saveError, setSaveError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [isReadOnly, setIsReadOnly] = React.useState(Boolean(readOnlyConfig));

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await apiGet<CaseLogFieldsResponse>("/api/admin/department/case-log-fields");
      setFields(Array.isArray(result.fields) ? result.fields : []);
      setIsReadOnly(Boolean(result.readOnlyConfig || readOnlyConfig));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load case log fields");
    } finally {
      setLoading(false);
    }
  }, [department.id, readOnlyConfig]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const addField = () => {
    const key = `cf_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    setFields((prev) => [...prev, { key, label: "", type: "text", required: false }]);
    setNotice("");
    setSaveError("");
  };

  const updateField = (index: number, patch: Partial<LogCustomFieldDefinition>) => {
    setFields((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setNotice("");
    setSaveError("");
  };

  const moveField = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    setFields((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
    setNotice("");
    setSaveError("");
  };

  const removeField = (index: number) => {
    setFields((prev) => {
      const removed = prev[index];
      return prev
        .filter((_, i) => i !== index)
        .map((item) => (item.requiredWhen?.field === removed?.key ? { ...item, requiredWhen: undefined } : item));
    });
    setNotice("");
    setSaveError("");
  };

  const save = async () => {
    setSaveError("");
    setNotice("");
    const cleaned = fields.map((field) =>
      field.type === "select"
        ? { ...field, options: (field.options ?? []).map((o) => o.trim()).filter(Boolean) }
        : field,
    );
    const parsed = logCustomFieldDefinitionsSchema.safeParse(cleaned);
    if (!parsed.success) {
      setSaveError(parsed.error.issues[0]?.message || "Please check your custom field settings");
      return;
    }
    setSaving(true);
    try {
      const updated = await apiPatch<CaseLogFieldsResponse>("/api/admin/department/case-log-fields", {
        fields: parsed.data,
      });
      setFields(updated.fields);
      await refresh();
      setNotice("Case log custom fields saved.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save case log custom fields");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p role="status" className="text-sm text-slate-500">Loading case log fields…</p>;
  if (loadError) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p>{loadError}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h4 className="font-semibold text-slate-900">Case log custom fields</h4>
          <p className="text-xs text-slate-500">
            Add department-specific fields to resident case logs. Existing logs keep their saved values.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isReadOnly || saving || fields.length >= 40} onClick={addField}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add field
          </Button>
          <Button type="button" size="sm" disabled={isReadOnly || saving} onClick={() => void save()}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Saving…" : "Save fields"}
          </Button>
        </div>
      </div>

      {isReadOnly && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This test department mirrors its parent department configuration. Case log fields are read-only here.
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

      {!fields.length ? (
        <p className="text-sm text-slate-500">No custom fields configured for case logs.</p>
      ) : (
        <div className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.key} className="space-y-3 rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-600">Field {index + 1}</span>
                <div className="flex items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" aria-label={`Move field ${index + 1} up`} disabled={isReadOnly || saving || index === 0} onClick={() => moveField(index, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" aria-label={`Move field ${index + 1} down`} disabled={isReadOnly || saving || index === fields.length - 1} onClick={() => moveField(index, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="text-rose-700" aria-label={`Remove field ${index + 1}`} disabled={isReadOnly || saving} onClick={() => removeField(index)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={field.label}
                    maxLength={160}
                    disabled={isReadOnly || saving}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <select
                    className={selectClass}
                    value={field.type}
                    disabled={isReadOnly || saving}
                    onChange={(e) => {
                      const type = e.target.value as LogCustomFieldDefinition["type"];
                      updateField(index, {
                        type,
                        options: type === "select" ? (field.options?.length ? field.options : ["Option 1"]) : undefined,
                        min: undefined,
                        max: undefined,
                        maxLength: undefined,
                      });
                    }}
                  >
                    <option value="text">Short text</option>
                    <option value="textarea">Long text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="select">Dropdown</option>
                  </select>
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(field.required)}
                      disabled={isReadOnly || saving}
                      onChange={(e) => updateField(index, { required: e.target.checked })}
                    />
                    Required
                  </label>
                </div>
              </div>

              {field.type === "select" && (
                <div className="space-y-1">
                  <Label className="text-xs">Dropdown choices (one per line)</Label>
                  <Textarea
                    rows={3}
                    disabled={isReadOnly || saving}
                    value={field.options?.join("\n") ?? ""}
                    onChange={(e) => updateField(index, { options: e.target.value.split("\n") })}
                  />
                </div>
              )}

              {field.type === "number" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Minimum (optional)</Label>
                    <Input
                      type="number"
                      step="any"
                      disabled={isReadOnly || saving}
                      value={field.min ?? ""}
                      onChange={(e) => updateField(index, { min: e.target.value === "" ? undefined : Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Maximum (optional)</Label>
                    <Input
                      type="number"
                      step="any"
                      disabled={isReadOnly || saving}
                      value={field.max ?? ""}
                      onChange={(e) => updateField(index, { max: e.target.value === "" ? undefined : Number(e.target.value) })}
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Show only when (optional)</Label>
                  <select
                    className={selectClass}
                    disabled={isReadOnly || saving}
                    value={field.requiredWhen?.field ?? ""}
                    onChange={(e) =>
                      updateField(index, {
                        requiredWhen: e.target.value ? { field: e.target.value, value: "" } : undefined,
                      })
                    }
                  >
                    <option value="">Always show</option>
                    {fields
                      .filter((other) => other.key !== field.key && !other.requiredWhen)
                      .map((other) => (
                        <option key={other.key} value={other.key}>
                          {other.label || other.key}
                        </option>
                      ))}
                  </select>
                </div>
                {field.requiredWhen && (
                  <div className="space-y-1">
                    <Label className="text-xs">Equals value</Label>
                    <Input
                      value={field.requiredWhen.value}
                      maxLength={160}
                      disabled={isReadOnly || saving}
                      onChange={(e) =>
                        updateField(index, { requiredWhen: { ...field.requiredWhen!, value: e.target.value } })
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
