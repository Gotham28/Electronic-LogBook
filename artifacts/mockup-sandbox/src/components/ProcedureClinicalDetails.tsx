import { isBuiltInProcedureField, type ProcedureFieldDefinition } from "@/lib/procedure-log-fields";

type ClinicalEntry = {
  patientAge?: string | null;
  patientUhid?: string | null;
  sex?: string | null;
  diagnosis?: string | null;
  setting?: string | null;
  competencyLevel?: string | null;
  declaredCompetency?: string | null;
  customFields?: Record<string, string> | null;
};

function readFieldValue(entry: ClinicalEntry, id: string): string | null | undefined {
  if (isBuiltInProcedureField(id)) {
    if (id === "competencyLevel") return entry.competencyLevel ?? entry.declaredCompetency;
    return entry[id];
  }
  return entry.customFields?.[id];
}

export function ProcedureClinicalDetails({
  entry,
  fields,
}: {
  entry: ClinicalEntry;
  fields?: ProcedureFieldDefinition[];
}) {
  const items = fields !== undefined
    ? fields.map((field) => [field.id, field.label, readFieldValue(entry, field.id)] as const)
    : [
      ["patientAge", "Age", entry.patientAge],
      ["sex", "Sex", entry.sex],
      ["patientUhid", "De-identified patient ID (IP/OP number)", entry.patientUhid],
      ["diagnosis", "Diagnosis or indication", entry.diagnosis],
      ["setting", "Setting", entry.setting],
      ["competencyLevel", "Role level", entry.competencyLevel ?? entry.declaredCompetency],
    ] as const;

  if (items.length === 0) return null;

  return <dl className="mt-3 grid min-w-0 gap-3 text-xs sm:grid-cols-2">
    {items.map(([id, label, value]) => <div key={id} className="min-w-0">
      <dt className="font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap break-words font-normal text-slate-800">{value && value !== "N/A" ? value : "Not recorded"}</dd>
    </div>)}
  </dl>;
}
