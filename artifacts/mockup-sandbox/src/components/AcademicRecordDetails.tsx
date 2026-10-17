import { academicRecordText } from "@/lib/academic-logbook";
import { useDepartment } from "@/lib/department-context";

/** One readable representation for resident, faculty/HOD review and printing. */
export function AcademicRecordDetails({ activityType, description, presentationType }: {
  activityType: string;
  description?: string | null;
  presentationType?: string | null;
}) {
  const { academicLogbook } = useDepartment();
  const section = academicLogbook?.sections.find((item) => item.value === activityType);
  const text = academicRecordText(description, section);
  if (!text && !presentationType) return null;
  return <div className="mt-2 space-y-1 text-xs font-normal text-slate-700">
    {presentationType && presentationType !== "—" && <p>Participation / format: {presentationType}</p>}
    {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
  </div>;
}
