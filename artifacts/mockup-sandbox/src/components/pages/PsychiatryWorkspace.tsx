import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Bell, BookOpen, CalendarDays, ClipboardList, FileText, Home, LogOut, Menu, Printer, Stethoscope, X } from "lucide-react";
import {
  PSYCHIATRY_BASE, PSYCHIATRY_ICUS, psychiatryFieldVisible, psychiatryNavigation, psychiatryPages, psychiatryDiagnosisLabel, resolvePsychiatryDiagnosis,
  SHORT_CASE_REFERRALS, SHORT_CASE_TAGS, isPsychiatryShortCase, type PsychiatryDiagnosisRow, type PsychiatryField, type PsychiatryPage, type PsychiatryValues,
} from "@workspace/api-zod";
import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { useDepartment } from "@/lib/department-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { localDateValue } from "@/lib/quarterly-appraisal";
import { Chapter06DiagnosisPicker } from "@/components/Chapter06DiagnosisPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThesisPage } from "@/components/pages/ThesisPage";
import { PsychiatryShortCasesPage, SHORT_CASES_PATH } from "@/components/pages/PsychiatryShortCasesPage";

type Diagnosis = { code: string; title: string; uri: string };
type StoredRow = Partial<PsychiatryDiagnosisRow> & { diagnosis: Diagnosis };
type Entry = {
  id: number; section: string; values: Record<string, string | string[] | Diagnosis>; diagnosisRows: StoredRow[]; month?: string;
  status: "draft" | "pending" | "verified" | "rejected" | "recorded"; reviewNote?: string; own?: boolean;
  reviewerId?: number; reviewerName?: string; attendeeNames?: string[]; attendeeIds?: number[]; revision: number; residentName?: string;
};
type Roster = Array<{ id: number; name: string; role: string }>;
type ResidentData = { caseLogs: Array<{ id: number; category: string; status: string; customFields?: Record<string, string> }>;
  profile: { registrationNumber: string | null; joiningYear: string | null; mentorName: string | null; dateOfJoining: string | null } };
type Thesis = { protocolStatus: string; midTermStatus: string; finalSubmissionStatus: string; iecClearanceDate: string | null };
const endpoint = "/api/psychiatry";
const box = "rounded-2xl border border-[#d3e7e2] bg-white p-5 shadow-sm";
const selectStyle = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm";
const entryLink = (section: string) => `${PSYCHIATRY_BASE}/${section}`;
const parentSection = (section: string) => section.startsWith("psy-") ? "psy" : section;
const defaultDiagnosisRow: PsychiatryDiagnosisRow = { diagnosisCode: "", medical: "", count: 1, visit: "Fresh", tags: [], department: "Medicine", icu: "" };
const reviewLabels = { draft: "Draft", pending: "Pending", verified: "Verified", rejected: "Returned", recorded: "Recorded" };

function Heading({ title, help, action }: { title: string; help?: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div>
    {help && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-teal-800">{help}</p>}
    <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
  </div>{action}</div>;
}

function Flag({ status, monthly, shared }: { status: Entry["status"]; monthly?: boolean; shared?: boolean }) {
  const name = status === "verified" ? monthly ? "Signed" : shared ? "Chair verified" : "Verified" : reviewLabels[status];
  const tone = status === "rejected" ? "bg-rose-100 text-rose-800" : status === "pending" || status === "draft" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900";
  return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{name}</span>;
}

function display(value: unknown): ReactNode {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object" && "code" in value && "title" in value && "uri" in value) return psychiatryDiagnosisLabel(value as Diagnosis);
  if (typeof value === "string" || typeof value === "number") return value;
  return "—";
}

function Table({ columns, rows, actions }: { columns: PsychiatryPage["columns"]; rows: Array<{ id?: number; [key: string]: unknown }>; actions?: (id: number) => ReactNode }) {
  return <div className="overflow-x-auto rounded-xl border border-[#d3e7e2] bg-white">
    <table className="w-full text-left text-sm"><thead className="bg-teal-50/80 text-xs uppercase tracking-wide text-teal-950"><tr>
      {columns.map(([key, title]) => <th className="px-4 py-3" key={key} scope="col">{title}</th>)}{actions && <th scope="col" className="sr-only">Actions</th>}
    </tr></thead><tbody>
      {!rows.length ? <tr><td colSpan={columns.length + Number(Boolean(actions))} className="px-4 py-5 text-slate-600">Nothing here yet.</td></tr> : rows.map((row, index) => <tr key={row.id ?? index} className="border-t border-slate-100 align-top">
        {columns.map(([key]) => <td key={key} className="px-4 py-3">{key === "status" && typeof row.status === "string" && row.status in reviewLabels ? <Flag status={row.status as Entry["status"]} shared={Boolean(row.shared)} /> : display(row[key])}</td>)}
        {actions && <td className="px-4 py-3">{row.id !== undefined && actions(row.id)}</td>}
      </tr>)}
    </tbody></table>
  </div>;
}

function entryRow(entry: Entry, page: PsychiatryPage) {
  return { ...entry.values, id: entry.id, status: entry.status, shared: page.shared, reviewerName: entry.reviewerName,
    attendeeCount: entry.attendeeNames?.length, attendeeNames: entry.attendeeNames,
    role: page.shared ? entry.own ? entry.values.role ?? (entry.section === "a_intern" ? "Conducted" : "Presented") : entry.own === false ? "Attended" : undefined : entry.values.role,
    period: entry.values.month ?? (entry.values.admittedAt ? `${entry.values.admittedAt} – ${entry.values.dischargedAt}` : undefined),
  };
}

function WorkList({ section, page, records }: { section: string; page: PsychiatryPage; records: Entry[] }) {
  const [departmentWide, setDepartmentWide] = useState(false);
  const [departmentRecords, setDepartmentRecords] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!departmentWide || !page.shared) return;
    const controller = new AbortController();
    apiGet<Entry[]>(`${endpoint}/entries?view=department&section=${encodeURIComponent(section)}`, { signal: controller.signal })
      .then((rows) => { if (!controller.signal.aborted) setDepartmentRecords(rows); })
      .catch(() => { if (!controller.signal.aborted) setError("Unable to load department sessions."); });
    return () => controller.abort();
  }, [departmentWide, page.shared, section]);

  const monthCards = page.monthly ? records.map((entry) => {
    const rows = entry.diagnosisRows;
    const sum = (visit?: string) => rows.filter((row) => !visit || row.visit === visit).reduce((total, row) => total + (row.count ?? 0), 0);
    return <article className={`${box} space-y-4`} key={entry.id}>
      <header className="flex flex-wrap items-center justify-between gap-2"><div>
        <h2 className="font-bold text-slate-900">{entry.month && new Date(`${entry.month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
        <p className="text-sm text-slate-600">{page.monthly === "counts" ? `Fresh ${sum("Fresh")} · Review ${sum("Review")}` : `${sum()} ${section === "cl" ? "referrals" : "emergencies"}`}</p>
      </div><div className="flex items-center gap-3"><Flag status={entry.status} monthly />{entry.own && entry.status !== "verified" && <Link className="text-sm text-teal-800 underline" href={`${entryLink(section)}/${entry.id}/edit`}>Edit</Link>}</div></header>
      {entry.reviewNote && <p className="rounded-lg bg-amber-50 p-3 text-sm">{entry.reviewNote}</p>}
      <Table columns={page.columns} rows={rows.map((row) => ({ ...row, department: [row.department, row.icu].filter(Boolean).join(" · ") }))} />
    </article>;
  }) : null;
  const tableRows = departmentWide ? (departmentRecords ?? []).map((entry) => records.find((row) => row.id === entry.id) ?? entry) : records;
  const activeRecords = records.filter((entry) => entry.status !== "rejected");
  const owned = activeRecords.filter((entry) => entry.own);
  const presented = section === "a_cme" ? owned.filter((entry) => entry.values.role !== "Attended").length : owned.length;
  const attended = section === "a_cme" ? activeRecords.length - presented : activeRecords.length - owned.length;
  return <div className="space-y-4">
    <Heading title={page.title} help={page.monthly ? page.title : undefined} action={<Button className="bg-teal-700 text-white hover:bg-teal-800" asChild><Link href={`${entryLink(section)}/new`}>{page.add}</Link></Button>} />
    {page.monthly && <p className="-mt-4 text-sm text-slate-600">{page.monthly === "counts" ? "Per month: each diagnosis with number, fresh or review, and tags. One consultant signature per month." : "Per month: diagnoses and referring departments. One consultant signature per month."}</p>}
    {page.shared && <div className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-teal-100 px-3 py-1">{section === "a_cme" ? "Papers / posters" : section === "a_intern" ? "Conducted" : "Presented"} {presented}</span>
      <span className="rounded-full bg-white px-3 py-1">Attended {attended}</span></div>}
    {page.shared && <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant={departmentWide ? "outline" : "default"} onClick={() => setDepartmentWide(false)}>My logbook</Button>
      <Button variant={departmentWide ? "default" : "outline"} onClick={() => { if (!departmentWide) { setError(""); setDepartmentRecords(null); setDepartmentWide(true); } }}>All department sessions</Button>
    </div>}
    {page.monthly ? (monthCards?.length ? monthCards : <p className={box}>Nothing here yet.</p>) : departmentWide && error ? <p role="alert">{error}</p> : departmentWide && !departmentRecords ?
      <p role="status">Loading department sessions…</p> : <Table columns={page.columns} rows={tableRows.map((entry) => entryRow(entry, page))}
        actions={(id) => <Link className="text-teal-800 underline" href={`${entryLink(section)}/${id}`}>Open</Link>} />}
  </div>;
}

function Chips({ label, options, selected, set }: { label: string; options: Array<{ key: string; text: string }>; selected: string[]; set: (values: string[]) => void }) {
  return <fieldset className="space-y-2"><legend className="text-sm font-medium">{label}</legend><div className="flex flex-wrap gap-2">
    {options.map(({ key, text }) => <button type="button" aria-pressed={selected.includes(key)} key={key} onClick={() => set(selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key])}
      className="rounded-full border border-teal-200 px-3 py-1.5 text-sm text-teal-950 aria-pressed:border-teal-600 aria-pressed:bg-teal-600 aria-pressed:text-white">{text}</button>)}
  </div></fieldset>;
}

function FormField({ field, value, set, roster, section }: { field: PsychiatryField; value: string | string[] | undefined; set: (value: string | string[]) => void; roster: Roster; section: string }) {
  const radioName = useId();
  if (field.kind === "diagnosis") return <Chapter06DiagnosisPicker code={typeof value === "string" ? value : ""} onSelect={set} />;
  if (field.kind === "radio") return <fieldset className="space-y-2"><legend className="text-sm font-medium">{field.label}</legend>
    <div className="flex flex-wrap gap-2">{field.choices?.map((choice) => <label key={choice} className="cursor-pointer rounded-full border border-teal-200 bg-white px-3 py-1.5 text-sm text-teal-950 has-checked:bg-teal-700 has-checked:text-white has-focus-visible:ring-2">
      <input className="sr-only" type="radio" name={radioName} value={choice} checked={value === choice} onChange={() => set(choice)} />{choice}
    </label>)}</div></fieldset>;
  if (field.kind === "chips" || field.kind === "attendees") {
    const options = field.kind === "attendees" ? roster.filter((person) => !["comm", "a_cme"].includes(section) || person.role === "student").map((person) => ({ key: String(person.id), text: person.name })) :
      (field.choices ?? []).map((choice) => ({ key: choice, text: choice }));
    return <Chips label={field.label} options={options} selected={Array.isArray(value) ? value : []} set={set} />;
  }
  const text = typeof value === "string" ? value : "";
  const options = field.kind === "faculty" ? roster.filter((person) => person.role !== "student").map((person) => ({ key: String(person.id), text: person.name })) :
    (field.choices ?? []).map((choice) => ({ key: choice, text: choice }));
  return <label className="block space-y-1.5 text-sm font-medium"><span>{field.label}</span>
    {field.kind === "select" || field.kind === "faculty" ? <select className={selectStyle} value={text} onChange={(event) => set(event.target.value)}>
      <option value="">Select</option>{options.map(({ key, text: label }) => <option key={key} value={key}>{label}</option>)}
    </select> : field.kind === "textarea" ? <Textarea maxLength={4000} value={text} onChange={(event) => set(event.target.value)} /> :
      <Input className="rounded-[10px] border-[#d9e6e2]" type={field.kind} maxLength={4000} value={text} onChange={(event) => set(event.target.value)} />}
  </label>;
}

function MonthlyDiagnosis({ row, mode, onChange }: { row: PsychiatryDiagnosisRow; mode: NonNullable<PsychiatryPage["monthly"]>; onChange: (row: PsychiatryDiagnosisRow) => void }) {
  return <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/30 p-4">
    <Chapter06DiagnosisPicker code={row.diagnosisCode} onSelect={(diagnosisCode) => onChange({ ...row, diagnosisCode })} />
    <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
      <FormField field={{ key: "medical", label: "Medical diagnosis", kind: "text" }} value={row.medical} roster={[]} section="" set={(medical) => onChange({ ...row, medical: String(medical) })} />
      <FormField field={{ key: "count", label: "Number", kind: "select", choices: Array.from({ length: 50 }, (_, index) => String(index + 1)) }} value={String(row.count)} roster={[]} section="" set={(count) => onChange({ ...row, count: Number(count) })} />
    </div>
    {mode === "counts" ? <>
      <FormField field={{ key: "type", label: "Type", kind: "select", choices: ["Fresh", "Review"] }} value={row.visit} roster={[]} section="" set={(visit) => onChange({ ...row, visit: visit as PsychiatryDiagnosisRow["visit"] })} />
      <Chips label="Tags" options={SHORT_CASE_TAGS.map((tag) => ({ key: tag, text: tag }))} selected={row.tags} set={(tags) => onChange({ ...row, tags: tags as PsychiatryDiagnosisRow["tags"] })} />
    </> : <>
      <FormField field={{ key: "department", label: "Department", kind: "select", choices: SHORT_CASE_REFERRALS }} value={row.department} roster={[]} section="" set={(department) => onChange({ ...row, department: department as PsychiatryDiagnosisRow["department"], icu: "" })} />
      {row.department === "ICU" && <FormField field={{ key: "icu", label: "Which ICU", kind: "select", choices: PSYCHIATRY_ICUS }} value={row.icu} roster={[]} section="" set={(icu) => onChange({ ...row, icu: icu as PsychiatryDiagnosisRow["icu"] })} />}
    </>}
  </div>;
}

function initialValues(page: PsychiatryPage, entry?: Entry): PsychiatryValues {
  const date = localDateValue();
  return Object.fromEntries(page.fields.map((field) => {
    const current = entry?.values[field.key];
    const fallback = field.kind === "date" ? date : field.kind === "month" ? date.slice(0, 7) : field.kind === "select" || field.kind === "radio" ? field.choices?.[0] ?? "" : field.kind === "chips" ? [] : "";
    const value = field.kind === "attendees" ? (entry?.attendeeIds ?? []).map(String) : field.kind === "faculty" ? String(entry?.reviewerId ?? "") :
      current && typeof current === "object" && !Array.isArray(current) ? current.code : current ?? fallback;
    return [field.key, value];
  }));
}

function EntryForm({ section, page, entry, onSaved }: { section: string; page: PsychiatryPage; entry?: Entry; onSaved: () => void }) {
  const [values, setValues] = useState(() => initialValues(page, entry));
  const [rows, setRows] = useState(() => entry?.diagnosisRows.length ? entry.diagnosisRows.map(({ diagnosis, ...row }, key) => ({ key, value: { ...defaultDiagnosisRow, ...row, diagnosisCode: diagnosis.code } })) : page.monthly ? [{ key: 0, value: { ...defaultDiagnosisRow } }] : []);
  const nextRow = useRef(rows.length);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const needsRoster = page.fields.some(({ kind }) => kind === "faculty" || kind === "attendees");
  useEffect(() => {
    if (!needsRoster) return;
    const controller = new AbortController();
    apiGet<Roster>(`${endpoint}/roster`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setRoster(result); })
      .catch(() => { if (!controller.signal.aborted) setError("Unable to load your department roster."); });
    return () => controller.abort();
  }, [needsRoster]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (needsRoster && !roster)) return;
    const button = (event.nativeEvent as SubmitEvent).submitter;
    const draft = button?.getAttribute("value") === "draft";
    if (rows.some(({ value }) => !resolvePsychiatryDiagnosis(value.diagnosisCode))) {
      setError("Choose or enter a psychiatric diagnosis for each row.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const diagnosis = values.diagnosis;
      const draftValues = draft && typeof diagnosis === "string" && diagnosis.trim() === "text:" ? { ...values, diagnosis: "" } : values;
      const payload = { values: draftValues, rows: rows.map(({ value }) => value), draft, ...(entry ? { revision: entry.revision } : {}) };
      const url = `${endpoint}/entries/${section}`;
      if (entry) await apiPatch(`${url}/${entry.id}`, payload);
      else await apiPost(url, payload);
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to save this entry.");
    } finally {
      setBusy(false);
    }
  }

  return <><Heading title={entry ? `Edit ${page.add.replace(/^Add /, "")}` : page.add} help="New entry" action={<Button variant="outline" asChild><Link href={entryLink(parentSection(section))}>Cancel</Link></Button>} />
    <form className={`${box} max-w-2xl space-y-4`} onSubmit={save}>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-rose-800">{error}</p>}
      {entry?.reviewNote && <p className="rounded-lg bg-amber-50 p-3">{entry.reviewNote}</p>}
      {page.fields.filter((field) => psychiatryFieldVisible(field, values)).map((field) => <FormField key={field.key} field={field} value={values[field.key]} roster={roster ?? []} section={section}
        set={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />)}
      {page.monthly && <div className="space-y-3">
        {rows.map(({ key, value }) => <div key={key} className="space-y-2">
          <MonthlyDiagnosis row={value} mode={page.monthly!} onChange={(next) => setRows((current) => current.map((row) => row.key === key ? { key, value: next } : row))} />
          {rows.length > 1 && <Button type="button" variant="ghost" onClick={() => setRows((current) => current.filter((row) => row.key !== key))}>Remove diagnosis</Button>}
        </div>)}
        <Button type="button" variant="outline" disabled={rows.length >= 50} onClick={() => { const key = nextRow.current++; setRows((current) => [...current, { key, value: { ...defaultDiagnosisRow } }]); }}>Add another diagnosis</Button>
      </div>}
      <div className="flex gap-2">{page.draft && <Button type="submit" value="draft" variant="outline" disabled={busy || (needsRoster && !roster)}>Save draft</Button>}
        <Button type="submit" disabled={busy || (needsRoster && !roster)}>{busy ? "Saving…" : "Save"}</Button></div>
    </form>
  </>;
}

function EntryDetails({ entry, page, review }: { entry: Entry; page: PsychiatryPage; review?: ReactNode }) {
  const map = entryRow(entry, page);
  const canEdit = entry.own && entry.status !== "verified";
  return <><Heading title={typeof entry.values.topic === "string" ? entry.values.topic : page.title}
    action={review ? undefined : <div className="flex gap-2"><Button variant="outline" asChild><Link href={entryLink(parentSection(entry.section))}>Back</Link></Button>
      {canEdit && <Button asChild><Link href={`${entryLink(entry.section)}/${entry.id}/edit`}>{entry.status === "rejected" ? "Revise" : "Edit"}</Link></Button>}</div>} />
    <article className={`${box} max-w-3xl space-y-4`}>
      {entry.residentName && <p className="font-medium">{entry.residentName}</p>}
      <Flag status={entry.status} monthly={Boolean(page.monthly)} shared={page.shared} />
      <dl className="grid gap-3 sm:grid-cols-2">
        {page.fields.map(({ key, label }) => {
          const value = key === "reviewerId" ? entry.reviewerName : key === "attendees" ? entry.attendeeNames : map[key as keyof typeof map];
          return value ? <div key={key}><dt className="text-xs font-semibold uppercase text-slate-600">{label}</dt><dd className="whitespace-pre-wrap break-words">{display(value)}</dd></div> : null;
        })}
      </dl>
      {entry.reviewNote && <p className="rounded-lg bg-amber-50 p-3">{entry.reviewNote}</p>}
      {entry.diagnosisRows?.length > 0 && <Table columns={page.columns} rows={entry.diagnosisRows.map((row) => ({ ...row, department: [row.department, row.icu].filter(Boolean).join(" · ") }))} />}
      {review}
    </article>
  </>;
}

function DepartmentSession({ section, id, page }: { section: string; id: number; page: PsychiatryPage }) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    apiGet<Entry>(`${endpoint}/sessions/${section}/${id}`, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setEntry(data); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [id, section]);
  if (error) return <p role="alert">This session is unavailable. <Link className="underline" href={entryLink(section)}>Back</Link></p>;
  return entry ? <EntryDetails entry={entry} page={page} /> : <p role="status">Loading session…</p>;
}

function HomePage({ data, records }: { data: ResidentData; records: Entry[] }) {
  const user = useCurrentUser();
  const { config, department } = useDepartment();
  const short = data.caseLogs.filter(isPsychiatryShortCase);
  const returned = records.filter((row) => row.own && row.status === "rejected");
  const returnedShort = short.filter((row) => row.status === "rejected");
  const returnedCount = returned.length + returnedShort.length;
  const returnedHref = returned.length ? `${entryLink(returned[0].section)}/${returned[0].id}` : returnedShort.length ? `${SHORT_CASES_PATH}/${returnedShort[0].id}/edit` : SHORT_CASES_PATH;
  const academics = records.filter((row) => row.own && ["recorded", "verified"].includes(row.status) &&
    (["a_cp", "a_sem", "a_jc"].includes(row.section) || (row.section === "a_cme" && ["Paper presented", "Poster presented"].includes(String(row.values.role)))));
  const added = records.filter((row) => !row.own && row.section.startsWith("a_"));
  return <div className="space-y-5">
    {returnedCount > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900"><div><p className="font-semibold">{returnedCount} {returnedCount === 1 ? "entry" : "entries"} returned for revision</p><p className="text-sm">Review the consultant’s remarks and resubmit.</p></div><Button variant="outline" asChild><Link href={returnedHref}>Review &amp; resubmit</Link></Button></div>}
    <section className="grid items-center gap-4 rounded-2xl bg-[#104e4d] p-6 text-white md:grid-cols-[1.3fr_1fr]"><div><p className="text-xs font-semibold uppercase tracking-wide text-teal-100">{department.name}</p>
      <h1 className="mt-1 text-3xl font-bold">Welcome back, {user?.name}</h1><p className="mt-1 text-sm text-teal-100">Your cases, academics and consultant reviews in one place.</p></div>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-white/10 p-4 text-sm">{[["Registration", data.profile.registrationNumber], ["Batch", data.profile.joiningYear], ["Guide", data.profile.mentorName], ["Joined", data.profile.dateOfJoining]].map(([label, value]) =>
        <div key={label}><dt className="text-xs uppercase tracking-wide text-teal-100">{label}</dt><dd className="font-semibold">{value || "—"}</dd></div>)}</dl>
    </section>
    <div className="grid gap-3 sm:grid-cols-3">
      {[["Add short case", SHORT_CASES_PATH], ["Add long case", entryLink("long")], ["Add C-L month", entryLink("cl")]].map(([title, href]) =>
        <Link key={href} href={`${href}/new`} className={`${box} flex items-center gap-2 font-semibold text-teal-900 hover:bg-teal-50`}><ClipboardList className="size-5" />{title}</Link>)}
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[["Long cases", records.filter((row) => row.section === "long" && row.own && row.status !== "draft" && row.status !== "rejected").length, null],
        ["Short cases", short.filter((row) => row.status !== "rejected").length, config?.requiredCases], ["Academics presented", academics.length, config?.requiredAcademic]].map(([title, count, target]) =>
        <section className={box} key={title}><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</p><p className="mt-1 text-3xl font-bold">{count}</p>
          {typeof target === "number" && target > 0 && <><progress className="h-2 w-full accent-teal-700" value={Number(count)} max={target} aria-label={`${title} progress`} /><p className="text-xs text-slate-600">{count} of {target}</p></>}</section>)}
    </div>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Added to your logbook by others</h2><Table columns={[["date", "Date"], ["topic", "Session"], ["status", "Status"]]} rows={added.map((row) => ({ ...row.values, id: row.id, status: row.status, shared: true }))} /></section>
  </div>;
}

function Summary({ data, records, studentId }: { data: ResidentData; records: Entry[]; studentId: number }) {
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [thesisState, setThesisState] = useState<"loading" | "loaded" | "error">("loading");
  useEffect(() => {
    const controller = new AbortController();
    apiGet<{ data: Thesis | null }>(`/api/students/${studentId}/thesis`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setThesis(result.data); setThesisState("loaded"); } })
      .catch(() => { if (!controller.signal.aborted) setThesisState("error"); });
    return () => controller.abort();
  }, [studentId]);
  const valid = records.filter((row) => row.status !== "draft" && row.status !== "rejected");
  const count = (section: string) => valid.filter((entry) => entry.section === section).length;
  const presented = (section: string) => valid.filter((entry) => entry.section === section && entry.own).length;
  const total = (section: string) => valid.filter((row) => row.section === section).flatMap((row) => row.diagnosisRows).reduce((sum, row) => sum + (row.count ?? 0), 0);
  const lines: Array<[string, number | string]> = [
    ["OPD cases (fresh + review)", total("opd")], ["Ward cases", total("ward")], ["Long cases", count("long")],
    ["Short cases", data.caseLogs.filter((entry) => isPsychiatryShortCase(entry) && entry.status !== "rejected").length],
    ["Case presentations presented", presented("a_cp")], ["Seminars / symposia presented", presented("a_sem")], ["Journal clubs presented", presented("a_jc")],
    ["Academic sessions attended", valid.filter((row) => !row.own && ["a_cp", "a_sem", "a_jc", "a_intern"].includes(row.section)).length],
    ["Consultation liaison psychiatry cases attended", total("cl")], ["Psychiatric emergencies managed", total("emer")], ["Procedures attended / done", count("proc")],
    ["Teaching sessions conducted (UG)", count("a_ug")], ["Training sessions conducted (interns)", presented("a_intern")],
    ["Clinical psychology interventions / assessments", `${count("psy-intervention")} / ${count("psy-assessment")}`], ["Lectures attended", count("a_lecture")],
    ["Community outreach programmes", count("comm")], ["CME / conferences / workshops attended", count("a_cme")],
    ["Paper / poster presentations", valid.filter((row) => row.section === "a_cme" && row.own && ["Paper presented", "Poster presented"].includes(String(row.values.role))).length],
    ["Thesis", thesisState === "error" ? "Unable to load thesis" : thesisState === "loading" ? "Loading…" : thesis ? thesis.finalSubmissionStatus === "approved" ? "Final submission approved" : thesis.midTermStatus === "approved" ? "Mid-term approved" : thesis.iecClearanceDate ? "IEC clearance recorded" : `Protocol ${thesis.protocolStatus}` : "—"],
    ["Other achievements", count("ach")],
  ];
  return <><Heading title="Summary · Clinical works" action={<Button className="print:hidden" onClick={() => window.print()}><Printer className="size-4" />Print PDF</Button>} />
    <dl className={`${box} max-w-3xl divide-y divide-teal-100`}>{lines.map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-3"><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
  </>;
}

function PsychiatryPostings({ studentId }: { studentId: number }) {
  const { postings } = useDepartment();
  const [rows, setRows] = useState<Array<{ id: number; ward: string; startDate: string; endDate: string; supervisorName: string | null }> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    apiGet<{ data: NonNullable<typeof rows> }>(`/api/students/${studentId}/postings`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setRows(result.data); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [studentId]);
  return <><Heading title="Postings" />{error ? <p role="alert">Unable to load postings.</p> : !rows ? <p role="status">Loading postings…</p> :
    <Table columns={[["name", "Posting"], ["dates", "From – to"], ["supervisorName", "Consultant"]]} rows={rows.map((row) => ({ ...row,
      name: postings.find(({ value }) => value === row.ward)?.name ?? row.ward, dates: `${row.startDate} – ${row.endDate}`,
    }))} />}</>;
}

function iconFor(section: string) {
  if (section === "home") return Home;
  if (["opd", "ward", "postings"].includes(section)) return CalendarDays;
  if (section === "summary") return Printer;
  if (section.startsWith("a_")) return BookOpen;
  if (["short-cases", "long", "proc"].includes(section)) return Stethoscope;
  if (["cl", "emer", "psy", "comm"].includes(section)) return Activity;
  return FileText;
}

export function PsychiatryWorkspace({ onSignOut }: { onSignOut: () => void }) {
  const [location, navigate] = useLocation();
  const user = useCurrentUser();
  const { department } = useDepartment();
  const studentId = user?.studentProfileId;
  const [bundle, setBundle] = useState<{ records: Entry[]; data: ResidentData } | null>(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [section = "home", action, extra] = location.startsWith(`${PSYCHIATRY_BASE}/`) ? location.slice(PSYCHIATRY_BASE.length + 1).split("/") : [];

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!studentId) return;
    try {
      const [records, data] = await Promise.all([
        apiGet<Entry[]>(`${endpoint}/entries`, { signal }), apiGet<ResidentData>(`/api/students/${studentId}/logs`, { signal }),
      ]);
      if (!signal?.aborted) { setBundle({ records, data }); setError(""); }
    } catch {
      if (!signal?.aborted) setError("Unable to load your Psychiatry logbook.");
    }
  }, [studentId]);
  useEffect(() => {
    const controller = new AbortController();
    setBundle(null);
    setError("");
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => { setMenu(false); setNotifications(false); }, [location]);

  function saved() {
    navigate(entryLink(parentSection(section)));
    void refresh();
  }

  function content() {
    if (!studentId) return <p role="alert">An active resident profile is required.</p>;
    if (section === "short-cases") return <PsychiatryShortCasesPage key={location} mode={action === "new" ? "add" : extra === "edit" ? "edit" : "list"} entryId={Number(action)} onSave={() => void refresh()} />;
    if (section === "postings") return <PsychiatryPostings studentId={studentId} />;
    if (error) return <div className={box}><p role="alert">{error}</p><Button className="mt-3" variant="outline" onClick={() => void refresh()}>Try again</Button></div>;
    if (!bundle) return <p role="status">Loading your Psychiatry logbook…</p>;
    const { records, data } = bundle;
    if (section === "home") return <HomePage records={records} data={data} />;
    if (section === "summary") return <Summary records={records} data={data} studentId={studentId} />;
    if (section === "psy") return <><Heading title="Clinical psychology" /><div className="space-y-6">{["psy-intervention", "psy-assessment"].map((key) => <WorkList key={key} section={key} page={psychiatryPages[key]} records={records.filter((entry) => entry.section === key)} />)}</div></>;
    const page = psychiatryPages[section];
    if (!Object.hasOwn(psychiatryPages, section) || !page) return <p role="alert">This Psychiatry page was not found. <Link href={entryLink("home")} className="underline">Go to Home</Link></p>;
    if (action === "new") return <EntryForm key={location} section={section} page={page} onSaved={saved} />;
    const list = records.filter((entry) => entry.section === section);
    if (action) {
      const record = list.find((entry) => entry.id === Number(action));
      if (!record && page.shared && /^\d+$/.test(action)) return <DepartmentSession key={location} section={section} id={Number(action)} page={page} />;
      if (!record) return <p role="alert">This entry is unavailable. <Link className="underline" href={entryLink(parentSection(section))}>Back</Link></p>;
      if (extra === "edit" && record.own && record.status !== "verified") return <EntryForm key={location} section={section} page={page} entry={record} onSaved={saved} />;
      return <EntryDetails entry={record} page={page} />;
    }
    return <div className="space-y-5">{section === "thesis" && <ThesisPage />}<WorkList key={section} section={section} page={page} records={list} /></div>;
  }

  const returned = bundle?.records.filter((row) => row.own && row.status === "rejected") ?? [];
  const returnedShort = bundle?.data.caseLogs.filter((row) => isPsychiatryShortCase(row) && row.status === "rejected") ?? [];
  const notificationCount = returned.length + returnedShort.length;
  return <div className="min-h-screen bg-[#edf8f4] text-slate-900" style={{ backgroundImage: "linear-gradient(#cde5df 1px, transparent 1px), linear-gradient(90deg, #cde5df 1px, transparent 1px)", backgroundSize: "28px 28px" }}>
    <aside className={`${menu ? "flex" : "hidden"} fixed inset-y-0 left-0 z-30 w-64 flex-col border-r border-teal-100 bg-white lg:flex print:hidden`}>
      <div className="flex items-center gap-3 border-b border-teal-100 p-5"><span className="rounded-xl bg-teal-600 p-2.5 text-white"><ClipboardList className="size-5" /></span>
        <div className="flex-1"><p className="font-bold">E-Logbook</p><p className="text-xs text-slate-600">Clinical training records</p></div>
        <button type="button" className="lg:hidden" aria-label="Close menu" onClick={() => setMenu(false)}><X className="size-5" /></button>
      </div>
      <nav aria-label="Psychiatry logbook" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {psychiatryNavigation.map((group) => <div key={group.label}><p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{group.label}</p>
          {group.links.map(([key, label, badge]) => { const Icon = iconFor(key); const active = parentSection(section) === key;
            return <Link key={key} href={entryLink(key)} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-2 py-2 text-sm ${active ? "bg-[#116f68] font-semibold text-white" : "text-slate-800 hover:bg-teal-50"}`}>
              <Icon className="size-4 shrink-0" /><span className="flex-1">{label}</span>{badge && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-900">New</span>}
            </Link>;
          })}
        </div>)}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t border-teal-100 px-4 py-3"><Link className="rounded-md hover:underline" href="/profile"><p className="text-sm font-semibold">{user?.name}</p><p className="text-xs text-slate-600">Resident</p></Link>
        <div className="flex items-center gap-3"><Link href="/cases" aria-label="Standard logbook" title="Standard logbook"><BookOpen className="size-4" /></Link>
          <button type="button" aria-label="Sign out" onClick={onSignOut}><LogOut className="size-4" /></button></div></div>
    </aside>
    <div className="lg:ml-64 print:m-0">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-teal-100 bg-white px-5 py-3 print:hidden">
        <div className="flex items-center gap-3"><button className="lg:hidden" type="button" aria-label="Open menu" onClick={() => setMenu(true)}><Menu className="size-5" /></button>
          <div><p className="font-semibold">{department.name.toLowerCase().startsWith("department of") ? department.name : `Department of ${department.name}`}</p><p className="text-xs text-slate-600">Resident workspace</p></div>
        </div>
        <div className="relative flex items-center gap-2"><Button variant="outline" asChild><Link href={entryLink("summary")}><Printer className="size-4" />Print</Link></Button>
          <Button variant="outline" aria-label="Notifications" aria-expanded={notifications} onClick={() => setNotifications(!notifications)}><Bell className="size-4" />{notificationCount > 0 && <span>{notificationCount}</span>}</Button>
          {notifications && <div className="absolute right-0 top-11 z-30 w-72 rounded-lg border bg-white p-4 shadow-lg"><p className="mb-2 font-semibold">Notifications</p>
            {returned.map((row) => <Link key={row.id} className="block py-1 text-sm text-teal-900 underline" href={`${entryLink(row.section)}/${row.id}`}>{psychiatryPages[row.section]?.title} entry returned</Link>)}
            {returnedShort.map((row) => <Link key={`short-${row.id}`} className="block py-1 text-sm text-teal-900 underline" href={`${SHORT_CASES_PATH}/${row.id}/edit`}>Short case returned</Link>)}
            {!notificationCount && <p className="text-sm text-slate-600">No returned entries.</p>}
          </div>}
        </div>
      </header>
      <main className="mx-auto min-h-[85vh] max-w-[1200px] p-4 sm:p-7 print:p-0">{content()}</main>
    </div>
  </div>;
}

export function PsychiatryReviewPage() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    apiGet<Entry[]>(`${endpoint}/reviews${history ? "?view=history" : ""}`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setRows(result); })
      .catch(() => { if (!controller.signal.aborted) setError("Unable to load Psychiatry reviews."); });
    return () => controller.abort();
  }, [history]);
  async function review(status: "verified" | "rejected") {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiPatch(`${endpoint}/reviews/${selected.id}`, { status, comment, revision: selected.revision });
      setRows((current) => current?.filter((row) => row.id !== selected.id) ?? []);
      setSelected(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to review this entry."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4"><Heading title="Psychiatry reviews" />{error && <p role="alert" className="text-rose-800">{error}</p>}
    <div className="flex gap-2">{[[false, "Pending"], [true, "History"]].map(([view, title]) => <Button key={String(view)} variant={history === view ? "default" : "outline"} disabled={busy} onClick={() => {
      if (history !== view) { setHistory(Boolean(view)); setRows(null); setSelected(null); setError(""); }
    }}>{title}</Button>)}</div>
    {!rows && !error && <p role="status">Loading reviews…</p>}
    {rows && <Table columns={[["type", "Section"], ["residentName", "Resident"], ["period", "Date / month"], ["status", "Status"]]} rows={rows.map((row) => ({ id: row.id, residentName: row.residentName,
      type: psychiatryPages[row.section]?.title, period: row.values.date ?? row.values.month ?? row.values.admittedAt, status: row.status }))} actions={(id) =>
      <button className="text-teal-900 underline" type="button" disabled={busy} onClick={() => { setComment(""); setSelected(rows.find((row) => row.id === id) ?? null); }}>{history ? "Open" : "Review"}</button>} />}
    {selected && psychiatryPages[selected.section] && <EntryDetails entry={selected} page={psychiatryPages[selected.section]} review={history ? <Button variant="outline" onClick={() => setSelected(null)}>Close</Button> : <div className="space-y-3">
      <label className="block space-y-2">Review comments<Textarea maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
      <Button disabled={busy} onClick={() => void review("verified")}>{psychiatryPages[selected.section].monthly ? "Sign month" : "Verify"}</Button>{" "}
      <Button disabled={busy} variant="outline" onClick={() => void review("rejected")}>Return</Button>
    </div>} />}
  </div>;
}
