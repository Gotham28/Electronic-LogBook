import * as React from "react";
import { useEffect, useState } from "react";

export function CookieConsentBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if consent has already been given or rejected
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      setIsVisible(true);
    }

    // Listen for custom event to reopen the banner
    const handleOpen = () => setIsVisible(true);
    window.addEventListener("open-cookie-consent", handleOpen);
    
    return () => window.removeEventListener("open-cookie-consent", handleOpen);
  }, []);

  const handleAccept = () => {
    localStorage.setItem("cookie-consent", "accepted");
    setIsVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem("cookie-consent", "rejected");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 w-full z-50 p-4 sm:p-6 pb-6 sm:pb-8 bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <p className="text-sm text-slate-700 leading-relaxed md:pr-10">
          We use cookies to improve your experience. Currently, this site does not use any tracking or analytics cookies - only essential functionality.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
          <button 
            onClick={handleReject}
            className="flex-1 sm:flex-none px-6 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors whitespace-nowrap"
          >
            Reject All
          </button>
          <button 
            onClick={handleAccept}
            className="flex-1 sm:flex-none px-6 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-colors whitespace-nowrap"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}
