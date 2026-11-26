import * as React from "react";
import { HelpCircle, Send, Check, Copy, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  submitSupportTicket,
  type SupportTicketCategory,
} from "@/lib/apiClient";
import { getCurrentUser, isDemoMode, SESSION_USER_CHANGED_EVENT } from "@/lib/session";

// Feature flag: reactivated with unauthenticated restriction (only "login_issue" permitted signed out)
export const SUPPORT_FEATURE_ENABLED = true;

export const OPEN_SUPPORT_WIDGET_EVENT = "elogbook:open-support";

export function openSupportWidget(preset?: { category?: SupportTicketCategory }) {
  if (!SUPPORT_FEATURE_ENABLED) return;
  window.dispatchEvent(
    new CustomEvent(OPEN_SUPPORT_WIDGET_EVENT, { detail: preset })
  );
}

export function SupportWidget() {
  if (!SUPPORT_FEATURE_ENABLED) return null;

  const [currentUser, setCurrentUser] = React.useState(getCurrentUser);
  const [isOpen, setIsOpen] = React.useState(false);
  const [category, setCategory] = React.useState<SupportTicketCategory>(() => (getCurrentUser() ? "bug" : "login_issue"));
  const [message, setMessage] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [honeypot, setHoneypot] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [referenceCode, setReferenceCode] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const isDemo = isDemoMode();

  React.useEffect(() => {
    const handleUserChange = () => {
      const user = getCurrentUser();
      setCurrentUser(user);
      if (!user) {
        setCategory("login_issue");
      }
    };
    window.addEventListener(SESSION_USER_CHANGED_EVENT, handleUserChange);
    window.addEventListener("popstate", handleUserChange);
    return () => {
      window.removeEventListener(SESSION_USER_CHANGED_EVENT, handleUserChange);
      window.removeEventListener("popstate", handleUserChange);
    };
  }, []);

  // Arogya AI mascot is active in AppLayout for all authenticated non-admin users (Student, Faculty, HOD)
  const hasArogyaLauncher = Boolean(currentUser && currentUser.role !== "admin");

  // Prefill user details if available and reset when dialog opens
  const initUserFields = React.useCallback(() => {
    const user = getCurrentUser();
    if (user) {
      if (user.name) setName(user.name);
    }
  }, []);

  React.useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<{ category?: SupportTicketCategory }>;
      const user = getCurrentUser();
      if (!user) {
        setCategory("login_issue");
      } else if (customEvent.detail?.category) {
        setCategory(customEvent.detail.category);
      } else {
        setCategory("bug");
      }
      initUserFields();
      setReferenceCode(null);
      setIsOpen(true);
    };

    window.addEventListener(OPEN_SUPPORT_WIDGET_EVENT, handleOpen);
    return () => {
      window.removeEventListener(OPEN_SUPPORT_WIDGET_EVENT, handleOpen);
    };
  }, [initUserFields]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      const user = getCurrentUser();
      if (!user) {
        setCategory("login_issue");
      }
      initUserFields();
      setReferenceCode(null);
    } else {
      // Reset form if closed after submission
      if (referenceCode) {
        setMessage("");
        setHoneypot("");
        setReferenceCode(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isDemo) {
      toast.error("Support ticket submission is not available in demo mode.");
      return;
    }

    const trimmedMsg = message.trim();
    if (trimmedMsg.length < 10) {
      toast.error("Please provide a message with at least 10 characters.");
      return;
    }
    if (trimmedMsg.length > 2000) {
      toast.error("Message is too long (maximum 2000 characters).");
      return;
    }

    if (email && email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        toast.error("Please enter a valid email address.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Auto-capture pathname only (strip query string and fragment for privacy)
      const pathname = window.location.pathname.slice(0, 500);
      const userAgent = navigator.userAgent ? navigator.userAgent.slice(0, 300) : null;
      const finalCategory = currentUser ? category : "login_issue";

      const res = await submitSupportTicket({
        category: finalCategory,
        message: trimmedMsg,
        name: name.trim() || null,
        email: email.trim() || null,
        pageUrl: pathname,
        userAgent,
        honeypot: honeypot || null,
      });

      setReferenceCode(res.referenceCode);
      toast.success("Support ticket submitted successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to submit support ticket. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = () => {
    if (!referenceCode) return;
    navigator.clipboard.writeText(referenceCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Reference code copied to clipboard.");
    });
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={`print:hidden fixed z-40 flex items-center gap-2 rounded-full border border-line-soft bg-card px-3.5 py-2 text-xs font-semibold text-forest shadow-md backdrop-blur-sm transition-all hover:bg-mist hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:px-4 sm:py-2.5 sm:text-sm ${
          hasArogyaLauncher
            ? "bottom-[calc(86px+env(safe-area-inset-bottom))] right-20 sm:bottom-[31px] sm:right-24"
            : "bottom-4 right-4 sm:bottom-6 sm:right-6"
        }`}
        aria-label="Need help? Report a problem or contact support"
      >
        <HelpCircle className="h-4 w-4 text-forest sm:h-4 sm:w-4" />
        <span>Need help?</span>
      </button>

      {/* Support Dialog */}
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-ink">
              <HelpCircle className="h-5 w-5 text-forest" />
              {referenceCode ? "Ticket Submitted" : "Report a Problem / Support"}
            </DialogTitle>
            <DialogDescription className="text-xs text-helper">
              {referenceCode
                ? "Your ticket has been received and logged."
                : "Need help or found an issue? Tell us what went wrong and our team will investigate."}
            </DialogDescription>
          </DialogHeader>

          {referenceCode ? (
            <div className="space-y-4 py-3">
              <div className="rounded-xl border border-status-border bg-status p-4 text-center">
                <p className="text-xs font-medium text-status-foreground">Your Ticket Reference Code</p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span className="font-mono text-xl font-bold tracking-wider text-status-foreground">
                    {referenceCode}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCode}
                    className="h-8 border-status-border bg-white px-2.5 text-xs text-status-foreground hover:bg-status"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-status-foreground" /> : <Copy className="h-3.5 w-3.5" />}
                    <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
                <p className="mt-3 text-xs text-soft-ink">
                  Please keep this reference code handy. Our administrator has been notified.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="bg-forest text-white hover:bg-deep"
                >
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              {/* Privacy Warning */}
              <div className="flex items-start gap-2.5 rounded-lg border border-status-border bg-status p-3 text-xs text-status-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-foreground" />
                <span>
                  <strong>Important:</strong> Do not include patient details, medical records, or passwords.
                </span>
              </div>

              {isDemo && (
                <div className="rounded-lg border border-line-soft bg-mist p-2.5 text-xs text-soft-ink">
                  <strong>Notice:</strong> Support tickets cannot be submitted in demo mode. Please sign in with a real account to report issues.
                </div>
              )}

              {/* Category */}
              <div className="space-y-1.5">
                <Label htmlFor="support-category" className="text-xs font-semibold text-ink">
                  Category <span className="text-status-foreground">*</span>
                </Label>
                {currentUser ? (
                  <Select
                    value={category}
                    onValueChange={(val) => setCategory(val as SupportTicketCategory)}
                  >
                    <SelectTrigger id="support-category" className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="login_issue">Cannot log in / Account issue</SelectItem>
                      <SelectItem value="bug">Report a Bug / Error</SelectItem>
                      <SelectItem value="feature_request">Feature Request</SelectItem>
                      <SelectItem value="other">Other Inquiry / Feedback</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex h-10 w-full items-center justify-between rounded-md border border-line-soft bg-mist px-3 py-2 text-sm text-ink">
                      <span>Cannot log in / Account access</span>
                      <span className="rounded bg-mist px-2 py-0.5 text-[11px] font-medium text-forest border border-line-soft">
                        Login Issue
                      </span>
                    </div>
                    <p className="text-[11px] text-helper">
                      Public reports are restricted to login issues. Please log in to report bugs or request features.
                    </p>
                  </div>
                )}
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="support-message" className="text-xs font-semibold text-ink">
                    Message <span className="text-status-foreground">*</span>
                  </Label>
                  <span className="text-[11px] text-helper">
                    {message.length}/2000
                  </span>
                </div>
                <Textarea
                  id="support-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe the issue or feedback in detail (at least 10 characters)..."
                  rows={4}
                  maxLength={2000}
                  required
                  disabled={isSubmitting || isDemo}
                  className="resize-none text-sm"
                />
              </div>

              {/* Name & Email (optional but encouraged) */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="support-name" className="text-xs font-semibold text-ink">
                    Your Name <span className="text-helper font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="support-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Full Name"
                    maxLength={100}
                    disabled={isSubmitting || isDemo}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="support-email" className="text-xs font-semibold text-ink">
                    Email for Reply <span className="text-helper font-normal">(optional)</span>
                  </Label>
                  <Input
                    id="support-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    maxLength={254}
                    disabled={isSubmitting || isDemo}
                    className="text-sm"
                  />
                </div>
              </div>

              {/* Hidden honeypot field for bot protection */}
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="hidden"
                style={{ display: "none" }}
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || isDemo || message.trim().length < 10}
                  className="bg-forest text-white hover:bg-deep"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Submit Ticket
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
