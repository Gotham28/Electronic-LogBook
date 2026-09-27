import * as React from "react";
import { CalendarDays, PlusCircle, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatLogbookDate, todayForInput } from "@/lib/logbook-config";
import { useDepartment, type CatalogItem, type PostingScheduleRow } from "@/lib/department-context";

type PostingName = string;

type Posting = {
  id: number;
  ward: PostingName;
  startDate: string;
  endDate: string;
  supervisorId: number;
  supervisorName: string;
  status: "pending" | "verified" | "rejected";
  facultyRemarks: string | null;
};

import { apiGet, apiPost, apiPatch } from "@/lib/apiClient";
import { getCurrentUser } from "@/lib/session";

export function PostingsPage() {
  const { postings: postingOptions, config, postingSchedule } = useDepartment();
  const [open, setOpen] = React.useState(false);
  const [postings, setPostings] = React.useState<Posting[]>([]);
  const user = React.useMemo(() => getCurrentUser(), []);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [professors, setProfessors] = React.useState<any[]>([]);

  // Form State
  const [ward, setWard] = React.useState<PostingName>("");
  const [startDate, setStartDate] = React.useState(todayForInput());
  const [endDate, setEndDate] = React.useState(todayForInput());
  const [supervisorId, setSupervisorId] = React.useState("");
  const [editId, setEditId] = React.useState<number | null>(null);

  const isFreeTextWard = !!config?.enabledFeatures?.freeTextPostingUnit;

  const fetchPostings = React.useCallback(async () => {
    if (!user?.studentProfileId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiGet(`/api/students/${user.studentProfileId}/postings`);
      setPostings(resp.data || []);
    } catch (e: any) {
      toast.error("Failed to fetch postings");
      // AGENTS.md sec 7 (SEC-17): postings stays [] on failure, which otherwise renders
      // identically to "you genuinely have none yet" - and invites adding a duplicate.
      setError(e?.message || "Could not load your postings");
    } finally {
      setLoading(false);
    }
  }, [user?.studentProfileId]);

  React.useEffect(() => {
    fetchPostings();
    if (user?.departmentId) {
      apiGet(`/api/departments/${user.departmentId}/professors`).then(setProfessors).catch(console.error);
    }
  }, [fetchPostings, user?.departmentId]);

  const handleAddPosting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.studentProfileId) return;

    if (!ward || !startDate || !endDate || (!isFreeTextWard && !supervisorId)) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      const finalSupervisorId = isFreeTextWard ? undefined : supervisorId;
      if (editId) {
        await apiPatch(`/api/students/${user.studentProfileId}/postings/${editId}`, { ward, startDate, endDate, supervisorId: finalSupervisorId });
        toast.success("Posting updated successfully");
      } else {
        await apiPost(`/api/students/${user.studentProfileId}/postings`, { ward, startDate, endDate, supervisorId: finalSupervisorId });
        toast.success("Posting added successfully");
      }
      setOpen(false);
      setEditId(null);
      fetchPostings();
      setStartDate(todayForInput());
      setEndDate(todayForInput());
    } catch (e: any) {
      toast.error(e.message || "Failed to add posting");
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="page-eyebrow flex items-center gap-2">Student-managed clinical training</p>
          <h2 className="page-title mt-1">Postings &amp; rotations</h2>
          <p className="mt-2 text-sm text-slate-500">Track your individual ward postings and rotations.</p>
        </div>
        <Dialog open={open} onOpenChange={(val) => {
          setOpen(val);
          if (!val) { setWard(""); setStartDate(todayForInput()); setEndDate(todayForInput()); setSupervisorId(""); setEditId(null); }
        }}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="h-4 w-4 mr-2" /> Add posting
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Posting" : "Add Posting"}</DialogTitle>
              <DialogDescription>
                Log a new ward posting or rotation.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddPosting} className="space-y-4">
              <div className="space-y-2">
                <Label>Ward / Posting Unit</Label>
                {isFreeTextWard ? (
                  <Input value={ward} onChange={e => setWard(e.target.value)} required placeholder="Enter posting unit" />
                ) : (
                  <>
                    {!postingOptions.length && <p className="text-xs text-slate-500">Your HOD has not configured postings yet.</p>}
                    <Select value={ward} onValueChange={(val: any) => setWard(val)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {postingOptions.map((opt) => (
                          <SelectItem key={opt.id} value={opt.value}>{opt.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
                </div>
              </div>
              {!isFreeTextWard && (
                <div className="space-y-2">
                  <Label>Supervisor (Unit Chief)</Label>
                  <Select value={supervisorId} onValueChange={setSupervisorId}>
                    <SelectTrigger><SelectValue placeholder="Select faculty member" /></SelectTrigger>
                    <SelectContent>
                      {professors.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.fullName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit">Save Posting</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {postingSchedule.length > 0 && <PostingScheduleCard schedule={postingSchedule} postingOptions={postingOptions} />}

      <Card className="border-white/70 bg-white/76">
        <CardHeader className="border-b border-white/70">
          <CardTitle className="text-lg">Posting Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
             <div className="p-8 text-center text-slate-500">Loading...</div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
              <p className="text-sm font-medium text-rose-700">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchPostings} className="border-rose-200 text-rose-700">Try again</Button>
            </div>
          ) : postings.length === 0 ? (
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><CalendarDays className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>No postings logged</EmptyTitle>
                <EmptyDescription>Add your current ward or rotation and keep the timeline readable for review.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setOpen(true)}>Add posting</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead>Ward / Unit</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  {!isFreeTextWard && <TableHead>Supervisor</TableHead>}
                  {!isFreeTextWard && <TableHead>Status</TableHead>}
                  <TableHead className="text-right">{isFreeTextWard ? "Action" : "Faculty Remarks"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {postings.map((item, index) => (
                  <TableRow key={item.id || index}>
                    <TableCell className="font-medium text-slate-900">{item.ward}</TableCell>
                    <TableCell>{formatLogbookDate(item.startDate)}</TableCell>
                    <TableCell>{formatLogbookDate(item.endDate)}</TableCell>
                    {!isFreeTextWard && <TableCell>{item.supervisorName}</TableCell>}
                    {!isFreeTextWard && (
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          item.status === "verified" ? "bg-emerald-100 text-emerald-700" :
                          item.status === "rejected" ? "bg-rose-100 text-rose-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {item.status === "verified" ? "Verified" : item.status === "rejected" ? "Rejected" : "Pending"}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-right max-w-[220px]">
                      {/* Auto-verified postings (no supervisor) stay editable; faculty-verified ones are locked. */}
                      {(item.status === "pending" || (isFreeTextWard && item.status === "verified" && !item.supervisorId)) ? (
                        <Button variant="ghost" size="sm" className="text-teal-600 hover:text-teal-800 hover:bg-teal-50" onClick={() => {
                          setEditId(item.id);
                          setWard(item.ward);
                          setStartDate(item.startDate);
                          setEndDate(item.endDate);
                          setSupervisorId(String(item.supervisorId));
                          setOpen(true);
                        }}>
                          <Edit3 className="h-4 w-4" /> Edit
                        </Button>
                      ) : !isFreeTextWard ? (
                        (item as any).facultyRemarks ? (
                          <span
                            title={(item as any).facultyRemarks}
                            className={`block truncate cursor-help text-sm font-medium ${
                              item.status === "rejected" ? "text-rose-700" : "text-slate-600"
                            }`}
                          >
                            {(item as any).facultyRemarks}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">No remark</span>
                        )
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

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function PostingScheduleCard({ schedule, postingOptions }: { schedule: PostingScheduleRow[]; postingOptions: CatalogItem[] }) {
  const names = new Map(postingOptions.map((option) => [option.value, option.name]));
  const years = Array.from(new Set(schedule.map((row) => row.trainingYear))).sort((a, b) => a - b);
  return (
    <Card className="border-white/70 bg-white/76">
      <CardHeader className="border-b border-white/70">
        <CardTitle className="text-lg">Posting schedule</CardTitle>
        <p className="text-sm text-slate-500">The planned rotation for each year of training, set by your department.</p>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 md:grid-cols-3">
        {years.map((year) => {
          const rows = schedule.filter((row) => row.trainingYear === year);
          const total = rows.reduce((sum, row) => sum + row.months, 0);
          return (
            <section key={year} className="rounded-xl border border-slate-200 bg-white" aria-label={`Year ${year} postings`}>
              <header className="flex items-baseline justify-between border-b border-slate-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-900">Year {ROMAN[year - 1] ?? year}</h3>
                <span className="text-xs text-slate-500">{total} {total === 1 ? "month" : "months"}</span>
              </header>
              <ul className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <li key={row.postingValue} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="text-slate-700">{names.get(row.postingValue) ?? row.postingValue}</span>
                    <Badge variant="secondary" className="shrink-0">{row.months} {row.months === 1 ? "month" : "months"}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
