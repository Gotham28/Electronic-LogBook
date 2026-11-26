import * as React from "react";
import { apiGet } from "./apiClient";
import { clearSession } from "./session";
import { isDemoMode } from "./session";
import { Button } from "@/components/ui/button";
import type { AcademicLogbookProfile } from "./academic-logbook";
import { resolveProcedureFieldDefinitions, type ProcedureFieldDefinition } from "./procedure-log-fields";
import { resolveDepartmentLabel, type DepartmentLabelKey } from "../../../../lib/api-zod/src/department-labels";

// The label registry is shared with the API. Re-exported so screens import it from one place.
export {
  DEPARTMENT_LABELS, DEPARTMENT_LABEL_GROUPS, DEPARTMENT_LABEL_MAX_LENGTH, defaultDepartmentLabel, resolveDepartmentLabel,
  type DepartmentLabelKey,
} from "../../../../lib/api-zod/src/department-labels";

export type DepartmentConfig = {
  requiredCases: number | null; requiredProcedures: number | null; requiredAcademic: number | null;
  enabledFeatures: Record<string, boolean>;
  procedureLogFields?: ProcedureFieldDefinition[] | null;
};
export type CatalogItem = { id: number; name: string; value: string; required: number; period: "total" | "month"; parentValue?: string | null };
export type PostingScheduleRow = { trainingYear: number; postingValue: string; months: number };
export type DepartmentData = {
  department: { id: number; name: string; code: string };
  hod: { id: number; name: string } | null;
  config: DepartmentConfig | null;
  procedures: Array<{ id: number; name: string; group: string; required: number; requiredLogFields?: string[] }>;
  procedureFields?: ProcedureFieldDefinition[];
  readOnlyConfig?: boolean;
  postings: CatalogItem[]; academics: CatalogItem[]; caseCategories: CatalogItem[]; competencyLevels: CatalogItem[]; leaveTypes: CatalogItem[]; conferenceLevels: CatalogItem[];
  clinicalWorkCategories: CatalogItem[]; clinicalWorkSubtypes: CatalogItem[]; postingSchedule: PostingScheduleRow[];
  academicLogbook?: AcademicLogbookProfile | null;
  // Overrides only. Use label(key) / useLabel(key), which apply the registry default.
  labels?: Record<string, string>;
};
// refresh() never throws: it resolves true when the catalog loaded, false when it could not (the error is also shown by the provider).
type DepartmentContextValue = DepartmentData & { refresh: () => Promise<boolean>; label: (key: DepartmentLabelKey) => string };
const DepartmentContext = React.createContext<DepartmentContextValue | null>(null);

export function DepartmentProvider({ departmentId, children }: { departmentId: number | null; children: React.ReactNode }) {
  const [data, setData] = React.useState<DepartmentData | null>(null);
  const [error, setError] = React.useState("");
  const refresh = React.useCallback(async (): Promise<boolean> => {
    if (!departmentId) { setError("Your account has no department. Contact the database administrator."); return false; }
    try {
      const result = await apiGet<DepartmentData>(`/api/departments/${departmentId}/catalog`);
      // The stored configuration is the only source of behaviour. Nothing here reads the department's name or code.
      const resolvedConfig: DepartmentConfig | null = result.config ? {
        ...result.config,
        enabledFeatures: { ...(result.config.enabledFeatures || {}) },
      } : null;

      const academics = (result.academics && result.academics.length > 0) ? result.academics : [];

      setData({
        ...result,
        config: resolvedConfig,
        postings: result.postings || [],
        academics,
        caseCategories: result.caseCategories || [],
        competencyLevels: result.competencyLevels || [],
        leaveTypes: result.leaveTypes || [],
        conferenceLevels: result.conferenceLevels || [],
        clinicalWorkCategories: result.clinicalWorkCategories || [],
        clinicalWorkSubtypes: result.clinicalWorkSubtypes || [],
        postingSchedule: result.postingSchedule || [],
        procedures: result.procedures || [],
        procedureFields: result.procedureFields !== undefined
          ? result.procedureFields
          : resolveProcedureFieldDefinitions(resolvedConfig?.procedureLogFields, Boolean(resolvedConfig?.enabledFeatures?.dynamicProcedureFields)),
        readOnlyConfig: Boolean(result.readOnlyConfig),
        labels: result.labels ?? {},
      });
      setError("");
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load your department"); return false; }
  }, [departmentId]);
  React.useEffect(() => {
    if (!isDemoMode()) setData(null);
    void refresh();
  }, [refresh]);
  const labels = data?.labels;
  const mandatoryCertifications = Boolean(data?.config?.enabledFeatures?.useThesisAndMandatoryCertificationsLabel);
  // An override if one exists, else the default (which follows the existing wording flag).
  const label = React.useCallback((key: DepartmentLabelKey) => resolveDepartmentLabel(key, labels,
    { useThesisAndMandatoryCertificationsLabel: mandatoryCertifications }), [labels, mandatoryCertifications]);
  if (!data) return <div className="mx-auto max-w-lg space-y-4 p-10" role="status">
    <p>{error || "Loading your department…"}</p>
    {error && <><Button onClick={refresh}>Try again</Button><Button variant="outline" onClick={() => { clearSession(); window.location.assign("/"); }}>Return to sign in</Button></>}
  </div>;
  return <DepartmentContext.Provider value={{ ...data, refresh, label }}>
    {error && <p role="alert" className="bg-status p-3 text-status-foreground">{error}</p>}{children}
  </DepartmentContext.Provider>;
}

export function useDepartment() {
  const value = React.useContext(DepartmentContext);
  if (!value) throw new Error("Department data is not ready");
  return value;
}

export function useLabel(key: DepartmentLabelKey): string {
  return useDepartment().label(key);
}
