import React from "react";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "./ui/table";
import { apiGet, apiPost, apiPatch } from "../lib/apiClient";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Checkbox } from "./ui/checkbox";
import { isoToIstDateTimeInput, istDateTimeInputToIso, maintenancePreview } from "../lib/maintenanceTime";

type Announcement = {
  id: number;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  audienceRoles: string[];
  status: "scheduled" | "active" | "completed" | "cancelled";
};
const ROLES = ["student", "professor", "hod"] as const;
const defaultForm = { id: null as number | null, startAt: "", endAt: "", audienceRoles: [...ROLES] as string[] };

function formatIst(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }) + " IST";
}

export function MaintenanceAnnouncements() {
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [form, setForm] = React.useState(defaultForm);
  const [submitting, setSubmitting] = React.useState(false);

  const fetchAnnouncements = async () => {
    setLoadError(null);
    try {
      const data = await apiGet<Announcement[]>("/api/superadmin/announcements");
      setAnnouncements(data);
    } catch (error: any) {
      setLoadError(error.message || "Failed to load announcements.");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    void fetchAnnouncements();
    const refresh = window.setInterval(() => { void fetchAnnouncements(); }, 60_000);
    const refreshOnFocus = () => { if (document.visibilityState === "visible") void fetchAnnouncements(); };
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, []);

  const startIso = istDateTimeInputToIso(form.startAt);
  const endIso = istDateTimeInputToIso(form.endAt);
  const nowIso = new Date().toISOString();
  const isTimeValid = Boolean(startIso && endIso && endIso > startIso && endIso > nowIso
    && (form.id ? true : startIso > nowIso));
  const isFormValid = isTimeValid && form.audienceRoles.length > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!startIso || !endIso || !isFormValid) return;
    setSubmitting(true);
    try {
      const payload = {
        startAt: startIso,
        endAt: endIso,
        audienceRoles: form.audienceRoles,
      };
      if (form.id) await apiPatch(`/api/superadmin/announcements/${form.id}`, payload);
      else await apiPost("/api/superadmin/announcements", payload);
      toast.success(form.id ? "Maintenance schedule updated." : "Maintenance scheduled.");
      setIsFormOpen(false);
      setForm(defaultForm);
      await fetchAnnouncements();
    } catch (error: any) {
      toast.error(error.message || "Could not save the maintenance schedule.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (announcement: Announcement) => {
    if (!confirm("Cancel this maintenance schedule?")) return;
    try {
      await apiPost(`/api/superadmin/announcements/${announcement.id}/cancel`, {});
      toast.success("Maintenance cancelled.");
      await fetchAnnouncements();
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel the maintenance schedule.");
    }
  };

  const openEdit = (announcement: Announcement) => {
    setForm({
      id: announcement.id,
      startAt: isoToIstDateTimeInput(announcement.startAt),
      endAt: isoToIstDateTimeInput(announcement.endAt),
      audienceRoles: announcement.audienceRoles,
    });
    setIsFormOpen(true);
  };

  const toggleRole = (role: string) => {
    setForm((previous) => ({
      ...previous,
      audienceRoles: previous.audienceRoles.includes(role)
        ? previous.audienceRoles.filter((item) => item !== role)
        : [...previous.audienceRoles, role],
    }));
  };

  const openNew = () => {
    setForm(defaultForm);
    setIsFormOpen(true);
  };

  return (
    <div className="mt-12 space-y-6 border-t pt-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Maintenance Notices</h2>
          <p className="text-slate-500">Schedule an ELogbook service notice for selected roles.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Schedule</Button>
      </div>

      <Card>
        <Table>
          <TableHeader><TableRow>
            <TableHead>Status</TableHead><TableHead>Notice</TableHead><TableHead>Window (IST)</TableHead>
            <TableHead>Audience</TableHead><TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={5} className="text-center text-slate-500">Loading…</TableCell></TableRow>
              : loadError ? <TableRow><TableCell colSpan={5} role="alert" className="py-6 text-center text-rose-700">{loadError}</TableCell></TableRow>
              : announcements.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-slate-500">No maintenance notices scheduled.</TableCell></TableRow>
              : announcements.map((announcement) => {
                const isScheduledOrActive = announcement.status === "scheduled" || announcement.status === "active";
                return <TableRow key={announcement.id}>
                  <TableCell><span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${announcement.status === "scheduled" ? "bg-amber-100 text-amber-700" : announcement.status === "active" ? "bg-emerald-100 text-emerald-700" : announcement.status === "cancelled" ? "bg-slate-100 text-slate-700" : "bg-blue-100 text-blue-700"}`}>{announcement.status}</span></TableCell>
                  <TableCell className="font-medium">ELogbook maintenance</TableCell>
                  <TableCell className="text-xs">{formatIst(announcement.startAt)}<br />to {formatIst(announcement.endAt)}</TableCell>
                  <TableCell className="text-xs text-slate-500">{announcement.audienceRoles.join(", ")}</TableCell>
                  <TableCell className="text-right">{isScheduledOrActive && <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(announcement)}>Edit</Button>
                    <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => void handleCancel(announcement)}>Cancel</Button>
                  </div>}</TableCell>
                </TableRow>;
              })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{form.id ? "Edit" : "Schedule"} ELogbook Maintenance</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm leading-relaxed text-teal-950">
              {maintenancePreview(form.startAt, form.endAt)}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maintenance-start">Start time (IST)</Label>
                <Input id="maintenance-start" type="datetime-local" required value={form.startAt}
                  min={form.id ? undefined : isoToIstDateTimeInput(new Date())}
                  onChange={(event) => setForm({ ...form, startAt: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maintenance-end">End time (IST)</Label>
                <Input id="maintenance-end" type="datetime-local" required value={form.endAt}
                  min={form.startAt || isoToIstDateTimeInput(new Date())}
                  onChange={(event) => setForm({ ...form, endAt: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Show this notice to</Label>
              <div className="flex flex-wrap gap-4">
                {ROLES.map((role) => <label key={role} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.audienceRoles.includes(role)} onCheckedChange={() => toggleRole(role)} />
                  {role === "hod" ? "HOD" : role === "professor" ? "Professors" : "Students"}
                </label>)}
              </div>
            </div>
            {form.id && <p className="text-xs text-slate-500">Changing the schedule or audience updates the in-app notice for those roles. Active maintenance keeps its original start time.</p>}
            {!isFormValid && (form.startAt || form.endAt) && <p role="alert" className="text-sm text-rose-700">Choose valid future IST times with the end after the start, and select at least one audience.</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Close</Button>
              <Button type="submit" disabled={submitting || !isFormValid}>{submitting ? "Saving…" : "Save schedule"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
