import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SendHorizontal, X } from "lucide-react";
import { ArogyaCharacter, type ArogyaState } from "./ArogyaCharacter";
import { apiGet, apiPost, applyMochiAction, submitSupportTicket, undoMochiAction, type ArogyaAnswer, type ArogyaContextResponse } from "@/lib/apiClient";
import { isDemoMode } from "@/lib/session";
import { AROGYA_CONTEXT_EVENT, AROGYA_OPEN_EVENT, type ArogyaSelectedContext } from "@/lib/arogya-context";
import { useDepartment } from "@/lib/department-context";
import { AssistantAnswer, type MochiEditHandlers } from "./AssistantAnswer";
import { displayAssistantError } from "./assistantCopy";
import { playDemoSound } from "@/lib/demoSounds";
import { DemoTypedText } from "../demo-movie/DemoTypedText";
import { isDemoMovieActive } from "@/lib/demoSession";

type RoleType = "Student" | "Faculty" | "HOD";
type ResidentOption = { id: number; name: string; registrationNumber?: string | null; batch?: string | null };

interface PanelNotifItem {
  id: string;
  text: string;
  href: string;
}

interface SnapshotLink {
  id: string;
  text: string;
  href: string;
}

interface ArogyaPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleType;
  actorKey: string;
  workflowId?: string;
  studentProfileId?: number;
  notifItems: PanelNotifItem[];
  maintenanceNotice?: { title: string; message: string } | null;
  onNavigate: (href: string) => void;
}

export function ArogyaPanel({ open, onOpenChange, role, actorKey, workflowId, studentProfileId, notifItems, maintenanceNotice, onNavigate }: ArogyaPanelProps) {
  const [characterState, setCharacterState] = React.useState<ArogyaState>("idle");
  const [question, setQuestion] = React.useState("");
  const [messages, setMessages] = React.useState<{
    role: "user" | "arogya";
    text?: string;
    tips?: string[];
    error?: boolean;
    links?: SnapshotLink[];
    heading?: string;
    answer?: ArogyaAnswer;
  }[]>([]);
  const [assistantContext, setAssistantContext] = React.useState<ArogyaContextResponse | null>(null);
  const [contextError, setContextError] = React.useState<string | null>(null);
  const [residentOptions, setResidentOptions] = React.useState<ResidentOption[]>([]);
  const [residentsError, setResidentsError] = React.useState<string | null>(null);
  const [selectedResidentId, setSelectedResidentId] = React.useState("");
  const [selectedContext, setSelectedContext] = React.useState<ArogyaSelectedContext>({ studentId: studentProfileId });
  const requestSequence = React.useRef(0);
  const wasOpen = React.useRef(false);
  const { refresh: refreshDepartment } = useDepartment();

  // Department edits exist for the HOD only. After an apply or undo the department wording and settings
  // are reloaded so the new wording shows without a page refresh. The department is never sent.
  const editHandlers = React.useMemo<MochiEditHandlers | undefined>(() => role === "HOD" && !isDemoMode() ? {
    onApply: async (proposal) => { const result = await applyMochiAction(proposal); void refreshDepartment(); return result; },
    onUndo: async (auditId) => { const result = await undoMochiAction(auditId); void refreshDepartment(); return result; },
    // The ticket text is the HOD's own question, edited by them; Mochi writes none of it.
    onTicket: (message) => submitSupportTicket({ category: "feature_request", message, pageUrl: window.location.pathname }),
  } : undefined, [role, refreshDepartment]);

  React.useEffect(() => {
    let cancelled = false;
    setAssistantContext(null);
    setContextError(null);
    setResidentOptions([]);
    setResidentsError(null);
    setMessages([]);
    setQuestion("");
    setCharacterState("idle");
    setSelectedResidentId("");
    setSelectedContext({ studentId: studentProfileId });
    requestSequence.current++;
    if (isDemoMode()) {
      setAssistantContext({ mode: "legacy", role: role === "Student" ? "student" : role === "Faculty" ? "professor" : "hod", departmentLabel: "Demo department", workflows: [], actions: [], knowledgeVersion: "demo", capabilitySignature: "demo" });
      return () => { cancelled = true; };
    }
    void apiGet<ArogyaContextResponse>("/api/arogya/context").then(async (context) => {
      if (cancelled) return;
      setAssistantContext(context);
      if (context.mode === "v2" && role !== "Student") {
        try {
          const students = await apiGet<ResidentOption[]>("/api/appraisals/students");
          if (!cancelled) setResidentOptions(Array.isArray(students) ? students : []);
        } catch (error: any) {
          if (!cancelled) setResidentsError(error?.data?.error || error?.message || "Resident list is unavailable for record checks.");
        }
      }
    }).catch((error: any) => {
      if (!cancelled) setContextError(displayAssistantError(error?.data?.error || error?.message, "Mochi could not load its role and department settings."));
    });
    return () => { cancelled = true; };
  }, [actorKey, role, studentProfileId]);

  React.useEffect(() => {
    const handleSelection = (event: Event) => {
      requestSequence.current++;
      setCharacterState("idle");
      const detail = (event as CustomEvent<ArogyaSelectedContext | null>).detail;
      if (!detail) {
        setSelectedContext({ studentId: studentProfileId });
        setSelectedResidentId("");
        return;
      }
      setSelectedContext({ ...detail });
      if (detail.studentId !== undefined) setSelectedResidentId(String(detail.studentId));
    };
    window.addEventListener(AROGYA_CONTEXT_EVENT, handleSelection);
    return () => window.removeEventListener(AROGYA_CONTEXT_EVENT, handleSelection);
  }, [studentProfileId]);

  const handleRevealDone = React.useCallback(() => {
    setCharacterState((current) => current === "talking" ? "idle" : current);
  }, []);

  React.useEffect(() => {
    if (characterState !== "talking" || !isDemoMode()) return undefined;
    playDemoSound("pop");
    
    const isTypingResponse = messages.length > 0 && messages[messages.length - 1].role === "arogya" && (messages[messages.length - 1].text || messages[messages.length - 1].tips);
    
    if (!isTypingResponse) {
      const timer = window.setTimeout(() => {
        setCharacterState((current) => current === "talking" ? "idle" : current);
      }, 1200);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [characterState, messages]);

  React.useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (justOpened && !isDemoMode()) {
      void apiPost("/api/arogya/usage", { eventType: "panel_open" }).catch(() => {});
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    setCharacterState("waving");
    const timer = setTimeout(() => setCharacterState("idle"), 1500);
    return () => clearTimeout(timer);
  }, [open]);

  const handleWhatsDue = () => {
    // Snapshot at click time so a later bell change does not rewrite history (req 5)
    const snapshot = notifItems.slice();
    setMessages((prev) => [
      ...prev,
      { role: "user", text: "What's due?" },
      {
        role: "arogya",
        heading: "App notification snapshot — items that need your attention:",
        links: snapshot,
      },
    ]);
    if (isDemoMode()) setCharacterState("talking");
  };

  const handlePendingReviews = () => {
    // Snapshot filtered at click time (req 5)
    const snapshot = notifItems.filter((i) => i.id === "faculty_queue");
    setMessages((prev) => [
      ...prev,
      { role: "user", text: "My pending reviews" },
      {
        role: "arogya",
        heading: "App notification snapshot — pending reviews:",
        links: snapshot,
      },
    ]);
    if (isDemoMode()) setCharacterState("talking");
  };

  const handleAsk = async (e: React.FormEvent | Event, overrideQuestion?: string) => {
    e.preventDefault();
    const q = overrideQuestion ?? question;
    if (!q.trim() || characterState === "thinking") return;
    
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setCharacterState("thinking");
    const requestId = ++requestSequence.current;
    const requestActorKey = actorKey;

    try {
      if (!assistantContext) throw new Error(contextError || "Mochi is still loading its settings.");
      let data: any;
      if (assistantContext.mode === "v2") {
        const prior: Array<{ question: string; reply: string }> = [];
        for (let i = 0; i < messages.length - 1; i++) {
          const current = messages[i];
          const following = messages[i + 1];
          const reply = following?.answer?.reply ?? following?.text;
          if (current.role === "user" && typeof current.text === "string" && following?.role === "arogya" && typeof reply === "string") {
            prior.push({ question: current.text, reply });
          }
        }
        const selectedStudentId = role === "Student" ? studentProfileId : Number(selectedContext.studentId ?? selectedResidentId) || undefined;
        data = await apiPost<ArogyaAnswer>("/api/arogya/ask", {
          question: q,
          history: prior.slice(-6),
          context: {
            ...(workflowId ? { workflowId } : {}),
            ...(selectedStudentId ? { studentId: selectedStudentId } : {}),
            ...(selectedContext.log ? { log: selectedContext.log } : {}),
            ...(selectedContext.appraisalPeriod ? { appraisalPeriod: selectedContext.appraisalPeriod } : {}),
            ...(selectedContext.validationCodes ? { validationCodes: selectedContext.validationCodes } : {}),
          },
        });
        if (typeof data.reply !== "string" || !Array.isArray(data.steps) || !Array.isArray(data.sources) || !Array.isArray(data.facts) || !Array.isArray(data.actions)) throw new Error("Invalid Mochi response");
      } else {
        data = await apiPost("/api/arogya/ask", { question: q });
        if (typeof data.reply !== "string") throw new Error("Invalid shape");
      }
      if (requestId !== requestSequence.current || requestActorKey !== actorKey) return;
      setCharacterState("talking");
      setMessages((prev) => [...prev, assistantContext.mode === "v2" ? { role: "arogya", answer: data } : { role: "arogya", text: data.reply }]);
      setQuestion("");
    } catch (err: any) {
      if (requestId !== requestSequence.current || requestActorKey !== actorKey) return;
      setCharacterState("error");
      setMessages((prev) => [...prev, { role: "arogya", text: displayAssistantError(err?.data?.error, "Mochi couldn't answer right now."), error: true }]);
    }
  };

  const handleProgressCoach = async () => {
    if (characterState === "thinking") return;
    if (assistantContext?.mode === "v2") {
      handleAskRef.current(new Event("submit"), "How is my progress against the configured targets?");
      return;
    }
    
    setMessages((prev) => [...prev, { role: "user", text: "My progress coach" }]);
    setCharacterState("thinking");

    try {
      const data = await apiPost("/api/arogya/progress-coach", {});
      if (!Array.isArray(data.tips)) throw new Error("Invalid shape");
      
      setCharacterState("talking");
      setMessages((prev) => [...prev, { role: "arogya", tips: data.tips }]);
    } catch (err: any) {
      setCharacterState("error");
      setMessages((prev) => [...prev, { role: "arogya", text: displayAssistantError(err?.data?.error, "Mochi couldn't answer right now."), error: true }]);
    }
  };

  const handleDepartmentReport = async (type: "report" | "falling_behind") => {
    if (characterState === "thinking") return;
    if (assistantContext?.mode === "v2") {
      handleAskRef.current(new Event("submit"), type === "report"
        ? "Summarize my department's approved residents and pending review queue."
        : "Which approved residents are currently classified below their configured progress targets?");
      return;
    }
    
    setMessages((prev) => [...prev, { role: "user", text: type === "report" ? "Department report" : "Who's falling behind?" }]);
    setCharacterState("thinking");

    try {
      const data = await apiPost("/api/arogya/department-report", { type });
      if (typeof data.reply !== "string") throw new Error("Invalid shape");
      
      setCharacterState("talking");
      setMessages((prev) => [...prev, { role: "arogya", text: data.reply }]);
    } catch (err: any) {
      setCharacterState("error");
      setMessages((prev) => [...prev, { role: "arogya", text: displayAssistantError(err?.data?.error, "Mochi couldn't answer right now."), error: true }]);
    }
  };

  const handleAskRef = React.useRef(handleAsk);
  handleAskRef.current = handleAsk;

  const pendingPromptRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const handleOpenWithPrompt = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      if (detail?.prompt) {
        if (assistantContext) {
          handleAskRef.current(new Event("submit"), detail.prompt);
        } else {
          pendingPromptRef.current = detail.prompt;
        }
      }
    };
    window.addEventListener(AROGYA_OPEN_EVENT, handleOpenWithPrompt);
    return () => window.removeEventListener(AROGYA_OPEN_EVENT, handleOpenWithPrompt);
  }, [assistantContext]);

  React.useEffect(() => {
    if (assistantContext && pendingPromptRef.current) {
      const prompt = pendingPromptRef.current;
      pendingPromptRef.current = null;
      handleAskRef.current(new Event("submit"), prompt);
    }
  }, [assistantContext]);

  React.useEffect(() => {
    if (!open || !isDemoMode() || !isDemoMovieActive()) return undefined;

    let observer: ResizeObserver | null = null;
    let pollInterval: number | undefined;
    let attempts = 0;

    const tryInitObserver = () => {
      attempts++;
      const messagesEl = document.querySelector('[data-tour="arogya-messages"]');
      if (messagesEl) {
        const scrollContainer = messagesEl.closest('.overflow-y-auto');
        if (scrollContainer) {
          if (pollInterval !== undefined) window.clearInterval(pollInterval);
          observer = new ResizeObserver(() => {
            scrollContainer.scrollTo({
              top: scrollContainer.scrollHeight,
              behavior: "auto"
            });
          });
          observer.observe(messagesEl);
          return;
        }
      }
      if (attempts >= 30) {
        if (pollInterval !== undefined) window.clearInterval(pollInterval);
      }
    };
    
    pollInterval = window.setInterval(tryInitObserver, 100);
    return () => {
      if (pollInterval !== undefined) window.clearInterval(pollInterval);
      if (observer) observer.disconnect();
    };
  }, [open]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-tour="arogya-launcher"
          aria-label={open ? "Close Mochi assistant" : "Open Mochi assistant"}
          className="print:hidden fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-forest bg-white shadow-[0_12px_24px_color-mix(in_srgb,var(--gothos-forest)_12%,transparent)] transition-colors hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
        >
          <ArogyaCharacter state={characterState} size={44} closeUp />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        avoidCollisions={false}
        sideOffset={-56}
        collisionPadding={12}
        aria-labelledby="arogya-panel-heading"
        aria-describedby="arogya-panel-description"
        data-tour="arogya-panel"
        data-demo-assistant-state={characterState}
        className="arogya-chat-surface flex h-[min(68dvh,38rem)] min-h-0 w-[min(26rem,calc(100vw-1.5rem),var(--radix-popover-content-available-width,100vw))] max-h-[calc(100dvh-1.5rem)] flex-col gap-0 overflow-hidden rounded-[1.5rem] border border-line-soft bg-white p-0 text-ink shadow-[0_24px_70px_color-mix(in_srgb,var(--gothos-forest)_22%,transparent)]"
      >
        <style>{`
          @keyframes arogya-expand {
            from { clip-path: inset(calc(100% - 56px) 0 0 calc(100% - 56px) round 28px); }
            to { clip-path: inset(0 round 24px); }
          }

          .arogya-chat-surface[data-state="open"] {
            animation: arogya-expand 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .arogya-chat-surface[data-state="closed"] {
            animation: arogya-expand 220ms ease-in reverse both;
          }

          @media (prefers-reduced-motion: reduce) {
            .arogya-chat-surface[data-state] { animation: none; }
          }
        `}</style>
        <header className="flex shrink-0 items-center justify-between border-b border-line-soft bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-2xl border border-line-soft">
              <img src={`${import.meta.env.BASE_URL}gothos-logo.png`} alt="Gothos Labs" width={66} height={57} className="absolute -top-1 left-1/2 h-auto w-[66px] max-w-none -translate-x-1/2" />
            </div>
            <div className="min-w-0">
              <h2 id="arogya-panel-heading" className="font-display text-base font-bold leading-tight text-forest">Mochi</h2>
              <p className="mt-0.5 text-xs font-medium text-helper">Your assistant</p>
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Close Mochi assistant"
            onClick={() => onOpenChange(false)}
            className="h-11 w-11 shrink-0 rounded-full text-helper hover:bg-card hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
          <p id="arogya-panel-description" className="sr-only">Mochi assistant panel with role-specific suggestions and a prompt box.</p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {contextError && <p role="alert" className="rounded-lg border border-status-border bg-status p-2 text-xs text-status-foreground">{contextError}</p>}
          {maintenanceNotice && (
            <section aria-label="ELogbook service notice" className="shrink-0 rounded-xl border border-line-soft border-l-4 border-l-forest bg-card p-3 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-forest">ELogbook service notice</p>
              <h3 className="mt-1 text-sm font-semibold text-ink">{maintenanceNotice.title}</h3>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink">{maintenanceNotice.message}</p>
            </section>
          )}

          <section aria-label="Sample prompts" className="shrink-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-helper">Try a prompt</p>
            <div className="flex flex-wrap gap-2">
              {role === "Student" && (
                <>
                  <Button type="button" variant="outline" size="sm" data-tour="arogya-coach" className="min-h-11 rounded-full bg-card px-3 text-xs text-forest shadow-sm hover:bg-mist" onClick={handleProgressCoach}>
                    My progress coach
                  </Button>
                  <Button type="button" variant="outline" size="sm" data-tour="arogya-due" className="min-h-11 rounded-full bg-card px-3 text-xs text-forest shadow-sm hover:bg-mist" onClick={handleWhatsDue}>
                    What's due?
                  </Button>
                </>
              )}
              {role === "Faculty" && (
                <Button type="button" variant="outline" size="sm" className="min-h-11 rounded-full bg-card px-3 text-xs text-forest shadow-sm hover:bg-mist" onClick={handlePendingReviews}>
                  My pending reviews
                </Button>
              )}
              {role === "HOD" && (
                <>
                  <Button type="button" variant="outline" size="sm" data-tour="arogya-report" className="min-h-11 rounded-full bg-card px-3 text-xs text-forest shadow-sm hover:bg-mist" onClick={() => handleDepartmentReport("report")}>
                    Department report
                  </Button>
                  <Button type="button" variant="outline" size="sm" data-tour="arogya-falling-behind" className="min-h-11 rounded-full bg-card px-3 text-xs text-forest shadow-sm hover:bg-mist" onClick={() => handleDepartmentReport("falling_behind")}>
                    Who's falling behind?
                  </Button>
                </>
              )}
            </div>
            {assistantContext?.mode === "v2" && role !== "Student" && <div className="mt-2 space-y-1">
              <label htmlFor="arogya-resident-context" className="text-xs font-medium text-soft-ink">Resident for record checks</label>
              <select id="arogya-resident-context" value={selectedResidentId} onChange={(event) => {
                const value = event.target.value;
                requestSequence.current++;
                setCharacterState("idle");
                setSelectedResidentId(value);
                setSelectedContext((current) => ({ ...current, studentId: value ? Number(value) : undefined }));
              }} className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Select a resident to check a record</option>
                {residentOptions.map((student) => <option key={student.id} value={student.id}>{student.name}{student.registrationNumber ? ` · ${student.registrationNumber}` : ""}</option>)}
              </select>
              {residentsError && <p role="status" className="text-[11px] text-helper">{residentsError}</p>}
            </div>}
          </section>

          <div role="log" aria-label="Mochi conversation" aria-live="polite" data-tour="arogya-messages" className="flex min-h-0 flex-1 flex-col gap-3">
            {messages.length === 0 ? (
              <div className="my-auto flex min-h-32 flex-col items-center justify-center rounded-2xl border border-card-edge bg-card px-5 py-5 text-center shadow-sm">
                <ArogyaCharacter state={characterState} size={54} />
                <p className="mt-2 text-sm font-semibold text-ink">What can I help with?</p>
                <p className="mt-1 max-w-[18rem] text-xs leading-relaxed text-helper">Choose a sample prompt above or write your own below.</p>
              </div>
            ) : messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {msg.role === "arogya" && (
                  <div className="mt-1 shrink-0">
                    <ArogyaCharacter state={idx === messages.length - 1 ? characterState : "idle"} size={28} />
                  </div>
                )}
                <div className={`max-w-[88%] rounded-2xl border px-3.5 py-3 text-sm shadow-sm ${msg.role === "user" ? "rounded-tr-md border-forest bg-forest text-right text-white" : "rounded-tl-md border-line-soft bg-mist text-left text-ink"}`}>
                  {msg.answer ? (
                    <AssistantAnswer answer={msg.answer} edit={editHandlers}
                      question={idx > 0 && messages[idx - 1].role === "user" ? messages[idx - 1].text ?? "" : ""}
                      onNavigate={(href) => { onNavigate(href); onOpenChange(false); }} />
                  ) : msg.links !== undefined ? (
                    <div className="flex flex-col gap-2">
                      <p className="mb-1 font-semibold text-forest">{msg.heading}</p>
                      {/* Empty state wording MUST be exactly "No new notifications right now." — bell fetch errors are silent */}
                      {msg.links.length === 0 ? (
                        <p className="text-helper">No new notifications right now.</p>
                      ) : (
                        msg.links.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => { onNavigate(item.href); onOpenChange(false); }}
                            className="w-full rounded-lg border border-line-soft bg-mist p-2 text-left text-xs font-medium transition-colors hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {item.text}
                          </button>
                        ))
                      )}
                    </div>
                  ) : msg.tips ? (
                    <>
                      <ol className="list-decimal space-y-2 pl-4">
                        {msg.tips.map((tip, i) => (
                          <li key={i}>
                            {isDemoMode() ? (
                              <DemoTypedText text={tip} onDone={i === msg.tips!.length - 1 && idx === messages.length - 1 ? handleRevealDone : undefined} />
                            ) : tip}
                          </li>
                        ))}
                      </ol>
                      {isDemoMode() && <p className="mt-2 text-[10px] text-helper font-medium">Sample AI output</p>}
                    </>
                  ) : (
                    <>
                      <p className={`whitespace-pre-wrap font-medium ${msg.error ? "text-status-foreground" : "text-ink"}`}>
                        {isDemoMode() && !msg.error && msg.role === "arogya" && msg.text ? (
                          <DemoTypedText text={msg.text} onDone={idx === messages.length - 1 ? handleRevealDone : undefined} />
                        ) : msg.text}
                      </p>
                      {isDemoMode() && !msg.error && msg.role === "arogya" && <p className="mt-2 text-[10px] text-helper font-medium">Sample AI output</p>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="shrink-0 border-t border-line-soft bg-white px-4 pb-3 pt-3.5">
          {messages.length > 0 && <div className="mb-2 flex justify-end"><button type="button" onClick={() => {
            requestSequence.current++;
            setMessages([]);
            setQuestion("");
            setCharacterState("idle");
          }} className="text-xs font-medium text-helper underline decoration-input underline-offset-2 hover:text-ink">Clear conversation</button></div>}
          <form onSubmit={handleAsk} className="flex flex-col gap-1.5">
            <label htmlFor="arogya-ask-input" className="text-xs font-semibold text-ink">Ask Mochi</label>
            <div className="relative">
              <Input
                id="arogya-ask-input"
                data-tour="arogya-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={characterState === "thinking" || assistantContext === null}
                placeholder="Write a prompt..."
                className="h-12 rounded-2xl border-input bg-mist pr-14 text-sm focus-visible:ring-ring"
              />
              <Button
                type="submit"
                aria-label="Send prompt to Mochi"
                disabled={characterState === "thinking" || !question.trim() || assistantContext === null}
                size="icon"
                className="absolute right-0.5 top-0.5 h-11 w-11 rounded-lg bg-deep text-white shadow-sm hover:bg-deep"
              >
                <SendHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <p className="mt-1 text-center text-xs text-helper">Powered by Gothos Labs</p>
          </form>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
