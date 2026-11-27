import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { SHORT_CASE_ACTIVITIES, SHORT_CASE_CATEGORY, SHORT_CASE_REFERRALS, SHORT_CASE_SETTINGS, SHORT_CASE_TAGS, resolvePsychiatryDiagnosis, psychiatryDiagnosisLabel, isPsychiatryShortCase, type PsychiatryShortCase } from "@workspace/api-zod";
import { Chapter06DiagnosisPicker } from "@/components/Chapter06DiagnosisPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { localDateValue } from "@/lib/quarterly-appraisal";
import { useCurrentUser } from "@/hooks/use-current-user";

export const SHORT_CASES_PATH = "/psychiatry/short-cases";

type CaseEntry = {
  id: number;
  category: string;
  date: string;
  patientAge: string;
  patientGender: "male" | "female" | "other";
  diagnosisFinal: string;
  supervisorId: number;
  supervisorName: string | null;
  managementPlan: string | null;
  learningPoints: string | null;
  facultyRemarks: string | null;
  status: "pending" | "verified" | "rejected";
  customFields: Record<string, string>;
};

type Form = PsychiatryShortCase & { age: string; sex: CaseEntry["patientGender"] | ""; plan: string; consultant: string; learningPoint: string };
const initialForm: Form = { seenIn: "OPD", diagnosisCode: "", tags: [], activities: [], referredFrom: "", age: "", sex: "", plan: "", consultant: "", learningPoint: "" };
const statusLabels = { pending: "Pending", verified: "Verified", rejected: "Returned" };
const selectStyle = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium"><span>{label}</span>{children}</label>;
}

function Chips<T extends string>({ label, options, selected, onToggle }: { label: string; options: readonly T[]; selected: readonly T[]; onToggle: (value: T) => void }) {
  return <fieldset className="space-y-2"><legend className="text-sm font-medium">{label}</legend>
    <div className="flex flex-wrap gap-2">{options.map((option) => <button key={option} type="button" aria-pressed={selected.includes(option)} onClick={() => onToggle(option)}
      className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-sm text-teal-900 hover:bg-teal-50 aria-pressed:border-teal-600 aria-pressed:bg-teal-600 aria-pressed:text-white">
      {option}
    </button>)}</div>
  </fieldset>;
}

function toggle<T>(current: T[], value: T) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function formFor(entry?: CaseEntry): Form {
  if (!entry) return initialForm;
  const values = entry.customFields;
  return {
    seenIn: SHORT_CASE_SETTINGS.find((option) => option === values.psychiatrySeenIn) ?? "OPD",
    diagnosisCode: values.psychiatryDiagnosisCode ?? "",
    tags: SHORT_CASE_TAGS.filter((option) => values.psychiatryTags?.split(", ").includes(option)),
    activities: SHORT_CASE_ACTIVITIES.filter((option) => values.psychiatryActivities?.split(", ").includes(option)),
    referredFrom: SHORT_CASE_REFERRALS.find((option) => option === values.psychiatryReferredFrom) ?? "",
    age: entry.patientAge, sex: entry.patientGender,
    plan: entry.managementPlan ?? "", consultant: String(entry.supervisorId ?? ""), learningPoint: entry.learningPoints ?? "",
  };
}

function ShortCaseForm({ entry, studentId, departmentId, onSave }: { entry?: CaseEntry; studentId: number; departmentId: number; onSave: () => void }) {
  const [, navigate] = useLocation();
  const [form, setForm] = useState(() => formFor(entry));
  const [faculty, setFaculty] = useState<Array<{ id: number; name?: string; fullName?: string }> | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    apiGet<NonNullable<typeof faculty>>(`/api/departments/${departmentId}/professors`)
      .then((result) => { if (active) setFaculty(result); })
      .catch(() => { if (active) setError("Unable to load consultants. Reload the page to try again."); });
    return () => { active = false; };
  }, [departmentId]);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !faculty) return;
    const diagnosis = resolvePsychiatryDiagnosis(form.diagnosisCode);
    if (!diagnosis) { setError("Choose or enter a diagnosis."); return; }
    const endpoint = `/api/students/${studentId}/case-logs`;
    const payload = {
      date: entry?.date ?? localDateValue(), category: SHORT_CASE_CATEGORY,
      patientAge: form.age, patientGender: form.sex,
      supervisorId: Number(form.consultant), diagnosisFinal: psychiatryDiagnosisLabel(diagnosis),
      managementPlan: form.plan, learningPoints: form.learningPoint,
      psychiatryShortCase: { seenIn: form.seenIn, diagnosisCode: diagnosis.code, tags: form.tags, activities: form.activities, referredFrom: form.referredFrom },
    };
    setSaving(true);
    setError("");
    try {
      if (entry) await apiPatch(`${endpoint}/${entry.id}`, payload);
      else await apiPost(endpoint, payload);
      onSave();
      navigate(SHORT_CASES_PATH);
    } catch {
      setError("Unable to save the short case. Your changes are still in the form.");
      setSaving(false);
    }
  }

  return <>
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-teal-800">New entry</p><h1 className="text-3xl font-bold">{entry ? "Edit short case" : "Add short case"}</h1></div>
      <Button variant="outline" asChild><Link href={SHORT_CASES_PATH}>Cancel</Link></Button>
    </div>
    <form onSubmit={save} className="mt-6 w-full max-w-2xl space-y-4 rounded-2xl border border-teal-200 bg-white p-5 shadow-sm">
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {entry?.facultyRemarks && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{entry.facultyRemarks}</p>}
      <Chips label="Seen in" options={SHORT_CASE_SETTINGS} selected={[form.seenIn]} onToggle={(value) => update("seenIn", value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Age"><Input className="rounded-[10px] border-[#d9e6e2]" required type="number" min={0} step={1} value={form.age} onChange={(event) => update("age", event.target.value)} /></Field>
        <Field label="Sex"><select required className={selectStyle} value={form.sex} onChange={(event) => update("sex", event.target.value as Form["sex"])}>
          <option value="">Select</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
        </select></Field>
      </div>
      <Chapter06DiagnosisPicker code={form.diagnosisCode} onSelect={(code) => update("diagnosisCode", code)} />
      <Chips label="Tags (select all that apply)" options={SHORT_CASE_TAGS} selected={form.tags} onToggle={(value) => update("tags", toggle(form.tags, value))} />
      <Chips label="What you did" options={SHORT_CASE_ACTIVITIES} selected={form.activities} onToggle={(value) => update("activities", toggle(form.activities, value))} />
      <Field label="Plan (one line)"><Input className="rounded-[10px] border-[#d9e6e2]" maxLength={1000} value={form.plan} onChange={(event) => update("plan", event.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Referred from (optional)"><select className={selectStyle} value={form.referredFrom} onChange={(event) => update("referredFrom", event.target.value as Form["referredFrom"])}>
        <option value="">Select</option>{SHORT_CASE_REFERRALS.map((name) => <option key={name}>{name}</option>)}
      </select></Field>
      <Field label="Consultant"><select required className={selectStyle} value={form.consultant} onChange={(event) => update("consultant", event.target.value)}>
        <option value="">{faculty ? "Select a consultant" : "Loading consultants…"}</option>
        {faculty?.map((person) => <option value={person.id} key={person.id}>{person.name ?? person.fullName}</option>)}
      </select></Field></div>
      <Field label="Learning point (optional)"><Input className="rounded-[10px] border-[#d9e6e2]" maxLength={1000} value={form.learningPoint} onChange={(event) => update("learningPoint", event.target.value)} /></Field>
      <Button type="submit" disabled={saving || !faculty} className="bg-teal-700 text-white hover:bg-teal-800">{saving ? "Saving…" : "Save"}</Button>
    </form>
  </>;
}

export function PsychiatryShortCasesPage({ mode = "list", entryId, onSave }: { mode?: "list" | "add" | "edit"; entryId?: number; onSave: () => void }) {
  const user = useCurrentUser();
  const studentId = user?.studentProfileId;
  const departmentId = user?.departmentId;
  const [entries, setEntries] = useState<CaseEntry[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async (signal: AbortSignal) => {
    if (!studentId || mode === "add") return;
    try {
      const data = await apiGet<{ caseLogs: CaseEntry[] }>(`/api/students/${studentId}/logs`, { signal });
      if (!signal.aborted) setEntries(data.caseLogs.filter(isPsychiatryShortCase));
    } catch {
      if (!signal.aborted) setError("Unable to load your short cases. Reload the page to try again.");
    }
  }, [studentId, mode]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (!studentId || !departmentId || user?.isDemoMode) return <p role="alert">An active resident account is required.</p>;
  const entry = entries?.find((row) => row.id === entryId);
  return <section className="text-slate-900">
    {mode === "add" ? <ShortCaseForm studentId={studentId} departmentId={departmentId} onSave={onSave} /> : error ? <p role="alert" className="text-rose-800">{error}</p> : mode === "edit" ? (
      entries === null ? <p role="status">Loading short case…</p> : entry && entry.status !== "verified" ?
        <ShortCaseForm key={entry.id} entry={entry} studentId={studentId} departmentId={departmentId} onSave={onSave} /> :
        <p role="alert">This short case is unavailable for editing. <Link className="underline" href={SHORT_CASES_PATH}>Return to Short cases</Link></p>
    ) : <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div><h1 className="text-3xl font-bold">Short cases</h1><p className="mt-1 text-sm text-slate-600">One-visit clinical entries</p></div>
        <Button asChild className="bg-teal-700 text-white hover:bg-teal-800"><Link href={`${SHORT_CASES_PATH}/new`}>Add short case</Link></Button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-teal-200 bg-white">
        {entries === null ? <p role="status" className="p-4">Loading short cases…</p> : entries.length === 0 ? <p className="p-4 text-sm text-slate-600">Nothing here yet.</p> :
          <table className="w-full text-left text-sm">
            <thead className="bg-teal-50 text-xs uppercase tracking-wide text-teal-950"><tr>{["Date", "Seen in", "Diagnosis", "Tags", "What you did", "Status", "Actions"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
            <tbody>{entries.map((row) => <tr key={row.id} className="border-t border-teal-100 align-top">
              <td className="whitespace-nowrap p-3">{row.date}</td><td className="p-3">{row.customFields.psychiatrySeenIn}</td>
              <td className="p-3">{row.diagnosisFinal}</td><td className="p-3">{row.customFields.psychiatryTags}</td><td className="p-3">{row.customFields.psychiatryActivities}</td>
              <td className="p-3"><span className="rounded-full bg-teal-50 px-2 py-1">{statusLabels[row.status]}</span></td>
              <td className="p-3">{row.status !== "verified" && <Link className="text-teal-800 underline" href={`${SHORT_CASES_PATH}/${row.id}/edit`}>{row.status === "rejected" ? "Revise" : "Edit"}</Link>}</td>
            </tr>)}</tbody>
          </table>}
      </div>
    </>}
  </section>;
}
