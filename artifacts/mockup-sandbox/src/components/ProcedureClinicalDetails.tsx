export function ProcedureClinicalDetails({ entry }: { entry: {
  patientAge?: string | null; patientUhid?: string | null; sex?: string | null;
  diagnosis?: string | null; setting?: string | null; competencyLevel?: string | null;
} }) {
  const fields = [
    ["Age", entry.patientAge], ["Sex", entry.sex],
    ["De-identified patient ID (IP/OP number)", entry.patientUhid],
    ["Diagnosis or indication", entry.diagnosis], ["Setting", entry.setting],
    ["Role level", entry.competencyLevel],
  ];
  return <dl className="mt-3 grid min-w-0 gap-3 text-xs sm:grid-cols-2">
    {fields.map(([label, value]) => <div key={label} className="min-w-0">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words font-normal text-slate-800">{value && value !== "N/A" ? value : "Not recorded"}</dd>
    </div>)}
  </dl>;
}
