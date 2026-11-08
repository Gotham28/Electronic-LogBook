import * as React from "react";
import { toast } from "sonner";
import { apiPatch } from "@/lib/apiClient";
import { useDepartment } from "@/lib/department-context";
import { PROCEDURE_LOG_FIELDS, PROCEDURE_LOG_FIELD_LABELS } from "@/lib/procedure-log-fields";
import { Button } from "@/components/ui/button";

export function ProcedureFieldSelector({ value, onChange, disabled }: {
  value: string[]; onChange: (fields: string[]) => void; disabled?: boolean;
}) {
  const prefix = React.useId();
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
    <legend className="px-1 text-sm font-semibold text-slate-900">Required details in each resident entry</legend>
    <p className="text-xs text-slate-600">Residents must supply the checked details when logging this procedure.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {PROCEDURE_LOG_FIELDS.map((field) => <label key={field} htmlFor={`${prefix}-${field}`} className="flex items-start gap-2 text-sm text-slate-800">
        <input id={`${prefix}-${field}`} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
          checked={value.includes(field)} onChange={(event) => onChange(event.target.checked
            ? [...value, field] : value.filter((item) => item !== field))} />
        <span>{PROCEDURE_LOG_FIELD_LABELS[field]}{field === "setting" ? " (Ward / Casualty / OT / NICU)" : field === "competencyLevel" ? " (O / A / PS / PI)" : ""}</span>
      </label>)}
    </div>
  </fieldset>;
}

export function ProcedureFieldRequirementsEditor({ procedure }: {
  procedure: { id: number; name: string; requiredLogFields?: string[] };
}) {
  const { config, refresh } = useDepartment();
  const signature = (procedure.requiredLogFields ?? []).join(",");
  const [fields, setFields] = React.useState(procedure.requiredLogFields ?? []);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  React.useEffect(() => { setFields(signature ? signature.split(",") : []); }, [procedure.id, signature]);
  if (!config?.enabledFeatures?.procedureClinicalDetails && !signature) return null;
  const changed = [...fields].sort().join(",") !== [...(procedure.requiredLogFields ?? [])].sort().join(",");
  const save = async () => {
    setSaving(true); setError("");
    try {
      await apiPatch(`/api/admin/department/procedures/${procedure.id}`, { requiredLogFields: fields });
      await refresh();
      toast.success("Required entry details updated");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not update required details"); }
    finally { setSaving(false); }
  };
  return <details className="mt-2 w-full min-w-0">
    <summary className="cursor-pointer text-xs font-medium text-teal-700">Required entry details ({fields.length})</summary>
    <div className="mt-3 space-y-3">
      <ProcedureFieldSelector value={fields} onChange={setFields} disabled={saving} />
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <Button type="button" size="sm" onClick={save} disabled={saving || !changed}>{saving ? "Saving…" : "Save required details"}</Button>
    </div>
  </details>;
}
