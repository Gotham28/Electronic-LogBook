import * as React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { appraisalScoreBand, quarterlyAppraisalCategories, type QuarterlyAppraisal } from "@/lib/quarterly-appraisal";

export function QuarterlyAppraisalRecord({ appraisal }: { appraisal: QuarterlyAppraisal }) {
  const [printing, setPrinting] = React.useState(false);
  const scorePairs = quarterlyAppraisalCategories.map(({ key, label }) => ({ label, score: appraisal[key] }));
  const hasDetailedScores = scorePairs.every(({ score }) => typeof score === "number");

  React.useEffect(() => {
    if (!printing) return;
    const clearPrintState = () => {
      document.body.classList.remove("print-quarterly-appraisal");
      setPrinting(false);
    };
    document.body.classList.add("print-quarterly-appraisal");
    window.addEventListener("afterprint", clearPrintState);
    const timer = window.setTimeout(() => window.print(), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", clearPrintState);
      document.body.classList.remove("print-quarterly-appraisal");
    };
  }, [printing]);

  return (
    <Card className={`quarterly-appraisal-record border-line-soft bg-white ${printing ? "quarterly-appraisal-print-target" : ""}`}>
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-forest">Postgraduate Students Quarterly Appraisal Form</p>
            <h3 className="mt-1 text-lg font-bold text-ink">Quarter {appraisal.quarter}, {appraisal.year}</h3>
            <p className="mt-1 text-sm text-soft-ink">{appraisal.departmentName} · {appraisal.studentName}</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="print-hidden gap-2" onClick={() => setPrinting(true)}>
            <Printer className="h-4 w-4" aria-hidden="true" /> Print appraisal
          </Button>
        </div>

        <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-line-soft bg-mist p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-helper">PG student</dt><dd className="mt-0.5 font-semibold text-ink">{appraisal.studentName}</dd></div>
          <div><dt className="text-xs text-helper">Registration number</dt><dd className="mt-0.5 font-semibold text-ink">{appraisal.registrationNumber}</dd></div>
          <div><dt className="text-xs text-helper">Batch / year</dt><dd className="mt-0.5 font-semibold text-ink">{appraisal.batch}</dd></div>
          <div><dt className="text-xs text-helper">Date / month</dt><dd className="mt-0.5 font-semibold text-ink">{appraisal.appraisalDate || "—"}</dd></div>
          <div><dt className="text-xs text-helper">Publications</dt><dd className="mt-0.5 font-semibold text-ink">{appraisal.publications === null ? "—" : appraisal.publications ? "Yes" : "No"}</dd></div>
          <div><dt className="text-xs text-helper">Consultant / evaluator</dt><dd className="mt-0.5 font-semibold text-ink">{appraisal.evaluatorName}</dd></div>
        </dl>

        {hasDetailedScores ? (
          <div className="overflow-x-auto rounded-lg border border-line-soft">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <caption className="sr-only">Quarterly appraisal category scores</caption>
              <thead className="bg-mist text-xs uppercase tracking-wide text-soft-ink">
                <tr><th scope="col" className="px-4 py-3">Particulars</th><th scope="col" className="w-44 px-4 py-3">Score</th></tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {scorePairs.map(({ label, score }) => (
                  <tr key={label}>
                    <th scope="row" className="px-4 py-3 font-medium text-ink">{label}</th>
                    <td className="px-4 py-3 font-semibold text-ink">{score} <span className="font-normal text-soft-ink">· {appraisalScoreBand(score!)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-line-soft p-4">
            <h4 className="text-sm font-semibold text-ink">Earlier appraisal grades</h4>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-helper">Scholastic</dt><dd className="mt-1 font-medium">{appraisal.scholasticGrade || "—"}</dd></div>
              <div><dt className="text-xs text-helper">Patient care</dt><dd className="mt-1 font-medium">{appraisal.patientCareGrade || "—"}</dd></div>
              <div><dt className="text-xs text-helper">Professional attributes</dt><dd className="mt-1 font-medium">{appraisal.professionalAttributesGrade || "—"}</dd></div>
            </dl>
            {appraisal.facultyRemarks && <p className="mt-3 text-sm text-ink">{appraisal.facultyRemarks}</p>}
          </div>
        )}

        {appraisal.facultyRemarks && (
          <section className="rounded-lg border border-line-soft bg-mist p-4">
            <h4 className="text-sm font-semibold text-ink">Faculty remarks</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{appraisal.facultyRemarks}</p>
          </section>
        )}

        {appraisal.remediationSuggestions && (
          <section className="rounded-lg border border-status-border bg-status p-4">
            <h4 className="text-sm font-semibold text-ink">Remarks / remediation suggestions</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{appraisal.remediationSuggestions}</p>
          </section>
        )}

        <div className="grid gap-8 pt-3 text-xs font-semibold uppercase tracking-wide text-soft-ink sm:grid-cols-3">
          {["Signature of assessee", "Signature of consultant", "Signature of HOD"].map((label) => (
            <div key={label} className="border-t border-input pt-2">{label}</div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
