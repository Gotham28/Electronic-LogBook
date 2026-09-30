import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SendHorizontal } from "lucide-react";
import { ArogyaCharacter, type ArogyaState } from "./ArogyaCharacter";

type RoleType = "Student" | "Faculty" | "HOD";

interface PanelNotifItem {
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
  const [activeTab, setActiveTab] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState("");
  const [messages, setMessages] = React.useState<{ text?: string; tips?: string[]; error?: boolean; role: "user" | "arogya" }[]>([]);

  React.useEffect(() => {
    if (!open) return undefined;
    setCharacterState("waving");
    setActiveTab(null);
    const timer = setTimeout(() => setCharacterState("idle"), 1500);
    return () => clearTimeout(timer);
  }, [open]);

  // "What's due?" -> All current Student notifications
  const studentDue = notifItems;
  // "My pending reviews" -> Faculty notifications strictly marked 'faculty_queue'
  const facultyPending = notifItems.filter((i) => i.id === "faculty_queue");

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || characterState === "thinking") return;
    
    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setCharacterState("thinking");
    setActiveTab("ask_reply");

    try {
      const res = await fetch("/api/arogya/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Arogya couldn't answer right now.");
      setCharacterState("talking");
      setMessages((prev) => [...prev, { role: "arogya", text: data.reply }]);
      setQuestion("");
    } catch (err: any) {
      setCharacterState("error");
      setMessages((prev) => [...prev, { role: "arogya", text: "Arogya couldn't answer right now.", error: true }]);
    }
  };

  const handleProgressCoach = async () => {
    if (characterState === "thinking") return;
    
    setMessages((prev) => [...prev, { role: "user", text: "My progress coach" }]);
    setCharacterState("thinking");
    setActiveTab("ask_reply");

    try {
      const res = await fetch("/api/arogya/progress-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Arogya couldn't answer right now.");
      
      setCharacterState("talking");
      setMessages((prev) => [...prev, { role: "arogya", tips: data.tips }]);
    } catch (err: any) {
      setCharacterState("error");
      setMessages((prev) => [...prev, { role: "arogya", text: "Arogya couldn't answer right now.", error: true }]);
    }
  };

  const handleDepartmentReport = async (type: "report" | "falling_behind") => {
    if (characterState === "thinking") return;
    
    setMessages((prev) => [...prev, { role: "user", text: type === "report" ? "Department report" : "Who's falling behind?" }]);
    setCharacterState("thinking");
    setActiveTab("ask_reply");

    try {
      const res = await fetch("/api/arogya/department-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Arogya couldn't answer right now.");
      
      setCharacterState("talking");
      setMessages((prev) => [...prev, { role: "arogya", text: data.reply }]);
    } catch (err: any) {
      setCharacterState("error");
      setMessages((prev) => [...prev, { role: "arogya", text: err.message || "Arogya couldn't answer right now.", error: true }]);
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
                <Button variant="outline" size="sm" className="rounded-full bg-white text-teal-800 border-teal-200 hover:bg-teal-50" onClick={() => setActiveTab("student_due")}>
                  What's due?
                </Button>
              </>
            )}
            
            {role === "Faculty" && (
              <>
                <Button variant="outline" size="sm" className="rounded-full bg-white text-teal-800 border-teal-200 hover:bg-teal-50" onClick={() => setActiveTab("faculty_pending")}>
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
            {activeTab === "ask_reply" && messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {msg.role === "arogya" && (
                  <div className="mt-1 shrink-0">
                    <ArogyaCharacter state={idx === messages.length - 1 ? characterState : "idle"} size={32} />
                  </div>
                )}
                <div className={`bg-white rounded-2xl p-3.5 shadow-sm border border-teal-100 text-sm text-slate-700 max-w-[85%] ${msg.role === "user" ? "bg-teal-50 rounded-tr-sm text-right" : "rounded-tl-sm text-left"}`}>
                  {msg.tips ? (
                    <ol className="list-decimal pl-4 space-y-2">
                      {msg.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                    </ol>
                  ) : (
                    <p className={`font-medium whitespace-pre-wrap ${msg.error ? "text-red-600" : "text-slate-800"}`}>{msg.text}</p>
                  )}
                </div>
              </div>
            ))}

            {activeTab && activeTab !== "ask_reply" && (
              <div className="flex gap-3">
                <div className="mt-1 shrink-0">
                  <ArogyaCharacter state="idle" size={32} />
                </div>
                <div className="bg-white rounded-2xl rounded-tl-sm p-3.5 shadow-sm border border-teal-100 text-sm text-slate-700 w-full">
                  
                  {/* Student What's Due */}
                  {activeTab === "student_due" && (
                    <div className="flex flex-col gap-2">
                      <p className="font-semibold text-teal-900 mb-1">Items that need your attention:</p>
                      {/* Empty state wording MUST be exactly "No new notifications right now." to respect AGENTS.md §7, as backend fetch errors are swallowed silently. */}
                      {studentDue.length === 0 ? (
                        <p className="text-slate-500">No new notifications right now.</p>
                      ) : (
                        studentDue.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              onNavigate(item.href);
                              onOpenChange(false);
                            }}
                            className="text-left w-full p-2 bg-slate-50 hover:bg-teal-50 rounded-lg border border-slate-100 transition-colors text-xs font-medium"
                          >
                            {item.text}
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {/* Faculty Pending Reviews */}
                  {activeTab === "faculty_pending" && (
                    <div className="flex flex-col gap-2">
                      <p className="font-semibold text-teal-900 mb-1">Your pending reviews:</p>
                      {facultyPending.length === 0 ? (
                        <p className="text-slate-500">No new notifications right now.</p>
                      ) : (
                        facultyPending.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              onNavigate(item.href);
                              onOpenChange(false);
                            }}
                            className="text-left w-full p-2 bg-slate-50 hover:bg-teal-50 rounded-lg border border-slate-100 transition-colors text-xs font-medium"
                          >
                            {item.text}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
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
