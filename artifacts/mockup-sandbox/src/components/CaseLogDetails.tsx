import * as React from "react";
import { formatLogbookDate } from "@/lib/logbook-config";

export type CaseLogDetailRecord = {
  date: string;
  attemptNumber?: number | null;
  patientUhid?: string | null;
  patientAge: string;
  patientGender: string;
  category?: string | null;
  chiefComplaints?: string | null;
  history?: string | null;
  examination?: string | null;
  investigations?: string | null;
  diagnosisProvisional?: string | null;
  differentialDiagnosis?: string | null;
  diagnosisFinal: string;
  managementPlan?: string | null;
  outcome?: string | null;
  learningPoints?: string | null;
  status?: string | null;
  facultyRemarks?: string | null;
  facultyGrade?: string | null;
  reviewedAt?: string | Date | null;
};

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
        {value === null || value === undefined || value === "" ? <span className="text-slate-400">Not recorded</span> : value}
      </dd>
    </div>
  );
}

export function CaseLogDetails({ caseLog, hideUhid = false, showReview = false }: {
  caseLog: CaseLogDetailRecord;
  hideUhid?: boolean;
  showReview?: boolean;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <section aria-labelledby="case-context-heading">
        <h4 id="case-context-heading" className="mb-3 text-xs font-bold uppercase tracking-wide text-teal-800">Case and patient context</h4>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="Date" value={formatLogbookDate(caseLog.date)} />
          <DetailField label="Attempt" value={caseLog.attemptNumber ?? 1} />
          <DetailField label="Category" value={caseLog.category} />
          <DetailField label="Patient age" value={caseLog.patientAge} />
          <DetailField label="Patient gender" value={caseLog.patientGender} />
          {!hideUhid && <DetailField label="UHID" value={caseLog.patientUhid} />}
        </dl>
      </section>
      <section aria-labelledby="case-clinical-heading">
        <h4 id="case-clinical-heading" className="mb-3 text-xs font-bold uppercase tracking-wide text-teal-800">Clinical details</h4>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DetailField label="Chief complaints" value={caseLog.chiefComplaints} />
          <DetailField label="History" value={caseLog.history} />
          <DetailField label="Examination" value={caseLog.examination} />
          <DetailField label="Investigations" value={caseLog.investigations} />
          <DetailField label="Provisional diagnosis" value={caseLog.diagnosisProvisional} />
          <DetailField label="Differential diagnosis" value={caseLog.differentialDiagnosis} />
          <DetailField label="Final diagnosis" value={caseLog.diagnosisFinal} />
          <DetailField label="Management plan" value={caseLog.managementPlan} />
          <DetailField label="Outcome" value={caseLog.outcome} />
          <DetailField label="Learning points" value={caseLog.learningPoints} />
        </dl>
      </section>
      {showReview && (caseLog.status !== "pending" || caseLog.facultyRemarks || caseLog.facultyGrade || caseLog.reviewedAt) && (
        <section aria-labelledby="case-review-heading" className="border-t border-slate-100 pt-4">
          <h4 id="case-review-heading" className="mb-3 text-xs font-bold uppercase tracking-wide text-teal-800">Faculty review</h4>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailField label="Status" value={caseLog.status} />
            <DetailField label="Faculty grade" value={caseLog.facultyGrade} />
            <DetailField label="Faculty remarks" value={caseLog.facultyRemarks} />
            <DetailField label="Reviewed at" value={caseLog.reviewedAt ? new Date(caseLog.reviewedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : null} />
          </dl>
        </section>
      )}
    </div>
  );
}
