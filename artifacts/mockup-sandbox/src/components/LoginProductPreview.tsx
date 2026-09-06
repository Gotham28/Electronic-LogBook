import * as React from "react";
import { Building2, BookOpenCheck } from "lucide-react";
import { apiGet } from "@/lib/apiClient";

export function LoginProductPreview() {
  const [departments, setDepartments] = React.useState<Array<{ id: number; name: string }>>([]);
  const [error, setError] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    apiGet<Array<{ id: number; name: string }>>("/api/departments")
      .then(setDepartments).catch(() => setError(true)).finally(() => setLoading(false));
  }, []);
  return <div className="mt-8 rounded-[22px] border border-white/25 bg-white/10 p-6 shadow-lg">
    <BookOpenCheck className="h-7 w-7 text-teal-100" />
    <h2 className="mt-4 text-xl font-semibold">One logbook. Your department.</h2>
    <p className="mt-3 text-sm leading-6 text-teal-50/85">Record clinical training, complete faculty assignments, and follow your department's requirements.</p>
    <div className="mt-6 border-t border-white/20 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-teal-100">Available departments</p>
      {loading ? <p className="mt-3 text-sm" role="status">Loading departments…</p> : error ? <p className="mt-3 text-sm">Department directory is temporarily unavailable.</p> :
        departments.length ? <div className="mt-3 flex flex-wrap gap-2">{departments.map((department) => <span key={department.id} className="flex items-center gap-2 rounded-full border border-white/20 px-3 py-2 text-xs"><Building2 className="h-3 w-3" />{department.name}</span>)}</div> :
        <p className="mt-3 text-sm">Departments will appear once their HOD accounts are configured.</p>}
    </div>
  </div>;
}
