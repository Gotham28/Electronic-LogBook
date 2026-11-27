import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Redirect } from "wouter";
import { CalendarDays, CheckCircle2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { formatLogbookDate } from "@/lib/logbook-config";
import { apiGet } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useDepartment } from "@/lib/department-context";

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
        <Badge className="border-status-border bg-status text-[11px] font-semibold text-status-foreground">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Present
        </Badge>
      );
    case "absent":
      return (
        <Badge className="border-status-border bg-status text-[11px] font-semibold text-status-foreground">
          <XCircle className="mr-1 h-3 w-3" /> Absent
        </Badge>
      );
    case "half_day":
      return (
        <Badge className="border-status-border bg-status text-[11px] font-semibold text-status-foreground">
          <Clock className="mr-1 h-3 w-3" /> Half Day
        </Badge>
      );
    case "leave":
      return (
        <Badge className="border-line-soft bg-sage text-[11px] font-semibold text-ink">
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
        <p className="mt-2 text-sm text-helper">
          Review your verified daily attendance records marked by department faculty.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[18px] border border-card-edge bg-card p-4 shadow-[0_18px_48px_color-mix(in_srgb,var(--gothos-forest)_5%,transparent)]">
          <p className="text-3xl font-bold text-ink">{totalDays}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-helper">Days Logged</p>
        </div>
        <div className="rounded-[18px] border border-card-edge bg-card p-4 shadow-[0_18px_48px_color-mix(in_srgb,var(--gothos-forest)_5%,transparent)]">
          <p className="text-3xl font-bold text-status-foreground">{presentDays}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-helper">Days Present</p>
        </div>
        <div className="rounded-[18px] border border-card-edge bg-card p-4 shadow-[0_18px_48px_color-mix(in_srgb,var(--gothos-forest)_5%,transparent)]">
          <p className="text-3xl font-bold text-status-foreground">{absentDays + leaveDays}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-helper">Absent / Leave</p>
        </div>
        <div className="rounded-[18px] border border-card-edge bg-card p-4 shadow-[0_18px_48px_color-mix(in_srgb,var(--gothos-forest)_5%,transparent)]">
          <p className="text-3xl font-bold text-forest">{percentage}{percentage !== "—" ? "%" : ""}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-helper">Attendance Rate</p>
        </div>
      </div>

      <Card className="border-card-edge bg-card">
        <CardHeader className="border-b border-card-edge pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-ink">Attendance History</CardTitle>
          <Button size="sm" variant="outline" onClick={fetchAttendance} disabled={loading} className="text-xs">
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 flex justify-center items-center">
              <div className="animate-spin rounded-full border-4 border-line-soft border-t-forest h-8 w-8" />
            </div>
          ) : error ? (
            <div className="p-6 text-center text-status-foreground text-sm font-medium">
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
                    <TableCell className="text-xs font-medium text-ink py-3">
                      {formatLogbookDate(r.date)}
                    </TableCell>
                    <TableCell className="py-3">
                      {renderAttendanceStatusBadge(r.status)}
                    </TableCell>
                    <TableCell className="text-xs text-soft-ink py-3">
                      {r.clockIn || r.clockOut ? `${r.clockIn || "—"} to ${r.clockOut || "—"}` : "Full Day"}
                    </TableCell>
                    <TableCell className="text-xs text-soft-ink py-3">
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
        <p className="mt-2 text-sm text-helper">
          Review your annual attendance percentages logged and verified by department faculty.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {yearRows.map(({ year, label, pct, record }) => (
          <div key={year} className="rounded-[18px] border border-card-edge bg-card p-4 shadow-[0_18px_48px_color-mix(in_srgb,var(--gothos-forest)_5%,transparent)]">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-wider text-helper">{label}</p>
              {pct !== null ? (
                <Badge className="border-status-border bg-status text-[10px] font-semibold text-status-foreground">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Recorded
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-helper">
                  Pending
                </Badge>
              )}
            </div>
            <p className="mt-2 text-3xl font-bold text-ink">
              {pct !== null ? `${pct}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-helper truncate">
              {record?.verifierName ? `Marked by ${record.verifierName}` : "Not yet entered"}
            </p>
          </div>
        ))}

        <div className="rounded-[18px] border border-card-edge bg-card p-4 shadow-[0_18px_48px_color-mix(in_srgb,var(--gothos-forest)_5%,transparent)]">
          <p className="text-[11px] font-bold uppercase tracking-wider text-forest">Overall Average</p>
          <p className="mt-2 text-3xl font-bold text-forest">
            {avg}{avg !== "—" ? "%" : ""}
          </p>
          <p className="mt-1 text-xs text-helper">
            {validPercentages.length} of 3 years recorded
          </p>
        </div>
      </div>

      <Card className="border-card-edge bg-card">
        <CardHeader className="border-b border-card-edge pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-ink">Yearly Attendance Breakdown</CardTitle>
          <Button size="sm" variant="outline" onClick={fetchAttendance} disabled={loading} className="text-xs">
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 flex justify-center items-center">
              <div className="animate-spin rounded-full border-4 border-line-soft border-t-forest h-8 w-8" />
            </div>
          ) : error ? (
            <div className="p-6 text-center text-status-foreground text-sm font-medium">
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
                    <TableCell className="text-xs font-bold text-ink py-3">
                      {label}
                    </TableCell>
                    <TableCell className="py-3">
                      {pct !== null ? (
                        <span className="text-sm font-bold text-forest">{pct}%</span>
                      ) : (
                        <span className="text-xs text-helper">Not recorded</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      {pct !== null ? (
                        <Badge className="border-status-border bg-status text-[11px] font-semibold text-status-foreground">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] text-helper">
                          Pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-soft-ink py-3">
                      {record?.verifierName || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-soft-ink py-3">
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
  const isYearlyAttendance = Boolean(dept.config?.enabledFeatures?.yearlyAttendance);
  const isDailyAttendance = Boolean(dept.config?.enabledFeatures?.dailyAttendance && !isYearlyAttendance);

  if (isYearlyAttendance) {
    return <StudentYearlyAttendanceView />;
  }
  if (isDailyAttendance) {
    return <StudentDailyAttendanceView />;
  }
  return <Redirect to="/" replace />;
}
