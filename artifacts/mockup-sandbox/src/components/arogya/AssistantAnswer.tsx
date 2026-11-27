import * as React from "react";
import type { ArogyaAnswer, MochiActionResult, MochiProposal, MochiRefusal } from "@/lib/apiClient";

const safeRoutes: Record<string, string> = {
  dashboard: "/", cases: "/cases", procedures: "/procedures", academics: "/academics",
  "clinical-work": "/clinical-works", conferences: "/conferences", postings: "/postings",
  assessments: "/assessments", milestones: "/milestones",
  thesis: "/thesis", certifications: "/certifications", awards: "/awards", "print-logbook": "/print", "evaluation-queue": "/",
  "student-progress": "/mentees", "quarterly-appraisal": "/assessments",
  "department-dashboard": "/roster", "review-queue": "/review-queue",
  "student-approval": "/student-access", "faculty-management": "/professors",
  requirements: "/requirements",
  // Department Settings is the requirements page; the HOD-only refusal links here.
  "department-settings": "/requirements",
};

function displayWorkflowTitle(id: string, title: string) {
  return id === "assistant-scope" ? "What Mochi can check" : title;
}

export interface MochiEditHandlers {
  onApply: (proposal: MochiProposal) => Promise<MochiActionResult>;
  onUndo: (auditId: string) => Promise<MochiActionResult>;
  onTicket: (message: string) => Promise<{ referenceCode: string }>;
}

const buttonClass = "rounded-full border border-line-soft bg-white px-3 py-1.5 text-xs font-semibold text-forest hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const primaryButtonClass = "rounded-full bg-deep px-3 py-1.5 text-xs font-semibold text-white hover:bg-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-60";

type EditState =
  | { step: "preview" }
  | { step: "applying" }
  | { step: "done"; result: MochiActionResult }
  | { step: "undoing"; result: MochiActionResult }
  | { step: "undone" }
  | { step: "cancelled" }
  | { step: "stale" }
  | { step: "error"; message: string; from: "apply" | "undo"; result?: MochiActionResult; retry?: boolean };

// The preview Mochi shows before anything changes. Nothing is written until the HOD presses Confirm.
function ProposalCard({ proposal, handlers }: { proposal: MochiProposal; handlers: MochiEditHandlers }) {
  const [state, setState] = React.useState<EditState>({ step: "preview" });
  const apply = async () => {
    setState({ step: "applying" });
    try {
      setState({ step: "done", result: await handlers.onApply(proposal) });
    } catch (error: any) {
      setState(error?.status === 409 ? { step: "stale" } : { step: "error", from: "apply", message: error?.data?.message || error?.data?.error || "That change could not be made." });
    }
  };
  const undo = async (result: MochiActionResult) => {
    if (!result.auditId) return;
    setState({ step: "undoing", result });
    try {
      await handlers.onUndo(result.auditId);
      setState({ step: "undone" });
    } catch (error: any) {
      setState(error?.status === 409
        ? { step: "error", from: "undo", result, message: error?.data?.error ?? error?.data?.message ?? "This changed since Mochi made it, so it was not undone.", retry: false }
        : { step: "error", from: "undo", result, message: error?.data?.error ?? error?.data?.message ?? "That change could not be undone.", retry: true });
    }
  };
  return <section aria-label="Proposed change" className="rounded-xl border border-line-soft bg-mist p-3">
    <p className="text-xs font-semibold text-forest">{proposal.title}</p>
    <dl className="mt-2 grid gap-1 text-xs">
      <div className="flex justify-between gap-3"><dt className="text-soft-ink">Current</dt><dd className="text-right font-semibold text-ink">{proposal.before}</dd></div>
      <div className="flex justify-between gap-3"><dt className="text-soft-ink">New</dt><dd className="text-right font-semibold text-forest">{proposal.after}</dd></div>
    </dl>
    {(state.step === "preview" || state.step === "applying") && <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" className={primaryButtonClass} disabled={state.step === "applying"} onClick={() => void apply()}>
        {state.step === "applying" ? "Applying…" : "Confirm"}
      </button>
      <button type="button" className={buttonClass} disabled={state.step === "applying"} onClick={() => setState({ step: "cancelled" })}>Cancel</button>
    </div>}
    {state.step === "cancelled" && <p role="status" className="mt-2 text-xs text-soft-ink">Cancelled. Nothing was changed.</p>}
    {state.step === "stale" && <p role="alert" className="mt-2 text-xs font-medium text-status-foreground">This changed since Mochi checked — ask again.</p>}
    {(state.step === "done" || state.step === "undoing") && <div className="mt-2 flex flex-wrap items-center gap-2">
      <p role="status" className="text-xs font-semibold text-forest">
        {state.result.auditId === null ? "Done. It was already set that way." : "Done."}
      </p>
      {state.result.auditId !== null && state.result.undoable !== false && <button type="button" className={buttonClass}
        disabled={state.step === "undoing"} onClick={() => void undo(state.result)}>{state.step === "undoing" ? "Undoing…" : "Undo"}</button>}
      {state.result.auditId !== null && state.result.undoable === false && <p className="w-full text-[11px] text-soft-ink">
        This can't be undone from here. Switch it back in Department Settings.</p>}
    </div>}
    {state.step === "undone" && <p role="status" className="mt-2 text-xs font-semibold text-forest">Undone. The previous value is back.</p>}
    {state.step === "error" && <div className="mt-2 flex flex-wrap items-center gap-2">
      <p role="alert" className="text-xs font-medium text-status-foreground">{state.message}</p>
      {state.from === "undo" && state.result && state.retry !== false && <button type="button" className={buttonClass} onClick={() => void undo(state.result!)}>Try undo again</button>}
      {state.from === "apply" && <button type="button" className={buttonClass} onClick={() => setState({ step: "preview" })}>Back</button>}
    </div>}
  </section>;
}

function RefusalCard({ refusal, question, onNavigate, handlers }: {
  refusal: MochiRefusal; question: string; onNavigate: (href: string) => void; handlers: MochiEditHandlers;
}) {
  const [message, setMessage] = React.useState(question);
  const [ticket, setTicket] = React.useState<{ step: "form" } | { step: "sending" } | { step: "sent"; referenceCode: string } | { step: "error"; message: string }>({ step: "form" });
  const ticketFieldId = React.useId();
  if (refusal.type === "hod_only") {
    const allowed = refusal.settingsHref === safeRoutes["department-settings"];
    return <section aria-label="Change not made" className="rounded-xl border border-line-soft bg-mist p-3">
      <p className="text-xs text-ink">{refusal.title} is a setting only you can switch. Mochi can't change it for you.</p>
      {allowed && <button type="button" className={`${buttonClass} mt-2`} onClick={() => onNavigate(refusal.settingsHref)}>Open Department Settings</button>}
    </section>;
  }
  const send = async () => {
    setTicket({ step: "sending" });
    try {
      setTicket({ step: "sent", ...(await handlers.onTicket(message.trim())) });
    } catch (error: any) {
      setTicket({ step: "error", message: error?.data?.message || error?.data?.error || "The support ticket could not be sent." });
    }
  };
  const length = message.trim().length;
  return <section aria-label="Raise a support ticket" className="rounded-xl border border-line-soft bg-mist p-3">
    {ticket.step === "sent"
      ? <p role="status" className="text-xs font-semibold text-forest">Support ticket sent. Reference {ticket.referenceCode}.</p>
      : <>
        <label htmlFor={ticketFieldId} className="text-xs font-semibold text-ink">Raise a support ticket</label>
        <textarea id={ticketFieldId} value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={2000}
          className="mt-1 w-full rounded-lg border border-input bg-white p-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        {ticket.step === "error" && <p role="alert" className="mt-1 text-xs font-medium text-status-foreground">{ticket.message}</p>}
        <button type="button" className={`${primaryButtonClass} mt-2`} disabled={ticket.step === "sending" || length < 10 || length > 2000} onClick={() => void send()}>
          {ticket.step === "sending" ? "Sending…" : "Send ticket"}
        </button>
      </>}
  </section>;
}

export function AssistantAnswer({ answer, onNavigate, question = "", edit }: {
  answer: ArogyaAnswer; onNavigate: (href: string) => void; question?: string; edit?: MochiEditHandlers;
}) {
  return <div className="flex flex-col gap-2">
    <p className="whitespace-pre-wrap font-medium text-ink">{answer.reply}</p>
    {edit && answer.proposal && <ProposalCard proposal={answer.proposal} handlers={edit} />}
    {edit && answer.refusal && <RefusalCard refusal={answer.refusal} question={question} onNavigate={onNavigate} handlers={edit} />}
    {answer.grounding && <p className="text-xs text-soft-ink">
      {answer.grounding.scope === "department"
        ? "Based on department data"
        : `Based on your ${answer.grounding.logCount} ${answer.grounding.logCount === 1 ? "log" : "logs"}`}
    </p>}
    {answer.steps.length > 0 && <ol className="list-decimal space-y-1.5 pl-5">
      {answer.steps.map((step, index) => <li key={index}>{step}</li>)}
    </ol>}
    {answer.facts.length > 0 && <dl className="mt-1 grid gap-1 rounded-lg bg-mist p-2">
      {answer.facts.map((item) => <div key={item.id} className="flex justify-between gap-3 text-xs">
        <dt className="text-soft-ink">{item.label}</dt><dd className="text-right font-semibold text-ink">{item.value ?? "Not available"}</dd>
      </div>)}
      {answer.checkedAt && <p className="text-[10px] text-helper">Checked {new Date(answer.checkedAt).toLocaleString()}</p>}
    </dl>}
    {answer.clarification?.choices && answer.clarification.choices.length > 0 && <div className="flex flex-wrap gap-1">
      {answer.clarification.choices.map((choice) => <span key={choice.id} className="rounded-full bg-mist px-2 py-1 text-xs">
        {answer.clarification?.type === "workflow" ? displayWorkflowTitle(choice.id, choice.label) : choice.label}
      </span>)}
    </div>}
    {answer.sources.length > 0 && <p className="text-[10px] text-helper">Source: {answer.sources.map((source) => displayWorkflowTitle(source.id, source.title)).join(", ")}</p>}
    {answer.actions.length > 0 && <div className="flex flex-wrap gap-2">
      {answer.actions.map((action) => {
        const href = safeRoutes[action.id];
        const routeAllowed = action.href === href;
        if (!href || !routeAllowed) return null;
        return <button type="button" key={action.id} onClick={() => onNavigate(action.href)}
          className="rounded-full border border-line-soft bg-white px-3 py-1.5 text-xs font-semibold text-forest hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Go to {action.label}
        </button>;
      })}
    </div>}
  </div>;
}
