import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  Award,
  AlertTriangle,
  PlusCircle,
  BookOpen,
  FileText,
  X,
  RefreshCw,
  Trash2,
  Pencil,
} from "lucide-react";
import { formatLogbookDate } from "@/lib/logbook-config";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/apiClient";
import { getCurrentUser, isDemoMode } from "@/lib/session";
import { QuarterlyAppraisalSection } from "@/components/QuarterlyAppraisalSection";
import { useDepartment } from "@/lib/department-context";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
} from "recharts";

// ── Types for the /progress response ──────────────────────────────────────────

type ProgressCaseCategory = {
  value: string | null;
  verified: number;
  pending: number;
};

type ProgressProcedure = {
  group: string;
  name: string;
  verified: number;
  pending: number;
  byCompetency: { level: string; verified: number; pending: number }[];
};

type ProgressAcademic = {
  value: string;
  verified: number;
  pending: number;
};

type MenteeProgress = {
  caseCategories: ProgressCaseCategory[];
  procedures: ProgressProcedure[];
  academics: ProgressAcademic[];
};

// ── Click-through filter state ─────────────────────────────────────────────────

type LogFilter =
  | { tab: "case-logs"; category: string | null; label: string }
  | { tab: "proc-logs"; group: string; name: string; label: string }
  | { tab: "acad-logs"; activityType: string; label: string }
  | null;

// ── Main component ─────────────────────────────────────────────────────────────

export function ProfessorPortal({ activeTab, embedded }: { activeTab?: string; embedded?: boolean }) {
  const hideUhid = isDemoMode();
  const { config, competencyLevels, caseCategories: deptCaseCategories, procedures: deptProcedures, academics: deptAcademics } = useDepartment();
  const [location, setLocation] = useLocation();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [remarks, setRemarks] = React.useState("");
  const [grade, setGrade] = React.useState("");
  const [competencyOverride, setCompetencyOverride] = React.useState(competencyLevels[0]?.value ?? "");
  const [evaluatedLogs, setEvaluatedLogs] = React.useState<Record<string, any>>({});
  const [departmentFilter, setDepartmentFilter] = React.useState("all");

  // Selected mentee for Logbook Inspector Modal
  const [selectedMentee, setSelectedMentee] = React.useState<any | null>(null);
  const [menteeLogs, setMenteeLogs] = React.useState<any>(null);
  const [menteeProgress, setMenteeProgress] = React.useState<MenteeProgress | null>(null);
  const [menteeProgressError, setMenteeProgressError] = React.useState<string | null>(null);
  const [menteeLogsLoading, setMenteeLogsLoading] = React.useState(false);
  const [menteePostings, setMenteePostings] = React.useState<any[]>([]);
  const [menteeThesis, setMenteeThesis] = React.useState<any | null>(null);
  const [menteeCerts, setMenteeCerts] = React.useState<any[]>([]);
  const [menteeAssessments, setMenteeAssessments] = React.useState<any[]>([]);
  const [reviewBusy, setReviewBusy] = React.useState(false);


  // Dialog inner tab & click-through filter
  const [dialogTab, setDialogTab] = React.useState("progress");
  const [logFilter, setLogFilter] = React.useState<LogFilter>(null);

  // "Show all" toggles for bar charts
  const [showAllCaseBars, setShowAllCaseBars] = React.useState(false);
  const [showAllProcBars, setShowAllProcBars] = React.useState(false);
  const [showAllAcadBars, setShowAllAcadBars] = React.useState(false);

  // Assessment form state
  const [assessExamName, setAssessExamName] = React.useState("");
  const [assessStudentId, setAssessStudentId] = React.useState("");
  const [assessMarks, setAssessMarks] = React.useState("");
  const [assessType, setAssessType] = React.useState<"quarterly" | "annual">("quarterly");
  const [assessDate, setAssessDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [assessSubmitting, setAssessSubmitting] = React.useState(false);

  const getTabFromPath = () => {
    if (activeTab) return activeTab;
    if (location === "/mentees") return "mentees";
    if (location === "/assessments") return "assessments";
    return "review-queue";
  };

  const currentTab = getTabFromPath();

  const handleTabChange = (val: string) => {
    if (val === "mentees") setLocation("/mentees");
    else if (val === "assessments") setLocation("/assessments");
    else setLocation("/");
  };

  const fetchProfessorData = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const user = getCurrentUser();

      if (!user?.id) {
        setError("Not logged in");
        setLoading(false);
        return;
      }

      const json = await apiGet(`/api/professors/${user.id}/review-queue`);
      setData(json);

      setEvaluatedLogs((prev) => {
        const freshReviewIds = new Set((json.pendingReviews || []).map((r: any) => String(r.id)));
        const next = { ...prev };
        let changed = false;
        for (const key of Object.keys(next)) {
          if (!freshReviewIds.has(key)) {
            delete next[key];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    } catch (e: any) {
      setError(e.message || "Failed to load review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchProfessorData();
  }, [fetchProfessorData]);

  const reviews = data?.pendingReviews || [];
  const allStudents = data?.assignedMentees || [];
  const mentees = departmentFilter === "all"
    ? allStudents
    : allStudents.filter((student: any) => student.department === departmentFilter);

  // Auto-clamp currentIndex if the review queue shrinks after an action
  React.useEffect(() => {
    if (reviews.length > 0 && currentIndex >= reviews.length) {
      setCurrentIndex(reviews.length - 1);
    }
  }, [reviews.length, currentIndex]);

  // Reset competencyOverride to default level only when navigating to a new queue item
  React.useEffect(() => {
    if (competencyLevels.length > 0) {
      setCompetencyOverride(competencyLevels[0].value);
    }
  }, [currentIndex]);

  // ── Fetch /logs and /progress in parallel when selectedMentee changes ────────
  React.useEffect(() => {
    if (!selectedMentee) {
      setMenteeLogs(null);
      setMenteeProgress(null);
      setMenteeProgressError(null);
      setLogFilter(null);
      setDialogTab("progress");
      setMenteePostings([]);
      setMenteeThesis(null);
      setMenteeCerts([]);
      setMenteeAssessments([]);
      return;
    }
    let mounted = true;
    const fetchBoth = async () => {
      setMenteeLogsLoading(true);
      setMenteeProgressError(null);

      // Fetch /logs independently so a /progress failure doesn't blank the log tables.
      try {
        const logs = await apiGet(`/api/students/${selectedMentee.id}/logs`);
        if (mounted) setMenteeLogs(logs);
      } catch (err: any) {
        if (mounted) toast.error("Failed to load student logs");
      }

      // Fetch /progress independently so a /logs failure doesn't block the progress tab.
      try {
        const progress = await apiGet(`/api/students/${selectedMentee.id}/progress`);
        if (mounted) setMenteeProgress(progress as MenteeProgress);
      } catch (err: any) {
        if (mounted) {
          toast.error("Failed to load progress data");
          setMenteeProgressError(err?.message || "Failed to load progress data");
        }
      }

      // Fetch postings — professors are scoped to their supervisorId
      try {
        const postingResp = await apiGet(`/api/students/${selectedMentee.id}/postings`);
        if (mounted) setMenteePostings(postingResp.data || []);
      } catch { /* postings tab will show empty */ }

      // Fetch thesis — professors are scoped to guide/co-guide
      try {
        const thesisResp = await apiGet(`/api/students/${selectedMentee.id}/thesis`);
        if (mounted) setMenteeThesis(thesisResp.data || null);
      } catch { /* thesis tab will show empty */ }

      // Fetch certifications — professors scoped to mentee relationship
      try {
        const certsResp = await apiGet(`/api/students/${selectedMentee.id}/certifications`);
        if (mounted) setMenteeCerts(Array.isArray(certsResp) ? certsResp : []);
      } catch { /* certs tab will show empty, 403 is expected for non-mentees */ }

      // Fetch assessments
      try {
        const assessResp = await apiGet(`/api/students/${selectedMentee.id}/assessments`);
        if (mounted) setMenteeAssessments(Array.isArray(assessResp) ? assessResp : (assessResp?.data || []));
      } catch { /* assessments tab will show empty */ }

      if (mounted) setMenteeLogsLoading(false);
    };
    fetchBoth();
    return () => { mounted = false; };
  }, [selectedMentee]);


  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-teal-600"></div>
          <p className="text-sm font-medium text-slate-500">Loading Faculty Review Queue...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center space-y-4">
        <p className="text-red-500">{error}</p>
        <Button onClick={fetchProfessorData} variant="outline">Try Again</Button>
      </div>
    );
  }

  const currentItem = reviews[currentIndex];

  const handleReviewAction = async (status: "verified" | "rejected") => {
    if (!currentItem || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await apiPatch(`/api/logs/${currentItem.logType}/${currentItem.dbId}/review`, {
        status,
        comments: remarks,
        ...(currentItem.logType === "procedure" && competencyOverride
          ? { facultyVerifiedLevel: competencyOverride }
          : {}),
        ...(currentItem.logType === "academic" && grade
          ? { facultyGrade: grade }
          : {})
      });

      // Optimistic update for evaluatedLogs mapping
      setEvaluatedLogs(prev => ({
        ...prev,
        [currentItem.id]: { status, remarks, grade },
      }));

      toast.success(status === "verified" ? `Number ${currentItem.id} verified` : `Revision Requested for ${currentItem.id}`);

      setRemarks("");
      setGrade("");
      // Refresh real data so the roster updates and the queue shrinks
      await fetchProfessorData();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit review");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = () => handleReviewAction("verified");
  const handleReject = () => handleReviewAction("rejected");

  // ── Helper: derive faculty role from review-queue response ────────────────────
  // data?.faculty?.role === "hod" means this portal is rendering in HOD context.
  const callerIsHod = data?.faculty?.role === "hod";

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner: Professor Profile — hidden when embedded in HOD portal */}
      {!embedded && (
        <div className="rounded-2xl bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 p-6 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30 text-xs font-semibold mb-2">
              Faculty &amp; Evaluator Portal
            </Badge>
            <h2 className="text-2xl font-black">Welcome, {data?.faculty?.name || getCurrentUser()?.name}</h2>
            <p className="text-xs text-slate-300">
              Department faculty • <strong>{allStudents.length} approved students</strong>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-teal-500/10 border border-teal-500/30 px-4 py-2 rounded-xl text-right">
              <p className="text-xl font-extrabold text-teal-300">{Math.max(0, reviews.length - Object.keys(evaluatedLogs).length)}</p>
              <p className="text-[11px] text-slate-300 font-medium">Pending Review Items</p>
            </div>
          </div>
        </div>
      )}



      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
        {/* Inner tab bar — hidden when embedded in HOD portal (HOD sidebar handles navigation) */}
        {!embedded && (
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto">
            <TabsTrigger value="review-queue" className="gap-2 text-xs font-semibold">
              <FileCheck className="h-4 w-4" /> Sequential Review Queue ({Math.max(0, reviews.length - Object.keys(evaluatedLogs).length)})
            </TabsTrigger>
            <TabsTrigger value="mentees" className="gap-2 text-xs font-semibold">
              <UserCheck className="h-4 w-4" /> All Students ({allStudents.length})
            </TabsTrigger>
            <TabsTrigger value="assessments" className="gap-2 text-xs font-semibold">
              <Award className="h-4 w-4" /> Add Assessment
            </TabsTrigger>
          </TabsList>
        )}

        {/* Tab 1: Sequential Fast Review Queue */}
        <TabsContent value="review-queue" className="pt-4 space-y-6">
          {reviews.length === 0 || currentIndex >= reviews.length ? (
            <Card className="p-8 text-center bg-white border border-slate-200">
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900">Review Queue Clear!</h3>
              <p className="text-xs text-slate-500">All submitted student logs have been reviewed and verified.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Submission Detail View */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="border border-slate-200 shadow-xs bg-white">
                  <CardHeader className="border-b border-slate-100 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-teal-50 text-teal-800 border-teal-300 text-xs">
                          Item {currentIndex + 1} of {reviews.length}
                        </Badge>
                        <Badge className="bg-slate-100 text-slate-700 text-xs">
                          {currentItem.type}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={currentIndex === 0}
                          onClick={() => setCurrentIndex(currentIndex - 1)}
                          className="h-8 text-xs"
                        >
                          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={currentIndex === reviews.length - 1}
                          onClick={() => setCurrentIndex(currentIndex + 1)}
                          className="h-8 text-xs"
                        >
                          Next <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{currentItem.title}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Submitted by <strong className="text-slate-800">{currentItem.studentName}</strong>
                        </p>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{formatLogbookDate(currentItem.date)}</span>
                    </div>

                    <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-200/60">
                      <h4 className="text-xs font-semibold uppercase text-slate-500">Submission Details</h4>
                      <p className="text-sm text-slate-800 leading-relaxed">{currentItem.detail}</p>
                      {currentItem.patientInfo && (
                        <p className="text-xs text-slate-600 font-medium">Patient Info: {currentItem.patientInfo}</p>
                      )}
                      {!hideUhid && currentItem.patientUhid && (
                        <p className="text-xs font-semibold text-teal-800">Patient ID: {currentItem.patientUhid}</p>
                      )}
                      {currentItem.declaredCompetency && (
                        <p className="text-xs text-teal-800 font-semibold bg-teal-50 inline-block px-2.5 py-1 rounded border border-teal-200 mt-1">
                          Self-Declared Level: {currentItem.declaredCompetency}
                        </p>
                      )}
                      {currentItem.type === "Conference" && currentItem.location && (
                        <p className="text-xs text-slate-600 font-medium">Location: {currentItem.location}</p>
                      )}
                      {currentItem.type === "Conference" && currentItem.certificateUrl && (
                        <p className="text-xs text-slate-600 font-medium overflow-hidden text-ellipsis whitespace-nowrap">
                          Certificate: <a href={currentItem.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">{currentItem.certificateUrl}</a>
                        </p>
                      )}
                    </div>

                    {evaluatedLogs[currentItem.id] && (
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
                        <span>Evaluated Status: <strong>{evaluatedLogs[currentItem.id].status.toUpperCase()}</strong> {evaluatedLogs[currentItem.id].remarks ? `(${evaluatedLogs[currentItem.id].remarks})` : "(No remark)"}</span>
                        <Badge className="bg-emerald-600">Saved</Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Fast Evaluation Panel */}
              <div className="space-y-4">
                <Card className="border border-teal-200 shadow-sm bg-white">
                  <CardHeader className="bg-teal-50/70 border-b border-teal-100 pb-3">
                    <CardTitle className="text-sm font-bold text-teal-900 flex items-center gap-2">
                      <FileCheck className="h-4 w-4 text-teal-700" /> Fast Faculty Evaluation
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {currentItem.type === "Procedure" && config?.enabledFeatures?.procedureExperience && (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-700">Verified Competency Level</label>
                        <Select value={competencyOverride} onValueChange={setCompetencyOverride}>
                          <SelectTrigger className="text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {competencyLevels.map((c) => <SelectItem key={c.id} value={c.value}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-slate-500">Available only while reviewing procedure logs.</p>
                      </div>
                    )}

                    {currentItem.type === "Academic" && (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-700">Scholastic Grade</label>
                        <div className="flex gap-2">
                          {["A+", "A", "B+", "B", "C"].map((g) => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => setGrade(g)}
                              className={`flex-1 py-1.5 rounded text-xs font-bold transition-all border ${grade === g ? "bg-teal-600 text-white border-teal-600" : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                                }`}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-700">Faculty Remarks</label>
                      <Textarea
                        rows={3}
                        placeholder="Add constructive feedback or verification notes..."
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        className="text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <Button
                        onClick={handleReject}
                        disabled={isSubmitting}
                        variant="outline"
                        className="border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold gap-1"
                      >
                        <XCircle className="h-4 w-4" /> Request Revision
                      </Button>
                      <Button
                        onClick={handleApprove}
                        disabled={isSubmitting}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold gap-1"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Verify &amp; Next
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab 2: All Students List with Full Logbook Inspector */}
        <TabsContent value="mentees" className="pt-4 space-y-4">
          <Card className="border-cyan-100 bg-cyan-50/60">
            <CardContent className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center">
              <div>
                <p className="font-bold text-slate-900">Privacy-protected student access</p>
                <p className="mt-1 text-xs text-slate-600">
                  {data?.faculty?.role === "hod"
                    ? "As HOD, you can inspect progress and complete logbooks for every approved student in your department."
                    : "Progress is visible department-wide; detailed entries are limited to logs explicitly sent to you."}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border border-slate-200 shadow-xs bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base font-bold text-slate-900">All PG Students Progress</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-semibold">Resident Name</TableHead>
                    <TableHead className="text-xs font-semibold">Requirement Progress</TableHead>
                    <TableHead className="text-xs font-semibold">Shortfall Status</TableHead>
                    <TableHead className="text-xs font-semibold text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mentees.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-bold text-xs text-slate-900">
                        {m.name}
                        <p className="text-[11px] text-slate-500 font-normal">{m.registrationNumber}</p>
                      </TableCell>
                      <TableCell className="text-xs w-48">
                        {m.overallCompletion !== null && m.overallCompletion !== undefined ? (
                          <>
                            <div className="flex items-center justify-between text-[11px] mb-1">
                              <span className="font-semibold text-slate-700">{m.overallCompletion}%</span>
                            </div>
                            <Progress value={m.overallCompletion} className="h-2" />
                          </>
                        ) : (
                          <span className="text-slate-400">Not configured</span>
                        )}
                      </TableCell>
                      <TableCell>{renderShortfallBadge(m.shortfallStatus)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          onClick={() => {
                            setSelectedMentee(m);
                            toast.info(`Opening Logbook for ${m.name}`);
                          }}
                          size="sm"
                          variant="outline"
                          className="text-xs text-teal-700 border-teal-300 font-semibold gap-1.5"
                        >
                          <BookOpen className="h-3.5 w-3.5" /> View Logbook
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Add Assessment */}
        <TabsContent value="assessments" className="pt-4 space-y-4">
          <Card className="border border-slate-200 bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-base font-bold text-slate-900">Add Assessment Score</CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Enter exam results for a student in your department. The assessment will be attributed to your account automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!assessExamName || !assessMarks || !assessStudentId) {
                    toast.error("Please fill in all required fields");
                    return;
                  }
                  setAssessSubmitting(true);
                  try {
                    await apiPost(`/api/students/${assessStudentId}/assessments`, {
                      examName: assessExamName,
                      type: assessType,
                      date: assessDate,
                      marks: assessMarks,
                    });
                    toast.success("Assessment recorded successfully");
                    setAssessExamName("");
                    setAssessStudentId("");
                    setAssessMarks("");
                    setAssessType("quarterly");
                    setAssessDate(new Date().toISOString().slice(0, 10));
                  } catch (err: any) {
                    toast.error(err.message || "Failed to record assessment");
                  } finally {
                    setAssessSubmitting(false);
                  }
                }}
                className="space-y-5"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Student <span className="text-rose-500">*</span></label>
                    <Select value={assessStudentId} onValueChange={setAssessStudentId}>
                      <SelectTrigger className="text-xs">
                        <SelectValue placeholder="Select student" />
                      </SelectTrigger>
                      <SelectContent>
                        {allStudents.map((s: any) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                            {s.registrationNumber ? ` — ${s.registrationNumber}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Exam Name <span className="text-rose-500">*</span></label>
                    <Input
                      value={assessExamName}
                      onChange={(e) => setAssessExamName(e.target.value)}
                      placeholder="e.g. Q1 Theory Exam 2026"
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Marks (out of 100) <span className="text-rose-500">*</span></label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={assessMarks}
                      onChange={(e) => setAssessMarks(e.target.value)}
                      placeholder="e.g. 78"
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Type</label>
                    <Select value={assessType} onValueChange={(val: any) => setAssessType(val)}>
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="quarterly">Quarterly</SelectItem>
                        <SelectItem value="annual">Annual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Date</label>
                    <Input
                      type="date"
                      value={assessDate}
                      onChange={(e) => setAssessDate(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={assessSubmitting}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs gap-2"
                >
                  <PlusCircle className="h-4 w-4" />
                  {assessSubmitting ? "Saving..." : "Record Assessment"}
                </Button>
              </form>
            </CardContent>
          </Card>
          <QuarterlyAppraisalSection />
        </TabsContent>
      </Tabs>

      {/* Mentee Detailed Logbook Inspector Dialog Modal */}
      <Dialog open={!!selectedMentee} onOpenChange={() => {
        setSelectedMentee(null);
        setLogFilter(null);
        setDialogTab("progress");
      }}>
        <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-y-auto bg-white">
          {selectedMentee && (
            <div className="space-y-4">
              <DialogHeader className="border-b border-slate-100 pb-3">
                <DialogTitle className="text-slate-900 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-teal-600" /> Logbook Record: {selectedMentee.name}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-slate-500">
                  Registration: {selectedMentee.registrationNumber}
                </DialogDescription>
              </DialogHeader>

              {selectedMentee.overallCompletion !== null && selectedMentee.overallCompletion !== undefined && (
                <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">Overall MCI Requirement Completion</span>
                    <span className="font-bold text-teal-800">{selectedMentee.overallCompletion}%</span>
                  </div>
                  <Progress value={selectedMentee.overallCompletion} className="h-2" />
                </div>
              )}

              <Tabs value={dialogTab} onValueChange={(v) => { setDialogTab(v); setLogFilter(null); }} className="w-full">
                <TabsList className="bg-slate-100 p-1 rounded-lg w-full h-auto flex flex-nowrap sm:flex-wrap justify-start overflow-x-auto gap-1">
                  <TabsTrigger value="progress" className="text-xs whitespace-nowrap">Training Progress</TabsTrigger>
                  <TabsTrigger value="case-logs" className="text-xs whitespace-nowrap">Clinical Case Logs</TabsTrigger>
                  <TabsTrigger value="proc-logs" className="text-xs whitespace-nowrap">Procedure Logs</TabsTrigger>
                  <TabsTrigger value="acad-logs" className="text-xs whitespace-nowrap">Academic Activity</TabsTrigger>
                  <TabsTrigger value="postings" className="text-xs whitespace-nowrap">Postings</TabsTrigger>
                  <TabsTrigger value="thesis" className="text-xs whitespace-nowrap">Thesis</TabsTrigger>
                  <TabsTrigger value="certifications" className="text-xs whitespace-nowrap">Certifications</TabsTrigger>
                  <TabsTrigger value="assessments" className="text-xs whitespace-nowrap">Assessments</TabsTrigger>
                </TabsList>

                {/* ── Progress Tab ─────────────────────────────────────────── */}
                <TabsContent value="progress" className="pt-3">
                  {menteeLogsLoading ? (
                    <div className="flex h-32 items-center justify-center">
                      <div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8" />
                    </div>
                  ) : menteeProgressError ? (
                    /* ── Error state — never show zeros on fetch failure ── */
                    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-rose-100 bg-rose-50/60 p-8 text-center">
                      <AlertTriangle className="h-8 w-8 text-rose-500" />
                      <div>
                        <p className="font-semibold text-rose-800">Failed to load progress data</p>
                        <p className="mt-1 text-xs text-rose-600">{menteeProgressError}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-rose-200 text-rose-700 gap-2"
                        onClick={() => {
                          if (!selectedMentee) return;
                          // Capture the mentee at click time so a navigation
                          // away during the async fetch cannot write stale state.
                          const menteeIdAtClick = selectedMentee.id;
                          setMenteeProgressError(null);
                          setMenteeLogsLoading(true);
                          (async () => {
                            try {
                              const logs = await apiGet(`/api/students/${menteeIdAtClick}/logs`);
                              if (selectedMentee?.id === menteeIdAtClick) setMenteeLogs(logs);
                            } catch {
                              /* toast already shown by original effect; suppress here */
                            }
                            try {
                              const progress = await apiGet(`/api/students/${menteeIdAtClick}/progress`);
                              if (selectedMentee?.id === menteeIdAtClick) setMenteeProgress(progress as MenteeProgress);
                            } catch (err: any) {
                              if (selectedMentee?.id === menteeIdAtClick) {
                                setMenteeProgressError(err?.message || "Failed to load progress data");
                              }
                            }
                            if (selectedMentee?.id === menteeIdAtClick) setMenteeLogsLoading(false);
                          })();
                        }}
                      >
                        <RefreshCw className="h-4 w-4" /> Retry
                      </Button>
                    </div>
                  ) : menteeProgress ? (
                    <ProgressTabContent
                      progress={menteeProgress}
                      deptCaseCategories={deptCaseCategories}
                      deptProcedures={deptProcedures}
                      deptAcademics={deptAcademics}
                      showAllCaseBars={showAllCaseBars}
                      setShowAllCaseBars={setShowAllCaseBars}
                      showAllProcBars={showAllProcBars}
                      setShowAllProcBars={setShowAllProcBars}
                      showAllAcadBars={showAllAcadBars}
                      setShowAllAcadBars={setShowAllAcadBars}
                      onBarClick={(filter) => {
                        setLogFilter(filter);
                        setDialogTab(filter?.tab ?? "case-logs");
                      }}
                    />
                  ) : (
                    /* ── Empty state before load completes ── */
                    <div className="flex h-32 items-center justify-center">
                      <div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8" />
                    </div>
                  )}
                </TabsContent>

                {/* ── Clinical Case Logs Tab ───────────────────────────────── */}
                <TabsContent value="case-logs" className="pt-3">
                  {logFilter?.tab === "case-logs" && (
                    <FilterBanner
                      label={logFilter.label}
                      onClear={() => setLogFilter(null)}
                      progressCount={
                        menteeProgress?.caseCategories.find(
                          (c) => c.value === (logFilter as any).category
                        )
                      }
                      filteredCount={
                        (menteeLogs?.caseLogs ?? []).filter((log: any) =>
                          log.category === (logFilter as any).category
                        ).length
                      }
                      callerIsHod={callerIsHod}
                    />
                  )}
                  {menteeLogsLoading ? (
                    <div className="flex h-32 items-center justify-center"><div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8" /></div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="text-xs font-semibold">Date</TableHead>
                          <TableHead className="text-xs font-semibold">Diagnosis</TableHead>
                          <TableHead className="text-xs font-semibold">{hideUhid ? "Patient Info" : "Patient ID & Info"}</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const rows = logFilter?.tab === "case-logs"
                            ? (menteeLogs?.caseLogs ?? []).filter((log: any) => log.category === (logFilter as any).category)
                            : (menteeLogs?.caseLogs ?? []);
                          if (!rows.length) {
                            return <TableRow><TableCell colSpan={4} className="text-center text-sm text-slate-500 py-6">No case logs found.</TableCell></TableRow>;
                          }
                          return rows.map((log: any) => (
                            <TableRow key={log.id}>
                              <TableCell className="text-xs font-medium">{formatLogbookDate(log.date)}</TableCell>
                              <TableCell className="text-xs font-bold text-slate-900">{log.diagnosisFinal}</TableCell>
                              <TableCell className="text-xs text-slate-600">
                                {!hideUhid && <p className="font-semibold text-teal-800">{log.patientUhid || "—"}</p>}
                                <p>{log.patientAge} / {log.patientGender}</p>
                              </TableCell>
                              <TableCell className="text-right">
                                {renderLogStatusBadge(log.status)}
                              </TableCell>
                            </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* ── Procedure Logs Tab ───────────────────────────────────── */}
                <TabsContent value="proc-logs" className="pt-3">
                  {logFilter?.tab === "proc-logs" && (
                    <FilterBanner
                      label={logFilter.label}
                      onClear={() => setLogFilter(null)}
                      progressCount={
                        menteeProgress?.procedures.find(
                          (p) => p.group === (logFilter as any).group && p.name === (logFilter as any).name
                        )
                      }
                      filteredCount={
                        (menteeLogs?.procedureLogs ?? []).filter((log: any) =>
                          log.procedureName === (logFilter as any).name &&
                          log.procedureGroup === (logFilter as any).group
                        ).length
                      }
                      callerIsHod={callerIsHod}
                    />
                  )}
                  {menteeLogsLoading ? (
                    <div className="flex h-32 items-center justify-center"><div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8" /></div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="text-xs font-semibold">Procedure Name</TableHead>
                          <TableHead className="text-xs font-semibold">{hideUhid ? "Age" : "Patient ID & Age"}</TableHead>
                          <TableHead className="text-xs font-semibold">Competency</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const rows = logFilter?.tab === "proc-logs"
                            ? (menteeLogs?.procedureLogs ?? []).filter((log: any) =>
                              log.procedureName === (logFilter as any).name &&
                              log.procedureGroup === (logFilter as any).group
                            )
                            : (menteeLogs?.procedureLogs ?? []);
                          if (!rows.length) {
                            return <TableRow><TableCell colSpan={4} className="text-center text-sm text-slate-500 py-6">No procedure logs found.</TableCell></TableRow>;
                          }
                          return rows.map((log: any) => (
                            <TableRow key={log.id}>
                              <TableCell className="text-xs font-bold text-slate-900">{log.procedureName}</TableCell>
                              <TableCell className="text-xs text-slate-600">
                                {!hideUhid && <p className="font-semibold text-teal-800">{log.patientUhid || "—"}</p>}
                                <p>{log.patientAge}</p>
                              </TableCell>
                              <TableCell className="text-xs text-teal-800 font-semibold">{log.competencyDeclared}</TableCell>
                              <TableCell className="text-right">
                                {renderLogStatusBadge(log.status)}
                              </TableCell>
                            </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* ── Academic Activity Tab ────────────────────────────────── */}
                <TabsContent value="acad-logs" className="pt-3">
                  {logFilter?.tab === "acad-logs" && (
                    <FilterBanner
                      label={logFilter.label}
                      onClear={() => setLogFilter(null)}
                      progressCount={
                        menteeProgress?.academics.find(
                          (a) => a.value === (logFilter as any).activityType
                        )
                      }
                      filteredCount={
                        (menteeLogs?.academicLogs ?? []).filter((log: any) =>
                          log.activityType === (logFilter as any).activityType
                        ).length
                      }
                      callerIsHod={callerIsHod}
                    />
                  )}
                  {menteeLogsLoading ? (
                    <div className="flex h-32 items-center justify-center"><div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8" /></div>
                  ) : (
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="text-xs font-semibold">Type</TableHead>
                          <TableHead className="text-xs font-semibold">Topic</TableHead>
                          <TableHead className="text-xs font-semibold text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const rows = logFilter?.tab === "acad-logs"
                            ? (menteeLogs?.academicLogs ?? []).filter((log: any) => log.activityType === (logFilter as any).activityType)
                            : (menteeLogs?.academicLogs ?? []);
                          if (!rows.length) {
                            return <TableRow><TableCell colSpan={3} className="text-center text-sm text-slate-500 py-6">No academic logs found.</TableCell></TableRow>;
                          }
                          return rows.map((log: any) => (
                            <TableRow key={log.id}>
                              <TableCell className="text-xs font-semibold">{log.activityType}</TableCell>
                              <TableCell className="text-xs text-slate-900">{log.topic}</TableCell>
                              <TableCell className="text-right">
                                {renderLogStatusBadge(log.status)}
                              </TableCell>
                            </TableRow>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* ── Postings Tab ──────────────────────────────────────────── */}
                <TabsContent value="postings" className="pt-3">
                  {menteePostings.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">No postings visible to you (either none logged or none assigned to you as supervisor).</p>
                  ) : (
                    <div className="space-y-3">
                      {menteePostings.map((posting: any) => (
                        <div key={posting.id} className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{posting.ward}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{formatLogbookDate(posting.startDate)} – {formatLogbookDate(posting.endDate)}</p>
                              {posting.facultyRemarks && (
                                <p className="mt-1 text-xs text-slate-600 italic">Remarks: {posting.facultyRemarks}</p>
                              )}
                            </div>
                            <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              posting.status === "verified" ? "bg-emerald-100 text-emerald-700" :
                              posting.status === "rejected" ? "bg-rose-100 text-rose-700" :
                              "bg-amber-100 text-amber-700"
                            }`}>{posting.status === "verified" ? "Verified" : posting.status === "rejected" ? "Rejected" : "Pending"}</span>
                          </div>
                          <PostingReviewForm
                            posting={posting}
                            studentId={selectedMentee.id}
                            busy={reviewBusy}
                            onDone={async () => {
                              setReviewBusy(true);
                              try {
                                const resp = await apiGet(`/api/students/${selectedMentee.id}/postings`);
                                setMenteePostings(resp.data || []);
                              } finally { setReviewBusy(false); }
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* ── Thesis Tab ────────────────────────────────────────────── */}
                <TabsContent value="thesis" className="pt-3">
                  {!menteeThesis ? (
                    <p className="text-sm text-slate-500 py-6 text-center">No thesis recorded yet, or this student's thesis is not assigned to you as guide.</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="font-semibold text-slate-900 text-sm">{menteeThesis.thesisTitle}</p>
                        {menteeThesis.facultyRemarks && (
                          <p className="mt-1 text-xs text-slate-600 italic">Remarks: {menteeThesis.facultyRemarks}</p>
                        )}
                        <div className="mt-3 grid grid-cols-3 gap-3">
                          {[
                            ["Protocol", menteeThesis.protocolStatus, "protocolStatus"],
                            ["Mid-Term", menteeThesis.midTermStatus, "midTermStatus"],
                            ["Final Submission", menteeThesis.finalSubmissionStatus, "finalSubmissionStatus"],
                          ].map(([label, status, field]) => (
                            <div key={field} className="text-center rounded-lg border border-slate-100 p-2">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                              <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                status === "approved" ? "bg-emerald-100 text-emerald-700" :
                                status === "submitted" ? "bg-blue-100 text-blue-700" :
                                "bg-amber-100 text-amber-700"
                              }`}>{String(status).charAt(0).toUpperCase() + String(status).slice(1)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <ThesisReviewForm
                        thesis={menteeThesis}
                        studentId={selectedMentee.id}
                        busy={reviewBusy}
                        onDone={async () => {
                          setReviewBusy(true);
                          try {
                            const resp = await apiGet(`/api/students/${selectedMentee.id}/thesis`);
                            setMenteeThesis(resp.data || null);
                          } finally { setReviewBusy(false); }
                        }}
                      />
                    </div>
                  )}
                </TabsContent>

                {/* ── Certifications Tab ────────────────────────────────────── */}
                <TabsContent value="certifications" className="pt-3">
                  {menteeCerts.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">No certifications visible to you (this student may not be your direct mentee).</p>
                  ) : (
                    <div className="space-y-3">
                      {menteeCerts.map((cert: any) => (
                        <div key={cert.id} className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{cert.title}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{cert.provider} · Issued {formatLogbookDate(cert.issueDate)}</p>
                              <a href={cert.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 hover:underline mt-0.5 inline-block">View certificate ↗</a>
                              {cert.facultyRemarks && (
                                <p className="mt-1 text-xs text-slate-600 italic">Remarks: {cert.facultyRemarks}</p>
                              )}
                            </div>
                            <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              cert.status === "verified" ? "bg-emerald-100 text-emerald-700" :
                              cert.status === "rejected" ? "bg-rose-100 text-rose-700" :
                              "bg-amber-100 text-amber-700"
                            }`}>{cert.status === "verified" ? "Verified" : cert.status === "rejected" ? "Rejected" : "Pending"}</span>
                          </div>
                          <CertReviewForm
                            cert={cert}
                            studentId={selectedMentee.id}
                            busy={reviewBusy}
                            onDone={async () => {
                              setReviewBusy(true);
                              try {
                                const resp = await apiGet(`/api/students/${selectedMentee.id}/certifications`);
                                setMenteeCerts(Array.isArray(resp) ? resp : []);
                              } finally { setReviewBusy(false); }
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* ── Assessments Tab ─────────────────────────────────────────── */}
                <TabsContent value="assessments" className="pt-3">
                  {menteeAssessments.length === 0 ? (
                    <p className="text-sm text-slate-500 py-6 text-center">No assessments found for this student.</p>
                  ) : (
                    <div className="space-y-4">
                      {menteeAssessments.map((assessment: any) => (
                        <div key={assessment.id} className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{assessment.examName}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{assessment.type === "annual" ? "Annual" : "Quarterly"} · {formatLogbookDate(assessment.date)}</p>
                              <p className="mt-1 text-xs font-medium text-teal-800">Assessor ID: {assessment.assessorId}</p>
                            </div>
                            <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-slate-100 text-slate-900">
                              {assessment.marks} / 100
                            </span>
                          </div>
                          <AssessmentEditForm
                            assessment={assessment}
                            studentId={selectedMentee.id}
                            busy={reviewBusy}
                            onDone={async () => {
                              setReviewBusy(true);
                              try {
                                const resp = await apiGet(`/api/students/${selectedMentee.id}/assessments`);
                                setMenteeAssessments(Array.isArray(resp) ? resp : (resp?.data || []));
                              } finally { setReviewBusy(false); }
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── FilterBanner ───────────────────────────────────────────────────────────────
// Renders the "Filtered by X — clear" control and the count-mismatch line
// for professor callers (never for HOD callers).

function FilterBanner({
  label,
  onClear,
  progressCount,
  filteredCount,
  callerIsHod,
}: {
  label: string;
  onClear: () => void;
  progressCount?: { verified: number; pending: number } | undefined;
  filteredCount: number;
  callerIsHod: boolean;
}) {
  const totalInProgress = progressCount
    ? progressCount.verified + progressCount.pending
    : null;

  // Count-mismatch: only visible to professor callers, and only when the counts differ.
  const showMismatch =
    !callerIsHod &&
    totalInProgress !== null &&
    filteredCount < totalInProgress;

  return (
    <div className="mb-3 rounded-lg border border-teal-100 bg-teal-50/60 px-4 py-2.5 flex items-center justify-between gap-3">
      <div>
        <span className="text-xs font-semibold text-teal-800">Filtered by: {label}</span>
        {showMismatch && (
          <p className="mt-0.5 text-[11px] text-slate-500">
            Showing {filteredCount} {filteredCount === 1 ? "entry" : "entries"} you supervised, of {totalInProgress} logged.
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onClear}
        className="h-7 px-2 text-xs text-slate-500 hover:text-slate-700 gap-1 shrink-0"
      >
        <X className="h-3 w-3" /> Clear filter
      </Button>
    </div>
  );
}

// ── ProgressTabContent ─────────────────────────────────────────────────────────
// Renders the three chart sections plus summary tiles.
// Extracted to keep the main component readable.

type DeptProcedure = { id: number; name: string; group: string; required: number };
type CatalogItem = { id: number; name: string; value: string; required: number; period: "total" | "month" };

function ProgressTabContent({
  progress,
  deptCaseCategories,
  deptProcedures,
  deptAcademics,
  showAllCaseBars,
  setShowAllCaseBars,
  showAllProcBars,
  setShowAllProcBars,
  showAllAcadBars,
  setShowAllAcadBars,
  onBarClick,
}: {
  progress: MenteeProgress;
  deptCaseCategories: CatalogItem[];
  deptProcedures: DeptProcedure[];
  deptAcademics: CatalogItem[];
  showAllCaseBars: boolean;
  setShowAllCaseBars: (v: boolean) => void;
  showAllProcBars: boolean;
  setShowAllProcBars: (v: boolean) => void;
  showAllAcadBars: boolean;
  setShowAllAcadBars: (v: boolean) => void;
  onBarClick: (filter: LogFilter) => void;
}) {
  // ── Check: student has no logs at all ────────────────────────────────────────
  const totalLogs =
    progress.caseCategories.reduce((s, c) => s + c.verified + c.pending, 0) +
    progress.procedures.reduce((s, p) => s + p.verified + p.pending, 0) +
    progress.academics.reduce((s, a) => s + a.verified + a.pending, 0);

  if (totalLogs === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileText />
          </EmptyMedia>
          <EmptyTitle>No logs yet</EmptyTitle>
          <EmptyDescription>
            This student has not submitted any case, procedure, or academic logs.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // ── Join: case categories ─────────────────────────────────────────────────────
  // Catalog items with required === 0 are "not tracked" — do not render a bar.
  // Items from progress absent in catalog render with no target and label "Not in current catalog".
  type CaseBarItem = {
    key: string;
    label: string;
    verified: number;
    pending: number;
    required: number | null; // null = no catalog entry
    inCatalog: boolean;
    done: boolean;
  };

  const caseBarItems: CaseBarItem[] = [];
  // Catalog-ordered items first
  for (const cat of deptCaseCategories) {
    if (cat.required === 0) continue; // not tracked
    
    const matches = progress.caseCategories.filter(
      (c) => c.value?.trim().toLowerCase() === cat.value?.trim().toLowerCase()
    );
    const verified = matches.reduce((sum, m) => sum + (m.verified ?? 0), 0);
    const pending = matches.reduce((sum, m) => sum + (m.pending ?? 0), 0);

    caseBarItems.push({
      key: cat.value,
      label: cat.name,
      verified,
      pending,
      required: cat.required,
      inCatalog: true,
      done: verified >= cat.required,
    });
  }
  // Uncatalogued items (present in progress but absent from catalog, or value === null)
  for (const item of progress.caseCategories) {
    const key = item.value ?? "__null__";
    const alreadyIncluded = deptCaseCategories.some(
      (c) => c.value?.trim().toLowerCase() === item.value?.trim().toLowerCase() && c.required > 0
    );
    if (!alreadyIncluded) {
      caseBarItems.push({
        key,
        label: item.value === null ? "Uncategorised" : item.value,
        verified: item.verified,
        pending: item.pending,
        required: null,
        inCatalog: false,
        done: false,
      });
    }
  }

  // ── Join: procedures ──────────────────────────────────────────────────────────
  type ProcBarItem = {
    key: string;
    group: string;
    label: string;
    verified: number;
    pending: number;
    required: number | null;
    inCatalog: boolean;
    done: boolean;
    byCompetency: { level: string; verified: number; pending: number }[];
  };

  // Build a lookup for catalog procedures keyed by group+name
  const deptProcMap = new Map<string, DeptProcedure>();
  for (const p of deptProcedures) {
    deptProcMap.set(`${p.group}\0${p.name}`, p);
  }
  // Separate map restricted to required > 0 — used only by the uncatalogued fallback loop
  // so that a procedure with required === 0 is NOT treated as "already included"
  // when it has real logged counts (Fix 1b).
  const deptProcTrackedMap = new Map<string, DeptProcedure>();
  for (const p of deptProcedures) {
    if (p.required > 0) deptProcTrackedMap.set(`${p.group}\0${p.name}`, p);
  }

  const procBarItems: ProcBarItem[] = [];
  // Catalog-ordered items first (only those with required > 0)
  for (const dp of deptProcedures) {
    if (dp.required === 0) continue;
    const match = progress.procedures.find((p) => p.group === dp.group && p.name === dp.name);
    const verified = match?.verified ?? 0;
    const pending = match?.pending ?? 0;
    procBarItems.push({
      key: `${dp.group}\0${dp.name}`,
      group: dp.group,
      label: dp.name,
      verified,
      pending,
      required: dp.required,
      inCatalog: true,
      done: verified >= dp.required,
      byCompetency: match?.byCompetency ?? [],
    });
  }
  // Uncatalogued procedures — compare against deptProcTrackedMap (required > 0 only)
  // so a procedure whose catalog entry has required === 0 still appears as a bar.
  for (const item of progress.procedures) {
    const key = `${item.group}\0${item.name}`;
    if (!deptProcTrackedMap.has(key)) {
      procBarItems.push({
        key,
        group: item.group,
        label: item.name,
        verified: item.verified,
        pending: item.pending,
        required: null,
        inCatalog: false,
        done: false,
        byCompetency: item.byCompetency,
      });
    }
  }

  // ── Join: academics ───────────────────────────────────────────────────────────
  type AcadBarItem = {
    key: string;
    label: string;
    verified: number;
    pending: number;
    required: number | null;
    inCatalog: boolean;
    done: boolean;
  };

  const acadBarItems: AcadBarItem[] = [];
  for (const cat of deptAcademics) {
    if (cat.required === 0) continue;
    const match = progress.academics.find((a) => a.value === cat.value);
    const verified = match?.verified ?? 0;
    const pending = match?.pending ?? 0;
    acadBarItems.push({
      key: cat.value,
      label: cat.name,
      verified,
      pending,
      required: cat.required,
      inCatalog: true,
      done: verified >= cat.required,
    });
  }
  for (const item of progress.academics) {
    const alreadyIncluded = deptAcademics.some((a) => a.value === item.value && a.required > 0);
    if (!alreadyIncluded) {
      acadBarItems.push({
        key: item.value,
        label: item.value,
        verified: item.verified,
        pending: item.pending,
        required: null,
        inCatalog: false,
        done: false,
      });
    }
  }

  // ── Summary tile counts ───────────────────────────────────────────────────────
  const totalCaseVerified = progress.caseCategories.reduce((s, c) => s + c.verified, 0);
  const totalProcVerified = progress.procedures.reduce((s, p) => s + p.verified, 0);
  const totalAcadVerified = progress.academics.reduce((s, a) => s + a.verified, 0);
  const totalCasePending = progress.caseCategories.reduce((s, c) => s + c.pending, 0);
  const totalProcPending = progress.procedures.reduce((s, p) => s + p.pending, 0);
  const totalAcadPending = progress.academics.reduce((s, a) => s + a.pending, 0);

  // ── Group procedures by group name ────────────────────────────────────────────
  const procGroups: Map<string, ProcBarItem[]> = new Map();
  for (const item of procBarItems) {
    if (!procGroups.has(item.group)) procGroups.set(item.group, []);
    procGroups.get(item.group)!.push(item);
  }

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
          <p className="metric-value">{totalCaseVerified + totalCasePending}</p>
          <p className="metric-label mt-1">Cases Logged</p>
          <p className="mt-1 text-[11px] text-slate-500">{totalCaseVerified} verified · {totalCasePending} pending</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
          <p className="metric-value">{totalProcVerified + totalProcPending}</p>
          <p className="metric-label mt-1">Procedures Logged</p>
          <p className="mt-1 text-[11px] text-slate-500">{totalProcVerified} verified · {totalProcPending} pending</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
          <p className="metric-value">{totalAcadVerified + totalAcadPending}</p>
          <p className="metric-label mt-1">Academic Activities</p>
          <p className="mt-1 text-[11px] text-slate-500">{totalAcadVerified} verified · {totalAcadPending} pending</p>
        </div>
      </div>

      {/* ── Section 1: Case Categories ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Case Categories</h3>
        {caseBarItems.length === 0 ? (
          <p className="text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 p-4 text-center">
            No case categories configured for this department.
          </p>
        ) : (
          <>
            <ProgressSection
              items={caseBarItems.slice(0, showAllCaseBars ? undefined : 8)}
              onItemClick={(item) =>
                onBarClick({
                  tab: "case-logs",
                  category: item.key === "__null__" ? null : item.key,
                  label: item.label,
                })
              }
            />
            {caseBarItems.length > 8 && (
              <div className="mt-1 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllCaseBars(!showAllCaseBars)}
                  className="text-slate-500 hover:text-slate-700"
                >
                  {showAllCaseBars ? "Show less" : `Show all ${caseBarItems.length} categories`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Section 2: Procedures (grouped) ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Procedures</h3>
        {procBarItems.length === 0 ? (
          <p className="text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 p-4 text-center">
            No procedures configured for this department.
          </p>
        ) : (
          <>
            {Array.from(procGroups.entries()).map(([group, items]) => (
              <div key={group} className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">{group}</p>
                <ProgressSection
                  items={items.slice(0, showAllProcBars ? undefined : 8)}
                  onItemClick={(item) =>
                    onBarClick({
                      tab: "proc-logs",
                      group: item.group ?? group,
                      name: item.label,
                      label: item.label,
                    })
                  }
                />
              </div>
            ))}
            {procBarItems.length > 8 && (
              <div className="mt-1 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllProcBars(!showAllProcBars)}
                  className="text-slate-500 hover:text-slate-700"
                >
                  {showAllProcBars ? "Show less" : `Show all ${procBarItems.length} procedures`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Section 3: Academic Activities ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">Academic Activities</h3>
        {acadBarItems.length === 0 ? (
          <p className="text-xs text-slate-500 rounded-xl border border-dashed border-slate-200 p-4 text-center">
            No academic activities configured for this department.
          </p>
        ) : (
          <>
            <ProgressSection
              items={acadBarItems.slice(0, showAllAcadBars ? undefined : 8)}
              onItemClick={(item) =>
                onBarClick({
                  tab: "acad-logs",
                  activityType: item.key,
                  label: item.label,
                })
              }
            />
            {acadBarItems.length > 8 && (
              <div className="mt-1 flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllAcadBars(!showAllAcadBars)}
                  className="text-slate-500 hover:text-slate-700"
                >
                  {showAllAcadBars ? "Show less" : `Show all ${acadBarItems.length} activities`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── ProgressSection ────────────────────────────────────────────────────────────
// Replaces the old ProgressBar with a Recharts vertical stacked BarChart.
// Renders all items for a section sharing a single X-axis scale.

type ProgressSectionItem = {
  key: string;
  label: string;
  verified: number;
  pending: number;
  required: number | null;
  inCatalog: boolean;
  done: boolean;
  group?: string;
  byCompetency?: { level: string; verified: number; pending: number }[];
};

const progressChartConfig = {
  verified: { label: "Verified", color: "#0d9488" },
  pending: { label: "Pending", color: "#99f6e4" },
  remaining: { label: "Remaining", color: "#f1f5f9" },
} satisfies ChartConfig;

function ProgressSection({
  items,
  onItemClick,
}: {
  items: ProgressSectionItem[];
  onItemClick: (item: any) => void;
}) {
  const chartData = items.map((item) => {
    const total = item.verified + item.pending;
    const remaining = item.required !== null ? Math.max(item.required - total, 0) : 0;
    return {
      ...item,
      name: item.label,
      verifiedVal: item.verified,
      pendingVal: item.pending,
      remainingVal: remaining,
    };
  });

  const chartHeight = Math.max(items.length * 45 + 30, 100);

  return (
    <div className="w-full overflow-x-auto">
      <div style={{ height: chartHeight, minWidth: "600px", width: "100%" }}>
        <ChartContainer config={progressChartConfig} className="h-full w-full">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
          >
            <XAxis type="number" hide />
            <YAxis
              dataKey="name"
              type="category"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fill: "#334155" }}
              width={160}
            />
            <ChartTooltip
              cursor={{ fill: "rgba(241, 245, 249, 0.5)" }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const data = payload[0].payload;
                const isDone = data.done && data.required !== null;
                const vColor = isDone ? "bg-emerald-500" : "bg-teal-600";
                const pColor = isDone ? "bg-emerald-300" : "bg-teal-200";

                return (
                  <div className="min-w-[200px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg z-50">
                    <p className="mb-2.5 text-sm font-bold text-slate-900">{data.name}</p>
                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-sm ${vColor}`}></span>Verified:
                        </span>
                        <span className="font-semibold text-slate-900">{data.verifiedVal}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-sm ${pColor}`}></span>Pending:
                        </span>
                        <span className="font-semibold text-slate-900">{data.pendingVal}</span>
                      </div>
                      {data.required !== null ? (
                        <>
                          <div className="flex items-center justify-between gap-4">
                            <span className="flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-sm bg-slate-200"></span>Remaining:
                            </span>
                            <span className="font-semibold text-slate-900">{data.remainingVal}</span>
                          </div>
                          <div className="mt-2.5 flex items-center justify-between gap-4 border-t border-slate-100 pt-2.5 text-sm font-bold text-slate-900">
                            <span>Target:</span>
                            <span>{data.required}</span>
                          </div>
                        </>
                      ) : (
                        <div className="mt-2 border-t border-slate-100 pt-2 text-[10px] italic text-slate-500">
                          Not in current catalog
                        </div>
                      )}
                      {data.byCompetency && data.byCompetency.length > 0 && (
                        <div className="mt-2.5 border-t border-slate-100 pt-2.5">
                          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            By Competency
                          </p>
                          <div className="space-y-1.5">
                            {data.byCompetency.map((comp: any) => (
                              <div key={comp.level} className="flex items-center justify-between gap-4 text-[11px]">
                                <span className="max-w-[140px] truncate text-slate-600">{comp.level}</span>
                                <span className="whitespace-nowrap font-semibold text-slate-900">
                                  {comp.verified}V · {comp.pending}P
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="verifiedVal"
              stackId="a"
              isAnimationActive={false}
              onClick={(_, index) => onItemClick(items[index])}
            >
              {chartData.map((entry, index) => {
                const isDone = entry.done && entry.required !== null;
                return (
                  <Cell
                    key={`cell-ver-${index}`}
                    fill={isDone ? "#10b981" : "#0d9488"}
                    className="cursor-pointer"
                  />
                );
              })}
            </Bar>
            <Bar
              dataKey="pendingVal"
              stackId="a"
              isAnimationActive={false}
              onClick={(_, index) => onItemClick(items[index])}
            >
              {chartData.map((entry, index) => {
                const isDone = entry.done && entry.required !== null;
                return (
                  <Cell
                    key={`cell-pen-${index}`}
                    fill={isDone ? "#6ee7b7" : "#99f6e4"}
                    className="cursor-pointer"
                  />
                );
              })}
            </Bar>
            <Bar
              dataKey="remainingVal"
              stackId="a"
              fill="#f1f5f9"
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              onClick={(_, index) => onItemClick(items[index])}
              className="cursor-pointer"
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}

// ── Shared badge helpers (unchanged from original) ────────────────────────────

function renderShortfallBadge(status: string) {
  switch (status) {
    case "on_track":
      return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">On Track</Badge>;
    case "behind":
      return <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">Behind</Badge>;
    case "not_tracked":
      return <Badge variant="outline" className="text-slate-500 text-[10px]">Not tracked</Badge>;
    default:
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">At Risk</Badge>;
  }
}

function renderLogStatusBadge(status: string) {
  switch (status) {
    case "verified":
      return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Verified</Badge>;
    case "rejected":
      return <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">Rejected</Badge>;
    default:
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Pending</Badge>;
  }
}

// ── PostingReviewForm ───────────────────────────────────────────────────────────

function PostingReviewForm({ posting, studentId, busy, onDone }: {
  posting: any; studentId: number; busy: boolean; onDone: () => void;
}) {
  const [remarks, setRemarks] = React.useState(posting.facultyRemarks ?? "");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(status: "verified" | "rejected") {
    setSubmitting(true);
    try {
      await apiPatch(`/api/students/${studentId}/postings/${posting.id}/review`, { status, remarks: remarks || undefined });
      toast.success(status === "verified" ? "Posting verified" : "Posting rejected");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Failed to save review");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
      <Textarea
        placeholder="Optional remarks for the student…"
        className="text-xs min-h-[60px]"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        maxLength={4000}
      />
      <div className="flex gap-2">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5" disabled={submitting || busy} onClick={() => submit("verified")}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Verify
        </Button>
        <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50 text-xs gap-1.5" disabled={submitting || busy} onClick={() => submit("rejected")}>
          <XCircle className="h-3.5 w-3.5" /> Reject
        </Button>
      </div>
    </div>
  );
}

// ── ThesisReviewForm ────────────────────────────────────────────────────────────

function ThesisReviewForm({ thesis, studentId, busy, onDone }: {
  thesis: any; studentId: number; busy: boolean; onDone: () => void;
}) {
  const [protocolStatus, setProtocolStatus] = React.useState(thesis.protocolStatus ?? "pending");
  const [midTermStatus, setMidTermStatus] = React.useState(thesis.midTermStatus ?? "pending");
  const [finalStatus, setFinalStatus] = React.useState(thesis.finalSubmissionStatus ?? "pending");
  const [remarks, setRemarks] = React.useState(thesis.facultyRemarks ?? "");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await apiPatch(`/api/students/${studentId}/thesis/review`, {
        protocolStatus, midTermStatus, finalSubmissionStatus: finalStatus,
        remarks: remarks || undefined,
      });
      toast.success("Thesis milestones updated");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Failed to save review");
    } finally { setSubmitting(false); }
  }

  const statusOpts = ["pending", "submitted", "approved"] as const;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-700">Update milestone statuses</p>
      <div className="grid grid-cols-3 gap-3">
        {([["Protocol", protocolStatus, setProtocolStatus], ["Mid-Term", midTermStatus, setMidTermStatus], ["Final Submission", finalStatus, setFinalStatus]] as const).map(([label, val, setter]) => (
          <div key={label}>
            <label className="text-[10px] font-semibold text-slate-500 uppercase">{label}</label>
            <select className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs" value={val} onChange={(e) => (setter as any)(e.target.value)}>
              {statusOpts.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
          </div>
        ))}
      </div>
      <Textarea
        placeholder="Optional remarks for the student…"
        className="text-xs min-h-[60px]"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        maxLength={4000}
      />
      <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs gap-1.5" disabled={submitting || busy} onClick={submit}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Save milestone update
      </Button>
    </div>
  );
}

// ── CertReviewForm ─────────────────────────────────────────────────────────────

function CertReviewForm({ cert, studentId, busy, onDone }: {
  cert: any; studentId: number; busy: boolean; onDone: () => void;
}) {
  const [remarks, setRemarks] = React.useState(cert.facultyRemarks ?? "");
  const [submitting, setSubmitting] = React.useState(false);

  async function submit(status: "verified" | "rejected") {
    setSubmitting(true);
    try {
      await apiPatch(`/api/students/${studentId}/certifications/${cert.id}/review`, { status, remarks: remarks || undefined });
      toast.success(status === "verified" ? "Certification verified" : "Certification rejected");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Failed to save review");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
      <Textarea
        placeholder="Optional remarks for the student…"
        className="text-xs min-h-[60px]"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        maxLength={4000}
      />
      <div className="flex gap-2">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5" disabled={submitting || busy} onClick={() => submit("verified")}>
          <CheckCircle2 className="h-3.5 w-3.5" /> Verify
        </Button>
        <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50 text-xs gap-1.5" disabled={submitting || busy} onClick={() => submit("rejected")}>
          <XCircle className="h-3.5 w-3.5" /> Reject
        </Button>
      </div>
    </div>
  );
}

// ── AssessmentEditForm ─────────────────────────────────────────────────────────────

function AssessmentEditForm({ assessment, studentId, busy, onDone }: {
  assessment: any; studentId: number; busy: boolean; onDone: () => void;
}) {
  const [examName, setExamName] = React.useState(assessment.examName || "");
  const [marks, setMarks] = React.useState(String(assessment.marks ?? ""));
  const [submitting, setSubmitting] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  async function submit() {
    if (!examName || marks === "") return;
    setSubmitting(true);
    try {
      await apiPatch(`/api/students/${studentId}/assessments/${assessment.id}`, { 
        examName, 
        marks: parseInt(marks, 10)
      });
      toast.success("Assessment updated");
      setEditing(false);
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Failed to update assessment");
    } finally { setSubmitting(false); }
  }

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to completely remove this assessment?")) return;
    setSubmitting(true);
    try {
      await apiDelete(`/api/students/${studentId}/assessments/${assessment.id}`);
      toast.success("Assessment removed");
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Failed to remove assessment");
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1 mt-3 border-t border-slate-100 pt-3">
        <Button variant="ghost" size="sm" className="h-7 text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50 gap-1.5 px-2" onClick={() => setEditing(true)}>
          <Pencil className="h-3.5 w-3.5" /> Edit Score
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-1.5 px-2" disabled={submitting || busy} onClick={handleDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 space-y-3 bg-slate-50/50 -mx-4 px-4 pb-1 rounded-b-xl">
      <div className="grid grid-cols-[1fr_80px] gap-2">
        <Input 
          value={examName} 
          onChange={(e) => setExamName(e.target.value)} 
          placeholder="Exam Name" 
          className="text-xs h-8 bg-white" 
        />
        <Input 
          type="number"
          value={marks} 
          onChange={(e) => setMarks(e.target.value)} 
          placeholder="Marks" 
          className="text-xs h-8 bg-white text-center" 
          min="0" max="100"
        />
      </div>
      <div className="flex items-center gap-2 pb-2">
        <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white text-xs gap-1.5 h-7 px-4" disabled={submitting || busy || !examName || marks === ""} onClick={submit}>
          Save Changes
        </Button>
        <Button size="sm" variant="ghost" className="text-slate-500 text-xs h-7" disabled={submitting || busy} onClick={() => {
          setEditing(false);
          setExamName(assessment.examName || "");
          setMarks(String(assessment.marks ?? ""));
        }}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
