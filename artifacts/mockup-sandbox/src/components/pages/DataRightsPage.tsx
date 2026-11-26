import * as React from "react";
import { ChevronLeft } from "lucide-react";

export function DataRightsPage() {
  return (
    <div className="min-h-screen bg-mist py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 shadow-sm rounded-3xl border border-line-soft">
        <a href="/" className="inline-flex items-center text-sm font-medium text-forest hover:text-forest mb-8 transition-colors">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Home
        </a>
        
        <h1 className="text-4xl font-bold text-ink mb-8 pb-6 border-b border-line-soft">Your Data Rights</h1>
        
        <div className="space-y-8 text-ink leading-relaxed">
          <p>
            Under Section 11 of the Digital Personal Data Protection Act, 2023, you have the following rights regarding your personal data:
          </p>

          <ul className="space-y-4">
            <li className="flex gap-3">
              <span className="flex-none font-bold text-forest bg-mist px-2 py-1 rounded text-sm self-start">Right to Access</span>
              <span>Request a copy of the personal data we hold about you</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-none font-bold text-forest bg-mist px-2 py-1 rounded text-sm self-start">Right to Correction</span>
              <span>Request correction of inaccurate or incomplete data</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-none font-bold text-forest bg-mist px-2 py-1 rounded text-sm self-start">Right to Erasure</span>
              <span>Request deletion of your personal data</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-none font-bold text-forest bg-mist px-2 py-1 rounded text-sm self-start">Right to Withdraw Consent</span>
              <span>Withdraw any consent previously given</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-none font-bold text-forest bg-mist px-2 py-1 rounded text-sm self-start">Right to Nominate</span>
              <span>Name someone to exercise these rights on your behalf in the event of death or incapacity</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-none font-bold text-forest bg-mist px-2 py-1 rounded text-sm self-start">Right to Grievance Redressal</span>
              <span>File a complaint if you believe your data rights have been violated</span>
            </li>
          </ul>

          <div className="mt-12 p-6 bg-mist rounded-2xl border border-line-soft">
            <h3 className="text-lg font-bold text-ink mb-3">To exercise any of these rights, contact our Grievance Officer:</h3>
            <p className="font-semibold text-ink">CEO</p>
            <p className="mb-4">Email: <a href="mailto:gothoslabs@gmail.com" className="text-forest hover:underline">gothoslabs@gmail.com</a></p>
            
            <p className="text-sm font-medium text-soft-ink bg-white p-3 rounded-lg border border-line-soft inline-block">
              We will respond to all requests within 30 days.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
