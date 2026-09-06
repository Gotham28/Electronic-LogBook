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

export function AttendancePage() {
  const [leaveType, setLeaveType] = React.useState("Casual Leave");
  const [fromDate, setFromDate] = React.useState(todayForInput());
  const [toDate, setToDate] = React.useState(todayForInput());
  const [reason, setReason] = React.useState("");

  const [leaves, setLeaves] = React.useState<LeaveRecord[]>([]);
  const [balance, setBalance] = React.useState({
    casual: { used: 0, total: null as number | null },
    academic: { used: 0, total: null as number | null }
  });
  const user = React.useMemo(() => getCurrentUser(), []);

  const fetchLeaves = React.useCallback(async () => {
    if (!user?.studentProfileId) return;
    try {
      const [leavesResponse, balanceData] = await Promise.all([
        apiGet(`/api/students/${user.studentProfileId}/leave-records`),
        apiGet<{casual: any, academic: any}>(`/api/students/${user.studentProfileId}/leave-balance`)
      ]);

      // Backend wraps leave-records in { data: [] }
      const leavesData: any[] = Array.isArray(leavesResponse) ? leavesResponse : (leavesResponse?.data ?? []);
      
      setLeaves(leavesData.map((l: any) => ({
        number: l.id.toString(),
        appliedOn: new Date(l.createdAt).toISOString(),
        leaveType: l.leaveType === "casual" ? "Casual Leave" : l.leaveType === "academic" ? "Academic Leave" : l.leaveType,
        fromDate: l.startDate,
        toDate: l.endDate,
        reason: l.reason,
        status: l.status,
        approvedBy: l.reviewedBy ? "HOD" : "Awaiting HOD",
        totalDays: l.startDate && l.endDate ? Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / (1000 * 3600 * 24)) + 1 : 1
      })));

      setBalance(balanceData);
    } catch (error) {
      console.error("Error fetching leave data:", error);
      toast.error("Failed to load leave records");
    }
  }, [user?.studentProfileId]);

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
        leaveType: leaveType.split(" ")[0].toLowerCase(),
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
        <SummaryCard label={`Casual Leave (${balance.casual.total ?? "not configured"})`} value={balance.casual.used} total={balance.casual.total} tone="teal" />
        <SummaryCard label={`Academic Leave (${balance.academic.total ?? "not configured"})`} value={balance.academic.used} total={balance.academic.total} tone="teal" />
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
                    <SelectItem value="Casual Leave">Casual Leave</SelectItem>
                    <SelectItem value="Medical Leave">Medical Leave</SelectItem>
                    <SelectItem value="Academic Leave">Academic Leave</SelectItem>
                    <SelectItem value="Maternity / Paternity Leave">Maternity / Paternity Leave</SelectItem>
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

      <Card className="border-white/70 bg-white/76">
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
