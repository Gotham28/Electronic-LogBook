import * as React from "react";
import { AlertCircle, CheckCircle2, Clock, Eye, FileText, PlusCircle, Search, Loader2, Trash2, Edit3, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/lib/apiClient";
import { openArogya, publishArogyaContext } from "@/lib/arogya-context";
import { getCurrentUser, isDemoMode } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { formatLogbookDate, todayForInput } from "@/lib/logbook-config";
import { VoiceLogRecorder } from "@/components/VoiceLogRecorder";
import { mergeCaseVoiceFields } from "@/lib/voiceLogMerge";
import type { VoiceLogExtractResponse } from "@workspace/api-zod";
import { useDepartment } from "@/lib/department-context";
import { getCaseMedicalSummary } from "@/lib/case-medical-summary";

type CaseLog = {
  number: number;
  date: string;
  patientUhid: string;
  age: string;
  gender: string;
  category: string;
  chiefComplaints: string;
  history: string;
  examination: string;
  investigations: string;
  diagnosis: string;
  differentialDiagnosis: string;
  management: string;
  outcome: string;
  learningPoints: string;
  status: "pending" | "verified" | "rejected";
  remarks: string;
  facultyRemarks?: string | null;
};

const emptyForm = {
  date: todayForInput(),
  patientUhid: "",
  age: "",
  gender: "Male",
  category: "",
  sampleProcessing: "",
  medicalSummary: "",
  chiefComplaints: "",
  history: "",
  examination: "",
  investigations: "",
  diagnosis: "",
  differentialDiagnosis: "",
  management: "",
  outcome: "",
  learningPoints: "",
  supervisorId: "",
};

export function CaseLogsPage() {
  const [showAllCategories, setShowAllCategories] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [selectedLog, setSelectedLog] = React.useState<any | null>(null);
  React.useEffect(() => {
    if (selectedLog?.id) publishArogyaContext({ log: { type: "case", id: Number(selectedLog.id) } });
    else publishArogyaContext(null);
  }, [selectedLog?.id]);
  const [caseLogs, setCaseLogs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState(emptyForm);
  const [editLogId, setEditLogId] = React.useState<number | null>(null);
  const [editLogRemarks, setEditLogRemarks] = React.useState<string | null>(null);
  const [editLogStatus, setEditLogStatus] = React.useState<string | null>(null);

  const [manuallyEditedFields, setManuallyEditedFields] = React.useState<Set<string>>(new Set());
  const [aiFilledFields, setAiFilledFields] = React.useState<Set<string>>(new Set());
  const [lastVoiceExtraction, setLastVoiceExtraction] = React.useState<VoiceLogExtractResponse | null>(null);
  const [voiceResetKey, setVoiceResetKey] = React.useState(0);

  const resetVoiceState = React.useCallback(() => {
    setManuallyEditedFields(new Set());
    setAiFilledFields(new Set());
    setLastVoiceExtraction(null);
    setVoiceResetKey((k) => k + 1);
  }, []);

  const startEditCase = (log: any) => {
    resetVoiceState();
    setEditLogId(log.id);
    setEditLogRemarks(log.facultyRemarks || null);
    setEditLogStatus(log.status);
    publishArogyaContext({ log: { type: "case", id: Number(log.id) } });
    setForm({
      date: log.date,
      patientUhid: log.patientUhid || "",
      age: log.patientAge || log.age || "",
      gender: (log.patientGender || log.gender || "male").charAt(0).toUpperCase() + (log.patientGender || log.gender || "male").slice(1),
      category: log.category || "",
      sampleProcessing: log.investigations || log.managementPlan || log.management || "",
      medicalSummary: getCaseMedicalSummary(log),
      chiefComplaints: log.chiefComplaints || "",
      history: log.history || "",
      examination: log.examination || "",
      investigations: log.investigations || "",
      diagnosis: log.diagnosisFinal || log.diagnosisProvisional || log.diagnosis || "",
      differentialDiagnosis: log.differentialDiagnosis || "",
      management: log.managementPlan || log.management || "",
      outcome: log.outcome || "",
      learningPoints: log.learningPoints || "",
      supervisorId: String(log.supervisorId || ""),
    });
    setIsModalOpen(true);
  };

  const user = React.useMemo(() => getCurrentUser(), []);
  const hideUhid = true; // isDemoMode();
  const [professors, setProfessors] = React.useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const { caseCategories, config: deptConfig } = useDepartment();
  const medicalSummaryCaseFields = Boolean(deptConfig?.enabledFeatures?.medicalSummaryCaseFields);
  const microbiologyCaseFields = Boolean(deptConfig?.enabledFeatures?.microbiologyCaseFields);

  const totalRequired = React.useMemo(() => 
    caseCategories?.reduce((acc: number, c: any) => acc + c.required, 0) || 50,
  [caseCategories]);

  const categoryProgress = React.useMemo(() => {
    if (!caseCategories) return {};
    return Object.fromEntries(caseCategories.map((cat: any) => [
      cat.value,
      caseLogs.filter((log) => log.category?.trim().toLowerCase() === cat.value?.trim().toLowerCase() && log.status !== "rejected").length,
    ]));
  }, [caseCategories, caseLogs]);

  const fetchLogs = React.useCallback(async () => {
    if (!user?.studentProfileId) {
      setError("Not logged in");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await apiGet(`/api/students/${user.studentProfileId}/logs`);
      // Sort so newest are first
      const sortedLogs = (data.caseLogs || []).sort((a: any, b: any) => b.id - a.id);
      setCaseLogs(sortedLogs.map((log: any, index: number) => ({ ...log, number: sortedLogs.length - index })));
    } catch (err: any) {
      setError(err.message || "Failed to load case logs");
    } finally {
      setLoading(false);
    }
  }, [user?.studentProfileId]);

  React.useEffect(() => {
    fetchLogs();
    if (user?.departmentId) {
      apiGet(`/api/departments/${user.departmentId}/professors`).then(setProfessors).catch(console.error);
    }
  }, [fetchLogs, user?.departmentId]);

  const handleAddCase = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.supervisorId) {
      toast.error("Please select a reviewing faculty member");
      return;
    }
    if (!form.category) {
      toast.error(microbiologyCaseFields ? "Please enter a sample category" : "Please select a category");
      return;
    }
    if (microbiologyCaseFields && !form.diagnosis?.trim()) {
      toast.error("Please enter a provisional diagnosis");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const payload = {
        date: form.date,
        patientUhid: form.patientUhid,
        patientAge: form.age,
        patientGender: form.gender.toLowerCase(),
        category: form.category.trim(),
        chiefComplaints: microbiologyCaseFields ? "" : medicalSummaryCaseFields ? form.medicalSummary : form.chiefComplaints,
        history: (microbiologyCaseFields || medicalSummaryCaseFields) ? "" : form.history,
        examination: (microbiologyCaseFields || medicalSummaryCaseFields) ? "" : form.examination,
        investigations: microbiologyCaseFields ? form.sampleProcessing : form.investigations,
        diagnosisProvisional: form.diagnosis.trim(),
        diagnosisFinal: form.diagnosis.trim(),
        differentialDiagnosis: microbiologyCaseFields ? "" : form.differentialDiagnosis,
        managementPlan: microbiologyCaseFields ? form.sampleProcessing : form.management,
        outcome: microbiologyCaseFields ? "" : form.outcome,
        learningPoints: microbiologyCaseFields ? "" : form.learningPoints,
        supervisorId: form.supervisorId,
      };
      
      if (editLogId) {
        await apiPatch(`/api/students/${user?.studentProfileId}/case-logs/${editLogId}`, payload);
      } else {
        await apiPost(`/api/students/${user?.studentProfileId}/case-logs`, payload);
      }
      
      await fetchLogs();
      setForm({ ...emptyForm, date: todayForInput() });
      setIsModalOpen(false);
      setEditLogId(null);
      setEditLogRemarks(null);
      setEditLogStatus(null);
      resetVoiceState();
      toast.success(
        editLogStatus === "rejected"
          ? "Case resubmitted for faculty review"
          : editLogId
          ? "Case updated successfully"
          : "Case submitted successfully"
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to submit case log");
    } finally {
      setIsSubmitting(false);
    }
  };

  async function handleDeleteCaseLog(logId: number) {
    if (!window.confirm("Delete this log? This cannot be undone.")) return;
    
    try {
      await apiDelete(`/api/students/${user!.studentProfileId}/case-logs/${logId}`);
      setCaseLogs(prev => prev.filter(log => log.id !== logId));
      toast.success("Log deleted successfully");
    } catch (error: any) {
      toast.error(error.message || "An error occurred");
    }
  }

  const search = searchTerm.toLowerCase();
  const filteredLogs = caseLogs.filter((log) => {
    const catName = caseCategories?.find((c: any) => c.value === log.category)?.name || log.category || "";
    const summary = microbiologyCaseFields ? (log.investigations || log.managementPlan || "") : medicalSummaryCaseFields ? getCaseMedicalSummary(log) : log.chiefComplaints;
    const searchFields = hideUhid
      ? [log.number, log.diagnosisProvisional, log.diagnosis, summary, catName]
      : [log.number, log.diagnosisProvisional, log.diagnosis, log.patientUhid, summary, catName];
    return searchFields.some((value) => String(value).toLowerCase().includes(search));
  });

  const setField = (field: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setManuallyEditedFields((prev) => new Set(prev).add(field));
    setAiFilledFields((prev) => {
      const next = new Set(prev);
      next.delete(field);
      return next;
    });
  };

  const handleVoiceExtracted = (result: VoiceLogExtractResponse) => {
    setLastVoiceExtraction(result);
    if (result.logType === "case" && result.fields) {
      const { nextForm, appliedFields } = mergeCaseVoiceFields(
        form,
        result.fields,
        manuallyEditedFields,
        false,
        {
          microbiologyCaseFields,
          medicalSummaryCaseFields,
          hideUhid,
        }
      );
      setForm(nextForm);
      setAiFilledFields(new Set(appliedFields));
    }
  };

  const handleOverwriteEdited = () => {
    if (lastVoiceExtraction && lastVoiceExtraction.logType === "case" && lastVoiceExtraction.fields) {
      const { nextForm, appliedFields } = mergeCaseVoiceFields(
        form,
        lastVoiceExtraction.fields,
        manuallyEditedFields,
        true,
        {
          microbiologyCaseFields,
          medicalSummaryCaseFields,
          hideUhid,
        }
      );
      setForm(nextForm);
      setAiFilledFields(new Set(appliedFields));
    }
  };

  const skippedEditedCount = React.useMemo(() => {
    if (!lastVoiceExtraction || lastVoiceExtraction.logType !== "case" || !lastVoiceExtraction.fields) {
      return 0;
    }
    const { skippedEditedFields } = mergeCaseVoiceFields(
      form,
      lastVoiceExtraction.fields,
      manuallyEditedFields,
      false,
      { microbiologyCaseFields, medicalSummaryCaseFields, hideUhid }
    );
    return skippedEditedFields.length;
  }, [lastVoiceExtraction, form, manuallyEditedFields, microbiologyCaseFields, medicalSummaryCaseFields, hideUhid]);

  const caseFieldLabels = React.useMemo<Record<string, string>>(() => ({
    date: "Date",
    patientUhid: "UHID",
    age: "Age",
    gender: "Gender",
    category: deptConfig?.enabledFeatures?.useCaseTypeLabel ? "Case type" : microbiologyCaseFields ? "Sample category" : "Case category",
    diagnosis: "Diagnosis",
    sampleProcessing: "Sample processing",
    medicalSummary: "Medical summary",
    chiefComplaints: "Chief complaints",
    history: "Relevant history",
    examination: "Clinical examination",
    investigations: "Investigations",
    differentialDiagnosis: "Differential diagnosis",
    management: "Management and interventions",
    outcome: "Outcome / follow-up",
    learningPoints: "Learning points",
  }), [deptConfig?.enabledFeatures?.useCaseTypeLabel, microbiologyCaseFields]);

  const missingRequiredLabels = React.useMemo(() => {
    const list: string[] = [];
    if (lastVoiceExtraction?.missingRequired) {
      for (const key of lastVoiceExtraction.missingRequired) {
        list.push(caseFieldLabels[key] || key);
      }
    }
    if (!form.supervisorId) {
      list.push("Reviewing faculty member");
    }
    return list;
  }, [lastVoiceExtraction, form.supervisorId, caseFieldLabels]);
  
  const hasTarget = deptConfig?.requiredCases !== null && deptConfig?.requiredCases !== undefined;

  return (
    <div className="space-y-6 pb-12">
      {error && (
        <div className="flex flex-col items-center justify-center p-8 text-center border rounded-2xl bg-status border-status-border">
          <p className="text-status-foreground mb-4">{error}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={fetchLogs} variant="outline" className="border-status-border text-status-foreground">Try Again</Button>
            <Button type="button" variant="outline" size="sm" onClick={openArogya}>Ask Mochi about this</Button>
          </div>
        </div>
      )}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="page-eyebrow">Clinical case exposure</p>
          <h2 className="page-title mt-1">Cases presented</h2>
          <p className="mt-2 max-w-2xl text-sm text-helper">
            Structured histories, examinations, investigations, management and learning reflections for every presented case.
          </p>
        </div>
        <Dialog open={isModalOpen} onOpenChange={(val) => { 
          setIsModalOpen(val); 
          if (!val) {
            setForm({ ...emptyForm, date: todayForInput() });
            setEditLogId(null);
            setEditLogRemarks(null);
            setEditLogStatus(null);
            resetVoiceState();
          } 
        }}>
          <DialogTrigger asChild>
            <Button data-tour="caselog-add"><PlusCircle className="h-4 w-4" /> Log clinical case</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl bg-white sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl"><FileText className="h-5 w-5 text-forest" /> {editLogStatus === "rejected" ? "Resubmit clinical case" : editLogId ? "Edit clinical case" : "New clinical case"}</DialogTitle>
              <DialogDescription>{editLogStatus === "rejected" ? "Review the faculty feedback below, edit your case details, and resubmit for faculty review." : "Complete the clinical record before sending it to a faculty member."}</DialogDescription>
            </DialogHeader>
            <form data-tour="caselog-form" onSubmit={handleAddCase} className="space-y-5">
              <VoiceLogRecorder
                studentId={user?.studentProfileId}
                logType="case"
                disabled={isSubmitting}
                onExtracted={handleVoiceExtracted}
                skippedEditedCount={skippedEditedCount}
                onOverwriteEdited={handleOverwriteEdited}
                missingRequiredLabels={missingRequiredLabels}
                resetKey={voiceResetKey}
              />
              {editLogStatus === "rejected" && (
                <div className="rounded-xl border border-status-border bg-status p-3.5 text-xs text-status-foreground">
                  <div className="flex items-center gap-1.5 font-semibold text-status-foreground">
                    <AlertCircle className="h-4 w-4 shrink-0 text-status-foreground" />
                    <span>Faculty Feedback / Revision Reason:</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-card p-2.5 text-ink border border-status-border font-medium leading-relaxed">
                    {editLogRemarks || "No specific feedback was provided. Please verify the case details and resubmit."}
                  </p>
                </div>
              )}
              <div data-tour="caselog-patient-info" className={`grid gap-4 ${hideUhid ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
                <Field label="Date" isAiFilled={aiFilledFields.has("date")}><Input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} required /></Field>
                <Field label="Age" isAiFilled={aiFilledFields.has("age")}><Input value={form.age} onChange={(e) => setField("age", e.target.value)} placeholder="e.g. 7 years" required /></Field>
                <Field label="Gender" isAiFilled={aiFilledFields.has("gender")}>
                  <Select value={form.gender} onValueChange={(value) => setField("gender", value)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                  </Select>
                </Field>
              </div>
              {microbiologyCaseFields ? (
                <>
                  <Field label="Sample category" isAiFilled={aiFilledFields.has("category")}>
                    <Input
                      value={form.category}
                      onChange={(e) => setField("category", e.target.value)}
                      placeholder="e.g. Blood, Sputum, Urine, Pus, CSF"
                      required
                    />
                  </Field>
                  <div data-tour="caselog-clinical-details" className="space-y-5">
                    <Field label="Provisional diagnosis" isAiFilled={aiFilledFields.has("diagnosis")}>
                      <Input
                        value={form.diagnosis}
                        onChange={(e) => setField("diagnosis", e.target.value)}
                        placeholder="e.g. Enteric fever, Pulmonary tuberculosis"
                        required
                      />
                    </Field>
                    <Field label="Sample processing in lab" isAiFilled={aiFilledFields.has("sampleProcessing")}>
                      <Textarea
                        rows={4}
                        value={form.sampleProcessing}
                        onChange={(e) => setField("sampleProcessing", e.target.value)}
                        placeholder="Describe sample receipt, macroscopic appearance, staining, culture media inoculation, incubation, colony characteristics, identification tests, and sensitivity..."
                      />
                    </Field>
                  </div>
                </>
              ) : (
                <>
                  <div data-tour="caselog-clinical-details" className="space-y-5">
                    <Field label={deptConfig?.enabledFeatures?.useCaseTypeLabel ? "Case type" : "Case category"} isAiFilled={aiFilledFields.has("category")}>
                      <Select value={form.category} onValueChange={(value) => setField("category", value)}>
                        <SelectTrigger><SelectValue placeholder={deptConfig?.enabledFeatures?.useCaseTypeLabel ? "Select a case type" : "Select a case category"} /></SelectTrigger>
                        <SelectContent>
                          {caseCategories?.map((cat: any) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    {medicalSummaryCaseFields ? (
                      <Field label="Medical Summary" isAiFilled={aiFilledFields.has("medicalSummary")}><Textarea rows={8} maxLength={8000} value={form.medicalSummary} onChange={(e) => setField("medicalSummary", e.target.value)} /></Field>
                    ) : (
                      <>
                        <Field label="Chief complaints" isAiFilled={aiFilledFields.has("chiefComplaints")}><Textarea rows={2} value={form.chiefComplaints} onChange={(e) => setField("chiefComplaints", e.target.value)} /></Field>
                        <Field label="Relevant history" isAiFilled={aiFilledFields.has("history")}><Textarea rows={3} value={form.history} onChange={(e) => setField("history", e.target.value)} /></Field>
                        <Field label="Clinical examination" isAiFilled={aiFilledFields.has("examination")}><Textarea rows={3} value={form.examination} onChange={(e) => setField("examination", e.target.value)} /></Field>
                      </>
                    )}
                    <Field label="Investigations" isAiFilled={aiFilledFields.has("investigations")}><Textarea rows={2} value={form.investigations} onChange={(e) => setField("investigations", e.target.value)} /></Field>
                  </div>
                  <div data-tour="caselog-diagnosis-details" className="space-y-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Final diagnosis" isAiFilled={aiFilledFields.has("diagnosis")}><Input value={form.diagnosis} onChange={(e) => setField("diagnosis", e.target.value)} required /></Field>
                      <Field label="Differential diagnosis" isAiFilled={aiFilledFields.has("differentialDiagnosis")}><Input value={form.differentialDiagnosis} onChange={(e) => setField("differentialDiagnosis", e.target.value)} /></Field>
                    </div>
                    <Field label="Management and interventions" isAiFilled={aiFilledFields.has("management")}><Textarea rows={3} value={form.management} onChange={(e) => setField("management", e.target.value)} /></Field>
                    <Field label="Outcome / follow-up" isAiFilled={aiFilledFields.has("outcome")}><Textarea rows={2} value={form.outcome} onChange={(e) => setField("outcome", e.target.value)} /></Field>
                    <Field label="Learning points" isAiFilled={aiFilledFields.has("learningPoints")}><Textarea rows={2} value={form.learningPoints} onChange={(e) => setField("learningPoints", e.target.value)} /></Field>
                  </div>
                </>
              )}
              <div data-tour="caselog-reviewer">
              <Field label="Reviewing faculty member">
                <Select value={form.supervisorId} onValueChange={(value) => setField("supervisorId", value)}>
                  <SelectTrigger><SelectValue placeholder="Select a faculty member" /></SelectTrigger>
                  <SelectContent>
                    {professors.map((p: any) => <SelectItem key={p.id} value={String(p.id)}>{p.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              </div>
              <DialogFooter data-tour="caselog-submit-actions">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>Save draft</Button>
                <Button 
                  type="submit" 
                  className={editLogStatus === "rejected" ? "bg-destructive hover:bg-deep text-white" : ""}
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editLogStatus === "rejected" ? (
                    <>
                      <RotateCcw className="mr-1.5 h-4 w-4" /> Resubmit for review
                    </>
                  ) : editLogId ? (
                    "Update case"
                  ) : (
                    "Send to faculty"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!microbiologyCaseFields && caseCategories && caseCategories.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Progress by category</h3>
            <span className="text-xs text-helper">
              {hasTarget ? `${caseLogs.filter(l => l.status !== "rejected").length} of ${totalRequired} total cases logged` : `${caseLogs.filter(l => l.status !== "rejected").length} cases logged`}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {caseCategories.slice(0, showAllCategories ? undefined : 8).map((cat: any) => {
              const logged = categoryProgress[cat.value] ?? 0;
              const pct = cat.required > 0 ? Math.min(Math.round((logged / cat.required) * 100), 100) : 0;
              const done = logged >= cat.required;
              return (
                <div key={cat.value} className={`rounded-xl border p-4 ${done && hasTarget ? "border-status-border bg-status" : "border-line-soft bg-white"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold leading-snug text-ink">{cat.name}</p>
                    {done && hasTarget && <CheckCircle2 className="h-4 w-4 shrink-0 text-status-foreground" />}
                  </div>
                  <p className="mt-2 text-xl font-bold text-ink">{logged}{hasTarget && <span className="text-sm font-normal text-helper">/{cat.required}</span>}</p>
                  {hasTarget && (
                    <div className="mt-2 h-1.5 w-full rounded-full bg-sage">
                      <div
                        className={`h-1.5 rounded-full transition-all ${done ? "bg-forest" : "bg-forest"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {caseCategories.length > 8 && (
            <div className="mt-1 flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setShowAllCategories(!showAllCategories)} className="text-forest hover:text-forest hover:bg-mist">
                {showAllCategories ? "Show less" : `Show all ${caseCategories.length} categories`}
              </Button>
            </div>
          )}
        </div>
      )}

      <Card data-tour="caselog-list">
        <CardHeader className="flex flex-col justify-between gap-4 border-b border-line-soft md:flex-row md:items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-forest" />
            <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-11 pl-9 pr-24" placeholder={microbiologyCaseFields ? "Search sample category, provisional diagnosis or lab processing..." : hideUhid ? "Search category or diagnosis..." : "Search patient, case ID, category or diagnosis..."} />
            <div className="pointer-events-none absolute right-3 top-2.5 flex items-center gap-1">
              <Kbd>Ctrl</Kbd>
              <span className="text-[10px] text-helper">+</span>
              <Kbd>K</Kbd>
            </div>
          </div>
          <Badge variant="outline" className="w-fit border-line-soft bg-mist px-3 py-1 text-forest">
            {hasTarget ? `${caseLogs.length} of ${totalRequired} cases logged` : `${caseLogs.length} cases logged`}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 flex-col items-center justify-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-forest" />
              <p className="text-sm font-medium text-helper">Loading cases...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center space-y-4 text-helper">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mist text-forest">
                <FileText className="h-6 w-6" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-base font-semibold text-ink">No cases found</p>
                <p className="max-w-sm text-sm leading-6 text-helper">{hideUhid ? "Try a different diagnosis or case number, or clear the search to see all records." : "Try a different case ID, diagnosis, or clear the search to see all records."}</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>{microbiologyCaseFields ? "Sample category" : deptConfig?.enabledFeatures?.useCaseTypeLabel ? "Type" : "Category"}</TableHead>
                  <TableHead>{microbiologyCaseFields ? "Provisional diagnosis" : "Diagnosis"}</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log: any) => {
                  const catName = caseCategories?.find((c: any) => c.value === log.category)?.name || log.category;
                  return (
                  <TableRow key={log.id}>
                    <TableCell className="font-bold">{log.number}</TableCell>
                    <TableCell>{formatLogbookDate(log.date)}</TableCell>
                    <TableCell>{log.patientAge || log.age}</TableCell>
                    <TableCell>
                      {catName
                        ? <Badge variant="outline" className="border-line-soft bg-mist text-forest">{catName}</Badge>
                        : <span className="text-helper text-xs">—</span>}
                    </TableCell>
                    <TableCell><p className="max-w-sm font-semibold text-ink">{log.diagnosisProvisional || log.diagnosisFinal || log.diagnosis}</p></TableCell>
                    <TableCell className="text-xs max-w-[160px]">
                      {log.status === "pending"
                        ? <span className="text-helper">—</span>
                        : log.status === "rejected"
                          ? <span title={log.facultyRemarks || "No remark"} className={`block truncate cursor-help font-medium ${log.facultyRemarks ? "text-status-foreground" : "text-helper"}`}>
                              {log.facultyRemarks || "No remark"}
                            </span>
                          : log.facultyRemarks
                            ? <span title={log.facultyRemarks} className="block truncate cursor-help text-soft-ink">{log.facultyRemarks}</span>
                            : <span className="text-helper">No remark</span>}
                    </TableCell>
                    <TableCell>{statusBadge(log.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {log.status === "rejected" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-status-border text-status-foreground bg-status hover:bg-status hover:text-status-foreground font-semibold text-xs gap-1.5 h-8 px-2.5"
                            onClick={() => startEditCase(log)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Resubmit
                          </Button>
                        ) : log.status === "pending" ? (
                          <>
                            <Button variant="ghost" size="sm" className="text-forest hover:text-forest hover:bg-mist" onClick={() => startEditCase(log)}>
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-status-foreground hover:text-status-foreground hover:bg-status" onClick={() => handleDeleteCaseLog(log.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}><Eye className="h-4 w-4" /> Details</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedLog)} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl bg-white sm:max-w-3xl">
          {selectedLog && (
            <>
              <DialogHeader>
                <p className="page-eyebrow">Case number {selectedLog.number} • {formatLogbookDate(selectedLog.date)}</p>
                <DialogTitle className="text-2xl">{selectedLog.diagnosisProvisional || selectedLog.diagnosis}</DialogTitle>
                <DialogDescription>{[hideUhid ? null : selectedLog.patientUhid, selectedLog.patientAge || selectedLog.age, selectedLog.patientGender || selectedLog.gender].filter(Boolean).join(" • ")}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4">
                <Detail label={microbiologyCaseFields ? "Sample category" : deptConfig?.enabledFeatures?.useCaseTypeLabel ? "Type" : "Category"} value={caseCategories?.find((c: any) => c.value === selectedLog.category)?.name || selectedLog.category} />
                {microbiologyCaseFields ? (
                  <>
                    <Detail label="Provisional diagnosis" value={selectedLog.diagnosisProvisional || selectedLog.diagnosisFinal || selectedLog.diagnosis} />
                    <Detail label="Sample processing in lab" value={selectedLog.investigations || selectedLog.managementPlan || selectedLog.management} />
                  </>
                ) : medicalSummaryCaseFields ? (
                  <>
                    <Detail label="Medical Summary" value={getCaseMedicalSummary(selectedLog)} />
                    <Detail label="Investigations" value={selectedLog.investigations} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Detail label="Final diagnosis" value={selectedLog.diagnosisProvisional || selectedLog.diagnosis} />
                      <Detail label="Differential diagnosis" value={selectedLog.differentialDiagnosis} />
                    </div>
                    <Detail label="Management and interventions" value={selectedLog.managementPlan || selectedLog.management} />
                    <Detail label="Outcome / follow-up" value={selectedLog.outcome} />
                    <Detail label="Learning points" value={selectedLog.learningPoints} />
                  </>
                ) : (
                  <>
                    <Detail label="Chief complaints" value={selectedLog.chiefComplaints} />
                    <Detail label="Relevant history" value={selectedLog.history} />
                    <Detail label="Clinical examination" value={selectedLog.examination} />
                    <Detail label="Investigations" value={selectedLog.investigations} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Detail label="Final diagnosis" value={selectedLog.diagnosisProvisional || selectedLog.diagnosis} />
                      <Detail label="Differential diagnosis" value={selectedLog.differentialDiagnosis} />
                    </div>
                    <Detail label="Management and interventions" value={selectedLog.managementPlan || selectedLog.management} />
                    <Detail label="Outcome / follow-up" value={selectedLog.outcome} />
                    <Detail label="Learning points" value={selectedLog.learningPoints} />
                  </>
                )}
                {selectedLog.status === "rejected" ? (
                  <div className="rounded-2xl border border-status-border bg-status p-4 space-y-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-status-foreground">Faculty remarks (revision requested)</p>
                      <p className="mt-1 text-sm font-medium text-status-foreground whitespace-pre-wrap">{selectedLog.facultyRemarks || "No remark provided"}</p>
                    </div>
                    <div className="pt-1 flex justify-end">
                      <Button
                        size="sm"
                        className="bg-destructive hover:bg-deep text-white font-semibold gap-1.5"
                        onClick={() => {
                          const logToEdit = selectedLog;
                          setSelectedLog(null);
                          startEditCase(logToEdit);
                        }}
                      >
                        <RotateCcw className="h-4 w-4" /> Edit &amp; Resubmit Case
                      </Button>
                    </div>
                  </div>
                ) : selectedLog.status === "verified" ? (
                  <div className="rounded-2xl border border-line-soft bg-mist p-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-forest">Faculty remarks</p>
                    <p className="mt-1 text-sm text-forest">{selectedLog.facultyRemarks || "No remark"}</p>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, isAiFilled }: { label: string; children: React.ReactNode; isAiFilled?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label>{label}</Label>
        {isAiFilled && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-mist text-forest border border-line-soft">
            <Sparkles className="h-2.5 w-2.5" />
            <span>AI filled</span>
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-forest">{label}</p><p className="mt-1 text-sm leading-6 text-ink">{value || "Not recorded"}</p></div>;
}

function statusBadge(status: CaseLog["status"]) {
  if (status === "verified") return <Badge className="border-status-border bg-status text-status-foreground"><CheckCircle2 className="mr-1 h-3 w-3" /> Verified</Badge>;
  if (status === "rejected") return <Badge className="border-status-border bg-status text-status-foreground"><AlertCircle className="mr-1 h-3 w-3" /> Rejected</Badge>;
  return <Badge className="border-status-border bg-status text-status-foreground"><Clock className="mr-1 h-3 w-3" /> Pending</Badge>;
}
