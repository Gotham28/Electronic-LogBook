import * as React from "react";
import { Trophy, PlusCircle, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { isLogCreateEligible, useLogCreateIntent } from "@/lib/log-create-navigation";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatLogbookDate, todayForInput } from "@/lib/logbook-config";
import { apiGet, apiPost, apiPatch } from "@/lib/apiClient";
import { getCurrentUser, isDemoMode } from "@/lib/session";
import { useDepartment } from "@/lib/department-context";

type AwardEntry = {
  id: number;
  date: string;
  description: string;
  supervisorId: number;
  supervisorName: string;
  status: "pending" | "verified" | "rejected";
  facultyRemarks: string | null;
};

export function AwardsPage() {
  const { config, academicLogbook } = useDepartment();
  const [open, setOpen] = React.useState(false);
  const [awards, setAwards] = React.useState<AwardEntry[]>([]);
  const user = React.useMemo(() => getCurrentUser(), []);
  useLogCreateIntent(["award"], () => {
    setEditId(null);
    setDate(todayForInput());
    setDescription("");
    setOpen(true);
  }, {
    targetPath: "/awards",
    ready: Boolean(config),
    eligible: isLogCreateEligible({
      action: "award",
      targetPath: "/awards",
      isStudent: user?.role === "student",
      config,
      demoMode: isDemoMode(),
      academicLogbook,
    }),
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Form State
  const [date, setDate] = React.useState(todayForInput());
  const [description, setDescription] = React.useState("");
  const [editId, setEditId] = React.useState<number | null>(null);

  const fetchAwards = React.useCallback(async () => {
    if (!user?.studentProfileId) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await apiGet(`/api/students/${user.studentProfileId}/awards`);
      setAwards(resp.data || []);
    } catch (e: any) {
      toast.error("Failed to fetch awards");
      setError(e?.message || "Could not load your awards");
    } finally {
      setLoading(false);
    }
  }, [user?.studentProfileId]);

  React.useEffect(() => {
    fetchAwards();
  }, [fetchAwards]);

  const handleAddAward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.studentProfileId) return;

    if (!date || !description) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      if (editId) {
        await apiPatch(`/api/students/${user.studentProfileId}/awards/${editId}`, { date, description });
        toast.success("Award updated successfully");
      } else {
        await apiPost(`/api/students/${user.studentProfileId}/awards`, { date, description });
        toast.success("Award added successfully");
      }
      setOpen(false);
      setEditId(null);
      fetchAwards();
      setDate(todayForInput());
      setDescription("");
    } catch (e: any) {
      toast.error(e.message || "Failed to save award");
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="page-eyebrow flex items-center gap-2">Student-managed achievements</p>
          <h2 className="page-title mt-1">Awards and Achievements</h2>
          <p className="mt-2 text-sm text-helper">Record your awards, prizes, and other notable achievements.</p>
        </div>
        <Dialog open={open} onOpenChange={(val) => {
          setOpen(val);
          if (!val) { setDate(todayForInput()); setDescription(""); setEditId(null); }
        }}>
          <DialogTrigger asChild>
            <Button>
              <PlusCircle className="h-4 w-4 mr-2" /> Add award
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Award" : "Add Award"}</DialogTitle>
              <DialogDescription>
                Log a new award or achievement.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddAward} className="space-y-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="E.g. Best Paper Award at XYZ Conference" required />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit">Save Award</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-card-edge bg-card">
        <CardHeader className="border-b border-card-edge">
          <CardTitle className="text-lg">Achievement Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
             <div className="p-8 text-center text-helper">Loading...</div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
              <p className="text-sm font-medium text-status-foreground">{error}</p>
              <Button size="sm" variant="outline" onClick={fetchAwards} className="border-status-border text-status-foreground">Try again</Button>
            </div>
          ) : awards.length === 0 ? (
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Trophy className="h-6 w-6" /></EmptyMedia>
                <EmptyTitle>No awards logged</EmptyTitle>
                <EmptyDescription>Record your achievements so they can be verified by faculty.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setOpen(true)}>Add award</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader className="bg-mist">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Supervisor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Faculty Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {awards.map((item, index) => (
                  <TableRow key={item.id || index}>
                    <TableCell>{formatLogbookDate(item.date)}</TableCell>
                    <TableCell className="font-medium text-ink">{item.description}</TableCell>
                    <TableCell>{item.supervisorName}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        item.status === "verified" ? "bg-status text-status-foreground" :
                        item.status === "rejected" ? "bg-status text-status-foreground" :
                        "bg-status text-status-foreground"
                      }`}>
                        {item.status === "verified" ? "Verified" : item.status === "rejected" ? "Rejected" : "Pending"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right max-w-[220px]">
                      {item.status === "pending" ? (
                        <Button variant="ghost" size="sm" className="text-forest hover:text-forest hover:bg-mist" onClick={() => {
                          setEditId(item.id);
                          setDate(item.date);
                          setDescription(item.description);
                          setOpen(true);
                        }}>
                          <Edit3 className="h-4 w-4" /> Edit
                        </Button>
                      ) : item.facultyRemarks ? (
                        <span
                          title={item.facultyRemarks}
                          className={`block truncate cursor-help text-sm font-medium ${
                            item.status === "rejected" ? "text-status-foreground" : "text-soft-ink"
                          }`}
                        >
                          {item.facultyRemarks}
                        </span>
                      ) : (
                        <span className="text-xs text-helper">No remark</span>
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
