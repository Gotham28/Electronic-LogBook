import * as React from "react";
import { apiGet } from "./apiClient";
import { clearSession } from "./session";
import { isDemoMode } from "./session";
import { Button } from "@/components/ui/button";
import type { AcademicLogbookProfile } from "./academic-logbook";

export type DepartmentConfig = {
  requiredCases: number | null; requiredProcedures: number | null; requiredAcademic: number | null;
  enabledFeatures: Record<string, boolean>;
};
export type CatalogItem = { id: number; name: string; value: string; required: number; period: "total" | "month"; parentValue?: string | null };
export type PostingScheduleRow = { trainingYear: number; postingValue: string; months: number };
export type DepartmentData = {
  department: { id: number; name: string; code: string };
  hod: { id: number; name: string } | null;
  config: DepartmentConfig | null;
  procedures: Array<{ id: number; name: string; group: string; required: number }>;
  postings: CatalogItem[]; academics: CatalogItem[]; caseCategories: CatalogItem[]; competencyLevels: CatalogItem[]; leaveTypes: CatalogItem[]; conferenceLevels: CatalogItem[];
  clinicalWorkCategories: CatalogItem[]; clinicalWorkSubtypes: CatalogItem[]; postingSchedule: PostingScheduleRow[];
  academicLogbook?: AcademicLogbookProfile | null;
};
const DepartmentContext = React.createContext<(DepartmentData & { refresh: () => Promise<void> }) | null>(null);

export function DepartmentProvider({ departmentId, children }: { departmentId: number | null; children: React.ReactNode }) {
  const [data, setData] = React.useState<DepartmentData | null>(null);
  const [error, setError] = React.useState("");
  const refresh = React.useCallback(async () => {
    if (!departmentId) { setError("Your account has no department. Contact the database administrator."); return; }
    try {
      const result = await apiGet<DepartmentData>(`/api/departments/${departmentId}/catalog`);
      if (result.department && /microbiology/i.test(result.department.name)) {
        result.department.name = result.department.name.replace(/microbiology/i, "Microbiology");
      }
      const isMicro = result.department?.code?.toLowerCase() === "microbiology" || result.department?.name?.toLowerCase().includes("microbiology");
      const enabledFeatures = { ...(result.config?.enabledFeatures || {}) };
      if (isMicro) {
        if (enabledFeatures.microbiologyCaseFields === undefined) enabledFeatures.microbiologyCaseFields = true;
        if (enabledFeatures.freeTextProcedures === undefined) enabledFeatures.freeTextProcedures = true;
        if (enabledFeatures.hideProcedureAge === undefined) enabledFeatures.hideProcedureAge = true;
        if (enabledFeatures.procedureExperience === undefined) enabledFeatures.procedureExperience = false;
        if (enabledFeatures.useThesisAndMandatoryCertificationsLabel === undefined) enabledFeatures.useThesisAndMandatoryCertificationsLabel = true;
        if (enabledFeatures.attendedConferences === undefined) enabledFeatures.attendedConferences = true;
        if (enabledFeatures.hideLeaveRecords === undefined) enabledFeatures.hideLeaveRecords = true;
        if (enabledFeatures.dailyAttendance === undefined) enabledFeatures.dailyAttendance = true;
        if (enabledFeatures.yearlyAttendance === undefined) enabledFeatures.yearlyAttendance = true;
        if (enabledFeatures.conferenceLevels === undefined) enabledFeatures.conferenceLevels = true;
      }
      const resolvedConfig: DepartmentConfig | null = result.config ? {
        ...result.config,
        enabledFeatures,
      } : isMicro ? {
        requiredCases: null,
        requiredProcedures: null,
        requiredAcademic: null,
        enabledFeatures,
      } : null;

      const academics = isMicro ? [
        { id: 1, name: "Journal club", value: "journal_club", required: 0, period: "total" as const },
        { id: 2, name: "UG teaching", value: "ug_teaching", required: 0, period: "total" as const },
        { id: 3, name: "Seminars", value: "seminars", required: 0, period: "total" as const },
      ] : ((result.academics && result.academics.length > 0) ? result.academics : []);

      setData({
        ...result,
        config: resolvedConfig,
        postings: result.postings || [],
        academics,
        caseCategories: result.caseCategories || [],
        competencyLevels: result.competencyLevels || [],
        leaveTypes: result.leaveTypes || [],
        conferenceLevels: isMicro ? [
          { id: 1, name: "National", value: "national", required: 0, period: "total" as const },
          { id: 2, name: "State", value: "state", required: 0, period: "total" as const },
        ] : (result.conferenceLevels || []),
        clinicalWorkCategories: result.clinicalWorkCategories || [],
        clinicalWorkSubtypes: result.clinicalWorkSubtypes || [],
        postingSchedule: result.postingSchedule || [],
        procedures: result.procedures || []
      });
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load your department"); }
  }, [departmentId]);
  React.useEffect(() => {
    if (!isDemoMode()) setData(null);
    void refresh();
  }, [refresh]);
  if (!data) return <div className="mx-auto max-w-lg space-y-4 p-10" role="status">
    <p>{error || "Loading your department…"}</p>
    {error && <><Button onClick={refresh}>Try again</Button><Button variant="outline" onClick={() => { clearSession(); window.location.assign("/"); }}>Return to sign in</Button></>}
  </div>;
  return <DepartmentContext.Provider value={{ ...data, refresh }}>
    {error && <p role="alert" className="bg-rose-50 p-3 text-rose-700">{error}</p>}{children}
  </DepartmentContext.Provider>;
}

export function useDepartment() {
  const value = React.useContext(DepartmentContext);
  if (!value) throw new Error("Department data is not ready");
  return value;
}
