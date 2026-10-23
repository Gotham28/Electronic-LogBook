import * as React from "react";
import { toast } from "sonner";
import { apiGet, apiPost, apiPatch } from "@/lib/apiClient";
import { useDepartment } from "@/lib/department-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AcademicRecordFields } from "./AcademicRecordFields";
import { logbookSectionSettingsSchema, type LogbookSectionSettings, type ManagedLogbookSection,
  type LogbookSectionSettingsResponse } from "../../../../lib/api-zod/src/logbook-section-settings";
import type { AcademicLogbookField } from "@/lib/academic-logbook";

const endpoint = "/api/admin/department/logbook-sections";
const selectClass = "h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:opacity-60";
const emptySection = (categoryId: string, sortOrder: number): LogbookSectionSettings => ({
  name: "", categoryId, sortOrder, years: [1, 2, 3], topicLabel: "Topic / title", multilineTopic: false,
  fields: [], archived: false, required: 0, period: "total",
});

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  const id = React.useId();
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{React.isValidElement<{ id?: string }>(children) ? React.cloneElement(children, { id }) : children}</div>;
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 accent-teal-700" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}
const cleanChoices = (values?: string[]) => values?.map((value) => value.trim()).filter(Boolean);

export function LogbookSectionSettings() {
  const department = useDepartment();
  const [data, setData] = React.useState<LogbookSectionSettingsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [draft, setDraft] = React.useState<LogbookSectionSettings | null>(null);
  const [editing, setEditing] = React.useState<{ value: string; revision: number } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [formError, setFormError] = React.useState("");
  const [preview, setPreview] = React.useState<Record<string, string>>({});
  const [query, setQuery] = React.useState("");
  const errorRef = React.useRef<HTMLParagraphElement>(null);
  const generation = React.useRef(0);
  const load = React.useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError("");
    try {
      const result = await apiGet<LogbookSectionSettingsResponse>(endpoint);
      if (!result || !Array.isArray(result.sections) || !Array.isArray(result.categories) || !result.categories.length || typeof result.readOnly !== "boolean") {
        throw new Error("Could not load logbook sections");
      }
      if (request === generation.current) setData(result);
    } catch (error) {
      if (request === generation.current) setError(error instanceof Error ? error.message : "Could not load logbook sections");
    } finally { if (request === generation.current) setLoading(false); }
  }, [department.department.id]);
  React.useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  React.useEffect(() => { if (formError) errorRef.current?.focus(); }, [formError]);

  const edit = (section?: ManagedLogbookSection) => {
    setEditing(section ? { value: section.value, revision: section.revision } : null);
    if (section) {
      const { value, revision, ...definition } = section;
      setDraft(structuredClone(definition));
    } else setDraft(emptySection(data!.categories[0].id, Math.max(-1, ...data!.sections.map((section) => section.sortOrder)) + 1));
    setPreview({}); setFormError("");
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || busy || data?.readOnly) return;
    const participation = cleanChoices(draft.participation);
    const parsed = logbookSectionSettingsSchema.safeParse({ ...draft, participation: participation?.length ? participation : undefined,
      fields: draft.fields.map((field) => ({ ...field, ...(field.options ? { options: cleanChoices(field.options) } : {}) })) });
    if (!parsed.success) {
      setFormError(parsed.error.issues.map((issue) => `${issue.path.join(" → ")}: ${issue.message}`).join("; ")); return;
    }
    setBusy(true); setFormError("");
    try {
      if (editing) await apiPatch(`${endpoint}/${encodeURIComponent(editing.value)}`, { definition: parsed.data, revision: editing.revision });
      else await apiPost(endpoint, parsed.data);
      setDraft(null); setEditing(null);
      toast.success("Logbook section saved");
      await load();
      try { await department.refresh(); } catch { toast.warning("Section saved. Reload Requirements to refresh the department settings."); }
    } catch (error) { setFormError(error instanceof Error ? error.message : "Could not save logbook section"); }
    finally { setBusy(false); }
  };
  const update = (changes: Partial<LogbookSectionSettings>) => setDraft((current) => current ? { ...current, ...changes } : current);
  const fieldChange = (index: number, changes: Partial<AcademicLogbookField>) => {
    if (!draft) return;
    update({ fields: draft.fields.map((field, item) => item === index ? { ...field, ...changes } : field) });
  };
  const moveField = (index: number, direction: number) => {
    if (!draft) return;
    const fields = [...draft.fields];
    [fields[index], fields[index + direction]] = [fields[index + direction], fields[index]];
    update({ fields });
  };

  if (loading && !data) return <p role="status" className="py-6 text-sm text-slate-500">Loading logbook sections…</p>;
  if (error) return <div role="alert" className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-4"><p>{error}</p><Button variant="outline" onClick={load} disabled={loading}>Reload sections</Button></div>;
  if (!data) return null;
  const filtered = data.sections.filter((section) => section.name.toLowerCase().includes(query.toLowerCase()));

  return <section className="space-y-5" aria-label="Logbook section settings">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
      <div><h3 className="text-lg font-semibold text-slate-900">Logbook sections</h3><p className="mt-1 text-sm text-slate-500">Configure the sections, fields and requirements residents use in their logbook.</p></div>
      {!draft && <Button onClick={() => edit()} disabled={data.readOnly || loading}>Add logbook section</Button>}
    </div>
    {data.readOnly && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">These settings are inherited from the source department. Edit them using that department’s HOD account.</p>}
    {!draft ? <>
      <Control label="Search logbook sections"><Input value={query} onChange={(event) => setQuery(event.target.value)} /></Control>
      {!filtered.length && <p className="py-6 text-sm text-slate-500">{query ? "No matching sections." : "No logbook sections configured. Add your first section to get started."}</p>}
      <div className="divide-y divide-slate-200">{filtered.map((section) => <div key={section.value} className="flex items-center justify-between gap-3 py-4">
        <div><p className="font-medium text-slate-900">{section.name}{section.archived && <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Archived</span>}</p>
          <p className="mt-1 text-xs text-slate-500">{data.categories.find((category) => category.id === section.categoryId)?.title} · Years {section.years.join(", ")} · {section.fields.length} additional fields · {section.required ? `${section.required} ${section.period === "month" ? "per month" : "overall"}` : "No minimum set"}</p></div>
        <Button variant="outline" size="sm" onClick={() => edit(section)} disabled={loading}>{data.readOnly ? "View" : "Edit"}</Button>
      </div>)}</div>
    </> : <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_22rem]">
      <form onSubmit={save} className="min-w-0 space-y-5">
        <h4 className="font-semibold text-slate-900">{editing ? "Edit logbook section" : "New logbook section"}</h4>
        {formError && <p role="alert" ref={errorRef} tabIndex={-1} className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{formError}</p>}
        <fieldset disabled={busy || data.readOnly} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Control label="Section name"><Input required maxLength={160} value={draft.name} onChange={(event) => update({ name: event.target.value })} /></Control>
            <Control label="Navigation group"><select className={selectClass} value={draft.categoryId} onChange={(event) => update({ categoryId: event.target.value })}>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.title}</option>)}</select></Control>
            <Control label="Display order"><Input required type="number" min={0} max={10000} value={draft.sortOrder} onChange={(event) => update({ sortOrder: Number(event.target.value) })} /></Control>
            <div className="space-y-2"><p className="text-sm font-medium">Training years</p><div className="flex flex-wrap gap-4">{[1, 2, 3].map((year) => <Check key={year} label={`Year ${year}`} checked={draft.years.includes(year)} onChange={(checked) => update({ years: checked ? [...draft.years, year].sort() : draft.years.filter((item) => item !== year) })} />)}</div></div>
            <Control label="Topic field label"><Input required maxLength={160} value={draft.topicLabel} onChange={(event) => update({ topicLabel: event.target.value })} /></Control>
            <div className="flex items-center"><Check label="Use a multiline topic field" checked={draft.multilineTopic} onChange={(multilineTopic) => update({ multilineTopic })} /></div>
          </div>
          <Control label="Participation choices (one per line; leave blank to hide)"><Textarea rows={3} value={draft.participation?.join("\n") ?? ""} onChange={(event) => update({ participation: event.target.value ? event.target.value.split("\n") : undefined })} /></Control>
          <div className="grid gap-4 sm:grid-cols-2">
            <Control label="Required activity count"><Input type="number" required min={0} max={100000} value={draft.required} onChange={(event) => update({ required: Number(event.target.value) })} /></Control>
            <Control label="Requirement period"><select className={selectClass} value={draft.period} onChange={(event) => update({ period: event.target.value as "total" | "month" })}><option value="total">Overall</option><option value="month">Per month</option></select></Control>
          </div>
          <p className="text-xs text-slate-500">A required count of 0 means optional. Monthly requirements are tracked separately from the overall academic target.</p>
          <Check label="Archive this section" checked={draft.archived} onChange={(archived) => update({ archived })} />
          <p className="text-xs text-slate-500">Archiving stops new entries. Existing entries and their review history remain available.</p>
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between gap-3"><h4 className="font-semibold">Additional fields</h4><Button type="button" variant="outline" size="sm" disabled={draft.fields.length >= 40} onClick={() => update({ fields: [...draft.fields, { key: `f_${crypto.randomUUID().replaceAll("-", "")}`, label: "", type: "text" }] })}>Add field</Button></div>
            {!draft.fields.length && <p className="text-sm text-slate-500">Add fields when this section needs details beyond the date, topic, notes and reviewing faculty.</p>}
            {draft.fields.map((field, index) => <div key={field.key} className="space-y-4 rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold">Field {index + 1}</p><div className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" aria-label={`Move field ${index + 1} up`} disabled={index === 0} onClick={() => moveField(index, -1)}>↑</Button>
                <Button type="button" size="sm" variant="ghost" aria-label={`Move field ${index + 1} down`} disabled={index === draft.fields.length - 1} onClick={() => moveField(index, 1)}>↓</Button>
                <Button type="button" size="sm" variant="ghost" className="text-rose-700" onClick={() => update({ fields: draft.fields.filter((_, item) => item !== index) })}>Remove field {index + 1}</Button>
              </div></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Control label={`Field ${index + 1} label`}><Input required maxLength={160} value={field.label} onChange={(event) => fieldChange(index, { label: event.target.value })} /></Control>
                <Control label={`Field ${index + 1} type`}><select className={selectClass} value={field.type} onChange={(event) => fieldChange(index, { type: event.target.value as AcademicLogbookField["type"], options: event.target.value === "select" ? [] : undefined, min: undefined, max: undefined, maximumField: undefined, notBeforeLogDate: undefined, maxLength: undefined })}>
                  <option value="text">Short text</option><option value="textarea">Long text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Dropdown</option>
                </select></Control>
                <Control label={`Field ${index + 1} group heading (optional)`}><Input maxLength={160} value={field.group ?? ""} onChange={(event) => fieldChange(index, { group: event.target.value || undefined })} /></Control>
                <div className="flex items-center"><Check label={`Field ${index + 1} is required`} checked={!!field.required} onChange={(required) => fieldChange(index, { required })} /></div>
              </div>
              {field.type === "select" && <Control label={`Field ${index + 1} dropdown choices (one per line)`}><Textarea required rows={3} value={field.options?.join("\n") ?? ""} onChange={(event) => fieldChange(index, { options: event.target.value.split("\n") })} /></Control>}
              {["text", "textarea"].includes(field.type) && <Control label={`Field ${index + 1} maximum characters (optional)`}><Input type="number" min={1} max={2000} value={field.maxLength ?? ""} onChange={(event) => fieldChange(index, { maxLength: event.target.value === "" ? undefined : Number(event.target.value) })} /></Control>}
              {field.type === "number" && <div className="grid gap-4 sm:grid-cols-2">
                <Control label={`Field ${index + 1} minimum (optional)`}><Input type="number" step="any" value={field.min ?? ""} onChange={(event) => fieldChange(index, { min: event.target.value === "" ? undefined : Number(event.target.value) })} /></Control>
                <Control label={`Field ${index + 1} maximum (optional)`}><Input type="number" step="any" value={field.max ?? ""} onChange={(event) => fieldChange(index, { max: event.target.value === "" ? undefined : Number(event.target.value) })} /></Control>
                <Control label={`Field ${index + 1} must not exceed another field`}><select className={selectClass} value={field.maximumField ?? ""} onChange={(event) => fieldChange(index, { maximumField: event.target.value || undefined })}><option value="">No comparison</option>{draft.fields.filter((other) => other.key !== field.key && other.type === "number").map((other) => <option key={other.key} value={other.key}>{other.label || "Unnamed field"}</option>)}</select></Control>
              </div>}
              {field.type === "date" && <Check label={`Field ${index + 1} must be on or after the entry date`} checked={!!field.notBeforeLogDate} onChange={(notBeforeLogDate) => fieldChange(index, { notBeforeLogDate })} />}
              <details className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium">Conditional display and requirement</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Control label={`Show field ${index + 1} when`}><select className={selectClass} value={field.requiredWhen?.field ?? ""} onChange={(event) => fieldChange(index, { requiredWhen: event.target.value ? { field: event.target.value, value: "" } : undefined })}><option value="">Always show</option>{draft.fields.filter((other) => other.key !== field.key && !other.requiredWhen).map((other) => <option key={other.key} value={other.key}>{other.label || "Unnamed field"}</option>)}</select></Control>
                {field.requiredWhen && <Control label={`Field ${index + 1} source must equal`}>
                  {draft.fields.find((other) => other.key === field.requiredWhen!.field)?.type === "select"
                    ? <select required className={selectClass} value={field.requiredWhen.value} onChange={(event) => fieldChange(index, { requiredWhen: { ...field.requiredWhen!, value: event.target.value } })}><option value="">Choose a value</option>{draft.fields.find((other) => other.key === field.requiredWhen!.field)?.options?.filter(Boolean).map((option, item) => <option key={item} value={option}>{option}</option>)}</select>
                    : <Input required maxLength={160} value={field.requiredWhen.value} onChange={(event) => fieldChange(index, { requiredWhen: { ...field.requiredWhen!, value: event.target.value } })} />}
                </Control>}
              </div><p className="mt-2 text-xs text-slate-500">A conditional field is required whenever its source matches.</p></details>
            </div>)}
          </div>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setDraft(null); setEditing(null); }}>Cancel editing</Button>
          <Button type="submit" disabled={busy || data.readOnly}>{busy ? "Saving…" : "Save logbook section"}</Button>
        </div>
        {formError.includes("another session") && <Button type="button" variant="outline" onClick={() => { setDraft(null); setEditing(null); void load(); }}>Reload sections</Button>}
      </form>
      <aside className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/30 p-4" aria-label="Resident form preview">
        <div><h4 className="font-semibold text-teal-950">Resident form preview</h4><p className="mt-1 text-xs text-slate-500">Try the fields to check conditional choices. Preview values are never saved.</p></div>
        <p className="font-medium">{draft.name || "Section name"}</p>
        <Control label="Logbook year"><select className={selectClass}>{draft.years.map((year) => <option key={year}>Year {year}</option>)}</select></Control>
        <Control label="Date"><Input type="date" /></Control>
        <Control label={draft.topicLabel || "Topic / title"}>{draft.multilineTopic ? <Textarea /> : <Input />}</Control>
        {!!draft.participation?.filter(Boolean).length && <Control label="Participation"><select className={selectClass}><option value="">Select participation</option>{draft.participation.filter(Boolean).map((choice, index) => <option key={index}>{choice}</option>)}</select></Control>}
        <AcademicRecordFields section={{ ...draft, value: editing?.value ?? "preview" }} values={preview} onChange={setPreview} />
        <Control label="Notes (optional)"><Textarea /></Control>
        <p className="text-xs text-slate-500">Residents select an approved reviewing faculty member when submitting.</p>
      </aside>
    </div>}
  </section>;
}
