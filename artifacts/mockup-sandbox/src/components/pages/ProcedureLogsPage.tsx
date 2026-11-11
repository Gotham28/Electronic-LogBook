import * as React from "react";
import { AlertCircle, CheckCircle2, Clock, PlusCircle, Stethoscope, Loader2, Trash2, Edit3, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/apiClient";
import { publishArogyaContext } from "@/lib/arogya-context";
import { getCurrentUser, isDemoMode } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatLogbookDate, todayForInput } from "@/lib/logbook-config";
import { useDepartment } from "@/lib/department-context";
import {
  PROCEDURE_SETTINGS,
  PROCEDURE_SEX_OPTIONS,
  isBuiltInProcedureField,
  validateDynamicProcedureLogFields,
  validateProcedureLogFields,
  type ProcedureFieldDefinition,
} from "@/lib/procedure-log-fields";
import { ProcedureClinicalDetails } from "@/components/ProcedureClinicalDetails";
type ProcedureGroup = string;

type ProcedureLog = {
  id: number;
  number: number;
  date: string;
  group: ProcedureGroup;
  patientUhid: string;
  procedureName: string;
  age: string;
  experience: string;
  facultyVerifiedLevel: string | null;
  facultyRemarks: string | null;
  status: "pending" | "verified" | "rejected";
  procedureGroup: string;
  patientAge: string;
  diagnosis?: string;
  sex?: string;
  competencyLevel: string;
};




export function ProcedureLogsPage() {
  const { procedures: PROCEDURE_REQUIREMENTS, competencyLevels, config, department, procedureFields } = useDepartment();
  const dynamicProcedureFields = Boolean(config?.enabledFeatures?.dynamicProcedureFields);
  const activeProcedureFields: ProcedureFieldDefinition[] = React.useMemo(
    () => (dynamicProcedureFields ? (procedureFields ?? []) : []),
    [dynamicProcedureFields, procedureFields],
  );
  const roleField = dynamicProcedureFields ? activeProcedureFields.find((f) => f.id === "competencyLevel") : undefined;
  const ageField = dynamicProcedureFields ? activeProcedureFields.find((f) => f.id === "patientAge") : undefined;
  const recordDetailsEnabled = dynamicProcedureFields || !!config?.enabledFeatures?.procedureClinicalDetails || PROCEDURE_REQUIREMENTS.some((item) => item.requiredLogFields?.length);
  const isMicrobiology = department?.code?.toLowerCase() === "microbiology" || department?.name?.toLowerCase().includes("microbiology");
  const hideProcedureAge = dynamicProcedureFields
    ? !ageField
    : (!recordDetailsEnabled && Boolean(config?.enabledFeatures?.hideProcedureAge || isMicrobiology));
  const showProcedureExperience = dynamicProcedureFields
    ? Boolean(roleField)
    : (recordDetailsEnabled || Boolean(config?.enabledFeatures?.procedureExperience && !isMicrobiology));
  const PROCEDURE_GROUPS = React.useMemo(() => Object.fromEntries([...new Set(PROCEDURE_REQUIREMENTS.map((p) => p.group))].map((group) => [group, PROCEDURE_REQUIREMENTS.filter((p) => p.group === group).map((p) => p.name)])), [PROCEDURE_REQUIREMENTS]);
  const REQUIRED_PROCEDURE_COUNT = PROCEDURE_REQUIREMENTS.reduce((sum, p) => sum + p.required, 0);
  const groupNames: Record<string, string> = Object.fromEntries(Object.keys(PROCEDURE_GROUPS).map((group) => [group, group]));
  const user = React.useMemo(() => getCurrentUser(), []);
  const hideUhid = !recordDetailsEnabled;
  const isFreeTextProcedures = Boolean(config?.enabledFeatures?.freeTextProcedures || isMicrobiology);
  const hasProcedureTarget = config?.requiredProcedures !== null && config?.requiredProcedures !== undefined;
  const initialGroup = hideUhid ? PROCEDURE_REQUIREMENTS[0]?.group ?? "" : "";
  const [open, setOpen] = React.useState(false);
  const [logs, setLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const createInitialForm = React.useCallback(() => ({
    date: todayForInput(),
    group: initialGroup as ProcedureGroup,
    procedureName: "",
    patientUhid: "",
    diagnosis: "",
    sex: "",
    age: "",
    setting: "",
    experience: recordDetailsEnabled ? "" : competencyLevels[0]?.value ?? "",
    supervisorId: "",
    customFields: {} as Record<string, string>,
  }), [initialGroup, recordDetailsEnabled, competencyLevels]);
  const [form, setForm] = React.useState(createInitialForm);
  const selectedProcedure = PROCEDURE_REQUIREMENTS.find((item) => item.name === form.procedureName && item.group === form.group);
  const requiredLogFields = selectedProcedure
    ? (selectedProcedure.requiredLogFields ?? [])
    : (dynamicProcedureFields ? activeProcedureFields.filter((f) => f.isRequired).map((f) => f.id) : []);
  const requires = (field: string) => requiredLogFields.includes(field);
  const [editLogId, setEditLogId] = React.useState<number | null>(null);
  const [editLogRemarks, setEditLogRemarks] = React.useState<string | null>(null);
  const [editLogStatus, setEditLogStatus] = React.useState<string | null>(null);
  const [editingOriginalLog, setEditingOriginalLog] = React.useState<any | null>(null);

  const getDynamicFieldValue = (fieldId: string): string => {
    switch (fieldId) {
      case "patientAge": return form.age;
      case "sex": return form.sex;
      case "patientUhid": return form.patientUhid;
      case "diagnosis": return form.diagnosis;
      case "setting": return form.setting;
      case "competencyLevel": return form.experience;
      default: return form.customFields[fieldId] ?? "";
    }
  };

  const setDynamicFieldValue = (fieldId: string, nextValue: string) => {
    setForm((prev) => {
      switch (fieldId) {
        case "patientAge": return { ...prev, age: nextValue };
        case "sex": return { ...prev, sex: nextValue };
        case "patientUhid": return { ...prev, patientUhid: nextValue };
        case "diagnosis": return { ...prev, diagnosis: nextValue };
        case "setting": return { ...prev, setting: nextValue };
        case "competencyLevel": return { ...prev, experience: nextValue };
        default: return { ...prev, customFields: { ...prev.customFields, [fieldId]: nextValue } };
      }
    });
  };

  const getOriginalDynamicFieldValue = (fieldId: string): string => {
    if (!editingOriginalLog) return "";
    let raw: unknown;
    switch (fieldId) {
      case "patientAge": raw = editingOriginalLog.patientAge ?? editingOriginalLog.age; break;
      case "sex": raw = editingOriginalLog.sex; break;
      case "patientUhid": raw = editingOriginalLog.patientUhid; break;
      case "diagnosis": raw = editingOriginalLog.diagnosis; break;
      case "setting": raw = editingOriginalLog.setting; break;
      case "competencyLevel": raw = editingOriginalLog.competencyLevel; break;
      default: raw = editingOriginalLog.customFields?.[fieldId]; break;
    }
    if (typeof raw !== "string") return "";
    const trimmed = raw.trim();
    return trimmed.toUpperCase() === "N/A" ? "" : trimmed;
  };

  const openLogEditor = (log: any, withRemarks: boolean) => {
    const cleanVal = (value: unknown) => {
      if (typeof value !== "string") return "";
      const trimmed = value.trim();
      return trimmed.toUpperCase() === "N/A" ? "" : trimmed;
    };
    setEditLogId(log.id);
    setEditLogRemarks(withRemarks ? (log.facultyRemarks || null) : null);
    setEditLogStatus(log.status);
    setEditingOriginalLog(log);
    publishArogyaContext({ log: { type: "procedure", id: Number(log.id) } });
    setForm({
      date: log.date,
      group: log.procedureGroup || "",
      procedureName: log.procedureName || "",
      patientUhid: log.patientUhid === "N/A" ? "" : (log.patientUhid || ""),
      age: dynamicProcedureFields ? cleanVal(log.patientAge || log.age) : (log.patientAge || log.age || ""),
      diagnosis: (log as any).diagnosis || "",
      sex: (log as any).sex || "",
      setting: log.setting || "",
      experience: dynamicProcedureFields ? cleanVal(log.competencyLevel) : (log.competencyLevel || ""),
      supervisorId: String(log.supervisorId || ""),
      customFields: log.customFields && typeof log.customFields === "object" && !Array.isArray(log.customFields)
        ? { ...log.customFields }
        : {},
    });
    setOpen(true);
  };

  React.useEffect(() => {
    if (!recordDetailsEnabled && competencyLevels.length > 0 && !form.experience) {
      setForm((prev) => ({ ...prev, experience: competencyLevels[0].value }));
    }
  }, [competencyLevels, form.experience, recordDetailsEnabled]);
  const loggedCounts = React.useMemo(
    () => Object.fromEntries(PROCEDURE_REQUIREMENTS.map((requirement) => [
      requirement.name,
      logs.filter((log) => log.procedureName === requirement.name && log.status !== "rejected").length,
    ])),
    [logs, PROCEDURE_REQUIREMENTS],
  );

  const setGroup = (group: ProcedureGroup) => setForm({ ...form, group, procedureName: "" });

  const [professors, setProfessors] = React.useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const fetchLogs = React.useCallback(async () => {
    if (!user?.studentProfileId) {
      setError("Not logged in");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await apiGet(`/api/students/${user.studentProfileId}/logs`);
      const sortedLogs = (data.procedureLogs || []).sort((a: any, b: any) => b.id - a.id);
      setLogs(sortedLogs.map((log: any, index: number) => ({ ...log, number: sortedLogs.length - index })));
    } catch (err: any) {
      setError(err.message || "Failed to load procedure logs");
    } finally {
      setLoading(false);
    }
  }, [user?.studentProfileId]);

  async function handleDeleteProcedureLog(logId: number) {
    if (!window.confirm("Delete this log? This cannot be undone.")) return;
    
    try {
      const res = await apiDelete(`/api/students/${user!.studentProfileId}/procedure-logs/${logId}`);
      if (res.error) {
        toast.error("Failed to delete log: " + res.error);
        return;
      }
      setLogs(prev => prev.filter(log => log.id !== logId));
      toast.success("Log deleted successfully");
    } catch (error) {
      toast.error("An error occurred");
    }
  }

  React.useEffect(() => {
    fetchLogs();
    if (user?.departmentId) {
      apiGet(`/api/departments/${user.departmentId}/professors`).then(setProfessors).catch(console.error);
    }
  }, [fetchLogs, user?.departmentId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isFreeTextProcedures && (!form.group || !form.procedureName)) {
      toast.error("Please select a procedure");
      return;
    }
    if (!form.supervisorId) {
      toast.error("Please select a reviewing faculty member");
      return;
    }

    setIsSubmitting(true);
    try {
      if (dynamicProcedureFields) {
        const activeFieldIds = new Set(activeProcedureFields.map((f) => f.id));
        const customFieldsPayload: Record<string, string | null> = {};
        for (const field of activeProcedureFields) {
          if (isBuiltInProcedureField(field.id)) continue;
          const raw = (form.customFields[field.id] ?? "").trim();
          if (raw) {
            customFieldsPayload[field.id] = raw;
          } else if (editLogId) {
            customFieldsPayload[field.id] = null;
          }
        }
        const validationEntry = {
          patientAge: activeFieldIds.has("patientAge") ? form.age.trim() : "",
          sex: activeFieldIds.has("sex") ? form.sex.trim() : "",
          patientUhid: activeFieldIds.has("patientUhid") ? form.patientUhid.trim() : "",
          diagnosis: activeFieldIds.has("diagnosis") ? form.diagnosis.trim() : "",
          setting: activeFieldIds.has("setting") ? form.setting.trim() : "",
          competencyLevel: activeFieldIds.has("competencyLevel") ? form.experience.trim() : "",
          customFields: customFieldsPayload,
        };
        const dynamicError = validateDynamicProcedureLogFields({
          requiredFields: requiredLogFields,
          fields: activeProcedureFields,
          entry: validationEntry,
          previousEntry: editingOriginalLog ?? undefined,
        });
        if (dynamicError) throw new Error(dynamicError);

        const payload = {
          procedureGroup: isFreeTextProcedures ? undefined : form.group,
          procedureName: form.procedureName,
          date: form.date,
          patientUhid: validationEntry.patientUhid || "N/A",
          diagnosis: validationEntry.diagnosis,
          sex: validationEntry.sex,
          patientAge: validationEntry.patientAge || "N/A",
          competencyLevel: validationEntry.competencyLevel || "N/A",
          setting: validationEntry.setting || null,
          customFields: customFieldsPayload,
          supervisorId: form.supervisorId,
        };

        if (editLogId) {
          await apiPatch(`/api/students/${user?.studentProfileId}/procedure-logs/${editLogId}`, payload);
        } else {
          await apiPost(`/api/students/${user?.studentProfileId}/procedure-logs`, payload);
        }
      } else {
        const payload = {
          procedureGroup: isFreeTextProcedures ? undefined : form.group,
          procedureName: form.procedureName,
          date: form.date,
          patientUhid: hideUhid ? "N/A" : form.patientUhid.trim() || "N/A",
          diagnosis: form.diagnosis,
          sex: form.sex,
          patientAge: hideProcedureAge ? "N/A" : form.age.trim() || "N/A",
          competencyLevel: showProcedureExperience ? form.experience || "N/A" : "N/A",
          ...(recordDetailsEnabled ? { setting: form.setting || null } : {}),
          supervisorId: form.supervisorId,
        };
        const requiredError = validateProcedureLogFields(requiredLogFields, payload);
        if (requiredError) throw new Error(requiredError);

        if (editLogId) {
          await apiPatch(`/api/students/${user?.studentProfileId}/procedure-logs/${editLogId}`, payload);
        } else {
          await apiPost(`/api/students/${user?.studentProfileId}/procedure-logs`, payload);
        }
      }

      await fetchLogs();
      setOpen(false);
      setEditLogId(null);
      setEditLogRemarks(null);
      setEditLogStatus(null);
      setEditingOriginalLog(null);
      setForm(createInitialForm());
      toast.success(
        editLogStatus === "rejected"
          ? "Procedure resubmitted for faculty review"
          : editLogId
          ? "Procedure updated successfully"
          : "Procedure submitted successfully"
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to submit procedure log");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {error && (
        <div className="flex flex-col items-center justify-center p-8 text-center border rounded-2xl bg-rose-50 border-rose-100">
          <p className="text-rose-700 mb-4">{error}</p>
          <Button onClick={fetchLogs} variant="outline" className="border-rose-200 text-rose-700">Try Again</Button>
        </div>
      )}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="page-eyebrow">Procedures seen and performed</p>
          <h2 className="page-title mt-1">Procedure log</h2>
          <p className="mt-2 text-sm text-slate-500">Procedure exposure, with competency verified only by the reviewing faculty member.</p>
        </div>
        <Dialog open={open} onOpenChange={(val) => { 
          setOpen(val); 
          if (!val) {
            publishArogyaContext(null);
            setForm(createInitialForm());
            setEditLogId(null);
            setEditLogRemarks(null);
            setEditLogStatus(null);
            setEditingOriginalLog(null);
          }
        }}>
          <DialogTrigger asChild><Button><PlusCircle className="h-4 w-4" /> Log procedure</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl bg-white sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editLogStatus === "rejected" ? "Resubmit procedure entry" : editLogId ? "Edit procedure entry" : "New procedure entry"}</DialogTitle>
              <DialogDescription>{editLogStatus === "rejected" ? "Review the faculty feedback below, update the entry details, and resubmit for faculty verification." : hideUhid && isFreeTextProcedures ? "Enter the procedure name and record the level of exposure." : "Select the required procedure and record the level of exposure."}</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              {editLogStatus === "rejected" && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs text-rose-900">
                  <div className="flex items-center gap-1.5 font-semibold text-rose-800">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>Faculty Feedback / Revision Reason:</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-white/80 p-2.5 text-slate-800 border border-rose-100 font-medium leading-relaxed">
                    {editLogRemarks || "No specific feedback was provided. Please verify the entry details and resubmit."}
                  </p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
                {!isFreeTextProcedures && (
                <Field label="Procedure group">
                  <Select value={form.group} onValueChange={(value: ProcedureGroup) => setGroup(value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.keys(PROCEDURE_GROUPS).map((group) => <SelectItem key={group} value={group}>{group}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                )}
              </div>
              <Field label="Procedure">
                {isFreeTextProcedures ? (
                  <Input value={form.procedureName} onChange={(e) => setForm({ ...form, procedureName: e.target.value })} placeholder="Enter procedure name" required />
                ) : (
                <Select value={form.procedureName} onValueChange={(value) => setForm({ ...form, procedureName: value })}>
                  <SelectTrigger><SelectValue placeholder="Select a required procedure" /></SelectTrigger>
                  <SelectContent>{(PROCEDURE_GROUPS[form.group] || []).map((procedure) => <SelectItem key={procedure} value={procedure}>{procedure}</SelectItem>)}</SelectContent>
                </Select>
                )}
              </Field>
              {isMicrobiology ? (
                <Field label="Details">
                  <Textarea
                    value={form.diagnosis}
                    onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
                    placeholder="Enter procedure details"
                    rows={3}
                    required
                  />
                </Field>
              ) : dynamicProcedureFields ? (
                activeProcedureFields.length > 0 && (
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    {activeProcedureFields.map((field) => {
                      const isReq = requires(field.id);
                      const val = getDynamicFieldValue(field.id);
                      const origVal = editLogId ? getOriginalDynamicFieldValue(field.id) : "";
                      const baseOptions = field.options ?? [];
                      const displayOptions = origVal && !baseOptions.includes(origVal)
                        ? [...baseOptions, origVal]
                        : baseOptions;
                      const spanFull = field.type === "textarea" || field.type === "radio";
                      const label = `${field.label}${isReq ? " *" : " (optional)"}`;

                      return (
                        <div key={field.id} className={spanFull ? "sm:col-span-2" : undefined}>
                          <Field label={label}>
                            {field.type === "textarea" ? (
                              <Textarea
                                aria-label={field.label}
                                value={val}
                                onChange={(e) => setDynamicFieldValue(field.id, e.target.value)}
                                maxLength={8000}
                                rows={3}
                                required={isReq}
                              />
                            ) : field.type === "select" ? (
                              <Select
                                value={val}
                                onValueChange={(next) => setDynamicFieldValue(field.id, next === "__none__" ? "" : next)}
                              >
                                <SelectTrigger aria-label={field.label}>
                                  <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {!isReq && <SelectItem value="__none__">Not recorded</SelectItem>}
                                  {displayOptions.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {opt === origVal && !baseOptions.includes(opt) ? `${opt} (previous)` : opt}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : field.type === "radio" ? (
                              <div role="radiogroup" aria-label={field.label} className="flex flex-wrap items-center gap-2 pt-0.5">
                                {displayOptions.map((opt) => {
                                  const checked = val === opt;
                                  return (
                                    <label
                                      key={opt}
                                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                        checked
                                          ? "border-teal-600 bg-teal-50 text-teal-900"
                                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name={`proc-field-${field.id}`}
                                        checked={checked}
                                        onChange={() => setDynamicFieldValue(field.id, opt)}
                                        className="h-3.5 w-3.5 accent-teal-700"
                                      />
                                      <span>{opt === origVal && !baseOptions.includes(opt) ? `${opt} (previous)` : opt}</span>
                                    </label>
                                  );
                                })}
                                {!isReq && val && (
                                  <button
                                    type="button"
                                    onClick={() => setDynamicFieldValue(field.id, "")}
                                    className="ml-1 text-xs font-medium text-slate-500 underline hover:text-slate-800"
                                  >
                                    Clear
                                  </button>
                                )}
                              </div>
                            ) : (
                              <Input
                                aria-label={field.label}
                                value={val}
                                onChange={(e) => setDynamicFieldValue(field.id, e.target.value)}
                                maxLength={isBuiltInProcedureField(field.id) ? 160 : 500}
                                placeholder={field.id === "patientAge" ? "Age with unit" : undefined}
                                required={isReq}
                              />
                            )}
                          </Field>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <>
                  <div className={`grid gap-4 ${hideUhid ? "sm:grid-cols-1" : "sm:grid-cols-2"}`}>
                    {isFreeTextProcedures && !isMicrobiology && !recordDetailsEnabled && (
                      <>
                        <Field label="Diagnosis"><Input value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="e.g. Tinea Corporis" required /></Field>
                        <Field label="Sex"><Input value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })} placeholder="e.g. Male" required /></Field>
                      </>
                    )}
                    {!hideProcedureAge && <Field label={`Age${recordDetailsEnabled ? requires("patientAge") ? " *" : " (optional)" : ""}`}><Input aria-label="Age" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="Age with unit" maxLength={160} required={!recordDetailsEnabled || requires("patientAge")} /></Field>}
                  </div>
                  {recordDetailsEnabled && <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <Field label={`Sex${requires("sex") ? " *" : " (optional)"}`}>
                      <Select value={form.sex} onValueChange={(sex) => setForm({ ...form, sex: sex === "__none__" ? "" : sex })}>
                        <SelectTrigger aria-label="Sex"><SelectValue placeholder="Select sex" /></SelectTrigger>
                        <SelectContent>{!requires("sex") && <SelectItem value="__none__">Not recorded</SelectItem>}{PROCEDURE_SEX_OPTIONS.map((sex) => <SelectItem key={sex} value={sex}>{sex}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                    <Field label={`De-identified patient ID (IP/OP number)${requires("patientUhid") ? " *" : " (optional)"}`}>
                      <Input aria-label="De-identified patient ID (IP/OP number)" value={form.patientUhid} onChange={(e) => setForm({ ...form, patientUhid: e.target.value })} maxLength={160} required={requires("patientUhid")} />
                    </Field>
                    <div className="sm:col-span-2"><Field label={`Diagnosis or indication${requires("diagnosis") ? " *" : " (optional)"}`}>
                      <Textarea aria-label="Diagnosis or indication" value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} maxLength={8000} required={requires("diagnosis")} />
                    </Field></div>
                    <Field label={`Setting${requires("setting") ? " *" : " (optional)"}`}>
                      <Select value={form.setting} onValueChange={(setting) => setForm({ ...form, setting: setting === "__none__" ? "" : setting })}>
                        <SelectTrigger aria-label="Setting"><SelectValue placeholder="Select setting" /></SelectTrigger>
                        <SelectContent>{!requires("setting") && <SelectItem value="__none__">Not recorded</SelectItem>}{PROCEDURE_SETTINGS.map((setting) => <SelectItem key={setting} value={setting}>{setting}</SelectItem>)}</SelectContent>
                      </Select>
                    </Field>
                  </div>}
                  {showProcedureExperience && (
                    <Field label={recordDetailsEnabled ? `Role level${requires("competencyLevel") ? " *" : " (optional)"}` : "Competency level"}>
                      <Select value={form.experience} onValueChange={(value) => setForm({ ...form, experience: value })}>
                        <SelectTrigger aria-label={recordDetailsEnabled ? "Role level" : "Competency level"}><SelectValue placeholder="Select a level" /></SelectTrigger>
                        <SelectContent>
                          {recordDetailsEnabled && !requires("competencyLevel") && <SelectItem value="N/A">Not recorded</SelectItem>}
                          {competencyLevels.map((c) => <SelectItem key={c.id} value={c.value}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {competencyLevels.length === 0 && (
                        <p className="text-sm text-slate-600">No competency levels are set up for your department. Ask your HOD to add them in Department Settings.</p>
                      )}
                    </Field>
                  )}
                </>
              )}
              
              <Field label="Reviewing faculty member">
                <Select value={form.supervisorId} onValueChange={(value) => setForm({ ...form, supervisorId: value })}>
                  <SelectTrigger><SelectValue placeholder="Select a faculty member" /></SelectTrigger>
                  <SelectContent>
                    {professors.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>Cancel</Button>
                <Button 
                  type="submit" 
                  disabled={
                    isSubmitting || 
                    (!dynamicProcedureFields && (requires("competencyLevel") || (!recordDetailsEnabled && Boolean(config?.enabledFeatures?.procedureExperience))) && (!competencyLevels.length || !form.experience))
                  }
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editLogStatus === "rejected" ? (
                    <>
                      <RotateCcw className="mr-1.5 h-4 w-4" /> Resubmit for review
                    </>
                  ) : editLogId ? (
                    "Update procedure"
                  ) : (
                    "Send to faculty"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!isMicrobiology && (
        <>
          {!PROCEDURE_REQUIREMENTS.length && <p className="rounded-xl bg-teal-50 p-4 text-sm text-teal-800">{hideUhid && isFreeTextProcedures ? "Procedure names can be entered directly. This demo department has no configured procedure list or target." : "Your HOD has not configured procedure types for this department yet."}</p>}
          {(PROCEDURE_REQUIREMENTS.length > 0 || !hideUhid) && <div className="grid gap-4 md:grid-cols-2">
            {(Object.keys(PROCEDURE_GROUPS) as ProcedureGroup[]).map((group) => {
              const completed = logs.filter((log) => log.procedureGroup === group && log.status !== "rejected").length;
              return (
                <Card key={group} className={group === "emergency" ? "border-cyan-100" : "border-teal-100"}>
                  <CardContent className="flex items-center justify-between p-5">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{groupNames[group]}</p>
                      <p className="mt-1 text-2xl font-bold text-slate-900">{completed} logged</p>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Stethoscope className="h-5 w-5" /></div>
                  </CardContent>
                </Card>
              );
            })}
          </div>}

          {(!hideUhid || hasProcedureTarget) && <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
            <AlertCircle className="h-5 w-5 text-amber-700" />
            <p className="text-xs text-amber-900"><strong>{logs.length}/{REQUIRED_PROCEDURE_COUNT}</strong> required procedures logged. Continue adding procedures from the departmental list.</p>
          </div>}

          {(!hideUhid || hasProcedureTarget) && <Card>
            <CardHeader className="border-b border-teal-100">
              <CardTitle className="text-lg">Number of procedures required</CardTitle>
              <p className="text-xs text-slate-500">The total is calculated from the procedure targets configured by your HOD.</p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Procedure</TableHead>{!isFreeTextProcedures && <TableHead>Group</TableHead>}<TableHead>Logged</TableHead><TableHead>Required</TableHead><TableHead>Remaining</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {PROCEDURE_REQUIREMENTS.map((requirement) => {
                    const logged = loggedCounts[requirement.name] ?? 0;
                    return (
                      <TableRow key={requirement.name}>
                        <TableCell className="font-semibold">{requirement.name}</TableCell>
                        {!isFreeTextProcedures && <TableCell><Badge variant="outline" className="border-teal-100 bg-teal-50 text-teal-800">{groupNames[requirement.group]}</Badge></TableCell>}
                        <TableCell>{logged}</TableCell>
                        <TableCell className="font-bold text-teal-800">{requirement.required}</TableCell>
                        <TableCell>{Math.max(requirement.required - logged, 0)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-teal-50/60">
                    <TableCell className="font-bold" colSpan={3}>Combined target</TableCell>
                    <TableCell className="font-bold text-teal-800">{REQUIRED_PROCEDURE_COUNT}</TableCell>
                    <TableCell className="font-bold">{Math.max(REQUIRED_PROCEDURE_COUNT - logs.length, 0)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>}
        </>
      )}

      <Card>
        <CardHeader className="border-b border-teal-100"><CardTitle className="text-lg">Procedure entries sent</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              <p className="text-sm font-medium text-slate-500">Loading procedures...</p>
            </div>
          ) : logs.length === 0 ? (
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Stethoscope className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>No procedures logged yet</EmptyTitle>
                <EmptyDescription>Record emergency or invasive procedures to start building your competency history.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setOpen(true)}>Log procedure</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Number</TableHead><TableHead>Date</TableHead>{!isFreeTextProcedures && <TableHead>Group</TableHead>}<TableHead>Procedure</TableHead>{isMicrobiology && <TableHead>Details</TableHead>}{!hideProcedureAge && <TableHead>{ageField?.label || "Age"}</TableHead>}{showProcedureExperience && <TableHead>{roleField?.label || "Competency level"}</TableHead>}{showProcedureExperience && <TableHead>Verified competency</TableHead>}<TableHead>Remarks</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-bold">{log.number}</TableCell>
                    <TableCell>{formatLogbookDate(log.date)}</TableCell>
                    {!isFreeTextProcedures && <TableCell><Badge variant="outline" className="border-teal-100 bg-teal-50 text-teal-800">{groupNames[log.procedureGroup as ProcedureGroup] || log.procedureGroup}</Badge></TableCell>}
                    <TableCell className="font-semibold">{log.procedureName}
                      {recordDetailsEnabled && (!dynamicProcedureFields || activeProcedureFields.length > 0) && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-teal-700">Entry details</summary>
                          <ProcedureClinicalDetails entry={log} fields={dynamicProcedureFields ? activeProcedureFields : undefined} />
                        </details>
                      )}
                    </TableCell>
                    {isMicrobiology && <TableCell className="text-xs max-w-[200px] truncate" title={log.diagnosis || ""}>{log.diagnosis || "—"}</TableCell>}
                    {!hideProcedureAge && <TableCell>{dynamicProcedureFields && (log.patientAge === "N/A" || !log.patientAge) ? "—" : (log.patientAge || log.age)}</TableCell>}
                    {showProcedureExperience && <TableCell className="text-xs">{dynamicProcedureFields && (log.competencyLevel === "N/A" || !log.competencyLevel) ? "—" : log.competencyLevel}</TableCell>}
                    {showProcedureExperience && <TableCell className="text-xs">{log.facultyVerifiedLevel ? (competencyLevels.find(c => c.value === log.facultyVerifiedLevel)?.name || log.facultyVerifiedLevel) : 'Pending verification'}</TableCell>}
                    <TableCell className="text-xs max-w-[160px]">
                      {log.status === "pending"
                        ? <span className="text-slate-400">—</span>
                        : log.status === "rejected"
                          ? <span title={log.facultyRemarks || "No remark"} className={`block truncate cursor-help font-medium ${log.facultyRemarks ? "text-rose-700" : "text-slate-400"}`}>
                              {log.facultyRemarks || "No remark"}
                            </span>
                          : log.facultyRemarks
                            ? <span title={log.facultyRemarks} className="block truncate cursor-help text-slate-600">{log.facultyRemarks}</span>
                            : <span className="text-slate-500">No remark</span>}
                    </TableCell>
                    <TableCell>{statusBadge(log.status)}</TableCell>
                    <TableCell className="text-right">
                      {log.status === "rejected" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 hover:text-rose-800 font-semibold text-xs gap-1.5 h-8 px-2.5"
                          onClick={() => openLogEditor(log, true)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Resubmit
                        </Button>
                      ) : log.status === "pending" ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-800 hover:bg-teal-50" onClick={() => openLogEditor(log, false)}>
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-rose-500 hover:text-rose-700 hover:bg-rose-50" onClick={() => handleDeleteProcedureLog(log.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function statusBadge(status: ProcedureLog["status"]) {
  if (status === "verified") return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" /> Verified</Badge>;
  if (status === "rejected") return <Badge className="border-rose-200 bg-rose-50 text-rose-700"><AlertCircle className="mr-1 h-3 w-3" /> Rejected</Badge>;
  return <Badge className="border-amber-200 bg-amber-50 text-amber-700"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>;
}
