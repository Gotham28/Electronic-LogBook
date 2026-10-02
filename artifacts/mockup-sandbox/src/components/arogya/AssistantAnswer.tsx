import * as React from "react";
import type { ArogyaAnswer } from "@/lib/apiClient";

const safeRoutes: Record<string, string> = {
  dashboard: "/", cases: "/cases", procedures: "/procedures", academics: "/academics",
  "clinical-work": "/clinical-works", conferences: "/conferences", postings: "/postings",
  leave: "/attendance", assessments: "/assessments", milestones: "/milestones",
  thesis: "/thesis", certifications: "/certifications", awards: "/awards", "print-logbook": "/print", "evaluation-queue": "/",
  "student-progress": "/mentees", "quarterly-appraisal": "/assessments",
  "department-dashboard": "/roster", "review-queue": "/review-queue",
  "student-approval": "/student-access", "faculty-management": "/professors",
  "leave-approvals": "/leave-approvals", requirements: "/requirements",
};

export function AssistantAnswer({ answer, onNavigate }: { answer: ArogyaAnswer; onNavigate: (href: string) => void }) {
  return <div className="flex flex-col gap-2">
    <p className="whitespace-pre-wrap font-medium text-slate-800">{answer.reply}</p>
    {answer.steps.length > 0 && <ol className="list-decimal space-y-1.5 pl-5">
      {answer.steps.map((step, index) => <li key={index}>{step}</li>)}
    </ol>}
    {answer.facts.length > 0 && <dl className="mt-1 grid gap-1 rounded-lg bg-slate-50 p-2">
      {answer.facts.map((item) => <div key={item.id} className="flex justify-between gap-3 text-xs">
        <dt className="text-slate-600">{item.label}</dt><dd className="text-right font-semibold text-slate-800">{item.value ?? "Not available"}</dd>
      </div>)}
      {answer.checkedAt && <p className="text-[10px] text-slate-500">Checked {new Date(answer.checkedAt).toLocaleString()}</p>}
    </dl>}
    {answer.clarification?.choices && answer.clarification.choices.length > 0 && <div className="flex flex-wrap gap-1">
      {answer.clarification.choices.map((choice) => <span key={choice.id} className="rounded-full bg-teal-50 px-2 py-1 text-xs">{choice.label}</span>)}
    </div>}
    {answer.sources.length > 0 && <p className="text-[10px] text-slate-500">Source: {answer.sources.map((source) => source.title).join(", ")}</p>}
    {answer.actions.length > 0 && <div className="flex flex-wrap gap-2">
      {answer.actions.map((action) => {
        const href = safeRoutes[action.id];
        const routeAllowed = action.href === href;
        if (!href || !routeAllowed) return null;
        return <button type="button" key={action.id} onClick={() => onNavigate(action.href)}
          className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-xs font-semibold text-teal-900 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          Go to {action.label}
        </button>;
      })}
    </div>}
  </div>;
}
