import * as React from "react";
import {
  KeyRound, ShieldCheck, UserPlus, Loader2,
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
import { startDemoSession } from "@/lib/demoSession";
import { SignedOutSupportButton } from "./SupportWidget";
import "./signed-out-entry.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "picker" | "login";

// ─── Component ────────────────────────────────────────────────────────────────

export function LoginPage({ onSignIn, onRegister }: { onSignIn: () => void; onRegister: () => void }) {
  const [mode, setMode] = React.useState<Mode>("picker");
  const pickerActionRef = React.useRef<HTMLButtonElement>(null);
  const signInHeadingRef = React.useRef<HTMLHeadingElement>(null);
  const focusAfterNavigation = React.useRef(false);
  const [isMobileViewport, setIsMobileViewport] = React.useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
  );
  const introVideoSrc = isMobileViewport ? "/demo-video-mobile.mp4" : "/demo-video.mp4";

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

  React.useEffect(() => {
    if (!focusAfterNavigation.current) return;
    focusAfterNavigation.current = false;
    if (mode === "login") signInHeadingRef.current?.focus();
    else pickerActionRef.current?.focus();
  }, [mode]);

  React.useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = (event: MediaQueryListEvent) => setIsMobileViewport(event.matches);
    setIsMobileViewport(mobileQuery.matches);
    mobileQuery.addEventListener("change", updateViewport);
    return () => mobileQuery.removeEventListener("change", updateViewport);
  }, []);

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
    focusAfterNavigation.current = true;
    setMode("picker");
    setError(null);
    setForgotStep(0);
    setUsername("");
    setPassword("");
  };

  // ── Demo Movie Startup ────────────────────────────────────────────────────

  const enterDemoWorkspace = React.useCallback(() => {
    if (demoLoading) return;
    setDemoLoading(true);
    try {
      if (introVideoRef.current) {
        introVideoRef.current.pause();
      }
      setShowIntroVideo(false);
      unlockDemoAudio();
      startDemoSession("student");
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
  }, [showIntroVideo, introVideoSrc, startIntroPlayback]);

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
    <div className="signed-out-entry min-h-screen bg-background flex flex-col">
      <div className="flex flex-1 items-center justify-center p-4 md:p-8">
        <div className="glass-panel grid w-full max-w-6xl overflow-hidden rounded-[28px] lg:grid-cols-[1.08fr_.92fr]">
        <main className="flex items-center bg-card p-6 sm:p-8 lg:col-start-2 lg:row-start-1 lg:p-12">
          <div className="mx-auto w-full max-w-sm">
            <p className="mb-4 text-lg font-bold text-forest">ELogBook</p>
            {/* ── MODE: Picker ─────────────────────────────────────────── */}
            {mode === "picker" && (
              <div>
                <h1 className="text-3xl font-bold text-forest sm:text-4xl">Welcome</h1>
                <p className="mt-2 text-base leading-snug text-ink">
                  Already have an account? Sign in. New here? Explore the demo first.
                </p>

                <div className="mt-6 space-y-4">
                  {/* Sign In card */}
                  <button
                    ref={pickerActionRef}
                    type="button"
                    onClick={() => {
                      focusAfterNavigation.current = true;
                      setMode("login");
                    }}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-forest bg-forest px-4 py-2.5 text-base font-semibold text-white transition-[background-color] hover:bg-deep"
                  >
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    Sign in to my account
                  </button>

                  <div>
                    <button
                      type="button"
                      onClick={handleMovieStart}
                      disabled={demoLoading}
                      aria-describedby="login-demo-description"
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border-2 border-forest bg-white px-4 py-2.5 text-base font-semibold text-forest transition-[background-color,color] hover:bg-forest hover:text-white disabled:opacity-60"
                    >
                      {demoLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                      Show demo
                    </button>
                    <p id="login-demo-description" className="mt-2 text-center text-sm leading-snug text-helper">
                      Watch the intro, then explore freely. Start a guided tour anytime. No sign-in needed.
                    </p>
                  </div>
                </div>
              </div>
            )}



            {/* ── MODE: Login ──────────────────────────────────────────── */}
            {mode === "login" && (
              <div>
                <button
                  type="button"
                  onClick={goBack}
                  className="mb-3 flex min-h-11 items-center gap-1 rounded-full px-2 text-xs font-medium text-forest hover:underline"
                >
                  <ChevronLeft className="h-3 w-3" /> Back
                </button>

                <h1 ref={signInHeadingRef} tabIndex={-1} className="text-3xl font-bold text-forest sm:text-4xl">Sign in</h1>
                <p className="mt-2 text-base leading-snug text-ink">
                  Sign in with your university registration number or email address and password.
                </p>

                <div id="login-credential-error" role="alert" aria-atomic="true">
                  {error && (
                    <p className="mt-4 rounded-md border border-status-border bg-status p-3 text-sm text-status-foreground">
                      {error}
                    </p>
                  )}
                </div>

                {/* Forgot-password flow */}
                {forgotStep > 0 ? (
                  <div className="mt-9 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between mb-2">
                      {forgotStep > 1 ? (
                        <button type="button" onClick={() => setForgotStep(forgotStep === 3 ? 2 : 1 as any)} className="text-xs text-forest hover:underline block">
                          &larr; Back
                        </button>
                      ) : <div />}
                      <button type="button" onClick={() => setForgotStep(0)} className="text-xs text-forest hover:underline block">
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
                  <form onSubmit={signIn} className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="username">Registration number or Email</Label>
                      <div className="relative">
                        <UserPlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-forest" aria-hidden="true" />
                        <Input
                          id="username"
                          name="username"
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? "login-credential-error" : undefined}
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="h-11 pl-10"
                          disabled={isLoading}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-forest" aria-hidden="true" />
                        <Input
                          id="password"
                          name="password"
                          type="password"
                          autoComplete="current-password"
                          aria-invalid={error ? true : undefined}
                          aria-describedby={error ? "login-credential-error" : undefined}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-11 pl-10"
                          disabled={isLoading}
                          required
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => { setResetEmail(username); setForgotStep(1); }}
                        className="ml-auto flex min-h-11 items-center rounded-full px-2 text-xs font-medium text-forest hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <Button type="submit" className="min-h-11 w-full text-base" disabled={isLoading}>
                      {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                      {isLoading ? "Signing in…" : "Sign in to ELogBook"}
                    </Button>
                  </form>
                )}

                {forgotStep === 0 && (
                  <>
                    <div className="my-6 flex items-center gap-3">
                      <div className="h-px flex-1 bg-sage" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-helper">New here?</span>
                      <div className="h-px flex-1 bg-sage" />
                    </div>
                    <Button type="button" variant="outline" onClick={onRegister} className="min-h-11 w-full border-2 text-forest hover:bg-forest hover:text-white">
                      <UserPlus className="h-4 w-4" /> Register &amp; Pay
                    </Button>
                  </>
                )}

              </div>
            )}

            <div className="mt-4 text-center">
              <SignedOutSupportButton>
                {mode === "login" ? "Having trouble signing in? Contact support" : "Need help?"}
              </SignedOutSupportButton>
              <p>
                <a href="https://www.gothoslabs.com" className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-[11px] text-helper hover:underline">
                  by <span className="font-bold text-forest">GOTHOS LABS</span>
                </a>
              </p>
            </div>
          </div>
        </main>
        <section className="relative overflow-hidden bg-mist p-6 text-ink sm:p-8 lg:col-start-1 lg:row-start-1 lg:p-10">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[42px] border-sage" />
          <div className="relative mx-auto max-w-lg">
            <h2 className="max-w-md text-2xl font-bold leading-tight text-forest sm:text-3xl">
              Clinical training, clearly organised.
            </h2>
            <p className="mt-3 max-w-md text-base leading-6">
              Keep cases, procedures, academic work, assessments and milestones together.
            </p>
            <img
              src={`${import.meta.env.BASE_URL}gothos-logo.png`}
              alt="Gothos Labs"
              width={1254}
              height={1081}
              className="mt-4 h-auto w-32 rounded-xl"
            />
            <LoginProductPreview />
          </div>
        </section>
      </div>
      </div>
      {/* Footer */}
      <footer className="w-full mt-auto py-6 border-t border-line-soft bg-white">
        <div className="max-w-6xl mx-auto px-4 md:px-8 flex flex-wrap justify-center gap-6 text-sm text-helper">
          <a href="/privacy-policy" className="hover:text-forest transition-colors">Privacy Policy</a>
          <a href="/grievance-officer" className="hover:text-forest transition-colors">Grievance Officer</a>
          <a href="/data-rights" className="hover:text-forest transition-colors">Data Rights</a>
          <button 
            onClick={(e) => {
              e.preventDefault();
              window.dispatchEvent(new Event("open-cookie-consent"));
            }}
            className="hover:text-forest transition-colors cursor-pointer"
          >
            Cookie Preferences
          </button>
        </div>
      </footer>

      {showIntroVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="ELogBook demo video"
          className="fixed inset-0 z-[10000] flex flex-col bg-deep text-white select-none animate-in fade-in duration-200"
        >
          {/* Top bar with branding and Skip to Demo button */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-deep/90 px-4 py-4 sm:px-8 sm:py-5">
            <div className="pointer-events-auto flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-deep/80 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-mint backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-forest animate-pulse" />
                ELogBook · Product Walkthrough
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
                  className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/20 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-white/30 cursor-pointer"
                >
                  <VolumeX className="h-3.5 w-3.5" />
                  Click to unmute audio
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={enterDemoWorkspace}
              data-testid="demo-video-skip"
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2.5 text-xs font-bold text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--gothos-forest)_45%,transparent)] ring-1 ring-ring transition-colors hover:bg-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-5 sm:py-2.5 sm:text-sm cursor-pointer"
            >
              Skip to Explore
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {/* Main video container */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-deep">
            <video
              ref={introVideoRef}
              src={introVideoSrc}
              className="h-full w-full max-h-screen object-contain"
              playsInline
              autoPlay
              controls
              preload="auto"
              onEnded={enterDemoWorkspace}
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
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-deep/70 backdrop-blur-sm transition hover:bg-deep/60 cursor-pointer"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-forest text-white shadow-2xl ring-4 ring-ring">
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



