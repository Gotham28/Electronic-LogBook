import * as React from "react";
import { ChevronLeft } from "lucide-react";

export function GrievanceOfficerPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 shadow-sm rounded-3xl border border-slate-200">
        <a href="/" className="inline-flex items-center text-sm font-medium text-teal-600 hover:text-teal-700 mb-8 transition-colors">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Home
        </a>
        
        <h1 className="text-4xl font-bold text-slate-900 mb-8 pb-6 border-b border-slate-100">Grievance Officer</h1>
        
        <div className="space-y-6 text-slate-700 leading-relaxed">
          <p>
            In accordance with Section 8(10) of the Digital Personal Data Protection Act, 2023, E-LogBook has appointed a Grievance Officer to address any concerns regarding the handling of your personal data.
          </p>

          <div className="my-8 p-6 bg-slate-50 rounded-2xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Grievance Officer: Gautam P</h2>
            <p className="mb-1"><strong>Email:</strong> <a href="mailto:gothoslabs@gmail.com" className="text-teal-600 hover:underline">gothoslabs@gmail.com</a></p>
            <p><strong>Address:</strong> Janaki House, Kuthirummal Road, Padannakkad, Nileshwar</p>
          </div>

          <h3 className="text-lg font-bold text-slate-900 mt-8 mb-3">You may contact the Grievance Officer regarding:</h3>
          <ul className="list-disc pl-6 space-y-2 mb-8">
            <li>Questions about how your personal data is collected, used, or stored</li>
            <li>Requests to access, correct, or erase your personal data</li>
            <li>Withdrawal of consent</li>
            <li>Any other complaint regarding data handling on this platform</li>
          </ul>

          <div className="bg-teal-50 border border-teal-100 p-4 rounded-xl text-teal-900 mt-8">
            <p>We will acknowledge and respond to all grievances within <strong>30 days of receipt</strong>, as required under the Act.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
