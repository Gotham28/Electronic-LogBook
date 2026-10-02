import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SendHorizontal, X } from "lucide-react";
import { ArogyaCharacter, type ArogyaState } from "./ArogyaCharacter";
import { apiGet, apiPost, type ArogyaAnswer, type ArogyaContextResponse } from "@/lib/apiClient";
import { isDemoMode } from "@/lib/session";
import { AROGYA_CONTEXT_EVENT, type ArogyaSelectedContext } from "@/lib/arogya-context";
import { AssistantAnswer } from "./AssistantAnswer";
import { playDemoSound } from "@/lib/demoSounds";
import { ARO_DEMO_COMMAND_EVENT, type AroDemoCommand } from "../demo-movie/movieBridge";
import { DemoTypedText } from "../demo-movie/DemoTypedText";
import { DEMO_MOVIE_CHANGED_EVENT, isDemoMovieActive } from "@/lib/demoSession";

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
      if (!cancelled) setContextError(error?.data?.error || error?.message || "Arogya could not load its role and department settings.");
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
      if (!assistantContext) throw new Error(contextError || "Arogya is still loading its settings.");
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
        if (typeof data.reply !== "string" || !Array.isArray(data.steps) || !Array.isArray(data.sources) || !Array.isArray(data.facts) || !Array.isArray(data.actions)) throw new Error("Invalid Arogya response");
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
      setMessages((prev) => [...prev, { role: "arogya", text: err?.data?.error ?? "Arogya couldn't answer right now.", error: true }]);
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
      setMessages((prev) => [...prev, { role: "arogya", text: err?.data?.error ?? "Arogya couldn't answer right now.", error: true }]);
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
      setMessages((prev) => [...prev, { role: "arogya", text: err?.data?.error ?? "Arogya couldn't answer right now.", error: true }]);
    }
  };

  const handleAskRef = React.useRef(handleAsk);
  const handleProgressCoachRef = React.useRef(handleProgressCoach);
  const handleDepartmentReportRef = React.useRef(handleDepartmentReport);
  handleAskRef.current = handleAsk;
  handleProgressCoachRef.current = handleProgressCoach;
  handleDepartmentReportRef.current = handleDepartmentReport;

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

  React.useEffect(() => {
    if (!isDemoMode()) return undefined;

    let typingTimeout: number | undefined;
    let isCleanedUp = false;
    let isCommandRunning = false;

    const cancelRun = () => {
      if (typingTimeout !== undefined) window.clearTimeout(typingTimeout);
      isCommandRunning = false;
    };
    const movieChangeHandler = () => {
      if (!isDemoMovieActive()) cancelRun();
    };
    window.addEventListener(DEMO_MOVIE_CHANGED_EVENT, movieChangeHandler);

    const handler = (e: Event) => {
      const event = e as CustomEvent<AroDemoCommand>;
      const command = event.detail;

      if (isCommandRunning) return;
      isCommandRunning = true;

      if (command.type === "ask") {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          setQuestion(command.question);
          typingTimeout = window.setTimeout(() => {
            if (!isCleanedUp) handleAskRef.current(new Event("submit"), command.question);
            isCommandRunning = false;
          }, 0);
        } else {
          let i = 0;
          setQuestion("");
          const typeChar = () => {
            if (isCleanedUp) return;
            if (i < command.question.length) {
              setQuestion(command.question.slice(0, i + 1));
              i++;
              typingTimeout = window.setTimeout(typeChar, 30);
            } else {
              handleAskRef.current(new Event("submit"), command.question);
              isCommandRunning = false;
            }
          };
          typeChar();
        }
      } else if (command.type === "progress-coach" && role === "Student") {
        handleProgressCoachRef.current();
        isCommandRunning = false;
      } else if (command.type === "department-report" && role === "HOD") {
        handleDepartmentReportRef.current(command.reportType);
        isCommandRunning = false;
      } else {
        isCommandRunning = false;
      }
    };

    window.addEventListener(ARO_DEMO_COMMAND_EVENT, handler);
    return () => {
      isCleanedUp = true;
      cancelRun();
      window.removeEventListener(ARO_DEMO_COMMAND_EVENT, handler);
      window.removeEventListener(DEMO_MOVIE_CHANGED_EVENT, movieChangeHandler);
    };
  }, [role]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-tour="arogya-launcher"
          aria-label={open ? "Close Arogya assistant" : "Open Arogya assistant"}
          className="print:hidden fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-teal-100 bg-white shadow-[0_12px_24px_rgba(15,23,42,0.12)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
        >
          <ArogyaCharacter state={characterState} size={36} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        collisionPadding={12}
        aria-labelledby="arogya-panel-heading"
        aria-describedby="arogya-panel-description"
        data-tour="arogya-panel"
        className="flex h-[min(68dvh,38rem)] min-h-[min(24rem,calc(100dvh-2rem))] w-[min(26rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] flex-col gap-0 overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/85 p-0 text-slate-800 shadow-[0_28px_80px_rgba(15,23,42,0.2)] backdrop-blur-2xl motion-reduce:animate-none supports-[backdrop-filter]:bg-white/70"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/80 bg-white/55 px-4 py-3 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-teal-100/80 bg-teal-50/80">
              <ArogyaCharacter state={characterState} size={36} />
            </div>
            <div className="min-w-0">
              <h2 id="arogya-panel-heading" className="font-display text-base font-bold leading-tight text-teal-950">Arogya</h2>
              <p className="mt-0.5 text-xs font-medium text-slate-500">Your assistant</p>
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Close Arogya assistant"
            onClick={() => onOpenChange(false)}
            className="h-11 w-11 shrink-0 rounded-full text-slate-500 hover:bg-white/80 hover:text-slate-800"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
          <p id="arogya-panel-description" className="sr-only">Arogya assistant panel with role-specific suggestions and a prompt box.</p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {contextError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">{contextError}</p>}
          {maintenanceNotice && (
            <section aria-label="ELogbook service notice" className="shrink-0 rounded-xl border border-slate-200 border-l-4 border-l-teal-700 bg-white/85 p-3 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-wide text-teal-800">ELogbook service notice</p>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">{maintenanceNotice.title}</h3>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{maintenanceNotice.message}</p>
            </section>
          )}

          <section aria-label="Sample prompts" className="shrink-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Try a prompt</p>
            <div className="flex flex-wrap gap-2">
              {role === "Student" && (
                <>
                  <Button type="button" variant="outline" size="sm" data-tour="arogya-coach" className="min-h-11 rounded-full border-teal-200/90 bg-white/80 px-3 text-xs text-teal-900 shadow-sm hover:bg-teal-50" onClick={handleProgressCoach}>
                    My progress coach
                  </Button>
                  <Button type="button" variant="outline" size="sm" data-tour="arogya-due" className="min-h-11 rounded-full border-teal-200/90 bg-white/80 px-3 text-xs text-teal-900 shadow-sm hover:bg-teal-50" onClick={handleWhatsDue}>
                    What's due?
                  </Button>
                </>
              )}
              {role === "Faculty" && (
                <Button type="button" variant="outline" size="sm" className="min-h-11 rounded-full border-teal-200/90 bg-white/80 px-3 text-xs text-teal-900 shadow-sm hover:bg-teal-50" onClick={handlePendingReviews}>
                  My pending reviews
                </Button>
              )}
              {role === "HOD" && (
                <>
                  <Button type="button" variant="outline" size="sm" data-tour="arogya-report" className="min-h-11 rounded-full border-teal-200/90 bg-white/80 px-3 text-xs text-teal-900 shadow-sm hover:bg-teal-50" onClick={() => handleDepartmentReport("report")}>
                    Department report
                  </Button>
                  <Button type="button" variant="outline" size="sm" data-tour="arogya-falling-behind" className="min-h-11 rounded-full border-teal-200/90 bg-white/80 px-3 text-xs text-teal-900 shadow-sm hover:bg-teal-50" onClick={() => handleDepartmentReport("falling_behind")}>
                    Who's falling behind?
                  </Button>
                </>
              )}
            </div>
            {assistantContext?.mode === "v2" && role !== "Student" && <div className="mt-2 space-y-1">
              <label htmlFor="arogya-resident-context" className="text-xs font-medium text-slate-600">Resident for record checks</label>
              <select id="arogya-resident-context" value={selectedResidentId} onChange={(event) => {
                const value = event.target.value;
                requestSequence.current++;
                setCharacterState("idle");
                setSelectedResidentId(value);
                setSelectedContext((current) => ({ ...current, studentId: value ? Number(value) : undefined }));
              }} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                <option value="">Select a resident to check a record</option>
                {residentOptions.map((student) => <option key={student.id} value={student.id}>{student.name}{student.registrationNumber ? ` · ${student.registrationNumber}` : ""}</option>)}
              </select>
              {residentsError && <p role="status" className="text-[11px] text-slate-500">{residentsError}</p>}
            </div>}
          </section>

          <div role="log" aria-label="Arogya conversation" aria-live="polite" data-tour="arogya-messages" className="flex min-h-0 flex-1 flex-col gap-3">
            {messages.length === 0 ? (
              <div className="my-auto flex min-h-32 flex-col items-center justify-center rounded-2xl border border-white/80 bg-white/55 px-5 py-5 text-center shadow-sm">
                <ArogyaCharacter state={characterState} size={54} />
                <p className="mt-2 text-sm font-semibold text-slate-800">What can I help with?</p>
                <p className="mt-1 max-w-[18rem] text-xs leading-relaxed text-slate-500">Choose a sample prompt above or write your own below.</p>
              </div>
            ) : messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {msg.role === "arogya" && (
                  <div className="mt-1 shrink-0">
                    <ArogyaCharacter state={idx === messages.length - 1 ? characterState : "idle"} size={28} />
                  </div>
                )}
                <div className={`max-w-[88%] rounded-2xl border px-3.5 py-3 text-sm shadow-sm ${msg.role === "user" ? "rounded-tr-md border-teal-200/80 bg-teal-50/90 text-right text-teal-950" : "rounded-tl-md border-white/90 bg-white/85 text-left text-slate-700"}`}>
                  {msg.answer ? (
                    <AssistantAnswer answer={msg.answer} onNavigate={(href) => { onNavigate(href); onOpenChange(false); }} />
                  ) : msg.links !== undefined ? (
                    <div className="flex flex-col gap-2">
                      <p className="mb-1 font-semibold text-teal-950">{msg.heading}</p>
                      {/* Empty state wording MUST be exactly "No new notifications right now." — bell fetch errors are silent */}
                      {msg.links.length === 0 ? (
                        <p className="text-slate-500">No new notifications right now.</p>
                      ) : (
                        msg.links.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => { onNavigate(item.href); onOpenChange(false); }}
                            className="w-full rounded-lg border border-slate-100 bg-slate-50 p-2 text-left text-xs font-medium transition-colors hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
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
                      {isDemoMode() && <p className="mt-2 text-[10px] text-slate-400 font-medium">Sample AI output</p>}
                    </>
                  ) : (
                    <>
                      <p className={`whitespace-pre-wrap font-medium ${msg.error ? "text-red-700" : "text-slate-800"}`}>
                        {isDemoMode() && !msg.error && msg.role === "arogya" && msg.text ? (
                          <DemoTypedText text={msg.text} onDone={idx === messages.length - 1 ? handleRevealDone : undefined} />
                        ) : msg.text}
                      </p>
                      {isDemoMode() && !msg.error && msg.role === "arogya" && <p className="mt-2 text-[10px] text-slate-400 font-medium">Sample AI output</p>}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="shrink-0 border-t border-white/80 bg-white/70 p-3.5 backdrop-blur-xl">
          {messages.length > 0 && <div className="mb-2 flex justify-end"><button type="button" onClick={() => {
            requestSequence.current++;
            setMessages([]);
            setQuestion("");
            setCharacterState("idle");
          }} className="text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-800">Clear conversation</button></div>}
          <form onSubmit={handleAsk} className="flex flex-col gap-1.5">
            <label htmlFor="arogya-ask-input" className="text-xs font-semibold text-slate-700">Ask Arogya</label>
            <div className="relative">
              <Input
                id="arogya-ask-input"
                data-tour="arogya-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={characterState === "thinking" || assistantContext === null}
                placeholder="Write a prompt..."
                className="h-12 rounded-xl border-slate-200 bg-white/90 pr-14 text-sm shadow-inner focus-visible:ring-teal-600"
              />
              <Button
                type="submit"
                aria-label="Send prompt to Arogya"
                disabled={characterState === "thinking" || !question.trim() || assistantContext === null}
                size="icon"
                className="absolute right-0.5 top-0.5 h-11 w-11 rounded-lg bg-teal-700 text-white shadow-sm hover:bg-teal-800"
              >
                <SendHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <span className="ml-1 text-xs font-medium text-slate-500">Don't type patient details.</span>
          </form>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
