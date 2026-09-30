import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SendHorizontal } from "lucide-react";
import { ArogyaCharacter, type ArogyaState } from "./ArogyaCharacter";
import { apiPost } from "@/lib/apiClient";

type RoleType = "Student" | "Faculty" | "HOD";

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
  notifItems: PanelNotifItem[];
  onNavigate: (href: string) => void;
}

export function ArogyaPanel({ open, onOpenChange, role, notifItems, onNavigate }: ArogyaPanelProps) {
  const [characterState, setCharacterState] = React.useState<ArogyaState>("idle");
  const [question, setQuestion] = React.useState("");
  const [messages, setMessages] = React.useState<{
    role: "user" | "arogya";
    text?: string;
    tips?: string[];
    error?: boolean;
    links?: SnapshotLink[];
    heading?: string;
  }[]>([]);

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
        heading: "Items that need your attention:",
        links: snapshot,
      },
    ]);
  };

  const handlePendingReviews = () => {
    // Snapshot filtered at click time (req 5)
    const snapshot = notifItems.filter((i) => i.id === "faculty_queue");
    setMessages((prev) => [
      ...prev,
      { role: "user", text: "My pending reviews" },
      {
        role: "arogya",
        heading: "Your pending reviews:",
        links: snapshot,
      },
    ]);
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || characterState === "thinking") return;
    
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setCharacterState("thinking");

    try {
      const data = await apiPost("/api/arogya/ask", { question });
      if (typeof data.reply !== "string") throw new Error("Invalid shape");
      setCharacterState("talking");
      setMessages((prev) => [...prev, { role: "arogya", text: data.reply }]);
      setQuestion("");
    } catch (err: any) {
      setCharacterState("error");
      setMessages((prev) => [...prev, { role: "arogya", text: err?.data?.error ?? "Arogya couldn't answer right now.", error: true }]);
    }
  };

  const handleProgressCoach = async () => {
    if (characterState === "thinking") return;
    
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-full flex flex-col p-0 sm:max-w-md border-l border-teal-100 bg-slate-50/50">
        <SheetDescription className="sr-only">Arogya assistant panel</SheetDescription>
        
        {/* Header */}
        <SheetHeader className="flex flex-row items-center justify-between p-4 bg-white border-b shadow-sm space-y-0">
          <div className="flex items-center gap-3">
            <ArogyaCharacter state={characterState} size={40} />
            <div className="flex flex-col text-left">
              <SheetTitle className="text-base text-teal-900 font-bold">Arogya</SheetTitle>
              <span className="text-xs text-slate-500 font-medium">Your assistant</span>
            </div>
          </div>
          {/* Removed extra SheetClose here because SheetContent includes one built-in */}
        </SheetHeader>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          
          {/* Quick Actions (Role specific) */}
          <div className="flex flex-wrap gap-2 shrink-0">
            {role === "Student" && (
              <>
                <Button variant="outline" size="sm" className="rounded-full bg-white text-teal-800 border-teal-200 hover:bg-teal-50" onClick={handleProgressCoach}>
                  My progress coach
                </Button>
                <Button variant="outline" size="sm" className="rounded-full bg-white text-teal-800 border-teal-200 hover:bg-teal-50" onClick={handleWhatsDue}>
                  What's due?
                </Button>
              </>
            )}
            
            {role === "Faculty" && (
              <>
                <Button variant="outline" size="sm" className="rounded-full bg-white text-teal-800 border-teal-200 hover:bg-teal-50" onClick={handlePendingReviews}>
                  My pending reviews
                </Button>
              </>
            )}

            {role === "HOD" && (
              <>
                <Button variant="outline" size="sm" className="rounded-full bg-white text-teal-800 border-teal-200 hover:bg-teal-50" onClick={() => handleDepartmentReport("report")}>
                  Department report
                </Button>
                <Button variant="outline" size="sm" className="rounded-full bg-white text-teal-800 border-teal-200 hover:bg-teal-50" onClick={() => handleDepartmentReport("falling_behind")}>
                  Who's falling behind?
                </Button>
              </>
            )}
          </div>

          {/* Chat Bubble Area */}
          <div className="flex flex-col gap-3 mt-4">
            {messages.length > 0 && messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {msg.role === "arogya" && (
                  <div className="mt-1 shrink-0">
                    <ArogyaCharacter state={idx === messages.length - 1 ? characterState : "idle"} size={32} />
                  </div>
                )}
                <div className={`bg-white rounded-2xl p-3.5 shadow-sm border border-teal-100 text-sm text-slate-700 max-w-[85%] ${msg.role === "user" ? "bg-teal-50 rounded-tr-sm text-right" : "rounded-tl-sm text-left"}`}>
                  {msg.links !== undefined ? (
                    <div className="flex flex-col gap-2">
                      <p className="font-semibold text-teal-900 mb-1">{msg.heading}</p>
                      {/* Empty state wording MUST be exactly "No new notifications right now." — AGENTS.md §7: bell fetch errors are silent */}
                      {msg.links.length === 0 ? (
                        <p className="text-slate-500">No new notifications right now.</p>
                      ) : (
                        msg.links.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => { onNavigate(item.href); onOpenChange(false); }}
                            className="text-left w-full p-2 bg-slate-50 hover:bg-teal-50 rounded-lg border border-slate-100 transition-colors text-xs font-medium"
                          >
                            {item.text}
                          </button>
                        ))
                      )}
                    </div>
                  ) : msg.tips ? (
                    <ol className="list-decimal pl-4 space-y-2">
                      {msg.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                    </ol>
                  ) : (
                    <p className={`font-medium whitespace-pre-wrap ${msg.error ? "text-red-600" : "text-slate-800"}`}>{msg.text}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Input Footer */}
        <div className="p-4 bg-white border-t">
          <form onSubmit={handleAsk} className="flex flex-col gap-2">
            <label htmlFor="arogya-ask-input" className="text-xs font-semibold text-slate-700">Ask Arogya anything</label>
            <div className="relative">
              <Input 
                id="arogya-ask-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={characterState === "thinking"}
                placeholder="Ask a question..." 
                className="pr-10 rounded-xl bg-slate-50"
              />
              <Button type="submit" disabled={characterState === "thinking" || !question.trim()} size="icon" variant="ghost" className="absolute right-1 top-1 h-8 w-8 text-teal-600">
                <SendHorizontal className="h-4 w-4" />
              </Button>
            </div>
            <span className="text-[10px] text-slate-400 font-medium ml-1">Don't type patient details.</span>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
