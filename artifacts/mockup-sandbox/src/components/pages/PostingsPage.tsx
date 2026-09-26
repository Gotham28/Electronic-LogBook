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
import { useDepartment } from "@/lib/department-context";

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
  const { postings: postingOptions } = useDepartment();
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

    if (!ward || !startDate || !endDate || !supervisorId) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      if (editId) {
        await apiPatch(`/api/students/${user.studentProfileId}/postings/${editId}`, { ward, startDate, endDate, supervisorId });
        toast.success("Posting updated successfully");
      } else {
        await apiPost(`/api/students/${user.studentProfileId}/postings`, { ward, startDate, endDate, supervisorId });
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
                {!postingOptions.length && <p className="text-xs text-slate-500">Your HOD has not configured postings yet.</p>}
                <Select value={ward} onValueChange={(val: any) => setWard(val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {postingOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.value}>{opt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <div className="space-y-2">
                <Label>Supervisor (Unit Chief)</Label>
                <Select value={supervisorId} onValueChange={setSupervisorId}>
                  <SelectTrigger><SelectValue placeholder="Select faculty member" /></SelectTrigger>
                  <SelectContent>
                    {professors.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit">Save Posting</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                  <TableHead>Supervisor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Faculty Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {postings.map((item, index) => (
                  <TableRow key={item.id || index}>
                    <TableCell className="font-medium text-slate-900">{item.ward}</TableCell>
                    <TableCell>{formatLogbookDate(item.startDate)}</TableCell>
                    <TableCell>{formatLogbookDate(item.endDate)}</TableCell>
                    <TableCell>{item.supervisorName}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        item.status === "verified" ? "bg-emerald-100 text-emerald-700" :
                        item.status === "rejected" ? "bg-rose-100 text-rose-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {item.status === "verified" ? "Verified" : item.status === "rejected" ? "Rejected" : "Pending"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right max-w-[220px]">
                      {item.status === "pending" ? (
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
                      ) : (item as any).facultyRemarks ? (
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
                      )}
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


