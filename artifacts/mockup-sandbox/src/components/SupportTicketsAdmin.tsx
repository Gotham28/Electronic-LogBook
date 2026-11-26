import * as React from "react";
import {
  LifeBuoy,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Save,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  Mail,
  Globe,
  Monitor,
} from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  getAdminSupportTickets,
  getAdminOpenSupportTicketsCount,
  updateAdminSupportTicket,
  type SupportTicket,
  type SupportTicketStatus,
  type SupportTicketCategory,
} from "@/lib/apiClient";

function formatIst(isoString: string): string {
  try {
    return (
      new Date(isoString).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " IST"
    );
  } catch {
    return isoString;
  }
}

function categoryLabel(cat: SupportTicketCategory): string {
  switch (cat) {
    case "login_issue":
      return "Login issue";
    case "bug":
      return "Bug report";
    case "feature_request":
      return "Feature request";
    case "other":
      return "Other inquiry";
    default:
      return cat;
  }
}

function statusBadge(status: SupportTicketStatus) {
  switch (status) {
    case "open":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-status px-2.5 py-0.5 text-xs font-semibold text-status-foreground border border-status-border">
          <Clock className="h-3 w-3" /> Open
        </span>
      );
    case "in_progress":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sage px-2.5 py-0.5 text-xs font-semibold text-forest border border-line-soft">
          <RefreshCw className="h-3 w-3 animate-spin" /> In Progress
        </span>
      );
    case "resolved":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-status px-2.5 py-0.5 text-xs font-semibold text-status-foreground border border-status-border">
          <CheckCircle2 className="h-3 w-3" /> Resolved
        </span>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function emailStatusBadge(status: string) {
  switch (status) {
    case "sent":
      return (
        <span className="inline-flex items-center rounded-md bg-status px-2 py-0.5 text-[11px] font-medium text-status-foreground ring-1 ring-inset ring-ring">
          Sent
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center rounded-md bg-status px-2 py-0.5 text-[11px] font-medium text-status-foreground ring-1 ring-inset ring-ring">
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center rounded-md bg-sage px-2 py-0.5 text-[11px] font-medium text-soft-ink">
          Pending
        </span>
      );
  }
}

export function SupportTicketsAdmin({
  onOpenCountChange,
}: {
  onOpenCountChange?: (count: number) => void;
}) {
  const [tickets, setTickets] = React.useState<SupportTicket[]>([]);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState<SupportTicketStatus | "all">("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Detail Modal State
  const [selectedTicket, setSelectedTicket] = React.useState<SupportTicket | null>(null);
  const [editStatus, setEditStatus] = React.useState<SupportTicketStatus>("open");
  const [editNotes, setEditNotes] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const fetchTickets = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, countRes] = await Promise.all([
        getAdminSupportTickets({ status: statusFilter, page, limit: 15 }),
        getAdminOpenSupportTicketsCount(),
      ]);
      setTickets(listRes.tickets);
      setTotal(listRes.total);
      setTotalPages(listRes.totalPages || 1);
      if (onOpenCountChange) {
        onOpenCountChange(countRes.count);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load support tickets.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, onOpenCountChange]);

  React.useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  const handleRowClick = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setEditStatus(ticket.status);
    setEditNotes(ticket.adminNotes || "");
  };

  const handleSaveChanges = async () => {
    if (!selectedTicket) return;
    setIsSaving(true);
    try {
      const updated = await updateAdminSupportTicket(selectedTicket.id, {
        status: editStatus,
        adminNotes: editNotes.trim() || null,
      });

      toast.success(`Ticket ${selectedTicket.referenceCode} updated.`);
      setSelectedTicket((prev) => (prev ? { ...prev, ...updated } : null));

      // Refresh ticket list and open count
      void fetchTickets();
    } catch (err: any) {
      toast.error(err.message || "Failed to update support ticket.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Filter Card */}
      <Card className="border-line-soft shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-ink">
                <LifeBuoy className="h-5 w-5 text-forest" />
                Support Tickets
              </CardTitle>
              <CardDescription className="text-xs text-helper">
                Review and resolve user-reported problems, bugs, and login inquiries across the platform.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchTickets()}
                disabled={loading}
                className="border-line-soft text-ink"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
            {/* Filter buttons */}
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { value: "all", label: "All Tickets" },
                  { value: "open", label: "Open" },
                  { value: "in_progress", label: "In Progress" },
                  { value: "resolved", label: "Resolved" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.value);
                    setPage(1);
                  }}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                    statusFilter === tab.value
                      ? "bg-forest text-white shadow-sm"
                      : "bg-sage text-soft-ink hover:bg-sage"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="text-xs text-helper font-medium">
              Showing {tickets.length} of {total} ticket{total === 1 ? "" : "s"}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tickets Table */}
      <Card className="border-line-soft shadow-sm overflow-hidden">
        {error ? (
          <div className="p-8 text-center" role="alert">
            <AlertCircle className="mx-auto h-8 w-8 text-status-foreground mb-2" />
            <p className="text-sm font-semibold text-ink">Error loading support tickets</p>
            <p className="text-xs text-helper mt-1 mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void fetchTickets()}>
              Retry
            </Button>
          </div>
        ) : loading && tickets.length === 0 ? (
          <div className="p-12 text-center text-helper">
            <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2 text-forest" />
            <p className="text-xs">Loading support tickets...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center text-helper">
            <LifeBuoy className="mx-auto h-8 w-8 text-helper mb-2" />
            <p className="text-sm font-semibold text-ink">No tickets found</p>
            <p className="text-xs text-helper mt-1">
              {statusFilter === "all"
                ? "No support tickets have been submitted yet."
                : `No tickets with status "${statusFilter}".`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-mist">
                <TableRow>
                  <TableHead className="w-[120px] text-xs font-semibold text-ink">Reference</TableHead>
                  <TableHead className="w-[120px] text-xs font-semibold text-ink">Category</TableHead>
                  <TableHead className="min-w-[160px] text-xs font-semibold text-ink">Reporter</TableHead>
                  <TableHead className="min-w-[240px] text-xs font-semibold text-ink">Message Preview</TableHead>
                  <TableHead className="w-[110px] text-xs font-semibold text-ink">Status</TableHead>
                  <TableHead className="w-[160px] text-xs font-semibold text-ink">Created</TableHead>
                  <TableHead className="w-[90px] text-xs font-semibold text-ink">Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => {
                  const reporterDisplay = t.userFullName
                    ? `${t.userFullName} (${t.userRole || "User"}${t.departmentName ? ` · ${t.departmentName}` : ""})`
                    : t.name || (t.email ? t.email : "Anonymous");

                  return (
                    <TableRow
                      key={t.id}
                      onClick={() => handleRowClick(t)}
                      className="cursor-pointer transition-colors hover:bg-mist"
                    >
                      <TableCell className="font-mono text-xs font-bold text-forest">
                        {t.referenceCode}
                      </TableCell>
                      <TableCell className="text-xs font-medium text-ink">
                        <Badge variant="outline" className="text-[11px] font-normal">
                          {categoryLabel(t.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-ink">
                        <div className="font-medium truncate max-w-[180px]">{reporterDisplay}</div>
                        {t.email && (
                          <div className="text-[11px] text-helper truncate max-w-[180px]">{t.email}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-soft-ink">
                        <p className="line-clamp-2 max-w-[320px]">{t.message}</p>
                      </TableCell>
                      <TableCell>{statusBadge(t.status)}</TableCell>
                      <TableCell className="text-xs text-helper whitespace-nowrap">
                        {formatIst(t.createdAt)}
                      </TableCell>
                      <TableCell>{emailStatusBadge(t.emailStatus)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-line-soft px-4 py-3 bg-mist">
            <span className="text-xs text-helper">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="h-8 px-2.5 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="h-8 px-2.5 text-xs"
              >
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail & Edit Modal */}
      <Dialog
        open={selectedTicket !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedTicket(null);
        }}
      >
        <DialogContent className="max-w-xl sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedTicket && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
                  <DialogTitle className="flex items-center gap-2 text-lg text-ink font-mono">
                    {selectedTicket.referenceCode}
                  </DialogTitle>
                  <div>{statusBadge(editStatus)}</div>
                </div>
                <DialogDescription className="text-xs text-helper">
                  Submitted on {formatIst(selectedTicket.createdAt)} · Category:{" "}
                  <strong>{categoryLabel(selectedTicket.category)}</strong>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Reporter & Context Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-line-soft bg-mist p-3 text-xs">
                  <div>
                    <span className="text-helper block mb-0.5 font-medium">Reporter</span>
                    <span className="font-semibold text-ink flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-helper" />
                      {selectedTicket.userFullName
                        ? `${selectedTicket.userFullName} (${selectedTicket.userRole || "User"})`
                        : selectedTicket.name || "Not provided"}
                    </span>
                    {selectedTicket.departmentName && (
                      <span className="text-helper block text-[11px] ml-5">
                        Department: {selectedTicket.departmentName}
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="text-helper block mb-0.5 font-medium">Contact Email</span>
                    <span className="text-ink flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-helper" />
                      {selectedTicket.email ? (
                        <a
                          href={`mailto:${selectedTicket.email}`}
                          className="text-forest hover:underline"
                        >
                          {selectedTicket.email}
                        </a>
                      ) : (
                        "None provided"
                      )}
                    </span>
                  </div>

                  {selectedTicket.pageUrl && (
                    <div className="sm:col-span-2">
                      <span className="text-helper block mb-0.5 font-medium">Page Location</span>
                      <span className="text-ink font-mono text-[11px] flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5 text-helper shrink-0" />
                        {selectedTicket.pageUrl}
                      </span>
                    </div>
                  )}

                  {selectedTicket.userAgent && (
                    <div className="sm:col-span-2">
                      <span className="text-helper block mb-0.5 font-medium">Browser / Device</span>
                      <span className="text-helper text-[11px] truncate block flex items-center gap-1.5">
                        <Monitor className="h-3.5 w-3.5 text-helper shrink-0" />
                        {selectedTicket.userAgent}
                      </span>
                    </div>
                  )}
                </div>

                {/* Message Body */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-ink">Problem Description</Label>
                  <div className="rounded-lg border border-line-soft bg-white p-3.5 text-sm text-ink whitespace-pre-wrap leading-relaxed shadow-inner max-h-56 overflow-y-auto">
                    {selectedTicket.message}
                  </div>
                </div>

                {/* Status & Admin Notes form */}
                <div className="space-y-3 pt-2 border-t border-line-soft">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-status" className="text-xs font-semibold text-ink">
                        Update Status
                      </Label>
                      <Select
                        value={editStatus}
                        onValueChange={(val) => setEditStatus(val as SupportTicketStatus)}
                      >
                        <SelectTrigger id="edit-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-ink">Email Notification</Label>
                      <div className="pt-2">
                        {emailStatusBadge(selectedTicket.emailStatus)}
                        <span className="ml-2 text-xs text-helper">
                          {selectedTicket.emailStatus === "sent"
                            ? "Admin notified via email"
                            : selectedTicket.emailStatus === "failed"
                            ? "Delivery attempt failed"
                            : "Queued"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-notes" className="text-xs font-semibold text-ink">
                      Admin Notes <span className="text-helper font-normal">(Internal notes on resolution)</span>
                    </Label>
                    <Textarea
                      id="edit-notes"
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Add notes about actions taken, investigation findings, or resolution..."
                      rows={3}
                      maxLength={5000}
                      className="text-xs"
                    />
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-line-soft">
                  <span className="text-[11px] text-helper">
                    {selectedTicket.resolvedAt && `Resolved at ${formatIst(selectedTicket.resolvedAt)}`}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedTicket(null)}
                      disabled={isSaving}
                    >
                      Close
                    </Button>
                    <Button
                      type="button"
                      onClick={handleSaveChanges}
                      disabled={isSaving}
                      className="bg-forest text-white hover:bg-deep"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-1.5 h-3.5 w-3.5" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
