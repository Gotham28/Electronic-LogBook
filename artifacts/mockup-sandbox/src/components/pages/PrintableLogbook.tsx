import * as React from "react";
import { getCurrentUser } from "@/lib/session";
import { apiGet } from "@/lib/apiClient";
import { formatLogbookDate } from "@/lib/logbook-config";
import { Printer, X } from "lucide-react";

export function PrintableLogbook() {
  const user = React.useMemo(() => getCurrentUser(), []);
  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const printStarted = React.useRef(false);

  const closePrintView = React.useCallback(() => {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    if (window.history.length > 1) window.history.back();
    else window.location.assign("/");
  }, []);

  React.useEffect(() => {
    if (!user?.studentProfileId) return;

    const fetchAll = async () => {
      try {
        const id = user.studentProfileId;

        // Step 1 fix: /logs returns caseLogs, procedureLogs, academicLogs + profile in ONE call.
        // Removed the broken /procedures and /academics calls entirely.
        const [logsBundle, postings, leaves, assessments, thesisRes] = await Promise.all([
          apiGet(`/api/students/${id}/logs`).catch(() => ({
            profile: null, caseLogs: [], procedureLogs: [], academicLogs: []
          })),
          apiGet(`/api/students/${id}/postings`).catch(() => ({ data: [] })),
          apiGet(`/api/students/${id}/leave-records`).catch(() => []),
          apiGet(`/api/students/${id}/assessments`).catch(() => []),
          apiGet(`/api/students/${id}/thesis`).catch(() => ({ data: null })),
        ]);

        setData({
          profile: logsBundle.profile || null,
          cases: logsBundle.caseLogs || [],
          procs: logsBundle.procedureLogs || [],
          academics: logsBundle.academicLogs || [],
          postings: postings.data || [],
          leaves: Array.isArray(leaves) ? leaves : leaves?.data || [],
          assessments: Array.isArray(assessments) ? assessments : assessments?.data || [],
          thesis: thesisRes.data || null,
        });
      } catch (err) {
        console.error("Failed to load consolidated print data", err);
      } finally {
        setLoading(false);
        if (!printStarted.current) {
          printStarted.current = true;
          window.addEventListener("afterprint", closePrintView, { once: true });
          setTimeout(() => window.print(), 500);
        }
      }
    };

    fetchAll();
  }, [user, closePrintView]);

  if (loading) return <div className="p-12 text-center text-slate-500">Preparing consolidated PDF...</div>;

  // Step 3 fix: joiningYear comes from profile in /logs response — no hardcoding
  const joiningYear = data?.profile?.joiningYear ?? "—";
  const department = data?.profile?.department ?? "—";
  const regNumber = data?.profile?.registrationNumber ?? "—";

  return (
    <div className="bg-white p-8 font-serif text-black max-w-[1000px] mx-auto">
      <div className="mb-12 border-b-2 border-black pb-4 text-center">
        <h1 className="text-3xl font-bold uppercase tracking-wider">Department of {department}</h1>
        <h2 className="mt-2 text-xl">Resident Logbook - Complete Record</h2>
        <p className="mt-4 text-sm">
          Resident: <span className="font-bold">{user?.name}</span> &nbsp;|&nbsp;
          Reg. No: <span className="font-bold">{regNumber}</span> &nbsp;|&nbsp;
          Batch: <span className="font-bold">{joiningYear}</span>
        </p>
        <p className="mt-1 text-xs text-gray-500">Printed: {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
      </div>

      <Section title="1. Postings & Rotations">
        {data.postings.length === 0 ? <p>No postings recorded.</p> : (
          <table className="w-full text-left border-collapse">
            <thead><tr className="border-b border-black"><th className="py-2">Ward/Unit</th><th>Start Date</th><th>End Date</th><th>Supervisor</th></tr></thead>
            <tbody>
              {data.postings.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-300">
                  <td className="py-2">{p.ward}</td>
                  <td>{formatLogbookDate(p.startDate)}</td>
                  <td>{formatLogbookDate(p.endDate)}</td>
                  <td>{p.supervisorName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="2. Case Logs">
        {data.cases.length === 0 ? <p>No cases recorded.</p> : (
          <table className="w-full text-left border-collapse text-sm">
            <thead><tr className="border-b border-black"><th className="py-2">Date</th><th>UHID / Age</th><th>Chief Complaint</th><th>Final Diagnosis</th><th>Status</th></tr></thead>
            <tbody>
              {data.cases.map((c: any) => (
                <tr key={c.id} className="border-b border-gray-300">
                  <td className="py-2 whitespace-nowrap">{formatLogbookDate(c.date)}</td>
                  <td>{[c.patientUhid, c.patientAge, c.patientGender].filter(Boolean).join(" / ")}</td>
                  <td>{c.chiefComplaints ?? "—"}</td>
                  <td>{c.diagnosisFinal || c.diagnosisProvisional || "—"}</td>
                  <td className="capitalize">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Step 2 fix: use competencyLevel not p.role */}
      <Section title="3. Procedure Logs">
        {data.procs.length === 0 ? <p>No procedures recorded.</p> : (
          <table className="w-full text-left border-collapse text-sm">
            <thead><tr className="border-b border-black"><th className="py-2">Date</th><th>Procedure</th><th>Group</th><th>Competency Level</th><th>Status</th></tr></thead>
            <tbody>
              {data.procs.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-300">
                  <td className="py-2 whitespace-nowrap">{formatLogbookDate(p.date)}</td>
                  <td>{p.procedureName}</td>
                  <td className="capitalize">{p.procedureGroup ?? "—"}</td>
                  <td className="capitalize">{p.competencyLevel ?? "—"}</td>
                  <td className="capitalize">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="4. Academic Activities">
        {data.academics.length === 0 ? <p>No academic activities recorded.</p> : (
          <table className="w-full text-left border-collapse text-sm">
            <thead><tr className="border-b border-black"><th className="py-2">Date</th><th>Activity Type</th><th>Topic</th><th>Supervisor</th><th>Status</th></tr></thead>
            <tbody>
              {data.academics.map((a: any) => (
                <tr key={a.id} className="border-b border-gray-300">
                  <td className="py-2 whitespace-nowrap">{formatLogbookDate(a.date)}</td>
                  <td className="capitalize">{(a.activityType ?? a.type ?? "—").replace(/_/g, " ")}</td>
                  <td>{a.topic ?? "—"}</td>
                  <td>{a.supervisorName ?? "—"}</td>
                  <td className="capitalize">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="5. Assessments">
        {data.assessments.length === 0 ? <p>No assessments recorded.</p> : (
          <table className="w-full text-left border-collapse text-sm">
            <thead><tr className="border-b border-black"><th className="py-2">Date</th><th>Exam</th><th>Type</th><th>Marks</th><th>Assessed By</th></tr></thead>
            <tbody>
              {data.assessments.map((a: any) => (
                <tr key={a.id} className="border-b border-gray-300">
                  <td className="py-2 whitespace-nowrap">{formatLogbookDate(a.date)}</td>
                  <td>{a.examName}</td>
                  <td className="capitalize">{a.type}</td>
                  <td>{a.marks}{a.maximum ? ` / ${a.maximum}` : ""}</td>
                  <td>{a.assessorName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Step 4 fix: Leave Records was fetched but never rendered */}
      <Section title="6. Leave Records">
        {data.leaves.length === 0 ? <p>No leave records.</p> : (
          <table className="w-full text-left border-collapse text-sm">
            <thead><tr className="border-b border-black"><th className="py-2">Type</th><th>From</th><th>To</th><th>Days</th><th>Reason</th><th>Status</th></tr></thead>
            <tbody>
              {data.leaves.map((l: any) => {
                const days = l.startDate && l.endDate
                  ? Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
                  : "—";
                return (
                  <tr key={l.id} className="border-b border-gray-300">
                    <td className="py-2 capitalize">{l.leaveType}</td>
                    <td>{formatLogbookDate(l.startDate)}</td>
                    <td>{formatLogbookDate(l.endDate)}</td>
                    <td>{days}</td>
                    <td>{l.reason ?? "—"}</td>
                    <td className="capitalize">{l.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      {/* Step 5 fix: Thesis from DB (researchTable fields: thesisTitle, protocolStatus, midTermStatus, finalSubmissionStatus, publicationProofUrl) */}
      <Section title="7. Thesis & Certifications">
        {!data.thesis ? (
          <p>No thesis record on file.</p>
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <tbody>
              <tr className="border-b border-gray-200"><td className="py-2 font-semibold w-48">Thesis Title</td><td>{data.thesis.thesisTitle}</td></tr>
              <tr className="border-b border-gray-200"><td className="py-2 font-semibold">Protocol Status</td><td className="capitalize">{data.thesis.protocolStatus}</td></tr>
              <tr className="border-b border-gray-200"><td className="py-2 font-semibold">Mid-Term Status</td><td className="capitalize">{data.thesis.midTermStatus}</td></tr>
              <tr className="border-b border-gray-200"><td className="py-2 font-semibold">Final Submission Status</td><td className="capitalize">{data.thesis.finalSubmissionStatus}</td></tr>
              {data.thesis.publicationProofUrl && (
                <tr className="border-b border-gray-200"><td className="py-2 font-semibold">Publication Proof</td><td>{data.thesis.publicationProofUrl}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Section>

      <div className="mt-20 flex justify-between">
        <div className="text-center">
          <div className="w-48 border-t border-black pt-2">Resident Signature</div>
        </div>
        <div className="text-center">
          <div className="w-48 border-t border-black pt-2">HOD Signature & Stamp</div>
        </div>
      </div>

      <div className="mt-8 flex justify-center gap-3 print:hidden">
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded bg-teal-600 px-4 py-2 text-white">
          <Printer className="h-4 w-4" /> Print again
        </button>
        <button onClick={closePrintView} className="flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-slate-700">
          <X className="h-4 w-4" /> Cancel
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10 page-break-inside-avoid">
      <h3 className="mb-4 text-lg font-bold border-b-2 border-slate-200 pb-1">{title}</h3>
      {children}
    </div>
  );
}
