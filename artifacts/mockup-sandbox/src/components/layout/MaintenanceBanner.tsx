import React from "react";
import { AlertTriangle, X } from "lucide-react";

export function MaintenanceBanner({ announcements }: { announcements: any[] }) {
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const d = new Set<string>();
    announcements.forEach(a => {
      const key = `maintenance_dismissed_${a.id}_${a.updatedAt}`;
      if (localStorage.getItem(key)) d.add(a.id);
    });
    setDismissed(d);
  }, [announcements]);

  const handleDismiss = (a: any) => {
    const key = `maintenance_dismissed_${a.id}_${a.updatedAt}`;
    localStorage.setItem(key, "1");
    setDismissed(prev => new Set(prev).add(a.id));
  };

  const visible = announcements.filter(a => !dismissed.has(a.id) && (a.status === "scheduled" || a.status === "active"));
  if (visible.length === 0) return null;

  return (
    <div className="mb-6 space-y-4 print-hidden">
      {visible.map(a => {
        const startIST = new Date(a.startAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
        const endIST = new Date(a.endAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
        const isUpcoming = a.status === "scheduled";
        
        return (
          <div key={a.id} className={`relative flex items-start gap-4 rounded-[20px] border p-4 shadow-sm md:items-center md:p-5 ${isUpcoming ? 'border-amber-200 bg-amber-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
            <div className={`rounded-xl p-2.5 ${isUpcoming ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <h3 className={`text-sm font-semibold ${isUpcoming ? 'text-amber-900' : 'text-rose-900'}`}>{a.title}</h3>
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${isUpcoming ? 'bg-amber-200/50 text-amber-800' : 'bg-rose-200/50 text-rose-800 animate-pulse'}`}>
                  {isUpcoming ? 'Upcoming' : 'Active'}
                </span>
              </div>
              <p className={`text-sm leading-relaxed ${isUpcoming ? 'text-amber-800/80' : 'text-rose-800/80'}`}>
                {isUpcoming 
                  ? `Scheduled maintenance on ${startIST} – ${endIST}. The site will remain accessible.`
                  : `Maintenance in progress until ${endIST}. You can continue using the site.`}
              </p>
              {a.description && <p className={`text-xs mt-1 ${isUpcoming ? 'text-amber-800/70' : 'text-rose-800/70'}`}>{a.description}</p>}
            </div>
            <button
              onClick={() => handleDismiss(a)}
              className={`absolute right-2 top-2 rounded-lg p-2 transition-colors md:static ${isUpcoming ? 'text-amber-500 hover:bg-amber-100 hover:text-amber-700' : 'text-rose-500 hover:bg-rose-100 hover:text-rose-700'}`}
              aria-label="Dismiss banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
