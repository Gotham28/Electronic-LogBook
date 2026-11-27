import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Bell, BookOpen, CalendarDays, ClipboardList, FileText, Home, LogOut, Menu, Printer, Stethoscope, X } from "lucide-react";
import {
  PSYCHIATRY_BASE, PSYCHIATRY_ICUS, psychiatryFieldVisible, psychiatryNavigation, psychiatryPages, psychiatryDiagnosisLabel, resolvePsychiatryDiagnosis, longCaseAdditionalDiagnosisFields,
  SHORT_CASE_REFERRALS, SHORT_CASE_TAGS, isPsychiatryShortCase, type PsychiatryDiagnosisRow, type PsychiatryField, type PsychiatryPage, type PsychiatryValues,
} from "@workspace/api-zod";
import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { useDepartment } from "@/lib/department-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { localDateValue } from "@/lib/quarterly-appraisal";
import { Chapter06DiagnosisPicker } from "@/components/Chapter06DiagnosisPicker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThesisPage } from "@/components/pages/ThesisPage";
import { PostingsPage } from "@/components/pages/PostingsPage";
import { PsychiatryShortCasesPage, SHORT_CASES_PATH } from "@/components/pages/PsychiatryShortCasesPage";

type Diagnosis = { code: string; title: string; uri: string };
type StoredRow = Partial<PsychiatryDiagnosisRow> & { diagnosis: Diagnosis };
type Entry = {
  id: number; section: string; values: Record<string, string | string[] | Diagnosis>; diagnosisRows: StoredRow[]; month?: string;
  status: "draft" | "pending" | "verified" | "rejected" | "recorded"; reviewNote?: string; own?: boolean;
  reviewerId?: number; reviewerName?: string; attendeeNames?: string[]; attendeeIds?: number[]; revision: number; residentName?: string;
};
type Roster = Array<{ id: number; name: string; role: string }>;
type ResidentData = { caseLogs: Array<{ id: number; category: string; status: string; customFields?: Record<string, string>;
  date: string; patientAge: string; patientGender: string; diagnosisFinal: string; supervisorName?: string;
  managementPlan?: string; learningPoints?: string }>;
  profile: { collegeName?: string | null; registrationNumber: string | null; joiningYear: string | null; mentorName: string | null; dateOfJoining: string | null } };
type ReportPosting = { id: number; ward: string; startDate: string; endDate: string; supervisorName: string | null; status: string };
type Thesis = { protocolStatus: string; midTermStatus: string; finalSubmissionStatus: string; iecClearanceDate: string | null };
const endpoint = "/api/psychiatry";
const box = "rounded-2xl border border-[#d3e7e2] bg-white p-5 shadow-sm";
const selectStyle = "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-base sm:text-sm";
const entryLink = (section: string) => `${PSYCHIATRY_BASE}/${section}`;
const parentSection = (section: string) => section.startsWith("psy-") ? "psy" : section;
const defaultDiagnosisRow: PsychiatryDiagnosisRow = { diagnosisCode: "", medical: "", count: 1, visit: "Fresh", tags: [], department: "Medicine", icu: "" };
const visitCountOptions = Array.from({ length: 51 }, (_, index) => String(index));
type MonthlyFormRow = { key: number; value: PsychiatryDiagnosisRow; fresh: number; review: number };
const reviewLabels = { draft: "Draft", pending: "Pending", verified: "Verified", rejected: "Returned", recorded: "Recorded" };
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const monthlyEntryLink = (row: Entry) => `${entryLink(row.section)}/${row.id}${row.own && row.status !== "verified" ? "/edit" : ""}`;

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
  const [monthFilter, setMonthFilter] = useState("");
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

  const monthCards = page.monthly ? records.filter((entry) => !monthFilter || monthFilter === entry.month).map((entry) => {
    const rows = entry.diagnosisRows;
    const sum = (visit?: string) => rows.filter((row) => !visit || row.visit === visit).reduce((total, row) => total + (row.count ?? 0), 0);
    return <article className={`${box} space-y-4`} key={entry.id}>
      <header className="flex flex-wrap items-center justify-between gap-2"><div>
        <h2 className="font-bold text-slate-900">{entry.month && monthLabel(entry.month)}</h2>
        <p className="text-sm text-slate-600">{page.monthly === "counts" ? `Fresh ${sum("Fresh")} · Review ${sum("Review")}` : `${sum()} ${section === "cl" ? "referrals" : "emergencies"}`}</p>
      </div><div className="flex items-center gap-3"><Flag status={entry.status} monthly /><Link className="inline-flex min-h-11 items-center text-sm text-teal-800 underline" href={monthlyEntryLink(entry)}>{entry.own && entry.status !== "verified" ? "Edit" : "View"}</Link></div></header>
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
    {page.monthly && records.length > 0 && <label className="block max-w-xs space-y-1"><span className="text-sm font-medium">Find a month</span>
      <select className={selectStyle} value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}>
        <option value="">All months</option>
        {records.flatMap(({ month }) => month ? [month] : []).sort().reverse().map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
      </select>
    </label>}
    {page.shared && <div className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-teal-100 px-3 py-1">{section === "a_cme" ? "Papers / posters" : section === "a_intern" ? "Conducted" : "Presented"} {presented}</span>
      <span className="rounded-full bg-white px-3 py-1">Attended {attended}</span></div>}
    {page.shared && <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant={departmentWide ? "outline" : "default"} onClick={() => setDepartmentWide(false)}>My logbook</Button>
      <Button variant={departmentWide ? "default" : "outline"} onClick={() => { if (!departmentWide) { setError(""); setDepartmentRecords(null); setDepartmentWide(true); } }}>All department sessions</Button>
    </div>}
    {page.monthly ? (monthCards?.length ? monthCards : <p className={box}>Nothing here yet.</p>) : departmentWide && error ? <p role="alert">{error}</p> : departmentWide && !departmentRecords ?
      <p role="status">Loading department sessions…</p> : <Table columns={page.columns} rows={tableRows.map((entry) => entryRow(entry, page))}
        actions={(id) => <Link className="text-teal-800 underline" href={`${entryLink(section)}/${id}`}>{page.shared && records.some((row) => row.id === id && !row.own) ? "Open attended session" : "Open"}</Link>} />}
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
      <Input className="rounded-[10px] border-[#d9e6e2]" type={field.kind} maxLength={field.maxLength ?? 4000} value={text} onChange={(event) => set(event.target.value)} />}
  </label>;
}

function MonthlyDiagnosis({ item, mode, onChange }: { item: MonthlyFormRow; mode: NonNullable<PsychiatryPage["monthly"]>; onChange: (item: MonthlyFormRow) => void }) {
  const row = item.value;
  const change = (value: PsychiatryDiagnosisRow) => onChange({ ...item, value });
  return <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/30 p-4">
    <Chapter06DiagnosisPicker code={row.diagnosisCode} onSelect={(diagnosisCode) => change({ ...row, diagnosisCode })} />
    <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
      <FormField field={{ key: "medical", label: "Medical diagnosis", kind: "text", maxLength: 500 }} value={row.medical} roster={[]} section="" set={(medical) => change({ ...row, medical: String(medical) })} />
      {mode === "referrals" && <FormField field={{ key: "count", label: "Number", kind: "select", choices: visitCountOptions.slice(1) }} value={String(row.count)} roster={[]} section="" set={(count) => change({ ...row, count: Number(count) })} />}
    </div>
    {mode === "counts" ? <>
      <div className="grid grid-cols-2 gap-3">
        <FormField field={{ key: "fresh", label: "Fresh visits", kind: "select", choices: visitCountOptions }} value={String(item.fresh)} roster={[]} section="" set={(count) => onChange({ ...item, fresh: Number(count) })} />
        <FormField field={{ key: "review", label: "Review visits", kind: "select", choices: visitCountOptions }} value={String(item.review)} roster={[]} section="" set={(count) => onChange({ ...item, review: Number(count) })} />
      </div>
      <Chips label="Tags" options={SHORT_CASE_TAGS.map((tag) => ({ key: tag, text: tag }))} selected={row.tags} set={(tags) => change({ ...row, tags: tags as PsychiatryDiagnosisRow["tags"] })} />
    </> : <>
      <FormField field={{ key: "department", label: "Department", kind: "select", choices: SHORT_CASE_REFERRALS }} value={row.department} roster={[]} section="" set={(department) => change({ ...row, department: department as PsychiatryDiagnosisRow["department"], icu: "" })} />
      {row.department === "ICU" && <FormField field={{ key: "icu", label: "Which ICU", kind: "select", choices: PSYCHIATRY_ICUS }} value={row.icu} roster={[]} section="" set={(icu) => change({ ...row, icu: icu as PsychiatryDiagnosisRow["icu"] })} />}
    </>}
  </div>;
}

function monthlyRowsForForm(page: PsychiatryPage, entry?: Entry): MonthlyFormRow[] {
  if (!page.monthly) return [];
  if (!entry?.diagnosisRows.length) return [{ key: 0, value: defaultDiagnosisRow, fresh: 1, review: 0 }];
  const rows: MonthlyFormRow[] = [];
  entry.diagnosisRows.forEach(({ diagnosis, ...saved }, key) => {
    const value = { ...defaultDiagnosisRow, ...saved, diagnosisCode: diagnosis.code };
    const countKey = value.visit === "Review" ? "review" : "fresh";
    const match = page.monthly === "counts" && rows.find((row) => row[countKey] === 0 &&
      row.value.diagnosisCode === value.diagnosisCode && row.value.medical === value.medical &&
      row.value.tags.length === value.tags.length && value.tags.every((tag) => row.value.tags.includes(tag)));
    if (match) match[countKey] = value.count;
    else rows.push({ key, value, fresh: countKey === "fresh" ? value.count : 0, review: countKey === "review" ? value.count : 0 });
  });
  return rows;
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

function EntryForm({ section, page, entry, existing = [], onSaved }: { section: string; page: PsychiatryPage; entry?: Entry; existing?: Entry[]; onSaved: () => void }) {
  const [values, setValues] = useState(() => initialValues(page, entry));
  const [shownDiagnosisFields, setShownDiagnosisFields] = useState(() => longCaseAdditionalDiagnosisFields
    .filter(({ key }) => values[key]).map(({ key }) => key));
  const nextDiagnosisField = section === "long" ? longCaseAdditionalDiagnosisFields.find(({ key }) => !shownDiagnosisFields.includes(key)) : undefined;
  const [rows, setRows] = useState(() => monthlyRowsForForm(page, entry));
  const nextRow = useRef(entry?.diagnosisRows.length || rows.length);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const existingMonth = page.monthly && existing.find((row) => row.id !== entry?.id && row.month === values.month);
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
    if (busy || existingMonth || (needsRoster && !roster)) return;
    const button = (event.nativeEvent as SubmitEvent).submitter;
    const draft = button?.getAttribute("value") === "draft";
    if (rows.some(({ value }) => !resolvePsychiatryDiagnosis(value.diagnosisCode))) {
      setError("Choose or enter a psychiatric diagnosis for each row.");
      return;
    }
    if (page.monthly === "counts" && rows.some(({ fresh, review }) => fresh + review < 1)) {
      setError("Enter at least one Fresh or Review visit for each diagnosis.");
      return;
    }
    const storedRows = rows.flatMap(({ value, fresh, review }): PsychiatryDiagnosisRow[] => page.monthly !== "counts" ? [value] : [
      ...(fresh > 0 ? [{ ...value, count: fresh, visit: "Fresh" as const }] : []),
      ...(review > 0 ? [{ ...value, count: review, visit: "Review" as const }] : []),
    ]);
    if (storedRows.length > 50) { setError("A monthly log can contain at most 50 Fresh and Review entries in total."); return; }
    setError("");
    setBusy(true);
    try {
      const draftValues = { ...values };
      for (const { key, kind, optional } of page.fields) {
        const value = draftValues[key];
        if (kind === "diagnosis" && typeof value === "string" && value.trim() === "text:" && (draft || optional)) draftValues[key] = "";
      }
      const payload = { values: draftValues, rows: storedRows, draft, ...(entry ? { revision: entry.revision } : {}) };
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
      {existingMonth && <p role="status" className="rounded-lg bg-amber-50 p-3">A log already exists for this month. <Link className="font-medium underline" href={monthlyEntryLink(existingMonth)}>{existingMonth.status === "verified" ? "View signed month" : "Open existing month"}</Link></p>}
      {entry?.reviewNote && <p className="rounded-lg bg-amber-50 p-3">{entry.reviewNote}</p>}
      {page.fields.filter((field) => psychiatryFieldVisible(field, values)).map((field) => {
        const additional = field.kind === "diagnosis" && field.optional;
        if (additional && !shownDiagnosisFields.includes(field.key)) return null;
        const input = <FormField field={field} value={values[field.key]} roster={roster ?? []} section={section}
          set={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />;
        return additional ? <fieldset key={field.key} className="space-y-2 rounded-lg border p-3"><legend>{field.label}</legend>
          {input}
          <Button type="button" variant="ghost" onClick={() => {
            setShownDiagnosisFields((current) => current.filter((key) => key !== field.key));
            setValues((current) => ({ ...current, [field.key]: "" }));
          }}>Remove diagnosis</Button>
        </fieldset> : <div key={field.key}>{input}
          {section === "long" && field.key === "diagnosis" && nextDiagnosisField &&
            <Button type="button" variant="outline" className="mt-3" onClick={() => setShownDiagnosisFields((current) => [...current, nextDiagnosisField.key])}>Add another psychiatric diagnosis</Button>}
        </div>;
      })}
      {page.monthly && <div className="space-y-3">
        {rows.map((item) => <div key={item.key} className="space-y-2">
          <MonthlyDiagnosis item={item} mode={page.monthly!} onChange={(next) => setRows((current) => current.map((row) => row.key === item.key ? next : row))} />
          {rows.length > 1 && <Button type="button" variant="ghost" onClick={() => setRows((current) => current.filter((row) => row.key !== item.key))}>Remove diagnosis</Button>}
        </div>)}
        <Button type="button" variant="outline" disabled={rows.length >= 50} onClick={() => { const key = nextRow.current++; setRows((current) => [...current, { key, value: defaultDiagnosisRow, fresh: 1, review: 0 }]); }}>Add another diagnosis</Button>
      </div>}
      <div className="flex gap-2">{page.draft && <Button type="submit" value="draft" variant="outline" disabled={busy || Boolean(existingMonth) || (needsRoster && !roster)}>Save draft</Button>}
        <Button type="submit" disabled={busy || Boolean(existingMonth) || (needsRoster && !roster)}>{busy ? "Saving…" : "Save"}</Button></div>
    </form>
  </>;
}

function EntryDetails({ entry, page, inReview = false }: { entry: Entry; page: PsychiatryPage; inReview?: boolean }) {
  const map = entryRow(entry, page);
  const canEdit = entry.own && entry.status !== "verified";
  return <><Heading title={typeof entry.values.topic === "string" ? entry.values.topic : page.title}
    action={inReview ? undefined : <div className="flex gap-2"><Button variant="outline" asChild><Link href={entryLink(parentSection(entry.section))}>Back</Link></Button>
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
  const user = useCurrentUser();
  const { department, postings } = useDepartment();
  const [postingRows, setPostingRows] = useState<ReportPosting[] | null>(null);
  const [postingError, setPostingError] = useState(false);
  const [thesis, setThesis] = useState<Thesis | null>(null);
  const [thesisState, setThesisState] = useState<"loading" | "loaded" | "error">("loading");
  useEffect(() => {
    const controller = new AbortController();
    apiGet<{ data: Thesis | null }>(`/api/students/${studentId}/thesis`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setThesis(result.data); setThesisState("loaded"); } })
      .catch(() => { if (!controller.signal.aborted) setThesisState("error"); });
    apiGet<{ data: ReportPosting[] }>(`/api/students/${studentId}/postings`, { signal: controller.signal })
      .then(({ data: rows }) => { if (!controller.signal.aborted) setPostingRows(rows); })
      .catch(() => { if (!controller.signal.aborted) setPostingError(true); });
    return () => controller.abort();
  }, [studentId]);
  const valid = records.filter((row) => row.status !== "draft" && row.status !== "rejected");
  const shortCases = data.caseLogs.filter((entry) => isPsychiatryShortCase(entry) && entry.status !== "rejected" && entry.status !== "draft");
  const count = (section: string) => valid.filter((entry) => entry.section === section).length;
  const presented = (section: string) => valid.filter((entry) => entry.section === section && entry.own).length;
  const total = (section: string) => valid.filter((row) => row.section === section).flatMap((row) => row.diagnosisRows).reduce((sum, row) => sum + (row.count ?? 0), 0);
  const lines: Array<[string, number | string]> = [
    ["OPD cases (fresh + review)", total("opd")], ["Ward cases", total("ward")], ["Long cases", count("long")],
    ["Short cases", shortCases.length],
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
  return <><Heading title="Summary · Clinical works" action={<Button className="print:hidden" disabled={!postingRows || thesisState !== "loaded"} onClick={() => window.print()}><Printer className="size-4" />Print PDF</Button>} />
    <p className="mb-5 font-medium">{user?.name} · {department.name}{data.profile?.collegeName && <> · {data.profile.collegeName}</>}</p>
    <dl className={`${box} max-w-3xl divide-y divide-teal-100`}>{lines.map(([label, value]) => <div key={label} className="flex justify-between gap-3 py-3"><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
    <div className="mt-8 space-y-6">
      <section aria-label="Short case details" className="space-y-3"><h2 className="text-xl font-semibold">Short case details</h2>
        {shortCases.length === 0 && <p>No short cases to print.</p>}
        {shortCases.map((row) => <article className={`${box} break-inside-avoid space-y-2`} key={row.id}>
          <h3 className="font-semibold">{row.diagnosisFinal}</h3><p>{row.date} · {row.status}</p>
          <ReportFields fields={[["Age", row.patientAge], ["Sex", row.patientGender], ["Consultant", row.supervisorName],
            ["Seen in", row.customFields?.psychiatrySeenIn], ["Tags", row.customFields?.psychiatryTags], ["Activities", row.customFields?.psychiatryActivities],
            ["Medical diagnosis", row.customFields?.psychiatryMedicalDiagnosis], ["Plan", row.managementPlan], ["Learning points", row.learningPoints]]} />
        </article>)}
      </section>
      {Object.entries(psychiatryPages).map(([section, page]) => {
        const entries = valid.filter((row) => row.section === section);
        if (!entries.length) return null;
        const title = section.startsWith("psy-") ? `Clinical psychology · ${page.title}` : page.title;
        return <section key={section} aria-label={title} className="space-y-3"><h2 className="text-xl font-semibold">{title}</h2>
          {entries.map((row) => <article key={row.id} className={`${box} space-y-2`}>
            <p className="font-semibold">{row.month && monthLabel(row.month)}{row.month && " · "}{reviewLabels[row.status]}</p>
            {page.shared && <p>{display(entryRow(row, page).role)}</p>}
            <ReportFields fields={page.fields.map(({ key, label }) => [label, key === "reviewerId" ? row.reviewerName : key === "attendees" ? row.attendeeNames : row.values[key]])} />
            {row.diagnosisRows?.map((diagnosisRow, index) => <div key={index} className="break-inside-avoid border-t pt-2">
              <ReportFields fields={page.columns.map(([key, label]) => [label, key === "department" ? [diagnosisRow.department, diagnosisRow.icu].filter(Boolean).join(" · ") : diagnosisRow[key as keyof StoredRow]])} />
            </div>)}
          </article>)}
        </section>;
      })}
      <section className="space-y-3"><h2 className="text-xl font-semibold">Postings</h2>
        {postingError ? <p role="alert">Unable to load postings. Reload before printing.</p> : !postingRows ? <p role="status">Loading postings…</p> :
          <div className="space-y-3">{postingRows.length === 0 && <p>No postings to print.</p>}
            {postingRows.map((row) => <article key={row.id} className={`${box} break-inside-avoid`}>
              <h3 className="font-semibold">{postings.find(({ value }) => value === row.ward)?.name ?? row.ward}</h3>
              <ReportFields fields={[["Start date", row.startDate], ["End date", row.endDate], ["Consultant", row.supervisorName], ["Status", row.status]]} />
            </article>)}
          </div>}
      </section>
    </div>
  </>;
}

function ReportFields({ fields }: { fields: Array<[string, unknown]> }) {
  return <dl className="grid gap-2 sm:grid-cols-2">{fields.filter(([, value]) => value != null && value !== "" && (!Array.isArray(value) || value.length > 0))
    .map(([label, value]) => <div className="min-w-0 break-words" key={label}><dt className="text-sm font-semibold">{label}</dt><dd className="whitespace-pre-wrap">{display(value)}</dd></div>)}</dl>;
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
    if (section === "postings") return <PostingsPage />;
    if (error) return <div className={box}><p role="alert">{error}</p><Button className="mt-3" variant="outline" onClick={() => void refresh()}>Try again</Button></div>;
    if (!bundle) return <p role="status">Loading your Psychiatry logbook…</p>;
    const { records, data } = bundle;
    if (section === "home") return <HomePage records={records} data={data} />;
    if (section === "summary") return <Summary records={records} data={data} studentId={studentId} />;
    if (section === "psy") return <><Heading title="Clinical psychology" /><div className="space-y-6">{["psy-intervention", "psy-assessment"].map((key) => <WorkList key={key} section={key} page={psychiatryPages[key]} records={records.filter((entry) => entry.section === key)} />)}</div></>;
    const page = psychiatryPages[section];
    if (!Object.hasOwn(psychiatryPages, section) || !page) return <p role="alert">This Psychiatry page was not found. <Link href={entryLink("home")} className="underline">Go to Home</Link></p>;
    const list = records.filter((entry) => entry.section === section);
    if (action === "new") return <EntryForm key={location} section={section} page={page} existing={list} onSaved={saved} />;
    if (action) {
      const record = list.find((entry) => entry.id === Number(action));
      if (!record && page.shared && /^\d+$/.test(action)) return <DepartmentSession key={location} section={section} id={Number(action)} page={page} />;
      if (!record) return <p role="alert">This entry is unavailable. <Link className="underline" href={entryLink(parentSection(section))}>Back</Link></p>;
      if (extra === "edit" && record.own && record.status !== "verified") return <EntryForm key={location} section={section} page={page} entry={record} existing={list} onSaved={saved} />;
      return <EntryDetails entry={record} page={page} />;
    }
    return <div className="space-y-5">{section === "thesis" && <ThesisPage />}<WorkList key={section} section={section} page={page} records={list} /></div>;
  }

  const returned = bundle?.records.filter((row) => row.own && row.status === "rejected") ?? [];
  const returnedShort = bundle?.data.caseLogs.filter((row) => isPsychiatryShortCase(row) && row.status === "rejected") ?? [];
  const notificationCount = returned.length + returnedShort.length;
  return <div className="min-h-screen bg-[#edf8f4] text-slate-900" style={{ backgroundImage: "linear-gradient(#cde5df 1px, transparent 1px), linear-gradient(90deg, #cde5df 1px, transparent 1px)", backgroundSize: "28px 28px" }}>
    {menu && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" aria-hidden="true" onClick={() => setMenu(false)} />}
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
        <div className="flex items-center gap-3"><Link href="/cases/legacy" aria-label="Older case records" title="Older case records" className="inline-flex min-h-11 min-w-11 items-center justify-center"><BookOpen className="size-4" /></Link>
          <button type="button" aria-label="Sign out" className="inline-flex min-h-11 min-w-11 items-center justify-center" onClick={onSignOut}><LogOut className="size-4" /></button></div></div>
    </aside>
    <div className="lg:ml-64 print:m-0">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-teal-100 bg-white px-5 py-3 print:hidden">
        <div className="flex items-center gap-3"><button className="inline-flex min-h-11 min-w-11 items-center justify-center lg:hidden" type="button" aria-label="Open menu" onClick={() => setMenu(true)}><Menu className="size-5" /></button>
          <div><p className="font-semibold">{department.name.toLowerCase().startsWith("department of") ? department.name : `Department of ${department.name}`}</p><p className="text-xs text-slate-600">Resident workspace</p></div>
        </div>
        <div className="relative flex items-center gap-2"><Button variant="outline" asChild><Link href={entryLink("summary")}><Printer className="size-4" />Print</Link></Button>
          <Button variant="outline" aria-label="Notifications" aria-expanded={notifications} onClick={() => setNotifications(!notifications)}><Bell className="size-4" />{notificationCount > 0 && <span>{notificationCount}</span>}</Button>
          {notifications && <>
            <div className="fixed inset-0 z-20" aria-hidden="true" onClick={() => setNotifications(false)} />
            <div className="absolute right-0 top-11 z-30 w-72 rounded-lg border bg-white p-4 shadow-lg"><p className="mb-2 font-semibold">Notifications</p>
              {returned.map((row) => <Link key={row.id} className="block py-1 text-sm text-teal-900 underline" href={`${entryLink(row.section)}/${row.id}`}>{psychiatryPages[row.section]?.title} entry returned</Link>)}
              {returnedShort.map((row) => <Link key={`short-${row.id}`} className="block py-1 text-sm text-teal-900 underline" href={`${SHORT_CASES_PATH}/${row.id}/edit`}>Short case returned</Link>)}
              {!notificationCount && <p className="text-sm text-slate-600">No returned entries.</p>}
            </div>
          </>}
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
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);
  const queue = useRef<HTMLDivElement | null>(null);
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
  const reviewPage = selected && psychiatryPages[selected.section];
  const openReview = (row: Entry, trigger: HTMLButtonElement) => {
    reviewTrigger.current = trigger;
    setError("");
    setComment("");
    setSelected(row);
  };
  return <div className="space-y-4" ref={queue} tabIndex={-1}><Heading title="Psychiatry reviews" />{error && !selected && <p role="alert" className="text-rose-800">{error}</p>}
    <div className="flex gap-2">{[[false, "Pending"], [true, "History"]].map(([view, title]) => <Button key={String(view)} variant={history === view ? "default" : "outline"} disabled={busy} onClick={() => {
      if (history !== view) { setHistory(Boolean(view)); setRows(null); setSelected(null); setError(""); }
    }}>{title}</Button>)}</div>
    {!rows && !error && <p role="status">Loading reviews…</p>}
    {rows?.length === 0 && <p className={box}>{history ? "No review history yet." : "No pending reviews."}</p>}
    {rows && rows.length > 0 && <ul className="space-y-3">{rows.map((row) => <li key={row.id} className={`${box} flex flex-wrap items-center justify-between gap-3`}>
      <div className="min-w-0 break-words"><h2 className="font-semibold">{psychiatryPages[row.section]?.title}</h2>
        <p className="text-sm">{row.residentName} · {display(row.month ?? row.values.date ?? row.values.admittedAt)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3"><Flag status={row.status} />
        <Button className="min-h-11" variant="outline" disabled={busy} onClick={(event) => openReview(row, event.currentTarget)}>{history ? "Open" : "Review"}</Button>
      </div>
    </li>)}</ul>}
    <Dialog open={Boolean(selected && reviewPage)} onOpenChange={(open) => { if (!open && !busy) setSelected(null); }}>
      <DialogContent className="max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden" onCloseAutoFocus={(event) => {
        event.preventDefault();
        (reviewTrigger.current?.isConnected ? reviewTrigger.current : queue.current)?.focus();
      }}>
        <DialogTitle>{history ? "Review history" : "Review Psychiatry entry"}</DialogTitle>
        <DialogDescription>{selected?.residentName}{reviewPage && ` · ${reviewPage.title}`}</DialogDescription>
        {selected && reviewPage && <div className="min-w-0 overflow-y-auto"><EntryDetails entry={selected} page={reviewPage} inReview /></div>}
        {reviewPage && (history ? <Button variant="outline" onClick={() => setSelected(null)}>Close</Button> : <div className="space-y-3 border-t pt-3">
          {error && <p role="alert" className="text-rose-800">{error}</p>}
          <label className="block space-y-2">Review comments<Textarea maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void review("verified")}>{reviewPage.monthly ? "Sign month" : "Verify"}</Button>
            <Button disabled={busy} variant="outline" onClick={() => void review("rejected")}>Return</Button>
          </div>
        </div>)}
      </DialogContent>
    </Dialog>
  </div>;
}
