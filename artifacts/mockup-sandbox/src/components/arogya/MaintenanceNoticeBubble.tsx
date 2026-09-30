import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MaintenanceNoticeBubble({ heading, message, onOpen, onDismiss }: {
  heading: string;
  message: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <section role="status" aria-live="polite" aria-label="ELogbook service notice"
      className="print:hidden fixed bottom-[calc(144px+env(safe-area-inset-bottom))] right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 border-l-4 border-l-teal-700 bg-white p-4 shadow-[0_16px_40px_rgba(15,23,42,0.18)] sm:bottom-24 sm:right-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-teal-800">ELogbook service notice</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-900">{heading}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{message}</p>
          <Button type="button" variant="link" size="sm" onClick={onOpen} className="mt-1 h-auto px-0 py-1 text-teal-800">
            View in Arogya
          </Button>
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label="Dismiss maintenance notice" onClick={onDismiss} className="-mr-2 -mt-2 h-8 w-8 shrink-0 text-slate-500">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
