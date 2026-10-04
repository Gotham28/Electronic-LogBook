import * as React from "react";
import {
  BookOpenCheck, KeyRound, ShieldCheck, UserPlus, Loader2,
  Sparkles, LogIn, ChevronLeft, ArrowRight, VolumeX, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/apiClient";
import { LoginProductPreview } from "@/components/LoginProductPreview";
import { clearMaintenanceNoticeSession, saveToken } from "@/lib/session";
import { PaymentStep } from "@/components/PaymentStep";
import { unlockDemoAudio } from "@/lib/demoSounds";
import { startDemoSession, setDemoMovieActive } from "@/lib/demoSession";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "picker" | "login";

// ─── Component ────────────────────────────────────────────────────────────────

export function LoginPage({ onSignIn, onRegister }: { onSignIn: () => void; onRegister: () => void }) {
  const [mode, setMode] = React.useState<Mode>("picker");

  // Demo state
  const [demoLoading, setDemoLoading] = React.useState(false);
  const [showIntroVideo, setShowIntroVideo] = React.useState(false);
  const [mutedByBrowser, setMutedByBrowser] = React.useState(false);
  const [needsManualPlay, setNeedsManualPlay] = React.useState(false);
  const introVideoRef = React.useRef<HTMLVideoElement | null>(null);
  // Login credentials
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [pendingPaymentToken, setPendingPaymentToken] = React.useState<string | null>(null);

  // Forgot-password flow (logic unchanged)
  const [forgotStep, setForgotStep] = React.useState<0 | 1 | 2 | 3>(0);
  const [resetEmail, setResetEmail] = React.useState("");
  const [resetOtp, setResetOtp] = React.useState("");
  const [verificationToken, setVerificationToken] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmNewPassword, setConfirmNewPassword] = React.useState("");
  const [isResetting, setIsResetting] = React.useState(false);

  // ── Navigation ────────────────────────────────────────────────────────────

  const goBack = () => {
    setMode("picker");
    setError(null);
    setForgotStep(0);
    setUsername("");
    setPassword("");
  };

  // ── Demo Movie Startup ────────────────────────────────────────────────────

  const proceedToActualDemo = React.useCallback(() => {
    if (demoLoading) return;
    setDemoLoading(true);
    try {
      if (introVideoRef.current) {
        introVideoRef.current.pause();
      }
      setShowIntroVideo(false);
      unlockDemoAudio();
      startDemoSession("student");
      setDemoMovieActive();
      onSignIn();
    } catch (err: any) {
      toast.error(err.message || "Failed to start demo. Please try again.");
    } finally {
      setDemoLoading(false);
    }
  }, [demoLoading, onSignIn]);

  const startIntroPlayback = React.useCallback(async () => {
    const video = introVideoRef.current;
    if (!video) return;
    setNeedsManualPlay(false);
    try {
      video.muted = false;
      setMutedByBrowser(false);
      await video.play();
    } catch {
      try {
        video.muted = true;
        setMutedByBrowser(true);
        await video.play();
      } catch {
        setNeedsManualPlay(true);
      }
    }
  }, []);

  React.useEffect(() => {
    if (!showIntroVideo) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    void startIntroPlayback();
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showIntroVideo, startIntroPlayback]);

  const handleMovieStart = () => {
    if (demoLoading) return;
    unlockDemoAudio();
    setShowIntroVideo(true);
  };

  // ── Real sign-in ─────────────────────────────────────────────────────────

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username || !password) return;

    try {
      setIsLoading(true);
      setError(null);

      const user = await apiPost("/api/auth/login", { username, password });

      clearMaintenanceNoticeSession();
      if (user.token) saveToken(user.token);
      window.sessionStorage.setItem("elogbook-user", JSON.stringify(user));
      window.sessionStorage.setItem("elogbook-login-summary-pending", "true");
      onSignIn();
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 402 && typeof err.data?.paymentToken === "string") {
        setPendingPaymentToken(err.data.paymentToken);
        return;
      }
      setError(err.message || "Failed to sign in. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  // ── Forgot-password handlers (unchanged) ─────────────────────────────────

  const handleForgotSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setIsResetting(true);
    try {
      await apiPost("/api/auth/forgot-password", { email: resetEmail });
      toast.success("If an account exists, a reset code was sent");
      setForgotStep(2);
    } catch (err: any) {
      toast.error(err.message || "Failed to send code");
    } finally {
      setIsResetting(false);
    }
  };

  const handleForgotVerifyOtp = async () => {
    if (resetOtp.length !== 6) return;
    setIsResetting(true);
    try {
      const verified = await apiPost("/api/auth/verify-reset-otp", { email: resetEmail, otp: resetOtp });
      setVerificationToken(verified.verificationToken);
      toast.success("Code verified");
      setForgotStep(3);
    } catch (err: any) {
      toast.error(err.message || "Invalid or expired code");
    } finally {
      setIsResetting(false);
    }
  };

  const handleForgotResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) { toast.error("Passwords do not match"); return; }
    setIsResetting(true);
    try {
      await apiPost("/api/auth/reset-password", { email: resetEmail, newPassword, verificationToken });
      toast.success("Password reset. Please log in with your new password.");
      setForgotStep(0);
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setIsResetting(false);
    }
  };

  // ── Payment gate ──────────────────────────────────────────────────────────

  if (pendingPaymentToken) {
    return (
      <PaymentStep
        paymentToken={pendingPaymentToken}
        onPaid={() => {
          toast.success("Payment received", {
            description: "Sign in again once your HOD has approved your account.",
          });
          setPendingPaymentToken(null);
        }}
        onExit={() => setPendingPaymentToken(null)}
      />
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="medical-grid flex flex-1 items-center justify-center p-4 md:p-8">
        <div className="glass-panel grid w-full max-w-6xl overflow-hidden rounded-[30px] lg:grid-cols-[1.08fr_.92fr]">

        {/* Left branding panel — unchanged */}
        <section className="relative overflow-hidden bg-gradient-to-br from-teal-700 via-teal-600 to-cyan-500 p-8 text-white md:p-12 transition-colors">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[42px] border-white/10" />
          <div className="absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-cyan-300/15 blur-2xl" />
          <div className="relative flex flex-col h-full justify-between">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/16 shadow-lg ring-1 ring-white/25">
                <BookOpenCheck className="h-7 w-7" />
              </div>
              <h1 className="mt-10 max-w-xl text-4xl font-bold leading-[1.05] md:text-5xl">
                Clinical training, clearly organised.
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-6 text-teal-50/85">
                Keep cases, procedures, academic work, assessments and milestones together.
              </p>
              <LoginProductPreview />
            </div>
          </div>
        </section>

        {/* Right panel */}
        <section className="bg-white/80 p-8 md:p-12 flex items-center">
          <div className="mx-auto w-full max-w-sm">

            {/* ── MODE: Picker ─────────────────────────────────────────── */}
            {mode === "picker" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <p className="page-eyebrow">Arogya E-LogBook</p>
                <h2 className="mt-2 text-4xl font-bold text-slate-900">Welcome</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Already have an account? Sign in. New here? Explore the demo first.
                </p>

                <div className="mt-8 space-y-3">
                  {/* Sign In card */}
                  <button
                    onClick={() => setMode("login")}
                    className="flex w-full items-center gap-4 rounded-2xl border border-[#0F766E] bg-[#0F766E] p-4 text-left text-white shadow-[0_10px_24px_rgba(15,118,110,0.16)] transition-[background-color,box-shadow] duration-150 hover:bg-[#0B665F] hover:shadow-[0_14px_28px_rgba(15,118,110,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 sm:p-5"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/20">
                      <LogIn className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-base">Sign In to my account</p>
                      <p className="mt-0.5 text-xs text-teal-100">For registered residents, faculty and HOD</p>
                    </div>
                  </button>

                  {/* Demo card */}
                  <button
                    onClick={handleMovieStart}
                    disabled={demoLoading}
                    className="flex w-full items-center gap-4 rounded-2xl border border-[#D9EAE7] bg-white p-4 text-left shadow-sm transition-[border-color,background-color,box-shadow] duration-150 hover:border-[#A9D4CF] hover:bg-[#F2F8F7] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:p-5"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F2F8F7] text-[#0F766E] ring-1 ring-[#D9EAE7]">
                      {demoLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" strokeWidth={1.8} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#16323A]">Show demo</p>
                      <p className="mt-0.5 text-xs leading-5 text-[#52696C]">A guided tour of the logbook. No sign-in needed.</p>
                    </div>
                  </button>
                  <video src="/demo-video.mp4" preload="auto" className="hidden" aria-hidden="true" muted />
                </div>
              </div>
            )}



            {/* ── MODE: Login ──────────────────────────────────────────── */}
            {mode === "login" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <button
                  type="button"
                  onClick={goBack}
                  className="mb-6 flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
                >
                  <ChevronLeft className="h-3 w-3" /> Back
                </button>

                <p className="page-eyebrow">Secure access</p>
                <h2 className="mt-2 text-4xl font-bold text-slate-900">Sign in</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Sign in with your university registration number or email address and password.
                </p>

                {error && (
                  <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                    {error}
                  </div>
                )}

                {/* Forgot-password flow */}
                {forgotStep > 0 ? (
                  <div className="mt-9 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between mb-2">
                      {forgotStep > 1 ? (
                        <button type="button" onClick={() => setForgotStep(forgotStep === 3 ? 2 : 1 as any)} className="text-xs text-teal-700 hover:underline block">
                          &larr; Back
                        </button>
                      ) : <div />}
                      <button type="button" onClick={() => setForgotStep(0)} className="text-xs text-teal-700 hover:underline block">
                        Exit to login
                      </button>
                    </div>

                    {forgotStep === 1 && (
                      <form onSubmit={handleForgotSendCode} className="space-y-4">
                        <div className="space-y-2">
                          <Label>Enter your email to reset password</Label>
                          <Input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required />
                        </div>
                        <Button type="submit" className="w-full" disabled={isResetting}>{isResetting ? "Sending..." : "Send Code"}</Button>
                      </form>
                    )}

                    {forgotStep === 2 && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Enter the 6-digit code sent to {resetEmail}</Label>
                          <div className="flex justify-center py-2">
                            <InputOTP maxLength={6} value={resetOtp} onChange={setResetOtp} disabled={isResetting}>
                              <InputOTPGroup>
                                <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
                                <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
                              </InputOTPGroup>
                            </InputOTP>
                          </div>
                        </div>
                        <Button type="button" onClick={handleForgotVerifyOtp} className="w-full" disabled={isResetting || resetOtp.length !== 6}>
                          {isResetting ? "Verifying..." : "Verify Code"}
                        </Button>
                      </div>
                    )}

                    {forgotStep === 3 && (
                      <form onSubmit={handleForgotResetPassword} className="space-y-4">
                        <div className="space-y-2">
                          <Label>New Password</Label>
                          <Input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                        </div>
                        <div className="space-y-2">
                          <Label>Confirm New Password</Label>
                          <Input type="password" minLength={8} value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} required />
                        </div>
                        <Button type="submit" className="w-full" disabled={isResetting}>{isResetting ? "Saving..." : "Reset Password"}</Button>
                      </form>
                    )}
                  </div>
                ) : (
                  <form onSubmit={signIn} className="mt-9 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="space-y-2">
                      <Label htmlFor="username">Registration number or Email</Label>
                      <div className="relative">
                        <UserPlus className="absolute left-3 top-3 h-4 w-4 text-teal-600" />
                        <Input
                          id="username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="pl-10"
                          disabled={isLoading}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        <button
                          type="button"
                          onClick={() => { setResetEmail(username); setForgotStep(1); }}
                          className="text-[11px] font-medium text-teal-700 hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-3 h-4 w-4 text-teal-600" />
                        <Input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10"
                          disabled={isLoading}
                          required
                        />
                      </div>
                    </div>

                    <Button type="submit" className="h-11 w-full" disabled={isLoading}>
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      {isLoading ? "Signing in…" : "Sign in to E-Logbook"}
                    </Button>
                  </form>
                )}

                {forgotStep === 0 && (
                  <>
                    <div className="my-6 flex items-center gap-3">
                      <div className="h-px flex-1 bg-teal-100" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">New here?</span>
                      <div className="h-px flex-1 bg-teal-100" />
                    </div>
                    <Button type="button" variant="outline" onClick={onRegister} className="h-11 w-full border-teal-200 text-teal-800">
                      <UserPlus className="h-4 w-4" /> Register &amp; Pay
                    </Button>
                  </>
                )}
              </div>
            )}

          </div>
        </section>
      </div>
      </div>
      {/* Footer */}
      <footer className="w-full mt-auto py-6 border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-8 flex flex-wrap justify-center gap-6 text-sm text-slate-500">
          <a href="/privacy-policy" className="hover:text-teal-700 transition-colors">Privacy Policy</a>
          <a href="/grievance-officer" className="hover:text-teal-700 transition-colors">Grievance Officer</a>
          <a href="/data-rights" className="hover:text-teal-700 transition-colors">Data Rights</a>
          <button 
            onClick={(e) => {
              e.preventDefault();
              window.dispatchEvent(new Event("open-cookie-consent"));
            }}
            className="hover:text-teal-700 transition-colors cursor-pointer"
          >
            Cookie Preferences
          </button>
        </div>
      </footer>

      {showIntroVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Arogya E-LogBook Demo Video"
          className="fixed inset-0 z-[10000] flex flex-col bg-slate-950 text-white select-none animate-in fade-in duration-200"
        >
          {/* Top bar with branding and Skip to Demo button */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-gradient-to-b from-slate-950/90 via-slate-950/50 to-transparent px-4 py-4 sm:px-8 sm:py-5">
            <div className="pointer-events-auto flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-900/80 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-teal-300 backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse" />
                Arogya E-LogBook · Product Walkthrough
              </span>

              {mutedByBrowser && (
                <button
                  type="button"
                  onClick={() => {
                    const video = introVideoRef.current;
                    if (!video) return;
                    video.muted = false;
                    setMutedByBrowser(false);
                    void video.play().catch(() => {});
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-400/40 bg-amber-500/20 px-3.5 py-1.5 text-xs font-semibold text-amber-200 backdrop-blur-md transition hover:bg-amber-500/30 cursor-pointer"
                >
                  <VolumeX className="h-3.5 w-3.5" />
                  Click to unmute audio
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={proceedToActualDemo}
              data-testid="demo-video-skip"
              className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-[0_10px_28px_rgba(13,148,136,0.45)] ring-1 ring-teal-400/40 transition-all duration-150 hover:bg-teal-500 hover:scale-[1.02] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 sm:px-5 sm:py-2.5 sm:text-sm cursor-pointer"
            >
              Skip to Demo
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Main video container */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
            <video
              ref={introVideoRef}
              src="/demo-video.mp4"
              className="h-full w-full max-h-screen object-contain"
              playsInline
              autoPlay
              controls
              preload="auto"
              onEnded={proceedToActualDemo}
              onVolumeChange={() => {
                if (introVideoRef.current && !introVideoRef.current.muted) {
                  setMutedByBrowser(false);
                }
              }}
            />

            {needsManualPlay && (
              <button
                type="button"
                onClick={() => void startIntroPlayback()}
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-950/70 backdrop-blur-sm transition hover:bg-slate-950/60 cursor-pointer"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-600 text-white shadow-2xl ring-4 ring-teal-400/30">
                  <Play className="h-9 w-9 fill-current ml-1" />
                </div>
                <span className="text-sm font-semibold text-white">Click to Play Demo Video</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}



