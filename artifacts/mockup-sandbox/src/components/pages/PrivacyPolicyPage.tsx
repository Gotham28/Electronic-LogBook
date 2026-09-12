import * as React from "react";
import { ChevronLeft } from "lucide-react";

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 shadow-sm rounded-3xl border border-slate-200">
        <a href="/" className="inline-flex items-center text-sm font-medium text-teal-600 hover:text-teal-700 mb-8 transition-colors">
          <ChevronLeft className="w-4 h-4 mr-1" /> Back to Home
        </a>
        
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-10 pb-6 border-b border-slate-100">Last updated: {new Date().toLocaleDateString()}</p>
        
        <div className="space-y-8 text-slate-700 leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">1. What data we collect</h2>
            <p>We collect your name, email address, registration/login credentials, department and role information, clinical case logs, procedure logs, academic activity records, attendance and leave records, and assessment results.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">2. Why we collect it</h2>
            <p>This data is collected solely to administer postgraduate medical training records - tracking case/procedure completion, academic activity, attendance, and supervisor approvals, in line with MCI/NMC postgraduate training requirements.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">3. How long we keep it</h2>
            <p>Data is retained for as long as you remain an active student or faculty member on the platform. When a student completes or exits their training program, or a faculty member leaves, their account and associated data are removed.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">4. Who can access your data</h2>
            <p>Your data is visible to authorized personnel within your department (e.g. your HOD, supervising faculty) and platform administrators, strictly for training administration purposes. We do not sell or share your data with third parties for marketing purposes.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">5. Children's Data</h2>
            <p>E-LogBook is intended solely for use by postgraduate medical trainees, faculty, and administrative staff at affiliated institutions, all of whom are adults. We do not knowingly collect or process personal data from individuals under the age of 18. If you believe a minor has provided personal data to this platform, please contact our Grievance Officer immediately so it can be removed.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">6. Your Rights</h2>
            <p>Under Section 11 of the Digital Personal Data Protection Act, 2023, you have the right to: access your data, request correction, request erasure, withdraw consent, nominate someone to act on your behalf, and file a grievance. See our <a href="/data-rights" className="text-teal-600 hover:underline">Data Rights page</a> for how to exercise these.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900 mb-3">7. Contact</h2>
            <p>For any questions or concerns about this policy, contact our Grievance Officer:</p>
            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="font-semibold text-slate-900">Gautam P</p>
              <p>Email: <a href="mailto:gothoslabs@gmail.com" className="text-teal-600 hover:underline">gothoslabs@gmail.com</a></p>
              <p>Address: Janaki House, Kuthirummal Road, Padannakkad, Nileshwar</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
