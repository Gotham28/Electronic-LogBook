import * as React from "react";
import { ProcedureClinicalDetails } from "@/components/ProcedureClinicalDetails";
import { AcademicRecordDetails } from "@/components/AcademicRecordDetails";
import { readAcademicRecord, academicSectionName } from "@/lib/academic-logbook";
import { isDemoMode } from "@/lib/session";
import { useCurrentUser } from "@/hooks/use-current-user";
import { apiGet } from "@/lib/apiClient";
import { formatLogbookDate } from "@/lib/logbook-config";
import { useDepartment } from "@/lib/department-context";
import { logCustomFieldVisible } from "@/lib/log-custom-fields";
import { Printer, X, BookOpen } from "lucide-react";
import { useMobileCellLabels } from "@/components/ui/table";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

class PrintErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 text-status-foreground bg-status border border-status-border rounded m-8">
          <h1 className="text-2xl font-bold mb-4">Print Render Crash</h1>
          <p className="mb-4">The PDF generation crashed during rendering:</p>
          <pre className="p-4 bg-white text-xs overflow-auto rounded border">{this.state.error.message}\n{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const STATUS_LABELS: Record<string, string> = {
  verified: "Verified",
  pending: "Pending",
  approved: "Approved",
  submitted: "Submitted",
};

function StatusPill({ status }: { status: string }) {
  const colours: Record<string, string> = {
    verified: "bg-status text-status-foreground",
    approved: "bg-status text-status-foreground",
    rejected: "bg-status text-status-foreground",
    pending: "bg-status text-status-foreground",
    submitted: "bg-sage text-forest",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${colours[status] ?? "bg-sage text-soft-ink"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function CoverPage({ profile, name }: { profile: any; name: string }) {
  if (!profile) return null;
  const mentorRole = profile.mentorRole === "hod" ? "Head of Department" : profile.mentorRole === "professor" ? "Professor" : "Supervisor";
  const dateRange = profile.dateOfJoining
    ? `${new Date(profile.dateOfJoining).toLocaleDateString("en-IN", { month: "long", year: "numeric" })} — Present`
    : "Present";
  const printedDate = new Date().toLocaleString("en-IN", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const [course, setCourse] = React.useState(() => localStorage.getItem("logbook_course") || profile.course || "MD/MS Program");
  
  React.useEffect(() => {
    localStorage.setItem("logbook_course", course);
  }, [course]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[98vh] break-after-page px-6 py-12 sm:px-12 sm:py-20 text-ink" style={{ fontFamily: "system-ui, sans-serif", background: "var(--gothos-bg)" }}>
      {/* Header band */}
      <div className="flex flex-col items-center gap-4 mb-20 text-center w-full">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-deep text-white shadow-lg mb-2">
          <BookOpen size={32} />
        </div>
        <p className="text-3xl font-extrabold text-ink text-center w-full">{profile.collegeName}</p>
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-forest">Electronic Logbook</p>
      </div>

      {/* Main title */}
      <div className="text-center mb-16 w-full max-w-2xl flex flex-col items-center">
        <h1 className="text-6xl font-extrabold text-ink leading-tight">Resident<br/>Training Record</h1>
        <div className="mt-8 mb-2 flex items-center justify-center w-full">
          <input 
            type="text" 
            value={course} 
            onChange={(e) => setCourse(e.target.value)}
            className="text-2xl font-bold text-forest bg-transparent text-center border-b border-transparent hover:border-input focus:border-forest focus:outline-none w-3/4 placeholder:text-helper transition-colors"
            placeholder="Enter Course (e.g. MD Pediatrics)"
          />
        </div>
        <p className="text-xl font-medium text-forest">Department of {profile.department ?? "—"}</p>
      </div>

      {/* Resident card */}
      <div className="w-full max-w-sm rounded-2xl border border-line-soft bg-white shadow-md px-8 py-8 text-center mb-16">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-helper mb-3">Resident</p>
        <h2 className="text-3xl font-bold text-ink mb-1">{name}</h2>
        {profile.registrationNumber && (
          <p className="text-sm text-helper font-mono mt-1">{profile.registrationNumber}</p>
        )}
        <div className="mt-4 border-t border-line-soft pt-4">
          <p className="text-sm text-soft-ink">{dateRange}</p>
          {profile.batch && <p className="text-xs text-helper mt-0.5">Batch of {profile.batch}</p>}
        </div>
      </div>

      {/* Guide */}
      {profile.mentorName && (
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-helper mb-2">Under the Guidance of</p>
          <p className="text-xl font-bold text-ink">{profile.mentorName}</p>
          <p className="text-sm text-helper">{mentorRole}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto pt-16 text-center text-xs text-helper">
        <p>Generated on {printedDate}</p>
        <p className="mt-1">This document is system-generated and confidential.</p>
      </div>
    </div>
  );
}

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-5 pb-3 border-b-2 border-forest break-after-avoid">
      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-forest">{number}</span>
      <h3 className="text-lg font-bold text-ink">{title}</h3>
    </div>
  );
}

function EmptySection() {
  return <p className="text-sm text-helper italic">No records found.</p>;
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-helper bg-mist border-b border-t border-line-soft whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, right, muted }: { children: React.ReactNode; right?: boolean; muted?: boolean }) {
  return (
    <td className={`py-2 px-3 text-[11px] border-b border-line-soft align-top ${right ? "text-right" : "text-left"} ${muted ? "text-helper" : "text-ink"}`}>
      {children}
    </td>
  );
}

function AggregateSummary({ rows, label }: { rows: any[]; label: string }) {
  if (!rows || rows.length === 0) return null;
  const verified = rows.filter(r => r.status === "verified" || r.status === "approved").length;
  const pending = rows.filter(r => r.status === "pending" || r.status === "submitted").length;
  const rejected = rows.filter(r => r.status === "rejected").length;
  return (
    <div className="mt-4 flex gap-4 text-[10px] font-bold text-helper uppercase tracking-wider justify-end">
      <div className="bg-sage px-4 py-2 rounded-lg border border-line-soft shadow-sm">Total {label}: <span className="text-ink ml-1">{rows.length}</span></div>
      <div className="bg-status text-status-foreground px-4 py-2 rounded-lg border border-status-border shadow-sm">Verified: <span className="ml-1">{verified}</span></div>
      <div className="bg-status text-status-foreground px-4 py-2 rounded-lg border border-status-border shadow-sm">Pending: <span className="ml-1">{pending}</span></div>
      {rejected > 0 && <div className="bg-status text-status-foreground px-4 py-2 rounded-lg border border-status-border shadow-sm">Rejected: <span className="ml-1">{rejected}</span></div>}
    </div>
  );
}

export function PrintableLogbook() {
  const user = useCurrentUser();
  const hideUhid = isDemoMode();
  const shouldReduceMotion = useReducedMotion();
  const { config, clinicalWorkCategories, clinicalWorkSubtypes, competencyLevels, procedureFields, caseLogFields = [], academicLogbook, label } = useDepartment();
  const features = config?.enabledFeatures ?? {};
  const hideCaseId = hideUhid || features.psychiatryWorkspace === true;
  const dynamicProcedureFields = Boolean(features.dynamicProcedureFields);
  const activeProcedureFields = dynamicProcedureFields ? (procedureFields ?? []) : undefined;
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // On a phone screen the record's tables read as cards; printing is unchanged.
  const documentRef = React.useRef<HTMLDivElement>(null);
  useMobileCellLabels(documentRef, true, data);
  const printStarted = React.useRef(false);
  const [flipPreviewDone, setFlipPreviewDone] = React.useState(() => !isDemoMode());
  const [flipPage, setFlipPage] = React.useState(0);

  const closePrintView = React.useCallback(() => {
    if (window.opener && !window.opener.closed) { window.close(); return; }
    if (window.history.length > 1) window.history.back();
    else window.location.assign("/");
  }, []);

  const fetchAll = React.useCallback(async () => {
    if (!user?.studentProfileId) {
      setError("User profile ID not found in session. Please log in again.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const id = user.studentProfileId;
      const [logsBundle, postings, leaves, assessments, thesisRes, certRes, appraisalsRes] = await Promise.all([
        apiGet(`/api/students/${id}/logs`),
        apiGet(`/api/students/${id}/postings`),
        apiGet(`/api/students/${id}/leave-records`),
        apiGet(`/api/students/${id}/assessments`),
        apiGet(`/api/students/${id}/thesis`),
        apiGet(`/api/students/${id}/certifications`),
        apiGet(`/api/appraisals/mine`),
      ]);

      setData({
        profile: logsBundle.profile || null,
        cases: logsBundle.caseLogs || [],
        procs: logsBundle.procedureLogs || [],
        clinicalWorks: logsBundle.clinicalWorkLogs || [],
        academics: logsBundle.academicLogs || [],
        postings: Array.isArray(postings) ? postings : postings?.data || [],
        leaves: Array.isArray(leaves) ? leaves : leaves?.data || [],
        assessments: Array.isArray(assessments) ? assessments : assessments?.data || [],
        thesis: thesisRes.data || null,
        certifications: Array.isArray(certRes) ? certRes : [],
        appraisals: Array.isArray(appraisalsRes) ? appraisalsRes : appraisalsRes?.data || [],
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your complete logbook.");
    } finally {
      setLoading(false);
    }
  }, [user?.studentProfileId]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  React.useEffect(() => {
    if (!isDemoMode() || shouldReduceMotion === true) setFlipPreviewDone(true);
  }, [shouldReduceMotion]);

  React.useEffect(() => {
    if (!isDemoMode() || loading || !data || flipPreviewDone || shouldReduceMotion !== false) return undefined;
    const timer = window.setTimeout(() => {
      if (flipPage >= 3) setFlipPreviewDone(true);
      else setFlipPage((current) => current + 1);
    }, 430);
    return () => window.clearTimeout(timer);
  }, [data, flipPage, flipPreviewDone, loading, shouldReduceMotion]);

  React.useEffect(() => {
    if (loading || !data || error || printStarted.current) return undefined;
    if (isDemoMode() && !flipPreviewDone) return undefined;

    printStarted.current = true;
    window.addEventListener("afterprint", closePrintView, { once: true });
    const timer = window.setTimeout(() => window.print(), 600);
    return () => window.clearTimeout(timer);
  }, [closePrintView, data, error, flipPreviewDone, loading]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-helper">
      <div className="w-10 h-10 rounded-full border-4 border-line-soft border-t-forest animate-spin" />
      <p className="text-sm font-medium">Preparing your logbook PDF…</p>
    </div>
  );

  if (error) {
    return (
      <div className="p-12 text-center print:hidden" role="alert">
        <p className="text-lg font-semibold text-status-foreground">Your logbook could not be printed</p>
        <p className="mt-2 text-sm text-soft-ink">{error}</p>
        <p className="mt-1 text-xs text-helper">Nothing was printed. Some sections could not be loaded.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={fetchAll} className="rounded-xl bg-forest px-5 py-2 text-sm text-white font-semibold">Try again</button>
          <button onClick={closePrintView} className="rounded-xl border border-input bg-white px-5 py-2 text-sm text-ink">Cancel</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  let sectionCount = 0;
  const nextSection = () => String(++sectionCount).padStart(2, "0");
  const clinicalNames = new Map([...clinicalWorkCategories, ...clinicalWorkSubtypes].map((item) => [item.value, item.name]));

  const regNumber = data?.profile?.registrationNumber ?? "—";
  const department = data?.profile?.department ?? "—";
  const joiningYear = data?.profile?.joiningYear ?? "—";

  return (
    <PrintErrorBoundary>
      {isDemoMode() && shouldReduceMotion === false && !flipPreviewDone && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-deep/55 p-5 print:hidden" role="status" aria-live="polite">
          <div className="absolute inset-0 bg-transparent" />
          <AnimatePresence mode="wait">
            <motion.div
              key={flipPage}
              initial={{ opacity: 0, rotateY: -78, x: 30 }}
              animate={{ opacity: 1, rotateY: 0, x: 0 }}
              exit={{ opacity: 0, rotateY: 70, x: -24 }}
              transition={{ duration: 0.38, ease: "easeOut" }}
              className="relative flex min-h-[min(68vh,34rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-card-edge bg-white px-6 py-7 shadow-[0_30px_100px_color-mix(in_srgb,var(--gothos-forest)_38%,transparent)] sm:px-9 sm:py-9"
              style={{ transformOrigin: "left center", perspective: 1200 }}
            >
              <div className="flex items-center justify-between border-b border-line-soft pb-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-forest">Electronic Logbook</span>
                <span className="text-xs font-medium tabular-nums text-helper">{String(flipPage + 1).padStart(2, "0")} / 04</span>
              </div>
              <div className="flex flex-1 flex-col justify-center py-9">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-helper">{user?.name ?? "Resident"}</p>
                <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  {["Training record", "Clinical activity", "Academic activity", "Progress summary"][flipPage]}
                </h1>
                <div className="mt-8 space-y-4" aria-hidden="true">
                  <div className="h-2 w-4/5 rounded-full bg-sage" />
                  <div className="h-2 w-full rounded-full bg-sage" />
                  <div className="h-2 w-3/5 rounded-full bg-sage" />
                  <div className="mt-7 grid grid-cols-2 gap-3">
                    <div className="h-16 rounded-xl border border-line-soft bg-mist" />
                    <div className="h-16 rounded-xl border border-line-soft bg-mist" />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-line-soft pt-4">
                <span className="text-xs text-helper">Preparing print view</span>
                <button
                  type="button"
                  onClick={() => setFlipPreviewDone(true)}
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold text-forest transition-colors hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Skip preview
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm 16mm 16mm 16mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .break-after-page { break-after: page; }
          .break-before-page { break-before: page; }
          .no-break { break-inside: avoid; }
          thead.print-header-group {
            display: table-header-group !important;
            break-inside: avoid;
          }
        }
      `}</style>

      <CoverPage profile={data.profile} name={user?.name ?? "—"} />

      {/* Main document */}
      <div ref={documentRef} className="bg-white px-4 py-8 sm:px-10 sm:py-10 max-w-[900px] mx-auto text-ink" style={{ fontFamily: "system-ui, sans-serif" }}>
        <table className="w-full border-collapse m-0 p-0 border-0">
          <thead className="print-header-group">
            <tr>
              <td className="p-0 border-0">
                {/* Running header on every printed page — native repeating header at top of each page */}
                <div className="hidden print:flex items-center justify-between border-b-2 border-forest pb-2 mb-6 bg-white">
                  <div className="flex items-center gap-3">
                    <div style={{ width: 4, height: 26, background: "var(--gothos-forest)", borderRadius: 3, flexShrink: 0 }} />
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 800, color: "var(--gothos-ink)", margin: 0, lineHeight: 1.2 }}>{user?.name ?? "—"}</p>
                      <p style={{ fontSize: 9, color: "var(--gothos-muted)", margin: 0, marginTop: 1 }}>
                        {data.profile?.collegeName} &nbsp;·&nbsp; Dept. of {department}&nbsp;&nbsp;|&nbsp;&nbsp;Reg. No:&nbsp;<span style={{ fontWeight: 700, color: "var(--gothos-ink)" }}>{regNumber}</span>
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: "var(--gothos-forest)", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Electronic Logbook</p>
                    <p style={{ fontSize: 8, color: "var(--gothos-muted)", margin: 0, marginTop: 1 }}>Resident Training Record · {new Date().getFullYear()}</p>
                  </div>
                </div>
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-0 border-0 align-top">
                {/* Document identity bar */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-10 pb-6 border-b border-line-soft">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-forest mb-1">{data.profile?.collegeName}</p>
            <h1 className="text-2xl font-extrabold text-ink">{user?.name ?? "—"}</h1>
            <p className="text-sm text-helper mt-0.5">Department of {department}</p>
          </div>
          <div className="text-right text-xs text-helper space-y-0.5">
            <p><span className="font-semibold text-ink">Reg. No:</span> {regNumber}</p>
            <p><span className="font-semibold text-ink">Batch:</span> {joiningYear}</p>
            <p><span className="font-semibold text-ink">Printed:</span> {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
          </div>
        </div>

        {/* ── 1. Postings ───────────────────────────────── */}
        <div className="mb-12 no-break">
          <SectionHeader number={nextSection()} title="Postings & Rotations" />
          {(() => { const rows = data.postings.filter((p: any) => p.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <>
              <table data-mobile="cards" className="w-full border-collapse">
                <thead><tr>
                  <Th>{label("postings.printColumn")}</Th><Th>Start</Th><Th>End</Th><Th>Supervisor</Th><Th>Status</Th>
                </tr></thead>
                <tbody>
                  {rows.map((p: any, i: number) => (
                    <tr key={p.id} className={i % 2 === 0 ? "bg-white" : "bg-mist"}>
                      <Td><span className="font-semibold">{p.ward}</span></Td>
                      <Td>{formatLogbookDate(p.startDate)}</Td>
                      <Td>{formatLogbookDate(p.endDate)}</Td>
                      <Td>{p.supervisorName ?? "—"}</Td>
                      <Td><StatusPill status={p.status ?? "pending"} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AggregateSummary rows={data.postings} label="Postings" />
            </>
          ); })()}
        </div>

        {/* ── Case Logs ─────────────────────────────────── */}
        {!features.hideCaseLogs && <div className="mb-12 break-before-page">
          <SectionHeader number={nextSection()} title="Clinical Case Logs" />
          {(() => { const rows = data.cases.filter((c: any) => c.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <>
              <table data-mobile="cards" className="w-full border-collapse">
                <thead><tr>
                  <Th>#</Th><Th>Date</Th>
                  {!hideCaseId && <Th>{label("caseLog.caseId")}</Th>}
                  <Th>Age / Gender</Th><Th>Category</Th><Th>Diagnosis</Th><Th>Status</Th>
                </tr></thead>
                <tbody>
                  {rows.map((c: any, i: number) => (
                    <tr key={c.id} className={i % 2 === 0 ? "" : "bg-mist"}>
                      <Td muted>{rows.length - i}</Td>
                      <Td>{formatLogbookDate(c.date)}</Td>
                      {!hideCaseId && <Td muted={!c.patientUhid}>{c.patientUhid || "—"}</Td>}
                      <Td>{[c.patientAge, c.patientGender].filter(Boolean).join(" / ") || "—"}</Td>
                      <Td>{c.category || "—"}</Td>
                      <Td>
                        <span className="font-medium">{c.diagnosisFinal || c.diagnosisProvisional || "—"}</span>
                        {(() => {
                          const visibleValues = caseLogFields
                            .filter((field) => logCustomFieldVisible(field, c.customFields ?? {}))
                            .map((field) => ({ key: field.key, label: field.label, val: c.customFields?.[field.key] }))
                            .filter((entry) => Boolean(entry.val));
                          if (!visibleValues.length) return null;
                          return (
                            <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                              {visibleValues.map((entry) => (
                                <div key={entry.key}><span className="font-semibold">{entry.label}:</span> {entry.val}</div>
                              ))}
                            </div>
                          );
                        })()}
                      </Td>
                      <Td><StatusPill status={c.status ?? "pending"} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AggregateSummary rows={data.cases} label="Cases" />
            </>
          ); })()}
        </div>}

        {/* ── Procedure Logs ────────────────────────────── */}
        {!features.hideProcedureLogs && <div className="mb-12 break-before-page">
          <SectionHeader number={nextSection()} title="Procedure Logs" />
          {(() => { const rows = data.procs.filter((p: any) => p.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <>
              <table data-mobile="cards" className="w-full border-collapse">
                <thead><tr>
                  <Th>#</Th><Th>Date</Th><Th>Procedure</Th><Th>Group</Th>
                  {!hideUhid && <Th>{label("caseLog.caseId")}</Th>}
                  <Th>Competency</Th><Th>Verified Level</Th><Th>Status</Th>
                </tr></thead>
                <tbody>
                  {rows.map((p: any, i: number) => (
                    <tr key={p.id} className={i % 2 === 0 ? "" : "bg-mist"}>
                      <Td muted>{rows.length - i}</Td>
                      <Td>{formatLogbookDate(p.date)}</Td>
                      <Td><span className="font-medium">{p.procedureName}</span>
                        {((dynamicProcedureFields && (activeProcedureFields?.length ?? 0) > 0) || (!dynamicProcedureFields && (features.procedureClinicalDetails || p.setting))) && (
                          <ProcedureClinicalDetails entry={p} fields={activeProcedureFields} />
                        )}
                      </Td>
                      <Td>{p.procedureGroup ?? "—"}</Td>
                      {!hideUhid && <Td muted={!p.patientUhid}>{p.patientUhid || "—"}</Td>}
                      <Td muted={!p.competencyLevel}>{p.competencyLevel || "—"}</Td>
                      <Td muted={!p.facultyVerifiedLevel}>{p.facultyVerifiedLevel || "—"}</Td>
                      <Td><StatusPill status={p.status ?? "pending"} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AggregateSummary rows={data.procs} label="Procedures" />
            </>
          ); })()}
        </div>}

        {/* ── Clinical Works ────────────────────────────── */}
        {features.clinicalWorks && <div className="mb-12 break-before-page">
          <SectionHeader number={nextSection()} title="Clinical Work" />
          {(() => { const rows = data.clinicalWorks.filter((c: any) => c.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <>
              <table data-mobile="cards" className="w-full border-collapse">
                <thead><tr>
                  <Th>#</Th><Th>Date</Th><Th>Category</Th><Th>Sub-type</Th>
                  {!hideUhid && <Th>Case No.</Th>}
                  <Th>Age / Sex</Th>
                  
                  {<Th>Findings</Th>}
                  {competencyLevels.length > 0 && <Th>Competency</Th>}
                  <Th>Status</Th>
                </tr></thead>
                <tbody>
                  {rows.map((c: any, i: number) => (
                    <tr key={c.id} className={i % 2 === 0 ? "" : "bg-mist"}>
                      <Td muted>{rows.length - i}</Td>
                      <Td>{formatLogbookDate(c.date)}</Td>
                      <Td><span className="font-medium">{clinicalNames.get(c.category) ?? c.category}</span></Td>
                      <Td muted={!c.subType}>{c.subType ? clinicalNames.get(c.subType) ?? c.subType : "—"}</Td>
                      {!hideUhid && <Td>{c.caseNumber}</Td>}
                      <Td>{[c.patientAge, c.patientSex].filter(Boolean).join(" / ")}</Td>
                      
                      {<Td muted={!c.clinicalFindings}><div className="whitespace-pre-wrap max-w-xs">{c.clinicalFindings || "—"}</div></Td>}
                      {competencyLevels.length > 0 && <Td muted={!c.competency}>{c.competency || "—"}</Td>}
                      <Td><StatusPill status={c.status ?? "pending"} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AggregateSummary rows={data.clinicalWorks} label="Clinical work" />
            </>
          ); })()}
        </div>}

        {/* ── 4. Academic Activities ────────────────────── */}
        <div className="mb-12 break-before-page">
          <SectionHeader number={nextSection()} title={academicLogbook?.title || "Academic Activities"} />
          {(() => { const rows = data.academics.filter((a: any) => a.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <>
              <table data-mobile="cards" className="w-full border-collapse">
                <thead><tr>
                  <Th>#</Th><Th>Date</Th><Th>Activity</Th><Th>Topic / Title</Th><Th>Supervisor</Th><Th>Grade</Th><Th>Status</Th>
                </tr></thead>
                <tbody>
                  {rows.map((a: any, i: number) => (
                    <tr key={a.id} className={i % 2 === 0 ? "" : "bg-mist"}>
                      <Td muted>{rows.length - i}</Td>
                      <Td>{formatLogbookDate(a.date)}</Td>
                      <Td>{academicSectionName(academicLogbook, a.activityType ?? a.type ?? "—").replace(/_/g, " ")}</Td>
                      <Td><span className="font-medium">{a.topic ?? "—"}</span></Td>
                      <Td muted={!a.supervisorName}>{a.supervisorName || "—"}</Td>
                      <Td muted={!a.facultyGrade}>{a.facultyGrade || "—"}</Td>
                      <Td><StatusPill status={a.status ?? "pending"} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-6 space-y-6">
                {rows.filter((row: any) => readAcademicRecord(row.description)).sort((a: any, b: any) =>
                  readAcademicRecord(a.description)!.trainingYear - readAcademicRecord(b.description)!.trainingYear
                  || a.activityType.localeCompare(b.activityType) || a.date.localeCompare(b.date)).map((row: any) => (
                  <article key={row.id}>
                    <h4 className="font-semibold text-ink">{academicSectionName(academicLogbook, row.activityType)} · {formatLogbookDate(row.date)}</h4>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{row.topic}</p>
                    <AcademicRecordDetails activityType={row.activityType} description={row.description} presentationType={row.presentationType} />
                    <p className="mt-2 text-xs">Reviewing faculty: {row.supervisorName || "—"} · Status: {row.status}</p>
                    {row.facultyRemarks && <p className="mt-1 whitespace-pre-wrap text-xs">Faculty remarks: {row.facultyRemarks}</p>}
                  </article>
                ))}
              </div>
              <AggregateSummary rows={data.academics} label="Academic Activities" />
            </>
          ); })()}
        </div>

        {/* ── 5. Assessments ───────────────────────────── */}
        <div className="mb-12 no-break">
          <SectionHeader number={nextSection()} title="Assessments" />
          {data.assessments.length === 0 ? <EmptySection /> : (
            <table data-mobile="cards" className="w-full border-collapse">
              <thead><tr>
                <Th>Date</Th><Th>Exam Name</Th><Th>Type</Th><Th right>Marks</Th><Th>Assessed By</Th>
              </tr></thead>
              <tbody>
                {data.assessments.map((a: any, i: number) => (
                  <tr key={a.id} className={i % 2 === 0 ? "" : "bg-mist"}>
                    <Td>{formatLogbookDate(a.date)}</Td>
                    <Td><span className="font-medium">{a.examName}</span></Td>
                    <Td>{a.type}</Td>
                    <Td right><span className="font-bold">{a.marks}</span>{a.maximum ? <span className="text-helper"> / {a.maximum}</span> : ""}</Td>
                    <Td muted={!a.assessorName}>{a.assessorName || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── 6. Certifications ────────────────────────── */}
        <div className="mb-12 no-break">
          <SectionHeader number={nextSection()} title="Certifications" />
          {(() => { const rows = data.certifications.filter((c: any) => c.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <table data-mobile="cards" className="w-full border-collapse">
              <thead><tr>
                <Th>Certificate</Th><Th>Issuing Body</Th><Th>Date Issued</Th><Th>Expiry</Th><Th>Status</Th>
              </tr></thead>
              <tbody>
                {rows.map((c: any, i: number) => (
                  <tr key={c.id} className={i % 2 === 0 ? "" : "bg-mist"}>
                    <Td><span className="font-medium">{c.title}</span></Td>
                    <Td muted={!c.provider}>{c.provider || "—"}</Td>
                    <Td>{formatLogbookDate(c.issueDate)}</Td>
                    <Td>{formatLogbookDate(c.expiryDate)}</Td>
                    <Td><StatusPill status={c.status ?? "pending"} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          ); })()}
        </div>

        {/* ── 7. Leave Records ─────────────────────────── */}
        <div className="mb-12 no-break">
          <SectionHeader number={nextSection()} title="Leave Records" />
          {(() => { const rows = data.leaves.filter((l: any) => l.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <table data-mobile="cards" className="w-full border-collapse">
              <thead><tr>
                <Th>Type</Th><Th>From</Th><Th>To</Th><Th right>Days</Th><Th>Status</Th>
              </tr></thead>
              <tbody>
                {rows.map((l: any, i: number) => {
                  const days = l.startDate && l.endDate
                    ? Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1
                    : "—";
                  return (
                    <tr key={l.id} className={i % 2 === 0 ? "" : "bg-mist"}>
                      <Td>{l.leaveType}</Td>
                      <Td>{formatLogbookDate(l.startDate)}</Td>
                      <Td>{formatLogbookDate(l.endDate)}</Td>
                      <Td right>{days}</Td>
                      <Td><StatusPill status={l.status ?? "pending"} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ); })()}
        </div>

        {/* ── 8. Thesis ────────────────────────────────── */}
        <div className="mb-16 no-break">
          <SectionHeader number={nextSection()} title="Thesis" />
          {!data.thesis ? <EmptySection /> : (
            <div className="rounded-xl border border-line-soft overflow-hidden">
              {[
                ["Thesis Title", data.thesis.thesisTitle],
                ["Protocol Submission", data.thesis.protocolSubmissionDate ? formatLogbookDate(data.thesis.protocolSubmissionDate) : "—"],
                ["IEC Clearance", data.thesis.iecClearanceDate ? formatLogbookDate(data.thesis.iecClearanceDate) : "—"],
                ["Data Collection Start", data.thesis.dataCollectionStartDate ? formatLogbookDate(data.thesis.dataCollectionStartDate) : "—"],
                ["Data Collection End", data.thesis.dataCollectionEndDate ? formatLogbookDate(data.thesis.dataCollectionEndDate) : "—"],
                ["Thesis Submission", data.thesis.submissionDate ? formatLogbookDate(data.thesis.submissionDate) : "—"],
                ["Protocol Status", data.thesis.protocolStatus],
                ["Mid-Term Status", data.thesis.midTermStatus],
                ["Final Submission Status", data.thesis.finalSubmissionStatus],
              ].map(([label, value], i) => (
                <div key={label} className={`flex gap-4 px-4 py-2.5 text-xs ${i % 2 === 0 ? "bg-white" : "bg-mist"}`}>
                  <span className="w-48 shrink-0 font-semibold text-helper">{label}</span>
                  <span className="text-ink">{value || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 9. Quarterly Appraisals ────────────────────── */}
        <div className="mb-16 no-break">
          <SectionHeader number={nextSection()} title="Quarterly Appraisals" />
          {(() => { const rows = data.appraisals; return !rows || rows.length === 0 ? <EmptySection /> : (
            <div className="grid grid-cols-2 gap-4">
              {rows.map((appr: any, i: number) => (
                <div key={appr.id || i} className="rounded-xl border border-line-soft overflow-hidden bg-white shadow-sm p-4 text-xs">
                  <div className="font-bold text-sm text-ink mb-2 border-b border-line-soft pb-2 flex justify-between items-center">
                    <span>Q{appr.quarter} {appr.year}</span>
                    <span className="text-[10px] font-normal text-helper uppercase">{formatLogbookDate(appr.appraisalDate)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    <span className="text-helper">Patient Care:</span><span className="font-semibold text-ink text-right">{appr.patientCareGrade || "—"}</span>
                    <span className="text-helper">Scholastic:</span><span className="font-semibold text-ink text-right">{appr.scholasticGrade || "—"}</span>
                    <span className="text-helper">Prof. Attributes:</span><span className="font-semibold text-ink text-right">{appr.professionalAttributesGrade || "—"}</span>
                  </div>
                  {appr.facultyRemarks && (
                    <div className="mt-3 pt-2 border-t border-line-soft italic text-soft-ink text-[10px]">
                      "{appr.facultyRemarks}"
                    </div>
                  )}
                </div>
              ))}
            </div>
          ); })()}
        </div>

        {/* ── Final Declaration ────────────────────────── */}
        <div className="break-before-page pt-10">
          <div className="text-center mb-8">
             <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-mist text-forest mb-4 shadow-sm border border-line-soft">
               <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
             </div>
             <h2 className="text-3xl font-bold text-ink">Final Verification</h2>
          </div>
          <div className="bg-mist border border-line-soft rounded-xl p-8 text-sm text-ink leading-loose space-y-5">
             <p>This is to certify that <strong>{user?.name ?? "the resident"}</strong> (Registration No: <strong>{regNumber}</strong>) has satisfactorily fulfilled all the mandatory requirements for the <strong>{localStorage.getItem("logbook_course") || data.profile?.course || "MD/MS Program"}</strong> training program in the Department of <strong>{department}</strong> at <strong>{data.profile?.collegeName}</strong>.</p>
             <p>All clinical cases, procedures, and academic activities recorded in this logbook have been personally performed or attended by the resident. The entries have been periodically evaluated, verified, and authenticated by the respective unit supervisors and the Head of Department.</p>
             <p>The resident has demonstrated the necessary clinical competencies, professionalism, and ethical conduct required for the successful completion of the training period.</p>
          </div>
          
          {/* Signature block */}
          <div className="mt-32 grid grid-cols-3 gap-8 no-break">
            {["Resident Signature", "Guide / Supervisor", "HOD Signature & Stamp"].map((label) => (
              <div key={label} className="text-center">
                <div className="h-14 border-b border-input mb-2" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-helper">{label}</p>
              </div>
            ))}
          </div>
        </div>

              </td>
            </tr>
          </tbody>
        </table>

        {/* Print controls */}
        <div className="mt-10 flex justify-center gap-3 print:hidden">
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-forest px-5 py-2 text-sm font-semibold text-white">
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
          <button onClick={closePrintView} className="flex items-center gap-2 rounded-xl border border-input bg-white px-5 py-2 text-sm text-ink">
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>
    </PrintErrorBoundary>
  );
}
