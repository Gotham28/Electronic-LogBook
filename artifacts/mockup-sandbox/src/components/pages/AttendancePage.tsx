import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, CheckCircle2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatLogbookDate, todayForInput } from "@/lib/logbook-config";
import { apiGet, apiPost } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useDepartment } from "@/lib/department-context";

type LeaveStatus = "pending" | "approved" | "rejected";

type LeaveRecord = {
  number: number;
  appliedOn: string;
  fromDate: string;
  toDate: string;
  totalDays: number;
  leaveType: string;
  reason: string;
  status: LeaveStatus;
  approvedBy: string;
};


type AttendanceRecord = {
  id: number;
  date: string;
  status: "present" | "absent" | "half_day" | "leave";
  clockIn?: string | null;
  clockOut?: string | null;
  verifiedBy?: number | null;
  verifierName?: string | null;
  createdAt: string;
};

function renderAttendanceStatusBadge(status: string) {
  switch (status) {
    case "present":
      return (
        <Badge className="border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Present
        </Badge>
      );
    case "absent":
      return (
        <Badge className="border-rose-200 bg-rose-50 text-[11px] font-semibold text-rose-700">
          <XCircle className="mr-1 h-3 w-3" /> Absent
        </Badge>
      );
    case "half_day":
      return (
        <Badge className="border-amber-200 bg-amber-50 text-[11px] font-semibold text-amber-700">
          <Clock className="mr-1 h-3 w-3" /> Half Day
        </Badge>
      );
    case "leave":
      return (
        <Badge className="border-slate-200 bg-slate-100 text-[11px] font-semibold text-slate-700">
          <CalendarDays className="mr-1 h-3 w-3" /> Leave
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function StudentDailyAttendanceView() {
  const user = React.useMemo(() => getCurrentUser(), []);
  const [records, setRecords] = React.useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchAttendance = React.useCallback(async () => {
    if (!user?.studentProfileId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiGet<{ data: AttendanceRecord[] } | AttendanceRecord[]>(
        `/api/students/${user.studentProfileId}/attendance`
      );
      const data = Array.isArray(resp) ? resp : (resp?.data || []);
      setRecords(data);
    } catch (err: any) {
      console.error("Failed to load attendance", err);
      setError(err?.message || "Failed to load attendance records");
      toast.error("Could not load attendance records");
    } finally {
      setLoading(false);
    }
  }, [user?.studentProfileId]);

  React.useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const totalDays = records.length;
  const presentDays = records.filter((r) => r.status === "present").length;
  const halfDays = records.filter((r) => r.status === "half_day").length;
  const absentDays = records.filter((r) => r.status === "absent").length;
  const leaveDays = records.filter((r) => r.status === "leave").length;
  const percentage = totalDays > 0 ? (((presentDays + halfDays * 0.5) / totalDays) * 100).toFixed(1) : "—";

  return (
    <div className="section-spacing pb-12 space-y-6">
      <div>
        <p className="page-eyebrow">Attendance administration</p>
        <h2 className="page-title mt-1">Daily Attendance</h2>
        <p className="mt-2 text-sm text-slate-500">
          Review your verified daily attendance records marked by department faculty.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[18px] border border-white/70 bg-white/76 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <p className="text-3xl font-bold text-slate-900">{totalDays}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Days Logged</p>
        </div>
        <div className="rounded-[18px] border border-white/70 bg-white/76 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <p className="text-3xl font-bold text-emerald-600">{presentDays}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Days Present</p>
        </div>
        <div className="rounded-[18px] border border-white/70 bg-white/76 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <p className="text-3xl font-bold text-rose-600">{absentDays + leaveDays}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Absent / Leave</p>
        </div>
        <div className="rounded-[18px] border border-white/70 bg-white/76 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <p className="text-3xl font-bold text-teal-600">{percentage}{percentage !== "—" ? "%" : ""}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Attendance Rate</p>
        </div>
      </div>

      <Card className="border-white/70 bg-white/76">
        <CardHeader className="border-b border-white/70 pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-slate-950">Attendance History</CardTitle>
          <Button size="sm" variant="outline" onClick={fetchAttendance} disabled={loading} className="text-xs">
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 flex justify-center items-center">
              <div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8" />
            </div>
          ) : error ? (
            <div className="p-6 text-center text-rose-600 text-sm font-medium">
              <p>{error}</p>
              <Button size="sm" variant="outline" onClick={fetchAttendance} className="mt-3">
                Try again
              </Button>
            </div>
          ) : records.length === 0 ? (
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><CalendarDays className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>No attendance records found</EmptyTitle>
                <EmptyDescription>Your department faculty will mark your daily attendance here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold">Date</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Timings</TableHead>
                  <TableHead className="text-xs font-semibold">Marked / Verified By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-medium text-slate-900 py-3">
                      {formatLogbookDate(r.date)}
                    </TableCell>
                    <TableCell className="py-3">
                      {renderAttendanceStatusBadge(r.status)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 py-3">
                      {r.clockIn || r.clockOut ? `${r.clockIn || "—"} to ${r.clockOut || "—"}` : "Full Day"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 py-3">
                      {r.verifierName || "Department Faculty"}
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


function StudentYearlyAttendanceView() {
  const user = React.useMemo(() => getCurrentUser(), []);
  const [records, setRecords] = React.useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchAttendance = React.useCallback(async () => {
    if (!user?.studentProfileId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiGet<{ data: AttendanceRecord[] } | AttendanceRecord[]>(
        `/api/students/${user.studentProfileId}/attendance`
      );
      const data = Array.isArray(resp) ? resp : (resp?.data || []);
      setRecords(data);
    } catch (err: any) {
      console.error("Failed to load attendance", err);
      setError(err?.message || "Failed to load yearly attendance records");
      toast.error("Could not load yearly attendance records");
    } finally {
      setLoading(false);
    }
  }, [user?.studentProfileId]);

  React.useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const year1 = records.find((r) => r.date === "YEAR_1");
  const year2 = records.find((r) => r.date === "YEAR_2");
  const year3 = records.find((r) => r.date === "YEAR_3");

  const p1 = year1?.clockIn ? parseFloat(year1.clockIn) : null;
  const p2 = year2?.clockIn ? parseFloat(year2.clockIn) : null;
  const p3 = year3?.clockIn ? parseFloat(year3.clockIn) : null;

  const validPercentages = [p1, p2, p3].filter((p): p is number => p !== null && !isNaN(p));
  const avg = validPercentages.length > 0
    ? (validPercentages.reduce((a, b) => a + b, 0) / validPercentages.length).toFixed(1)
    : "—";

  const yearRows = [
    { year: 1, label: "Year 1", record: year1, pct: p1 },
    { year: 2, label: "Year 2", record: year2, pct: p2 },
    { year: 3, label: "Year 3", record: year3, pct: p3 },
  ];

  return (
    <div className="section-spacing pb-12 space-y-6">
      <div>
        <p className="page-eyebrow">Attendance administration</p>
        <h2 className="page-title mt-1">Yearly Attendance</h2>
        <p className="mt-2 text-sm text-slate-500">
          Review your annual attendance percentages logged and verified by department faculty.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {yearRows.map(({ year, label, pct, record }) => (
          <div key={year} className="rounded-[18px] border border-white/70 bg-white/76 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
              {pct !== null ? (
                <Badge className="border-emerald-200 bg-emerald-50 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Recorded
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-slate-400">
                  Pending
                </Badge>
              )}
            </div>
            <p className="mt-2 text-3xl font-bold text-slate-900">
              {pct !== null ? `${pct}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500 truncate">
              {record?.verifierName ? `Marked by ${record.verifierName}` : "Not yet entered"}
            </p>
          </div>
        ))}

        <div className="rounded-[18px] border border-white/70 bg-white/76 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.05)]">
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal-600">Overall Average</p>
          <p className="mt-2 text-3xl font-bold text-teal-700">
            {avg}{avg !== "—" ? "%" : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {validPercentages.length} of 3 years recorded
          </p>
        </div>
      </div>

      <Card className="border-white/70 bg-white/76">
        <CardHeader className="border-b border-white/70 pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-slate-950">Yearly Attendance Breakdown</CardTitle>
          <Button size="sm" variant="outline" onClick={fetchAttendance} disabled={loading} className="text-xs">
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 flex justify-center items-center">
              <div className="animate-spin rounded-full border-4 border-slate-300 border-t-teal-600 h-8 w-8" />
            </div>
          ) : error ? (
            <div className="p-6 text-center text-rose-600 text-sm font-medium">
              <p>{error}</p>
              <Button size="sm" variant="outline" onClick={fetchAttendance} className="mt-3">
                Try again
              </Button>
            </div>
          ) : validPercentages.length === 0 ? (
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><CalendarDays className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>No yearly attendance recorded</EmptyTitle>
                <EmptyDescription>Your department faculty will log your attendance percentage for each training year here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold">Training Year</TableHead>
                  <TableHead className="text-xs font-semibold">Attendance Percentage</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Marked / Verified By</TableHead>
                  <TableHead className="text-xs font-semibold">Recorded Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {yearRows.map(({ year, label, pct, record }) => (
                  <TableRow key={year}>
                    <TableCell className="text-xs font-bold text-slate-900 py-3">
                      {label}
                    </TableCell>
                    <TableCell className="py-3">
                      {pct !== null ? (
                        <span className="text-sm font-bold text-teal-800">{pct}%</span>
                      ) : (
                        <span className="text-xs text-slate-400">Not recorded</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      {pct !== null ? (
                        <Badge className="border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] text-slate-400">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 py-3">
                      {record?.verifierName || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 py-3">
                      {record?.createdAt ? formatLogbookDate(record.createdAt.slice(0, 10)) : "—"}
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

export function AttendancePage() {
  const dept = useDepartment();
  const isMicroDept = dept.department?.code?.toLowerCase() === "microbiology" || dept.department?.name?.toLowerCase().includes("microbiology");
  const isYearlyAttendance = Boolean(dept.config?.enabledFeatures?.yearlyAttendance || isMicroDept);
  const isDailyAttendance = Boolean(dept.config?.enabledFeatures?.dailyAttendance && !isYearlyAttendance);

  if (isYearlyAttendance) {
    return <StudentYearlyAttendanceView />;
  }
  if (isDailyAttendance) {
    return <StudentDailyAttendanceView />;
  }
  const [leaveType, setLeaveType] = React.useState(dept.leaveTypes?.[0]?.value || "");
  const [fromDate, setFromDate] = React.useState(todayForInput());
  const [toDate, setToDate] = React.useState(todayForInput());
  const [reason, setReason] = React.useState("");

  const [leaves, setLeaves] = React.useState<LeaveRecord[]>([]);
  const [balance, setBalance] = React.useState<Record<string, { used: number, total: number | null }>>({});
  const [balanceError, setBalanceError] = React.useState<string | null>(null);
  const user = React.useMemo(() => getCurrentUser(), []);

  const fetchLeaves = React.useCallback(async () => {
    if (!user?.studentProfileId) return;
    setBalanceError(null);
    try {
      const [leavesResponse, balanceData] = await Promise.all([
        apiGet(`/api/students/${user.studentProfileId}/leave-records`),
        apiGet<Record<string, { used: number, total: number | null }>>(`/api/students/${user.studentProfileId}/leave-balance`)
      ]);

      // Backend wraps leave-records in { data: [] }
      const leavesData: any[] = Array.isArray(leavesResponse) ? leavesResponse : (leavesResponse?.data ?? []);
      
      setLeaves(leavesData.map((l: any) => ({
        number: l.id.toString(),
        appliedOn: new Date(l.createdAt).toISOString(),
        leaveType: dept.leaveTypes?.find(t => t.value === l.leaveType)?.name || l.leaveType,
        fromDate: l.startDate,
        toDate: l.endDate,
        reason: l.reason,
        status: l.status,
        approvedBy: l.reviewedBy ? "HOD" : "Awaiting HOD",
        totalDays: l.startDate && l.endDate ? Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / (1000 * 3600 * 24)) + 1 : 1
      })));

      setBalance(balanceData);
    } catch (error: any) {
      console.error("Error fetching leave data:", error);
      toast.error("Failed to load leave records");
      // AGENTS.md sec 7 (SEC-16): balance.total can legitimately be null when the
      // department has no configured allowance yet, so the initial/failure state must
      // not reuse that same shape - a resident who has actually used leave would see
      // "0 used" and believe their full allowance is untouched.
      setBalanceError(error?.message || "Could not load your leave balance");
    }
  }, [user?.studentProfileId, dept.leaveTypes]);

  React.useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = new Date(fromDate);
    const end = new Date(toDate);
    const totalDays = fromDate && toDate ? Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1 : 0;

    if (!reason || totalDays < 1) {
      toast.error("Enter a valid leave period and reason.");
      return;
    }
    
    if (!user?.studentProfileId) return;

    try {
      const payload = {
        startDate: fromDate,
        endDate: toDate,
        leaveType,
        reason
      };
      await apiPost(`/api/students/${user.studentProfileId}/leave-records`, payload);
      toast.success(`Leave application submitted`, {
        description: `Sent to the HOD for approval.`,
      });
      setReason("");
      fetchLeaves();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit leave application");
    }
  };

  const pendingCount = leaves.filter((leave) => leave.status === "pending").length;

  return (
    <div className="section-spacing pb-12">
      <div>
        <p className="page-eyebrow">Attendance administration</p>
        <h2 className="page-title mt-1">Leave records</h2>
        <p className="mt-2 text-sm text-slate-500">Apply for leave and maintain the complete HOD decision record.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {balanceError ? (
          <div className="md:col-span-2 flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-center" role="alert">
            <p className="text-sm font-medium text-rose-700">{balanceError}</p>
            <Button size="sm" variant="outline" onClick={fetchLeaves} className="border-rose-200 text-rose-700">Try again</Button>
          </div>
        ) : (
          <>
            {Object.entries(balance).map(([key, data]) => {
              const leaveType = dept.leaveTypes?.find(t => t.value === key);
              const displayName = leaveType ? leaveType.name : `${key} Leave`;
              return (
                <SummaryCard key={key} label={`${displayName} (${data.total ?? "not configured"})`} value={data.used} total={data.total} tone="teal" />
              );
            })}
          </>
        )}
        <SummaryCard label="Pending Approval" value={pendingCount} tone="amber" />
      </div>

      <Card className="border-white/70 bg-white/76">
        <CardHeader className="border-b border-white/70 pb-3">
          <CardTitle className="text-sm font-bold text-slate-950">New Leave Application</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <form onSubmit={handleApplyLeave} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Leave Type</Label>
                <Select value={leaveType} onValueChange={setLeaveType}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {dept.leaveTypes?.map((t) => (
                      <SelectItem key={t.id} value={t.value}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">From Date</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="text-xs" required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To Date</Label>
                <Input type="date" min={fromDate} value={toDate} onChange={(e) => setToDate(e.target.value)} className="text-xs" required />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason for Leave</Label>
              <Input
                placeholder="e.g. Attending IAP Pulmonary Conference"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="text-xs"
                required
              />
            </div>
            <Button type="submit" className="bg-gradient-to-r from-teal-600 via-teal-500 to-cyan-500 text-xs font-semibold text-white shadow-[0_14px_30px_rgba(13,148,136,0.18)] hover:shadow-[0_18px_38px_rgba(13,148,136,0.24)]">
              Submit Leave Application
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card data-tour="student-leave-records" className="border-white/70 bg-white/76">
        <CardHeader className="border-b border-white/70 pb-3">
          <CardTitle className="text-base font-bold text-slate-950">Leave Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {leaves.length === 0 ? (
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><CalendarDays className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>No leave records yet</EmptyTitle>
                <EmptyDescription>Submit a leave application to see HOD decisions, dates, and total days here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold">Application</TableHead>
                  <TableHead className="text-xs font-semibold">Leave Type</TableHead>
                  <TableHead className="text-xs font-semibold">Leave Period</TableHead>
                  <TableHead className="text-xs font-semibold">Reason</TableHead>
                  <TableHead className="text-xs font-semibold">HOD decision</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.map((leave, idx) => (
                  <TableRow key={leave.number}>
                    <TableCell className="py-3 text-xs font-bold text-slate-950">
                      {idx + 1}
                      <p className="text-[10px] font-normal text-slate-400">Applied {formatLogbookDate(leave.appliedOn)}</p>
                    </TableCell>
                    <TableCell className="py-3 text-xs font-medium text-slate-700">{leave.leaveType}</TableCell>
                    <TableCell className="py-3 text-xs text-slate-700">
                      {formatLogbookDate(leave.fromDate)} to {formatLogbookDate(leave.toDate)}
                      <p className="text-[10px] text-slate-400">{leave.totalDays} day(s)</p>
                    </TableCell>
                    <TableCell className="max-w-[260px] py-3 text-xs text-slate-600">{leave.reason}</TableCell>
                    <TableCell className="py-3 text-xs text-slate-600">{leave.approvedBy}</TableCell>
                    <TableCell className="py-3">{renderLeaveStatus(leave.status)}</TableCell>
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

function getInclusiveDays(fromDate: string, toDate: string) {
  const start = new Date(`${fromDate}T00:00:00Z`).getTime();
  const end = new Date(`${toDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function SummaryCard({ label, value, tone, total }: { label: string; value: number; tone: "teal" | "amber" | "slate", total?: number | null }) {
  const toneClass = {
    teal: "border-white/70 bg-white/76 text-teal-900",
    amber: "border-white/70 bg-white/76 text-amber-900",
    slate: "border-white/70 bg-white/76 text-slate-900",
  }[tone];

  return (
    <div className={`rounded-[18px] border p-4 shadow-[0_18px_48px_rgba(15,23,42,0.05)] ${toneClass}`}>
      <p className="text-4xl font-semibold leading-none text-slate-950">
        {value} <span className="text-sm font-semibold opacity-60">{total ? `/ ${total} used` : ""}</span>
      </p>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">{label}</p>
    </div>
  );
}

function renderLeaveStatus(status: LeaveStatus) {
  if (status === "approved") {
    return (
      <Badge className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Approved
      </Badge>
    );
  }

  if (status === "rejected") {
    return (
      <Badge className="border-rose-200 bg-rose-50 text-[10px] text-rose-700">
        <XCircle className="mr-1 h-3 w-3" /> Rejected
      </Badge>
    );
  }

  return (
    <Badge className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
      <Clock className="mr-1 h-3 w-3" /> Pending HOD
    </Badge>
  );
}
