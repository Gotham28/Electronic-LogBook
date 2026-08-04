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
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Stethoscope,
  GraduationCap,
  Clock,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  FileCheck,
  Award,
  AlertTriangle,
  PlusCircle,
  BookOpen,
  User,
  FileText,
} from "lucide-react";
import { DEPARTMENTS, formatLogbookDate } from "@/lib/logbook-config";
import { apiGet, apiPatch, apiPost } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";

export function ProfessorPortal({ activeTab, embedded }: { activeTab?: string; embedded?: boolean }) {
  const [location, setLocation] = useLocation();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [remarks, setRemarks] = React.useState("");
  const [grade, setGrade] = React.useState("A");
  const [competencyOverride, setCompetencyOverride] = React.useState("performed_independently");
  const [evaluatedLogs, setEvaluatedLogs] = React.useState<Record<string, any>>({});
  const [departmentFilter, setDepartmentFilter] = React.useState("all");

  // Selected mentee for Logbook Inspector Modal
  const [selectedMentee, setSelectedMentee] = React.useState<any | null>(null);

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

  const handleReviewAction = async (status: "verified" | "rejected", defaultRemarks: string) => {
    if (!currentItem || isSubmitting) return;
    
    setIsSubmitting(true);
    const user = getCurrentUser();
    
    try {
      await apiPatch(`/api/logs/${currentItem.logType}/${currentItem.dbId}/review`, {
        status,
        comments: remarks || defaultRemarks,
        reviewerId: user?.id
      });
      
      // Optimistic update for evaluatedLogs mapping
      setEvaluatedLogs(prev => ({
        ...prev,
        [currentItem.id]: { status, remarks: remarks || defaultRemarks, grade },
      }));

      toast.success(status === "verified" ? `Number ${currentItem.id} verified` : `Revision Requested for ${currentItem.id}`);
      
      setRemarks("");
      // Refresh real data so the roster updates and the queue shrinks
      await fetchProfessorData();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit review");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = () => handleReviewAction("verified", "Approved without conditions.");
  const handleReject = () => handleReviewAction("rejected", "Please expand on case findings.");

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner: Professor Profile — hidden when embedded in HOD portal */}
      {!embedded && (
        <div className="rounded-2xl bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 p-6 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Badge className="bg-teal-500/20 text-teal-300 border-teal-500/30 text-xs font-semibold mb-2">
              Faculty &amp; Evaluator Portal
            </Badge>
            <h2 className="text-2xl font-black">Welcome, {data?.faculty?.name || "Dr. Mohammed"}</h2>
            <p className="text-xs text-slate-300">
              {data?.faculty?.role} • All Departments • Full access: <strong>{allStudents.length} Students</strong>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-teal-500/10 border border-teal-500/30 px-4 py-2 rounded-xl text-right">
              <p className="text-xl font-extrabold text-teal-300">{reviews.length - Object.keys(evaluatedLogs).length}</p>
              <p className="text-[11px] text-slate-300 font-medium">Pending Review Items</p>
            </div>
          </div>
        </div>
      )}



      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
        {/* Inner tab bar — hidden when embedded in HOD portal (HOD sidebar handles navigation) */}
        {!embedded && (
          <TabsList className="bg-slate-200/70 p-1 rounded-xl">
            <TabsTrigger value="review-queue" className="gap-2 text-xs font-semibold">
              <FileCheck className="h-4 w-4" /> Sequential Review Queue ({reviews.length - Object.keys(evaluatedLogs).length})
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
                      {currentItem.patientUhid && (
                        <p className="text-xs font-semibold text-teal-800">Patient UHID: {currentItem.patientUhid}</p>
                      )}
                      {currentItem.declaredCompetency && (
                        <p className="text-xs text-teal-800 font-semibold bg-teal-50 inline-block px-2.5 py-1 rounded border border-teal-200 mt-1">
                          Self-Declared Level: {currentItem.declaredCompetency}
                        </p>
                      )}
                    </div>

                    {evaluatedLogs[currentItem.id] && (
                      <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
                        <span>Evaluated Status: <strong>{evaluatedLogs[currentItem.id].status.toUpperCase()}</strong> ({evaluatedLogs[currentItem.id].remarks})</span>
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
                    {currentItem.type === "Procedure" && (
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-700">Verified Competency Level</label>
                        <Select value={competencyOverride} onValueChange={setCompetencyOverride}>
                          <SelectTrigger className="text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="performed_independently">Performed Independently</SelectItem>
                            <SelectItem value="performed_under_supervision">Performed Under Supervision</SelectItem>
                            <SelectItem value="assisted">Assisted</SelectItem>
                            <SelectItem value="observed">Observed</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-slate-500">Available only while reviewing procedure logs.</p>
                      </div>
                    )}

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
                <p className="font-bold text-slate-900">Professor-wide student access</p>
                <p className="mt-1 text-xs text-slate-600">You can inspect and review every student's complete work in your department.</p>
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
                    <TableHead className="text-xs font-semibold">Department</TableHead>
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
                      <TableCell className="text-xs">{m.department}</TableCell>
                      <TableCell className="text-xs w-48">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="font-semibold text-slate-700">{m.overallCompletion}%</span>
                        </div>
                        <Progress value={m.overallCompletion} className="h-2" />
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
        </TabsContent>
      </Tabs>

      {/* Mentee Detailed Logbook Inspector Dialog Modal */}
      <Dialog open={!!selectedMentee} onOpenChange={() => setSelectedMentee(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto bg-white">
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

              <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">Overall MCI Requirement Completion</span>
                  <span className="font-bold text-teal-800">{selectedMentee.overallCompletion}%</span>
                </div>
                <Progress value={selectedMentee.overallCompletion} className="h-2" />
              </div>

              <Tabs defaultValue="case-logs" className="w-full">
                <TabsList className="bg-slate-100 p-1 rounded-lg">
                  <TabsTrigger value="case-logs" className="text-xs">Clinical Case Logs</TabsTrigger>
                  <TabsTrigger value="proc-logs" className="text-xs">Procedure Logs</TabsTrigger>
                  <TabsTrigger value="acad-logs" className="text-xs">Academic Activity</TabsTrigger>
                </TabsList>

                <TabsContent value="case-logs" className="pt-3">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs font-semibold">Date</TableHead>
                        <TableHead className="text-xs font-semibold">Diagnosis</TableHead>
                        <TableHead className="text-xs font-semibold">Patient UHID &amp; Info</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-xs font-medium">26/07/26</TableCell>
                        <TableCell className="text-xs font-bold text-slate-900">Acute Severe Asthma Exacerbation</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          <p className="font-semibold text-teal-800">UHID-2026-004281</p>
                          <p>7 yr / Male</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">Pending Review</Badge>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-xs font-medium">23/07/26</TableCell>
                        <TableCell className="text-xs font-bold text-slate-900">Severe Dengue Hemorrhagic Fever</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          <p className="font-semibold text-teal-800">UHID-2026-004097</p>
                          <p>3 yr / Female</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Faculty Verified</Badge>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="proc-logs" className="pt-3">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs font-semibold">Procedure Name</TableHead>
                        <TableHead className="text-xs font-semibold">Patient UHID &amp; Age</TableHead>
                        <TableHead className="text-xs font-semibold">Competency</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-xs font-bold text-slate-900">Endotracheal Intubation</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          <p className="font-semibold text-teal-800">UHID-2026-003944</p>
                          <p>7 years</p>
                        </TableCell>
                        <TableCell className="text-xs text-teal-800 font-semibold">Performed Independently</TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Verified</Badge>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="acad-logs" className="pt-3">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs font-semibold">Type</TableHead>
                        <TableHead className="text-xs font-semibold">Topic</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-xs font-semibold">Journal Club</TableCell>
                        <TableCell className="text-xs text-slate-900">High-Flow Nasal Cannula in Bronchiolitis</TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Verified</Badge>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function renderShortfallBadge(status: string) {
  switch (status) {
    case "on_track":
      return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">On Track</Badge>;
    case "behind":
      return <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">Behind</Badge>;
    default:
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">At Risk</Badge>;
  }
}


