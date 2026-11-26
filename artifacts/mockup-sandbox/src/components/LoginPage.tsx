import * as React from "react";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Play,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/apiClient";
import { BotanicalBackground } from "@/components/BotanicalBackground";
import { LoginProductPreview } from "@/components/LoginProductPreview";
import { clearMaintenanceNoticeSession, saveToken } from "@/lib/session";
import { PaymentStep } from "@/components/PaymentStep";
import { unlockDemoAudio } from "@/lib/demoSounds";
import { startDemoSession } from "@/lib/demoSession";
import "./signed-out-entry.css";

function BrandLockup() {
  return (
    <div className="flex items-center gap-3.5">
      <img
        src={`${import.meta.env.BASE_URL}gothos-owl-emblem.png`}
        alt="Gothos Labs"
        className="h-10 w-10 shrink-0 object-contain lg:h-12 lg:w-12"
      />
      <div className="leading-tight">
        <p className="text-lg font-bold tracking-tight text-[#14231B] lg:text-xl">
          E-Logbook
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5E6B64]">
          BY GOTHOS LAB
        </p>
      </div>
    </div>
  );
}

export function LoginPage({
  onSignIn,
  onRegister,
}: {
  onSignIn: () => void;
  onRegister: () => void;
}) {
  const [isMobileViewport, setIsMobileViewport] = React.useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
  );
  const introVideoSrc = isMobileViewport
    ? "/demo-video-mobile.mp4"
    : "/demo-video.mp4";

  // Demo state
  const [demoLoading, setDemoLoading] = React.useState(false);
  const [showIntroVideo, setShowIntroVideo] = React.useState(false);
  const [mutedByBrowser, setMutedByBrowser] = React.useState(false);
  const [needsManualPlay, setNeedsManualPlay] = React.useState(false);
  const introVideoRef = React.useRef<HTMLVideoElement | null>(null);

  // Login credentials
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [pendingPaymentToken, setPendingPaymentToken] = React.useState<string | null>(
    null
  );
  const usernameInputRef = React.useRef<HTMLInputElement>(null);
  const passwordInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = (event: MediaQueryListEvent) =>
      setIsMobileViewport(event.matches);
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
    if (demoLoading || isLoading) return;
    unlockDemoAudio();
    setShowIntroVideo(true);
  };

  // ── Real sign-in ─────────────────────────────────────────────────────────

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isLoading) return;

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setError("Please enter your registration number or email address.");
      usernameInputRef.current?.focus();
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      passwordInputRef.current?.focus();
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const user = await apiPost("/api/auth/login", {
        username: trimmedUsername,
        password,
      });

      clearMaintenanceNoticeSession();
      if (user.token) saveToken(user.token);
      window.sessionStorage.setItem("elogbook-user", JSON.stringify(user));
      window.sessionStorage.setItem("elogbook-login-summary-pending", "true");
      onSignIn();
    } catch (err: any) {
      if (
        err instanceof ApiError &&
        err.status === 402 &&
        typeof err.data?.paymentToken === "string"
      ) {
        setPendingPaymentToken(err.data.paymentToken);
        return;
      }
      setError(
        err.message || "Failed to sign in. Please check your credentials."
      );
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
      const verified = await apiPost("/api/auth/verify-reset-otp", {
        email: resetEmail,
        otp: resetOtp,
      });
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
    if (newPassword !== confirmNewPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setIsResetting(true);
    try {
      await apiPost("/api/auth/reset-password", {
        email: resetEmail,
        newPassword,
        verificationToken,
      });
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
    <div className="signed-out-entry relative flex min-h-screen w-full flex-col overflow-x-hidden bg-[#F6F4EF]">
      <BotanicalBackground />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-6 sm:px-8 lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:px-12 lg:py-10">
        {/* Compact single-row brand lockup on mobile */}
        <header className="mb-5 flex items-center justify-between lg:hidden">
          <BrandLockup />
        </header>

        {/* Left Column: Editorial Brand & Clinical Preview (desktop) */}
        <section className="hidden lg:flex lg:flex-col lg:items-start lg:pr-4">
          <BrandLockup />

          <h1 className="signed-out-hero-title mt-10 max-w-md text-[2.65rem] leading-[1.12] text-[#14231B]">
            Clinical training,
            <br />
            clearly organised.
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-[#4A5F53]">
            Cases, procedures, academic work, and faculty verifications in one place.
          </p>

          <LoginProductPreview />
        </section>

        {/* Right Column: Elevated White Sign-In Card */}
        <main className="flex w-full items-center justify-center pt-16 sm:pt-20 lg:justify-end lg:pt-20">
          <div className="relative w-full max-w-[420px]">
            {/* Mochi perched on the top-right edge of the sign-in card */}
            <div className="group/mochi pointer-events-auto absolute -top-16 right-4 z-20 h-24 w-24 sm:-top-[4.75rem] sm:right-5 sm:h-28 sm:w-28">
              <div
                role="tooltip"
                className="pointer-events-none absolute -top-9 right-0 whitespace-nowrap rounded-lg border border-[#E5E1D8] bg-white px-2.5 py-1 text-[11px] font-medium text-[#14231B] opacity-0 shadow-sm transition-all duration-200 group-hover/mochi:-translate-y-1 group-hover/mochi:opacity-100 motion-reduce:transition-none"
              >
                New here? Try the demo!
              </div>
              <div
                className={`h-full w-full transition-transform duration-300 ease-out motion-reduce:transition-none ${
                  isPasswordFocused ? "translate-y-2.5 scale-95" : "translate-y-0 scale-100"
                }`}
              >
                <div className="mochi-idle h-full w-full transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/mochi:-translate-y-1 group-hover/mochi:-rotate-3 group-hover/mochi:scale-105 motion-reduce:transition-none">
                  <img
                    src={`${import.meta.env.BASE_URL}hoot-body.png`}
                    alt="Mochi"
                    className="h-full w-full select-none object-contain drop-shadow-[0_6px_10px_rgba(15,31,24,0.14)]"
                  />
                </div>
              </div>
            </div>

            <div className="relative z-10 w-full rounded-2xl border border-[#E5E1D8] bg-white/95 p-6 shadow-[0_8px_30px_rgba(15,31,24,0.05)] backdrop-blur-sm sm:p-8">
            {forgotStep > 0 ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  {forgotStep > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setForgotStep((forgotStep === 3 ? 2 : 1) as 1 | 2)
                      }
                      className="rounded text-xs font-semibold text-[#164A35] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#164A35]/30"
                    >
                      &larr; Back
                    </button>
                  ) : (
                    <div />
                  )}
                  <button
                    type="button"
                    onClick={() => setForgotStep(0)}
                    className="rounded text-xs font-semibold text-[#164A35] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#164A35]/30"
                  >
                    Back to sign in
                  </button>
                </div>

                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-[#14231B]">
                    Reset your password
                  </h2>
                  <p className="mt-1.5 text-sm text-[#5E6B64]">
                    {forgotStep === 1 &&
                      "Enter your registered email address to receive a 6-digit verification code."}
                    {forgotStep === 2 &&
                      `Enter the 6-digit code sent to ${resetEmail}.`}
                    {forgotStep === 3 &&
                      "Choose a new password for your E-Logbook account."}
                  </p>
                </div>

                {forgotStep === 1 && (
                  <form onSubmit={handleForgotSendCode} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="reset-email" className="text-sm text-[#14231B]">
                        Email address
                      </Label>
                      <Input
                        id="reset-email"
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="h-11 rounded-lg border border-[#D8D4CA] bg-white text-[#14231B] shadow-none placeholder:text-[#8B968F] focus-visible:border-[#164A35] focus-visible:ring-2 focus-visible:ring-[#164A35]/15"
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      className="h-11 w-full rounded-lg border-0 bg-[#164A35] text-sm font-semibold text-white shadow-none hover:bg-[#123C2B] focus-visible:ring-2 focus-visible:ring-[#164A35]/30"
                      disabled={isResetting}
                    >
                      {isResetting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending code…
                        </>
                      ) : (
                        "Send reset code"
                      )}
                    </Button>
                  </form>
                )}

                {forgotStep === 2 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm text-[#14231B]">
                        Verification code
                      </Label>
                      <div className="flex justify-center py-2">
                        <InputOTP
                          maxLength={6}
                          value={resetOtp}
                          onChange={setResetOtp}
                          disabled={isResetting}
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={handleForgotVerifyOtp}
                      className="h-11 w-full rounded-lg border-0 bg-[#164A35] text-sm font-semibold text-white shadow-none hover:bg-[#123C2B] focus-visible:ring-2 focus-visible:ring-[#164A35]/30"
                      disabled={isResetting || resetOtp.length !== 6}
                    >
                      {isResetting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying…
                        </>
                      ) : (
                        "Verify code"
                      )}
                    </Button>
                  </div>
                )}

                {forgotStep === 3 && (
                  <form onSubmit={handleForgotResetPassword} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-password" className="text-sm text-[#14231B]">
                        New password
                      </Label>
                      <Input
                        id="new-password"
                        type="password"
                        minLength={8}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="h-11 rounded-lg border border-[#D8D4CA] bg-white text-[#14231B] shadow-none focus-visible:border-[#164A35] focus-visible:ring-2 focus-visible:ring-[#164A35]/15"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="confirm-new-password"
                        className="text-sm text-[#14231B]"
                      >
                        Confirm new password
                      </Label>
                      <Input
                        id="confirm-new-password"
                        type="password"
                        minLength={8}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="h-11 rounded-lg border border-[#D8D4CA] bg-white text-[#14231B] shadow-none focus-visible:border-[#164A35] focus-visible:ring-2 focus-visible:ring-[#164A35]/15"
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      className="h-11 w-full rounded-lg border-0 bg-[#164A35] text-sm font-semibold text-white shadow-none hover:bg-[#123C2B] focus-visible:ring-2 focus-visible:ring-[#164A35]/30"
                      disabled={isResetting}
                    >
                      {isResetting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        "Reset password"
                      )}
                    </Button>
                  </form>
                )}
              </div>
            ) : (
              <div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-[#14231B]">
                    Sign in
                  </h2>
                  <p className="mt-1 text-sm text-[#5E6B64]">
                    Access your resident, faculty, or HOD account.
                  </p>
                </div>

                <div
                  id="login-credential-error"
                  role="alert"
                  aria-atomic="true"
                  className={error ? "mt-4" : ""}
                >
                  {error && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
                      <AlertCircle
                        className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
                        aria-hidden="true"
                      />
                      <span>{error}</span>
                    </div>
                  )}
                </div>

                <form onSubmit={signIn} noValidate className="mt-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="username"
                      className="text-xs font-semibold text-[#14231B]"
                    >
                      Registration number or Email
                    </Label>
                    <Input
                      ref={usernameInputRef}
                      id="username"
                      name="username"
                      type="text"
                      placeholder="e.g. resident@hospital.edu or reg. no."
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={
                        error ? "login-credential-error" : undefined
                      }
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (error) setError(null);
                      }}
                      className="h-11 rounded-lg border border-[#D8D4CA] bg-white text-[#14231B] shadow-none placeholder:text-[#8B968F] focus-visible:border-[#164A35] focus-visible:ring-2 focus-visible:ring-[#164A35]/15"
                      disabled={isLoading}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label
                        htmlFor="password"
                        className="text-xs font-semibold text-[#14231B]"
                      >
                        Password
                      </Label>
                      <button
                        type="button"
                        onClick={() => {
                          setResetEmail(username.includes("@") ? username : "");
                          setError(null);
                          setForgotStep(1);
                        }}
                        className="rounded px-1 py-0.5 text-xs font-medium text-[#164A35] transition-colors hover:text-[#123C2B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#164A35]/30"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <div className="relative">
                      <Input
                        ref={passwordInputRef}
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        onFocus={() => setIsPasswordFocused(true)}
                        onBlur={() => setIsPasswordFocused(false)}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={
                          error ? "login-credential-error" : undefined
                        }
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError(null);
                        }}
                        className="h-11 rounded-lg border border-[#D8D4CA] bg-white pr-11 text-[#14231B] shadow-none placeholder:text-[#8B968F] focus-visible:border-[#164A35] focus-visible:ring-2 focus-visible:ring-[#164A35]/15"
                        disabled={isLoading}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        disabled={isLoading}
                        className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#5E6B64] transition-colors hover:bg-[#F6F4EF] hover:text-[#14231B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#164A35]/30 disabled:opacity-50"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="mt-1 h-11 w-full rounded-lg border-0 bg-[#164A35] text-sm font-semibold text-white shadow-none transition-colors hover:bg-[#123C2B] focus-visible:ring-2 focus-visible:ring-[#164A35]/30 disabled:opacity-60"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2
                          className="mr-2 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Signing in…
                      </>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>

                <div className="my-5 flex items-center gap-3" aria-hidden="true">
                  <div className="h-px flex-1 bg-[#E5E1D8]" />
                  <span className="text-xs font-medium text-[#7A847D]">or</span>
                  <div className="h-px flex-1 bg-[#E5E1D8]" />
                </div>

                <div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleMovieStart}
                    disabled={demoLoading || isLoading}
                    aria-describedby="login-demo-description"
                    className="h-11 w-full rounded-lg border border-[#D8D4CA] bg-white text-sm font-semibold text-[#14231B] shadow-none transition-colors hover:border-[#BDB8AC] hover:bg-[#FAF9F6] hover:text-[#14231B] focus-visible:ring-2 focus-visible:ring-[#164A35]/30 disabled:opacity-60"
                  >
                    {demoLoading ? (
                      <Loader2
                        className="mr-2 h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Play
                        className="mr-2 h-4 w-4 text-[#164A35]"
                        aria-hidden="true"
                      />
                    )}
                    Explore Interactive Demo
                  </Button>
                  <p
                    id="login-demo-description"
                    className="mt-2.5 text-center text-xs text-[#5E6B64]"
                  >
                    No sign-in required.
                  </p>
                </div>

                <p className="mt-5 border-t border-[#F0EDE6] pt-4 text-center text-xs text-[#5E6B64]">
                  New resident?{" "}
                  <button
                    type="button"
                    onClick={onRegister}
                    className="rounded px-1 py-0.5 font-semibold text-[#164A35] transition-colors hover:text-[#123C2B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#164A35]/30"
                  >
                    Register &amp; Pay
                  </button>
                </p>
              </div>
            )}
            </div>
          </div>
        </main>
      </div>

      {showIntroVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="E-Logbook demo video"
          className="fixed inset-0 z-[10000] flex flex-col bg-deep text-white select-none animate-in fade-in duration-200"
        >
          {/* Top bar with branding and Skip to Demo button */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between bg-deep/90 px-4 py-4 sm:px-8 sm:py-5">
            <div className="pointer-events-auto flex items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-deep/80 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-mint backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-forest animate-pulse" />
                E-Logbook · Product Walkthrough
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
                <span className="text-sm font-semibold text-white">
                  Click to Play Demo Video
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
