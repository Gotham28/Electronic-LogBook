import * as React from "react";
import { getCurrentUser, isDemoMode } from "@/lib/session";
import { apiGet } from "@/lib/apiClient";
import { formatLogbookDate } from "@/lib/logbook-config";
import { Printer, X, BookOpen } from "lucide-react";

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
        <div className="p-8 text-red-600 bg-red-50 border border-red-200 rounded m-8">
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
    verified: "bg-emerald-100 text-emerald-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
    pending: "bg-amber-100 text-amber-800",
    submitted: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${colours[status] ?? "bg-slate-100 text-slate-600"}`}>
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

  const [college, setCollege] = React.useState(() => localStorage.getItem("logbook_college") || "Medical College");
  const [course, setCourse] = React.useState(() => localStorage.getItem("logbook_course") || profile.course || "MD/MS Program");

  React.useEffect(() => {
    localStorage.setItem("logbook_college", college);
  }, [college]);
  
  React.useEffect(() => {
    localStorage.setItem("logbook_course", course);
  }, [course]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[98vh] break-after-page px-12 py-20 text-slate-800" style={{ fontFamily: "system-ui, sans-serif", background: "linear-gradient(160deg, #f0fdf9 0%, #ffffff 60%)" }}>
      {/* Header band */}
      <div className="flex flex-col items-center gap-4 mb-20 text-center w-full">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-teal-700 text-white shadow-lg mb-2">
          <BookOpen size={32} />
        </div>
        <input 
          type="text" 
          value={college} 
          onChange={(e) => setCollege(e.target.value)}
          className="text-3xl font-extrabold text-slate-900 bg-transparent text-center border-b border-transparent hover:border-slate-300 focus:border-teal-500 focus:outline-none w-full placeholder:text-slate-300 transition-colors"
          placeholder="Enter College Name"
        />
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-teal-700">Electronic Logbook</p>
      </div>

      {/* Main title */}
      <div className="text-center mb-16 w-full max-w-2xl flex flex-col items-center">
        <h1 className="text-6xl font-extrabold text-slate-900 leading-tight">Resident<br/>Training Record</h1>
        <div className="mt-8 mb-2 flex items-center justify-center w-full">
          <input 
            type="text" 
            value={course} 
            onChange={(e) => setCourse(e.target.value)}
            className="text-2xl font-bold text-teal-800 bg-transparent text-center border-b border-transparent hover:border-slate-300 focus:border-teal-500 focus:outline-none w-3/4 placeholder:text-teal-200 transition-colors"
            placeholder="Enter Course (e.g. MD Pediatrics)"
          />
        </div>
        <p className="text-xl font-medium text-teal-700">Department of {profile.department ?? "—"}</p>
      </div>

      {/* Resident card */}
      <div className="w-full max-w-sm rounded-2xl border border-teal-100 bg-white shadow-md px-8 py-8 text-center mb-16">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-3">Resident</p>
        <h2 className="text-3xl font-bold text-slate-900 mb-1">{name}</h2>
        {profile.registrationNumber && (
          <p className="text-sm text-slate-500 font-mono mt-1">{profile.registrationNumber}</p>
        )}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600">{dateRange}</p>
          {profile.batch && <p className="text-xs text-slate-400 mt-0.5">Batch of {profile.batch}</p>}
        </div>
      </div>

      {/* Guide */}
      {profile.mentorName && (
        <div className="text-center mb-16">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400 mb-2">Under the Guidance of</p>
          <p className="text-xl font-bold text-slate-800">{profile.mentorName}</p>
          <p className="text-sm text-slate-500">{mentorRole}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto pt-16 text-center text-xs text-slate-400">
        <p>Generated on {printedDate}</p>
        <p className="mt-1">This document is system-generated and confidential.</p>
      </div>
    </div>
  );
}

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-5 pb-3 border-b-2 border-teal-600 break-after-avoid">
      <span className="text-[11px] font-black uppercase tracking-[0.2em] text-teal-600">{number}</span>
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
    </div>
  );
}

function EmptySection() {
  return <p className="text-sm text-slate-400 italic">No records found.</p>;
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`py-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-t border-slate-200 whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, right, muted }: { children: React.ReactNode; right?: boolean; muted?: boolean }) {
  return (
    <td className={`py-2 px-3 text-[11px] border-b border-slate-100 align-top ${right ? "text-right" : "text-left"} ${muted ? "text-slate-400" : "text-slate-800"}`}>
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
    <div className="mt-4 flex gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider justify-end">
      <div className="bg-slate-100 px-4 py-2 rounded-lg border border-slate-200 shadow-sm">Total {label}: <span className="text-slate-900 ml-1">{rows.length}</span></div>
      <div className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg border border-emerald-100 shadow-sm">Verified: <span className="ml-1">{verified}</span></div>
      <div className="bg-amber-50 text-amber-700 px-4 py-2 rounded-lg border border-amber-100 shadow-sm">Pending: <span className="ml-1">{pending}</span></div>
      {rejected > 0 && <div className="bg-rose-50 text-rose-700 px-4 py-2 rounded-lg border border-rose-100 shadow-sm">Rejected: <span className="ml-1">{rejected}</span></div>}
    </div>
  );
}

export function PrintableLogbook() {
  const user = React.useMemo(() => getCurrentUser(), []);
  const hideUhid = isDemoMode();
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const printStarted = React.useRef(false);

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
        academics: logsBundle.academicLogs || [],
        postings: Array.isArray(postings) ? postings : postings?.data || [],
        leaves: Array.isArray(leaves) ? leaves : leaves?.data || [],
        assessments: Array.isArray(assessments) ? assessments : assessments?.data || [],
        thesis: thesisRes.data || null,
        certifications: Array.isArray(certRes) ? certRes : [],
        appraisals: Array.isArray(appraisalsRes) ? appraisalsRes : appraisalsRes?.data || [],
      });

      if (!printStarted.current) {
        printStarted.current = true;
        window.addEventListener("afterprint", closePrintView, { once: true });
        setTimeout(() => window.print(), 600);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your complete logbook.");
    } finally {
      setLoading(false);
    }
  }, [user, closePrintView]);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 text-slate-500">
      <div className="w-10 h-10 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" />
      <p className="text-sm font-medium">Preparing your logbook PDF…</p>
    </div>
  );

  if (error) {
    return (
      <div className="p-12 text-center print:hidden" role="alert">
        <p className="text-lg font-semibold text-rose-700">Your logbook could not be printed</p>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <p className="mt-1 text-xs text-slate-500">Nothing was printed. Some sections could not be loaded.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={fetchAll} className="rounded-xl bg-teal-600 px-5 py-2 text-sm text-white font-semibold">Try again</button>
          <button onClick={closePrintView} className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm text-slate-700">Cancel</button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const regNumber = data?.profile?.registrationNumber ?? "—";
  const department = data?.profile?.department ?? "—";
  const joiningYear = data?.profile?.joiningYear ?? "—";

  return (
    <PrintErrorBoundary>
      <style>{`
        @media print {
          @page { size: A4; margin: 18mm 16mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .break-after-page { break-after: page; }
          .break-before-page { break-before: page; }
          .no-break { break-inside: avoid; }
        }
      `}</style>

      <CoverPage profile={data.profile} name={user?.name ?? "—"} />

      {/* Main document */}
      <div className="bg-white px-10 py-10 max-w-[900px] mx-auto text-slate-800" style={{ fontFamily: "system-ui, sans-serif" }}>

        {/* Running header on every printed page */}
        <div className="hidden print:flex items-center justify-between border-b border-slate-200 pb-2 mb-6 text-[9px] text-slate-400 font-medium uppercase tracking-wide">
          <span>Resident Training Record — {user?.name ?? ""}</span>
          <span>Department of {department} · {new Date().getFullYear()}</span>
        </div>

        {/* Document identity bar */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-10 pb-6 border-b border-slate-200">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-600 mb-1">Complete Training Record</p>
            <h1 className="text-2xl font-extrabold text-slate-900">{user?.name ?? "—"}</h1>
            <p className="text-sm text-slate-500 mt-0.5">Department of {department}</p>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-0.5">
            <p><span className="font-semibold text-slate-700">Reg. No:</span> {regNumber}</p>
            <p><span className="font-semibold text-slate-700">Batch:</span> {joiningYear}</p>
            <p><span className="font-semibold text-slate-700">Printed:</span> {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
          </div>
        </div>

        {/* ── 1. Postings ───────────────────────────────── */}
        <div className="mb-12 no-break">
          <SectionHeader number="01" title="Postings & Rotations" />
          {(() => { const rows = data.postings.filter((p: any) => p.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <>
              <table className="w-full border-collapse">
                <thead><tr>
                  <Th>Ward / Unit</Th><Th>Start</Th><Th>End</Th><Th>Supervisor</Th><Th>Status</Th>
                </tr></thead>
                <tbody>
                  {rows.map((p: any, i: number) => (
                    <tr key={p.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
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

        {/* ── 2. Case Logs ──────────────────────────────── */}
        <div className="mb-12 break-before-page">
          <SectionHeader number="02" title="Clinical Case Logs" />
          {(() => { const rows = data.cases.filter((c: any) => c.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <>
              <table className="w-full border-collapse">
                <thead><tr>
                  <Th>#</Th><Th>Date</Th>
                  {!hideUhid && <Th>Patient ID</Th>}
                  <Th>Age / Gender</Th><Th>Category</Th><Th>Diagnosis</Th><Th>Status</Th>
                </tr></thead>
                <tbody>
                  {rows.map((c: any, i: number) => (
                    <tr key={c.id} className={i % 2 === 0 ? "" : "bg-slate-50/50"}>
                      <Td muted>{rows.length - i}</Td>
                      <Td>{formatLogbookDate(c.date)}</Td>
                      {!hideUhid && <Td muted={!c.patientUhid}>{c.patientUhid || "—"}</Td>}
                      <Td>{[c.patientAge, c.patientGender].filter(Boolean).join(" / ") || "—"}</Td>
                      <Td>{c.category || "—"}</Td>
                      <Td><span className="font-medium">{c.diagnosisFinal || c.diagnosisProvisional || "—"}</span></Td>
                      <Td><StatusPill status={c.status ?? "pending"} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AggregateSummary rows={data.cases} label="Cases" />
            </>
          ); })()}
        </div>

        {/* ── 3. Procedure Logs ─────────────────────────── */}
        <div className="mb-12 break-before-page">
          <SectionHeader number="03" title="Procedure Logs" />
          {(() => { const rows = data.procs.filter((p: any) => p.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <>
              <table className="w-full border-collapse">
                <thead><tr>
                  <Th>#</Th><Th>Date</Th><Th>Procedure</Th><Th>Group</Th>
                  {!hideUhid && <Th>Patient ID</Th>}
                  <Th>Competency</Th><Th>Verified Level</Th><Th>Status</Th>
                </tr></thead>
                <tbody>
                  {rows.map((p: any, i: number) => (
                    <tr key={p.id} className={i % 2 === 0 ? "" : "bg-slate-50/50"}>
                      <Td muted>{rows.length - i}</Td>
                      <Td>{formatLogbookDate(p.date)}</Td>
                      <Td><span className="font-medium">{p.procedureName}</span></Td>
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
        </div>

        {/* ── 4. Academic Activities ────────────────────── */}
        <div className="mb-12 break-before-page">
          <SectionHeader number="04" title="Academic Activities" />
          {(() => { const rows = data.academics.filter((a: any) => a.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <>
              <table className="w-full border-collapse">
                <thead><tr>
                  <Th>#</Th><Th>Date</Th><Th>Activity</Th><Th>Topic / Title</Th><Th>Supervisor</Th><Th>Grade</Th><Th>Status</Th>
                </tr></thead>
                <tbody>
                  {rows.map((a: any, i: number) => (
                    <tr key={a.id} className={i % 2 === 0 ? "" : "bg-slate-50/50"}>
                      <Td muted>{rows.length - i}</Td>
                      <Td>{formatLogbookDate(a.date)}</Td>
                      <Td>{(a.activityType ?? a.type ?? "—").replace(/_/g, " ")}</Td>
                      <Td><span className="font-medium">{a.topic ?? "—"}</span></Td>
                      <Td muted={!a.supervisorName}>{a.supervisorName || "—"}</Td>
                      <Td muted={!a.facultyGrade}>{a.facultyGrade || "—"}</Td>
                      <Td><StatusPill status={a.status ?? "pending"} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AggregateSummary rows={data.academics} label="Academic Activities" />
            </>
          ); })()}
        </div>

        {/* ── 5. Assessments ───────────────────────────── */}
        <div className="mb-12 no-break">
          <SectionHeader number="05" title="Assessments" />
          {data.assessments.length === 0 ? <EmptySection /> : (
            <table className="w-full border-collapse">
              <thead><tr>
                <Th>Date</Th><Th>Exam Name</Th><Th>Type</Th><Th right>Marks</Th><Th>Assessed By</Th>
              </tr></thead>
              <tbody>
                {data.assessments.map((a: any, i: number) => (
                  <tr key={a.id} className={i % 2 === 0 ? "" : "bg-slate-50/50"}>
                    <Td>{formatLogbookDate(a.date)}</Td>
                    <Td><span className="font-medium">{a.examName}</span></Td>
                    <Td>{a.type}</Td>
                    <Td right><span className="font-bold">{a.marks}</span>{a.maximum ? <span className="text-slate-400"> / {a.maximum}</span> : ""}</Td>
                    <Td muted={!a.assessorName}>{a.assessorName || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── 6. Certifications ────────────────────────── */}
        <div className="mb-12 no-break">
          <SectionHeader number="06" title="Certifications" />
          {(() => { const rows = data.certifications.filter((c: any) => c.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <table className="w-full border-collapse">
              <thead><tr>
                <Th>Certificate</Th><Th>Issuing Body</Th><Th>Date Issued</Th><Th>Expiry</Th><Th>Status</Th>
              </tr></thead>
              <tbody>
                {rows.map((c: any, i: number) => (
                  <tr key={c.id} className={i % 2 === 0 ? "" : "bg-slate-50/50"}>
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
          <SectionHeader number="07" title="Leave Records" />
          {(() => { const rows = data.leaves.filter((l: any) => l.status !== "rejected"); return rows.length === 0 ? <EmptySection /> : (
            <table className="w-full border-collapse">
              <thead><tr>
                <Th>Type</Th><Th>From</Th><Th>To</Th><Th right>Days</Th><Th>Status</Th>
              </tr></thead>
              <tbody>
                {rows.map((l: any, i: number) => {
                  const days = l.startDate && l.endDate
                    ? Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1
                    : "—";
                  return (
                    <tr key={l.id} className={i % 2 === 0 ? "" : "bg-slate-50/50"}>
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
          <SectionHeader number="08" title="Thesis" />
          {!data.thesis ? <EmptySection /> : (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
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
                <div key={label} className={`flex gap-4 px-4 py-2.5 text-xs ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
                  <span className="w-48 shrink-0 font-semibold text-slate-500">{label}</span>
                  <span className="text-slate-800">{value || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 9. Quarterly Appraisals ────────────────────── */}
        <div className="mb-16 no-break">
          <SectionHeader number="09" title="Quarterly Appraisals" />
          {(() => { const rows = data.appraisals; return !rows || rows.length === 0 ? <EmptySection /> : (
            <div className="grid grid-cols-2 gap-4">
              {rows.map((appr: any, i: number) => (
                <div key={appr.id || i} className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm p-4 text-xs">
                  <div className="font-bold text-sm text-slate-800 mb-2 border-b border-slate-100 pb-2 flex justify-between items-center">
                    <span>Q{appr.quarter} {appr.year}</span>
                    <span className="text-[10px] font-normal text-slate-500 uppercase">{formatLogbookDate(appr.appraisalDate)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    <span className="text-slate-500">Patient Care:</span><span className="font-semibold text-slate-800 text-right">{appr.patientCareGrade || "—"}</span>
                    <span className="text-slate-500">Scholastic:</span><span className="font-semibold text-slate-800 text-right">{appr.scholasticGrade || "—"}</span>
                    <span className="text-slate-500">Prof. Attributes:</span><span className="font-semibold text-slate-800 text-right">{appr.professionalAttributesGrade || "—"}</span>
                  </div>
                  {appr.facultyRemarks && (
                    <div className="mt-3 pt-2 border-t border-slate-100 italic text-slate-600 text-[10px]">
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
             <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-50 text-teal-600 mb-4 shadow-sm border border-teal-100">
               <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
             </div>
             <h2 className="text-3xl font-bold text-slate-900">Final Verification</h2>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-sm text-slate-700 leading-loose space-y-5">
             <p>This is to certify that <strong>{user?.name ?? "the resident"}</strong> (Registration No: <strong>{regNumber}</strong>) has satisfactorily fulfilled all the mandatory requirements for the <strong>{localStorage.getItem("logbook_course") || data.profile?.course || "MD/MS Program"}</strong> training program in the Department of <strong>{department}</strong> at <strong>{localStorage.getItem("logbook_college") || "the institution"}</strong>.</p>
             <p>All clinical cases, procedures, and academic activities recorded in this logbook have been personally performed or attended by the resident. The entries have been periodically evaluated, verified, and authenticated by the respective unit supervisors and the Head of Department.</p>
             <p>The resident has demonstrated the necessary clinical competencies, professionalism, and ethical conduct required for the successful completion of the training period.</p>
          </div>
          
          {/* Signature block */}
          <div className="mt-32 grid grid-cols-3 gap-8 no-break">
            {["Resident Signature", "Guide / Supervisor", "HOD Signature & Stamp"].map((label) => (
              <div key={label} className="text-center">
                <div className="h-14 border-b border-slate-300 mb-2" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Print controls */}
        <div className="mt-10 flex justify-center gap-3 print:hidden">
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white">
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </button>
          <button onClick={closePrintView} className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm text-slate-700">
            <X className="h-4 w-4" /> Close
          </button>
        </div>
      </div>
    </PrintErrorBoundary>
  );
}
