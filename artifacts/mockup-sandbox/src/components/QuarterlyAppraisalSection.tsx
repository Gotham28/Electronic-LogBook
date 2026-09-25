import * as React from "react";
import { ClipboardCheck, Printer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuarterlyAppraisalRecord } from "@/components/QuarterlyAppraisalRecord";
import { apiGet, apiPost } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";
import { toast } from "sonner";
import {
  appraisalScoreBand,
  localDateValue,
  quarterlyAppraisalCategories,
  type AppraisalScoreKey,
  type AppraisalStudent,
  type QuarterlyAppraisal,
} from "@/lib/quarterly-appraisal";

function blankScores(): Record<AppraisalScoreKey, string> {
  return Object.fromEntries(quarterlyAppraisalCategories.map(({ key }) => [key, ""])) as Record<AppraisalScoreKey, string>;
}

export function QuarterlyAppraisalSection() {
  const currentUser = React.useMemo(() => getCurrentUser(), []);
  const now = new Date();
  const [students, setStudents] = React.useState<AppraisalStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = React.useState(true);
  const [studentsError, setStudentsError] = React.useState<string | null>(null);
  const [studentId, setStudentId] = React.useState("");
  const [appraisals, setAppraisals] = React.useState<QuarterlyAppraisal[]>([]);
  const [appraisalsLoading, setAppraisalsLoading] = React.useState(false);
  const [appraisalsError, setAppraisalsError] = React.useState<string | null>(null);
  const [quarter, setQuarter] = React.useState(String(Math.floor(now.getMonth() / 3) + 1));
  const [year, setYear] = React.useState(String(now.getFullYear()));
  const [appraisalDate, setAppraisalDate] = React.useState(localDateValue(now));
  const [publications, setPublications] = React.useState("");
  const [scores, setScores] = React.useState<Record<AppraisalScoreKey, string>>(blankScores);
  const [remediationSuggestions, setRemediationSuggestions] = React.useState("");
  const [formError, setFormError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const loadStudents = React.useCallback(async () => {
    setStudentsLoading(true);
    setStudentsError(null);
    try {
      const result = await apiGet("/api/appraisals/students");
      setStudents(Array.isArray(result) ? result : []);
    } catch (error: any) {
      setStudentsError(error?.message || "Could not load the students available for appraisal.");
    } finally {
      setStudentsLoading(false);
    }
  }, []);

  const loadAppraisals = React.useCallback(async (targetStudentId: string) => {
    if (!targetStudentId) {
      setAppraisals([]);
      setAppraisalsError(null);
      return;
    }
    setAppraisalsLoading(true);
    setAppraisalsError(null);
    try {
      const result = await apiGet(`/api/appraisals/students/${targetStudentId}`);
      setAppraisals(Array.isArray(result) ? result : []);
    } catch (error: any) {
      setAppraisalsError(error?.message || "Could not load saved quarterly appraisals.");
      setAppraisals([]);
    } finally {
      setAppraisalsLoading(false);
    }
  }, []);

  React.useEffect(() => { loadStudents(); }, [loadStudents]);
  React.useEffect(() => { loadAppraisals(studentId); }, [loadAppraisals, studentId]);

  const onStudentChange = (value: string) => {
    setStudentId(value);
    setScores(blankScores());
    setRemediationSuggestions("");
    setPublications("");
    setFormError(null);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const firstMissingScore = quarterlyAppraisalCategories.find(({ key }) => !scores[key]);
    if (!studentId || !quarter || !year || !appraisalDate || !publications || firstMissingScore) {
      setFormError("Complete the student, quarter, year, date, publication status, and all 10 scores.");
      if (firstMissingScore) document.getElementById(`appraisal-${firstMissingScore.key}`)?.focus();
      else if (!studentId) document.getElementById("appraisal-student")?.focus();
      else if (!publications) document.getElementById("appraisal-publications")?.focus();
      return;
    }
    const anyLowScore = quarterlyAppraisalCategories.some(({ key }) => Number(scores[key]) < 4);
    if (anyLowScore && !remediationSuggestions.trim()) {
      setFormError("Add remediation suggestions because at least one score is below 4.");
      document.getElementById("appraisal-remediation")?.focus();
      return;
    }

    setSaving(true);
    try {
      const scoreValues = Object.fromEntries(quarterlyAppraisalCategories.map(({ key }) => [key, Number(scores[key])]));
      await apiPost(`/api/appraisals/students/${studentId}`, {
        quarter: Number(quarter),
        year: Number(year),
        appraisalDate,
        publications: publications === "yes",
        remediationSuggestions: remediationSuggestions.trim(),
        ...scoreValues,
      });
      toast.success("Quarterly appraisal saved");
      setScores(blankScores());
      setRemediationSuggestions("");
      setPublications("");
      await loadAppraisals(studentId);
    } catch (error: any) {
      setFormError(error?.message || "Could not save this quarterly appraisal. Check the entries and try again.");
    } finally {
      setSaving(false);
    }
  };

  const isHod = currentUser?.role === "hod";

  return (
    <section className="space-y-5" aria-labelledby="quarterly-appraisal-heading">
      <Card className="border-slate-200 bg-white">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-teal-50 p-2 text-teal-800"><ClipboardCheck className="h-5 w-5" aria-hidden="true" /></div>
            <div>
              <CardTitle id="quarterly-appraisal-heading" className="text-base font-bold text-slate-900">Postgraduate students quarterly appraisal</CardTitle>
              <CardDescription className="mt-1 text-sm text-slate-600">
                {isHod ? "Record and review appraisals for students in your department." : "Record and review appraisals for students assigned to you."}
                {" "}Scores use the form guide: 1–3 Not Satisfactory, 4–6 Satisfactory, 7–9 More Than Satisfactory.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          {studentsLoading ? (
            <div className="flex min-h-24 items-center justify-center text-sm text-slate-600" role="status">Loading available students…</div>
          ) : studentsError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4" role="alert">
              <p className="text-sm text-rose-800">{studentsError}</p>
              <Button type="button" variant="outline" size="sm" onClick={loadStudents}>Try again</Button>
            </div>
          ) : students.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
              {isHod ? "There are no approved students in your department to appraise." : "No approved students are currently assigned to you for appraisal."}
            </div>
          ) : (
            <form noValidate onSubmit={handleSave} className="space-y-6" aria-busy={saving}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="appraisal-student">PG student</Label>
                  <Select value={studentId} onValueChange={onStudentChange}>
                    <SelectTrigger id="appraisal-student" aria-invalid={Boolean(formError && !studentId)}>
                      <SelectValue placeholder="Select a student" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student) => <SelectItem key={student.id} value={String(student.id)}>{student.name} · {student.registrationNumber}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appraisal-quarter">Quarter</Label>
                  <Select value={quarter} onValueChange={setQuarter}>
                    <SelectTrigger id="appraisal-quarter"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((value) => <SelectItem key={value} value={String(value)}>Quarter {value}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appraisal-year">Year</Label>
                  <Input id="appraisal-year" type="number" min="2000" max="2200" value={year} onChange={(event) => setYear(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appraisal-date">Date / month</Label>
                  <Input id="appraisal-date" type="date" value={appraisalDate} onChange={(event) => setAppraisalDate(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="appraisal-publications">Publications</Label>
                  <Select value={publications} onValueChange={setPublications}>
                    <SelectTrigger id="appraisal-publications" aria-invalid={Boolean(formError && !publications)}>
                      <SelectValue placeholder="Select yes or no" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Appraisal scores</h4>
                  <p className="mt-1 text-xs text-slate-600">Choose one score from 1 to 9 for every category.</p>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                    <caption className="sr-only">Quarterly appraisal score entry</caption>
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr><th scope="col" className="px-4 py-3">Particulars</th><th scope="col" className="w-60 px-4 py-3">Score (1–9)</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quarterlyAppraisalCategories.map(({ key, label }) => (
                        <tr key={key}>
                          <th scope="row" className="px-4 py-3 font-medium text-slate-800">{label}</th>
                          <td className="px-4 py-2.5">
                            <Select value={scores[key]} onValueChange={(value) => setScores((current) => ({ ...current, [key]: value }))}>
                              <SelectTrigger id={`appraisal-${key}`} aria-label={`Score for ${label}`} aria-invalid={Boolean(formError && !scores[key])} className="h-10">
                                <SelectValue placeholder="Select score" />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 9 }, (_, index) => index + 1).map((score) => (
                                  <SelectItem key={score} value={String(score)}>{score} · {appraisalScoreBand(score)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="appraisal-remediation">Remarks / remediation suggestions</Label>
                <p id="appraisal-remediation-help" className="text-xs text-slate-600">Required if any category score is below 4.</p>
                <Textarea
                  id="appraisal-remediation"
                  aria-invalid={Boolean(formError && quarterlyAppraisalCategories.some(({ key }) => Number(scores[key]) < 4) && !remediationSuggestions.trim())}
                  aria-describedby="appraisal-remediation-help"
                  className="min-h-24 resize-none"
                  maxLength={5000}
                  value={remediationSuggestions}
                  onChange={(event) => setRemediationSuggestions(event.target.value)}
                  placeholder="Add the suggested remediation when a score is below 4"
                />
              </div>

              {formError && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{formError}</p>}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-500">The saved form will be visible to the student and can be printed.</p>
                <Button type="submit" disabled={saving} className="min-w-44 gap-2">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saving ? "Saving appraisal…" : "Save quarterly appraisal"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {studentId && (
        <Card className="border-slate-200 bg-white">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div><CardTitle className="text-base">Saved quarterly appraisals</CardTitle><CardDescription className="mt-1">Review or print the records available to your role.</CardDescription></div>
              <Printer className="h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5 sm:p-6">
            {appraisalsLoading ? <p className="py-5 text-center text-sm text-slate-600" role="status">Loading saved appraisals…</p>
              : appraisalsError ? <div className="flex flex-wrap items-center justify-between gap-3" role="alert"><p className="text-sm text-rose-700">{appraisalsError}</p><Button type="button" size="sm" variant="outline" onClick={() => loadAppraisals(studentId)}>Try again</Button></div>
                : appraisals.length === 0 ? <p className="py-5 text-center text-sm text-slate-600">No quarterly appraisal has been saved for this student yet.</p>
                  : appraisals.map((appraisal) => <QuarterlyAppraisalRecord key={appraisal.id} appraisal={appraisal} />)}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
