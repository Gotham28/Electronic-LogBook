import React from "react";
import { Plus, Edit2, XCircle, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "./ui/table";
import { apiGet, apiPost, apiPatch } from "../lib/apiClient";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Checkbox } from "./ui/checkbox";

export function MaintenanceAnnouncements() {
  const [announcements, setAnnouncements] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  
  const defaultForm = {
    id: null as number | null,
    title: "",
    description: "",
    expectedImpact: "",
    startAt: "",
    endAt: "",
    audienceRoles: ["student", "professor", "hod"],
    sendEmail: false
  };
  const [form, setForm] = React.useState(defaultForm);
  const [submitting, setSubmitting] = React.useState(false);

  const fetchAnnouncements = async () => {
    try {
      const data = await apiGet<any[]>("/api/superadmin/announcements");
      setAnnouncements(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to load announcements");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (form.id) {
        await apiPatch(`/api/superadmin/announcements/${form.id}`, form);
        toast.success("Announcement updated");
      } else {
        await apiPost("/api/superadmin/announcements", form);
        toast.success("Announcement scheduled");
      }
      setIsFormOpen(false);
      setForm(defaultForm);
      fetchAnnouncements();
    } catch (error: any) {
      toast.error(error.message || "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm("Are you sure you want to cancel this scheduled maintenance?")) return;
    try {
      await apiPost(`/api/superadmin/announcements/${id}/cancel`, {});
      toast.success("Announcement cancelled");
      fetchAnnouncements();
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel");
    }
  };

  const toInputDate = (isoString: string) => {
    if (!isoString) return "";
    const d = new Date(isoString);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const openEdit = (a: any) => {
    setForm({
      id: a.id,
      title: a.title,
      description: a.description,
      expectedImpact: a.expectedImpact || "",
      startAt: toInputDate(a.startAt),
      endAt: toInputDate(a.endAt),
      audienceRoles: a.audienceRoles,
      sendEmail: false
    });
    setIsFormOpen(true);
  };

  const toggleRole = (role: string) => {
    setForm(prev => ({
      ...prev,
      audienceRoles: prev.audienceRoles.includes(role) 
        ? prev.audienceRoles.filter(r => r !== role)
        : [...prev.audienceRoles, role]
    }));
  };

  return (
    <div className="space-y-6 mt-12 border-t pt-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Maintenance Announcements</h2>
          <p className="text-slate-500">Schedule downtime or maintenance banners across the platform.</p>
        </div>
        <Button onClick={() => { setForm(defaultForm); setIsFormOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Schedule</Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Window (IST)</TableHead>
              <TableHead>Audience</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-slate-500">Loading...</TableCell></TableRow>
            ) : announcements.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-slate-500">No announcements scheduled.</TableCell></TableRow>
            ) : (
              announcements.map(a => {
                const isUpcoming = a.status === "scheduled";
                const isActive = a.status === "active";
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${isUpcoming ? 'bg-amber-100 text-amber-700' : isActive ? 'bg-emerald-100 text-emerald-700' : a.status === 'cancelled' ? 'bg-slate-100 text-slate-700' : 'bg-blue-100 text-blue-700'}`}>
                        {a.status}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{a.title}</TableCell>
                    <TableCell className="text-xs">
                      {new Date(a.startAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}<br/>
                      to {new Date(a.endAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{a.audienceRoles.join(", ")}</TableCell>
                    <TableCell className="text-right">
                      {(isUpcoming || isActive) && (
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(a)}>Edit</Button>
                          <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => handleCancel(a.id)}>Cancel</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit' : 'Schedule'} Maintenance Announcement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Server Upgrades" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea required value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Briefly describe the maintenance" />
            </div>
            <div className="space-y-2">
              <Label>Expected Impact (Optional)</Label>
              <Input value={form.expectedImpact} onChange={e => setForm({...form, expectedImpact: e.target.value})} placeholder="e.g. Brief slowness or short disconnections" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input type="datetime-local" required value={form.startAt} onChange={e => setForm({...form, startAt: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <Input type="datetime-local" required value={form.endAt} onChange={e => setForm({...form, endAt: e.target.value})} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Target Audience</Label>
              <div className="flex gap-4">
                {["student", "professor", "hod"].map(role => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.audienceRoles.includes(role)} onCheckedChange={() => toggleRole(role)} />
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t mt-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={form.sendEmail} onCheckedChange={(c) => setForm({...form, sendEmail: c as boolean})} />
                Send email notification now
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Close</Button>
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save Announcement'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
