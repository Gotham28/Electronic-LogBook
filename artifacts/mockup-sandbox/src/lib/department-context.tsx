import * as React from "react";
import { apiGet } from "./apiClient";
import { clearSession } from "./session";
import { Button } from "@/components/ui/button";

export type DepartmentConfig = {
  requiredCases: number; requiredProcedures: number; requiredAcademic: number;
  programDurationMonths: number | null; casualLeaveAllowance: number | null; academicLeaveAllowance: number | null;
};
export type CatalogItem = { id: number; name: string; value: string; required: number; period: "total" | "month" };
export type DepartmentData = {
  department: { id: number; name: string; code: string };
  hod: { id: number; name: string } | null;
  config: DepartmentConfig | null;
  procedures: Array<{ id: number; name: string; group: string; required: number }>;
  postings: CatalogItem[]; academics: CatalogItem[];
};
const DepartmentContext = React.createContext<(DepartmentData & { refresh: () => Promise<void> }) | null>(null);

export function DepartmentProvider({ departmentId, children }: { departmentId: number | null; children: React.ReactNode }) {
  const [data, setData] = React.useState<DepartmentData | null>(null);
  const [error, setError] = React.useState("");
  const refresh = React.useCallback(async () => {
    if (!departmentId) { setError("Your account has no department. Contact the database administrator."); return; }
    try {
      const result = await apiGet<DepartmentData>(`/api/departments/${departmentId}/catalog`);
      setData(result); setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load your department"); }
  }, [departmentId]);
  React.useEffect(() => { setData(null); void refresh(); }, [refresh]);
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
