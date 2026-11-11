import * as React from "react";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { apiPatch } from "@/lib/apiClient";
import { useDepartment } from "@/lib/department-context";
import {
  PROCEDURE_LOG_FIELDS,
  PROCEDURE_LOG_FIELD_LABELS,
  PROCEDURE_FIELD_TYPES,
  type ProcedureFieldDefinition,
  type ProcedureFieldType,
  getDefaultProcedureFieldDefinitions,
  normalizeProcedureFieldDefinitions,
  procedureFieldDefinitionsSchema,
} from "@/lib/procedure-log-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELD_TYPE_LABELS: Record<ProcedureFieldType, string> = {
  text: "Short text",
  textarea: "Detailed text",
  select: "Dropdown",
  radio: "Radio choice",
};

function generateCustomFieldId(existingIds: Set<string>): string {
  let candidate = "";
  do {
    const raw = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
    candidate = `cf_${raw}`;
  } while (existingIds.has(candidate));
  return candidate;
}

function parseOptionsText(raw: string): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const trimmed = part.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    options.push(trimmed);
  }
  return options;
}

function serializeFields(fields: ProcedureFieldDefinition[]): string {
  return JSON.stringify(normalizeProcedureFieldDefinitions(fields));
}

type DraftRowInput = {
  label: string;
  type: ProcedureFieldType;
  optionsText: string;
  isRequired: boolean;
};

function validateSingleFieldDraft(
  draft: DraftRowInput,
  siblingFields: readonly ProcedureFieldDefinition[],
): { ok: true; label: string; type: ProcedureFieldType; options?: string[]; isRequired: boolean } | { ok: false; error: string } {
  const label = draft.label.trim();
  if (!label) return { ok: false, error: "Field title is required" };
  if (label.length > 160) return { ok: false, error: "Field title must be 160 characters or fewer" };
  const duplicate = siblingFields.find((f) => f.label.trim().toLowerCase() === label.toLowerCase());
  if (duplicate) return { ok: false, error: `Another field is already named "${duplicate.label}"` };

  if (draft.type === "select" || draft.type === "radio") {
    const options = parseOptionsText(draft.optionsText);
    if (options.length === 0) {
      return { ok: false, error: `Enter at least one choice for ${FIELD_TYPE_LABELS[draft.type].toLowerCase()}` };
    }
    if (options.length > 50) return { ok: false, error: "Maximum 50 choices allowed per field" };
    if (options.some((opt) => opt.length > 120)) return { ok: false, error: "Each choice must be 120 characters or fewer" };
    return { ok: true, label, type: draft.type, options, isRequired: draft.isRequired };
  }

  return { ok: true, label, type: draft.type, isRequired: draft.isRequired };
}

export type DynamicFieldEditorHandle = {
  /** Flushes an active inline edit/add draft; returns null if validation failed. */
  commitPending: () => ProcedureFieldDefinition[] | null;
};

export const DynamicProcedureFieldChecklist = React.forwardRef<DynamicFieldEditorHandle, {
  mode: "department" | "procedure";
  fields: ProcedureFieldDefinition[];
  onFieldsChange?: (next: ProcedureFieldDefinition[]) => void;
  requiredIds?: string[];
  onRequiredIdsChange?: (next: string[]) => void;
  onToggleDepartmentRequired?: (fieldId: string) => void;
  onPendingChange?: (hasPending: boolean) => void;
  disabled?: boolean;
  readOnlyConfig?: boolean;
  title?: string;
  description?: string;
  showCardChrome?: boolean;
}>(function DynamicProcedureFieldChecklist(
  {
    mode,
    fields,
    onFieldsChange,
    requiredIds = [],
    onRequiredIdsChange,
    onToggleDepartmentRequired,
    onPendingChange,
    disabled,
    readOnlyConfig,
    title = "Required details in each resident entry",
    description,
    showCardChrome = true,
  },
  ref,
) {
  const prefix = React.useId();
  const editableSchema = Boolean(onFieldsChange) && !readOnlyConfig;
  const interactionDisabled = Boolean(disabled || readOnlyConfig);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<DraftRowInput>({ label: "", type: "text", optionsText: "", isRequired: true });
  const [editError, setEditError] = React.useState("");

  const [isAdding, setIsAdding] = React.useState(false);
  const [addDraft, setAddDraft] = React.useState<DraftRowInput>({ label: "", type: "text", optionsText: "", isRequired: true });
  const [addError, setAddError] = React.useState("");

  React.useEffect(() => {
    if (editingId && !fields.some((f) => f.id === editingId)) {
      setEditingId(null);
      setEditError("");
    }
  }, [fields, editingId]);

  const onPendingChangeRef = React.useRef(onPendingChange);
  onPendingChangeRef.current = onPendingChange;
  const hasPendingInline = editingId !== null || (isAdding && Boolean(addDraft.label.trim() || addDraft.optionsText.trim()));
  React.useEffect(() => {
    onPendingChangeRef.current?.(hasPendingInline);
  }, [hasPendingInline]);

  const startEdit = (field: ProcedureFieldDefinition) => {
    if (!editableSchema || disabled) return;
    setIsAdding(false);
    setAddError("");
    setEditingId(field.id);
    setEditDraft({
      label: field.label,
      type: field.type,
      optionsText: (field.options ?? []).join(", "),
      isRequired: field.isRequired,
    });
    setEditError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError("");
  };

  const applyEdit = (currentFields: ProcedureFieldDefinition[] = fields): ProcedureFieldDefinition[] | null => {
    if (!editingId || !onFieldsChange) return currentFields;
    const siblings = currentFields.filter((f) => f.id !== editingId);
    const result = validateSingleFieldDraft(editDraft, siblings);
    if (!result.ok) {
      setEditError(result.error);
      return null;
    }
    const next = normalizeProcedureFieldDefinitions(
      currentFields.map((field) => field.id === editingId
        ? {
          id: field.id,
          label: result.label,
          type: result.type,
          isRequired: field.isRequired,
          isCustom: field.isCustom,
          ...(result.options ? { options: result.options } : {}),
        }
        : field),
    );
    onFieldsChange(next);
    setEditingId(null);
    setEditError("");
    return next;
  };

  const openAddPanel = () => {
    if (!editableSchema || disabled) return;
    setEditingId(null);
    setEditError("");
    setAddDraft({ label: "", type: "text", optionsText: "", isRequired: true });
    setAddError("");
    setIsAdding(true);
  };

  const cancelAdd = () => {
    setIsAdding(false);
    setAddDraft({ label: "", type: "text", optionsText: "", isRequired: true });
    setAddError("");
  };

  const applyAdd = (currentFields: ProcedureFieldDefinition[] = fields): { next: ProcedureFieldDefinition[]; addedId: string } | null => {
    if (!isAdding || !onFieldsChange) return { next: currentFields, addedId: "" };
    const result = validateSingleFieldDraft(addDraft, currentFields);
    if (!result.ok) {
      setAddError(result.error);
      return null;
    }
    const existingIds = new Set(currentFields.map((f) => f.id));
    const addedId = generateCustomFieldId(existingIds);
    const next = normalizeProcedureFieldDefinitions([
      ...currentFields,
      {
        id: addedId,
        label: result.label,
        type: result.type,
        isRequired: result.isRequired,
        isCustom: true,
        ...(result.options ? { options: result.options } : {}),
      },
    ]);
    onFieldsChange(next);
    if (mode === "procedure" && onRequiredIdsChange && result.isRequired) {
      onRequiredIdsChange([...new Set([...requiredIds, addedId])]);
    }
    setIsAdding(false);
    setAddDraft({ label: "", type: "text", optionsText: "", isRequired: true });
    setAddError("");
    return { next, addedId };
  };

  const deleteField = (fieldId: string) => {
    if (!editableSchema || disabled) return;
    if (editingId === fieldId) cancelEdit();
    const next = fields.filter((f) => f.id !== fieldId);
    onFieldsChange?.(next);
    if (mode === "procedure" && onRequiredIdsChange) {
      onRequiredIdsChange(requiredIds.filter((id) => id !== fieldId));
    }
  };

  React.useImperativeHandle(ref, () => ({
    commitPending: () => {
      let working = fields;
      if (editingId) {
        const applied = applyEdit(working);
        if (!applied) return null;
        working = applied;
      }
      if (isAdding) {
        if (!addDraft.label.trim() && !addDraft.optionsText.trim()) {
          cancelAdd();
        } else {
          const added = applyAdd(working);
          if (!added) return null;
          working = added.next;
        }
      }
      return working;
    },
  }));

  const handleCheckboxToggle = (field: ProcedureFieldDefinition, checked: boolean) => {
    if (interactionDisabled) return;
    if (mode === "procedure") {
      if (!onRequiredIdsChange) return;
      onRequiredIdsChange(checked
        ? [...new Set([...requiredIds, field.id])]
        : requiredIds.filter((id) => id !== field.id));
      return;
    }
    if (!onFieldsChange) return;
    onToggleDepartmentRequired?.(field.id);
    onFieldsChange(
      fields.map((item) => item.id === field.id ? { ...item, isRequired: checked } : item),
    );
  };

  const defaultDesc = mode === "department"
    ? "Customize the fields shown when residents log procedures. Check a field to mark it required; uncheck to make it optional."
    : "Checked fields are required when residents log this procedure; unchecked active fields remain optional.";

  const innerContent = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
          <p className="text-xs text-slate-600">{description ?? defaultDesc}</p>
        </div>
        {editableSchema && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={interactionDisabled || isAdding}
            onClick={openAddPanel}
            className="shrink-0 border-teal-200 text-teal-800 hover:bg-teal-50 hover:text-teal-900"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Custom Field
          </Button>
        )}
      </div>

      {readOnlyConfig && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This test department mirrors settings from its parent department and is read-only.
        </p>
      )}

      {fields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-4 text-center text-xs text-slate-500">
          No detail fields configured. Use &ldquo;+ Add Custom Field&rdquo; above to add a field.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {fields.map((field) => {
            const isChecked = mode === "procedure" ? requiredIds.includes(field.id) : field.isRequired;
            const isEditing = editingId === field.id;

            return (
              <div key={field.id} className={`p-3 ${isEditing ? "bg-teal-50/30" : ""}`}>
                {isEditing ? (
                  <div role="group" aria-label={`Edit ${field.label}`} className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
                      <div className="space-y-1">
                        <Label htmlFor={`${prefix}-edit-label-${field.id}`} className="text-xs text-slate-700">Field title</Label>
                        <Input
                          id={`${prefix}-edit-label-${field.id}`}
                          autoFocus
                          maxLength={160}
                          disabled={interactionDisabled}
                          value={editDraft.label}
                          onChange={(e) => { setEditDraft((prev) => ({ ...prev, label: e.target.value })); setEditError(""); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); applyEdit(); }
                            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelEdit(); }
                          }}
                          placeholder="Enter field title"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`${prefix}-edit-type-${field.id}`} className="text-xs text-slate-700">Input type</Label>
                        <select
                          id={`${prefix}-edit-type-${field.id}`}
                          disabled={interactionDisabled}
                          value={editDraft.type}
                          onChange={(e) => { setEditDraft((prev) => ({ ...prev, type: e.target.value as ProcedureFieldType })); setEditError(""); }}
                          className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                        >
                          {PROCEDURE_FIELD_TYPES.map((t) => (
                            <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {(editDraft.type === "select" || editDraft.type === "radio") && (
                      <div className="space-y-1.5">
                        <Label htmlFor={`${prefix}-edit-options-${field.id}`} className="text-xs text-slate-700">
                          Choices (comma-separated)
                        </Label>
                        <Input
                          id={`${prefix}-edit-options-${field.id}`}
                          disabled={interactionDisabled}
                          value={editDraft.optionsText}
                          onChange={(e) => { setEditDraft((prev) => ({ ...prev, optionsText: e.target.value })); setEditError(""); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); applyEdit(); }
                            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelEdit(); }
                          }}
                          placeholder="e.g. Ward, Casualty, OT, SICU"
                        />
                        {parseOptionsText(editDraft.optionsText).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {parseOptionsText(editDraft.optionsText).map((opt) => (
                              <span key={opt} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                {opt}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {editError && <p role="alert" className="text-xs font-medium text-rose-700">{editError}</p>}

                    <div className="flex items-center justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={cancelEdit} disabled={interactionDisabled}>
                        <X className="mr-1 h-3.5 w-3.5" /> Cancel
                      </Button>
                      <Button type="button" size="sm" onClick={() => applyEdit()} disabled={interactionDisabled}>
                        <Check className="mr-1 h-3.5 w-3.5" /> Apply
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <label htmlFor={`${prefix}-check-${field.id}`} className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5 text-sm text-slate-800">
                      <input
                        id={`${prefix}-check-${field.id}`}
                        type="checkbox"
                        disabled={interactionDisabled}
                        checked={isChecked}
                        onChange={(e) => handleCheckboxToggle(field, e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-slate-900 break-words">{field.label}</span>
                          <Badge
                            variant="outline"
                            className={isChecked
                              ? "border-teal-200 bg-teal-50 text-teal-800 text-[10px] px-1.5 py-0"
                              : "border-slate-200 bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0"}
                          >
                            {isChecked ? "Required" : "Optional"}
                          </Badge>
                          <Badge variant="outline" className="border-slate-200 bg-white text-slate-500 text-[10px] px-1.5 py-0">
                            {FIELD_TYPE_LABELS[field.type]}
                          </Badge>
                          {field.isCustom && (
                            <Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-800 text-[10px] px-1.5 py-0">
                              Custom
                            </Badge>
                          )}
                        </div>
                        {field.options && field.options.length > 0 && (
                          <p className="text-xs text-slate-500 break-words">
                            Choices: {field.options.join(" · ")}
                          </p>
                        )}
                      </div>
                    </label>
                    {editableSchema && (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          aria-label={`Edit ${field.label}`}
                          disabled={interactionDisabled}
                          onClick={() => startEdit(field)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          aria-label={`Delete ${field.label}`}
                          disabled={interactionDisabled}
                          onClick={() => deleteField(field.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isAdding && (
        <div role="group" aria-label="Add Custom Field" className="space-y-3 rounded-lg border border-teal-200 bg-teal-50/30 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-teal-900">New custom field</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
            <div className="space-y-1">
              <Label htmlFor={`${prefix}-add-label`} className="text-xs text-slate-700">Field title</Label>
              <Input
                id={`${prefix}-add-label`}
                autoFocus
                maxLength={160}
                disabled={interactionDisabled}
                value={addDraft.label}
                onChange={(e) => { setAddDraft((prev) => ({ ...prev, label: e.target.value })); setAddError(""); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); applyAdd(); }
                  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelAdd(); }
                }}
                placeholder="e.g. Anesthesia type or Blood loss (mL)"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${prefix}-add-type`} className="text-xs text-slate-700">Input type</Label>
              <select
                id={`${prefix}-add-type`}
                disabled={interactionDisabled}
                value={addDraft.type}
                onChange={(e) => { setAddDraft((prev) => ({ ...prev, type: e.target.value as ProcedureFieldType })); setAddError(""); }}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {PROCEDURE_FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>

          {(addDraft.type === "select" || addDraft.type === "radio") && (
            <div className="space-y-1.5">
              <Label htmlFor={`${prefix}-add-options`} className="text-xs text-slate-700">
                Choices (comma-separated)
              </Label>
              <Input
                id={`${prefix}-add-options`}
                disabled={interactionDisabled}
                value={addDraft.optionsText}
                onChange={(e) => { setAddDraft((prev) => ({ ...prev, optionsText: e.target.value })); setAddError(""); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); applyAdd(); }
                  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelAdd(); }
                }}
                placeholder="e.g. General, Regional, Local"
              />
              {parseOptionsText(addDraft.optionsText).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {parseOptionsText(addDraft.optionsText).map((opt) => (
                    <span key={opt} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {opt}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <label htmlFor={`${prefix}-add-required`} className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              id={`${prefix}-add-required`}
              type="checkbox"
              disabled={interactionDisabled}
              checked={addDraft.isRequired}
              onChange={(e) => setAddDraft((prev) => ({ ...prev, isRequired: e.target.checked }))}
              className="h-4 w-4 accent-teal-700"
            />
            Required by default for residents
          </label>

          {addError && <p role="alert" className="text-xs font-medium text-rose-700">{addError}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cancelAdd} disabled={interactionDisabled}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => applyAdd()} disabled={interactionDisabled}>
              Add field
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (!showCardChrome) return <div className="min-w-0 space-y-3">{innerContent}</div>;

  return (
    <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      {innerContent}
    </div>
  );
});

export function DepartmentProcedureFieldsCard() {
  const { config, procedureFields, readOnlyConfig, refresh, department } = useDepartment();
  const dynamicEnabled = Boolean(config?.enabledFeatures?.dynamicProcedureFields);
  const serverFields = React.useMemo(
    () => procedureFields ?? getDefaultProcedureFieldDefinitions(),
    [procedureFields],
  );
  const [draftFields, setDraftFields] = React.useState<ProcedureFieldDefinition[]>(serverFields);
  const [toggledIds, setToggledIds] = React.useState<string[]>([]);
  const [applyToExisting, setApplyToExisting] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [resetKey, setResetKey] = React.useState(0);
  const [hasPending, setHasPending] = React.useState(false);
  const editorRef = React.useRef<DynamicFieldEditorHandle>(null);

  const serverSignature = serializeFields(serverFields);
  React.useEffect(() => {
    setDraftFields(serverFields);
    setToggledIds([]);
    setError("");
    setHasPending(false);
    setResetKey((k) => k + 1);
  }, [department.id, serverSignature]);

  if (!dynamicEnabled) return null;

  const isDirty = serializeFields(draftFields) !== serverSignature || hasPending;

  const handleCancel = () => {
    setDraftFields(serverFields);
    setToggledIds([]);
    setError("");
    setHasPending(false);
    setResetKey((k) => k + 1);
  };

  const handleSave = async () => {
    if (readOnlyConfig) return;
    const committed = editorRef.current ? editorRef.current.commitPending() : draftFields;
    if (!committed) return;

    const parsed = procedureFieldDefinitionsSchema.safeParse(committed);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Please check your field configuration");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await apiPatch("/api/admin/department/procedure-fields", {
        fields: normalizeProcedureFieldDefinitions(parsed.data),
        applyRequiredToExisting: applyToExisting,
        toggledRequiredIds: toggledIds,
      });
      await refresh();
      setToggledIds([]);
      toast.success("Procedure entry fields updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update procedure fields");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <DynamicProcedureFieldChecklist
        key={resetKey}
        ref={editorRef}
        mode="department"
        showCardChrome={false}
        fields={draftFields}
        onFieldsChange={(next) => { setDraftFields(next); setError(""); }}
        onToggleDepartmentRequired={(id) => setToggledIds((prev) => prev.includes(id) ? prev : [...prev, id])}
        onPendingChange={setHasPending}
        disabled={saving}
        readOnlyConfig={readOnlyConfig}
      />

      {!readOnlyConfig && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={applyToExisting}
              disabled={saving}
              onChange={(e) => setApplyToExisting(e.target.checked)}
              className="h-3.5 w-3.5 accent-teal-700"
            />
            Apply added fields &amp; required/optional changes to existing procedures
          </label>
          <div className="flex items-center gap-2">
            {isDirty && (
              <span className="text-xs font-medium text-amber-700">Unsaved changes</span>
            )}
            <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={saving || !isDirty}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}

export function ProcedureFieldSelector({
  value,
  onChange,
  disabled,
  fieldDefinitions,
  onFieldDefinitionsChange,
  readOnlyConfig,
}: {
  value: string[];
  onChange: (fields: string[]) => void;
  disabled?: boolean;
  fieldDefinitions?: ProcedureFieldDefinition[];
  onFieldDefinitionsChange?: (next: ProcedureFieldDefinition[]) => void;
  readOnlyConfig?: boolean;
}) {
  const prefix = React.useId();

  if (fieldDefinitions !== undefined) {
    return (
      <DynamicProcedureFieldChecklist
        mode="procedure"
        fields={fieldDefinitions}
        onFieldsChange={onFieldDefinitionsChange}
        requiredIds={value}
        onRequiredIdsChange={onChange}
        disabled={disabled}
        readOnlyConfig={readOnlyConfig}
      />
    );
  }

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
  const { config, procedureFields, readOnlyConfig, refresh } = useDepartment();
  const dynamicEnabled = Boolean(config?.enabledFeatures?.dynamicProcedureFields);
  const serverSchema = React.useMemo(
    () => (dynamicEnabled ? (procedureFields ?? getDefaultProcedureFieldDefinitions()) : undefined),
    [dynamicEnabled, procedureFields],
  );
  const signature = (procedure.requiredLogFields ?? []).join(",");
  const schemaSignature = serverSchema ? serializeFields(serverSchema) : "";

  const [fields, setFields] = React.useState(procedure.requiredLogFields ?? []);
  const [draftSchema, setDraftSchema] = React.useState<ProcedureFieldDefinition[] | undefined>(serverSchema);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [resetKey, setResetKey] = React.useState(0);
  const [hasPending, setHasPending] = React.useState(false);
  const editorRef = React.useRef<DynamicFieldEditorHandle>(null);

  React.useEffect(() => {
    setFields(signature ? signature.split(",") : []);
    setError("");
  }, [procedure.id, signature]);

  React.useEffect(() => {
    setDraftSchema(serverSchema);
    setHasPending(false);
    setResetKey((k) => k + 1);
  }, [procedure.id, schemaSignature]);

  if (!config?.enabledFeatures?.procedureClinicalDetails && !dynamicEnabled && !signature) return null;

  const reqChanged = [...fields].sort().join(",") !== [...(procedure.requiredLogFields ?? [])].sort().join(",");
  const schemaChanged = Boolean(dynamicEnabled && draftSchema && serializeFields(draftSchema) !== schemaSignature);
  const changed = reqChanged || schemaChanged || hasPending;

  const cancel = () => {
    setFields(signature ? signature.split(",") : []);
    setDraftSchema(serverSchema);
    setError("");
    setHasPending(false);
    setResetKey((k) => k + 1);
  };

  const save = async () => {
    if (readOnlyConfig) return;
    const prevSchemaIds = new Set((draftSchema ?? []).map((f) => f.id));
    let committedSchema = draftSchema;
    if (dynamicEnabled && editorRef.current) {
      const next = editorRef.current.commitPending();
      if (!next) return;
      committedSchema = next;
    }

    setSaving(true);
    setError("");
    try {
      let nextRequiredFields = fields;
      if (dynamicEnabled && committedSchema && serializeFields(committedSchema) !== schemaSignature) {
        const parsed = procedureFieldDefinitionsSchema.safeParse(committedSchema);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message || "Please check your field configuration");
          setSaving(false);
          return;
        }
        const normalized = normalizeProcedureFieldDefinitions(parsed.data);
        const validIds = new Set(normalized.map((f) => f.id));
        const newlyAddedRequired = normalized
          .filter((f) => !prevSchemaIds.has(f.id) && f.isRequired)
          .map((f) => f.id);
        nextRequiredFields = [...new Set([...fields, ...newlyAddedRequired])].filter((id) => validIds.has(id));
        await apiPatch("/api/admin/department/procedure-fields", {
          fields: normalized,
          applyRequiredToExisting: false,
        });
      }
      await apiPatch(`/api/admin/department/procedures/${procedure.id}`, { requiredLogFields: nextRequiredFields });
      await refresh();
      toast.success("Required entry details updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update required details");
    } finally {
      setSaving(false);
    }
  };

  return <details className="mt-2 w-full min-w-0">
    <summary className="cursor-pointer text-xs font-medium text-teal-700">Required entry details ({fields.length})</summary>
    <div className="mt-3 space-y-3">
      {dynamicEnabled ? (
        <DynamicProcedureFieldChecklist
          key={resetKey}
          ref={editorRef}
          mode="procedure"
          fields={draftSchema ?? []}
          onFieldsChange={setDraftSchema}
          requiredIds={fields}
          onRequiredIdsChange={setFields}
          onPendingChange={setHasPending}
          disabled={saving}
          readOnlyConfig={readOnlyConfig}
        />
      ) : (
        <ProcedureFieldSelector value={fields} onChange={setFields} disabled={saving} />
      )}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {!readOnlyConfig && (
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={save} disabled={saving || !changed}>{saving ? "Saving…" : "Save required details"}</Button>
          {changed && (
            <Button type="button" variant="outline" size="sm" onClick={cancel} disabled={saving}>Cancel</Button>
          )}
        </div>
      )}
    </div>
  </details>;
}
