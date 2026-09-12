import * as React from "react";
import {
  BookOpenCheck, KeyRound, ShieldCheck, UserPlus, Loader2,
  GraduationCap, Users, Sparkles, LogIn, ChevronLeft, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/apiClient";
import { LoginProductPreview } from "@/components/LoginProductPreview";
import { saveToken } from "@/lib/session";
import { PaymentStep } from "@/components/PaymentStep";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "picker" | "demo" | "login";

// Demo portal config — credentials are now entirely mocked client-side
const DEMO_PORTALS: {
  key: string;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "student",
    label: "Resident Trainee",
    subtitle: "Explore case logs, procedures and academic records",
    icon: <GraduationCap className="h-6 w-6 text-teal-600" />,
  },
  {
    key: "faculty",
    label: "Faculty / Professor",
    subtitle: "Browse the evaluation queue and student progress",
    icon: <Users className="h-6 w-6 text-teal-600" />,
  },
  {
    key: "hod",
    label: "Head of Department",
    subtitle: "See department analytics, approvals and leave management",
    icon: <ShieldCheck className="h-6 w-6 text-teal-600" />,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function LoginPage({ onSignIn, onRegister }: { onSignIn: () => void; onRegister: () => void }) {
  const [mode, setMode] = React.useState<Mode>("picker");

  // Demo state
  const [demoLoading, setDemoLoading] = React.useState<string | null>(null);
  // PIN gate — pinPortalKey is the portal key currently asking for a PIN, null = no PIN screen
  const [pinPortalKey, setPinPortalKey] = React.useState<string | null>(null);
  const [pinValue, setPinValue] = React.useState("");
  const [pinError, setPinError] = React.useState<string | null>(null);

  // Portals that require a PIN before demo access (key → env-var name)
  const PIN_ENV_MAP: Record<string, string> = {
    faculty: "VITE_DEMO_FACULTY_PIN",
    hod: "VITE_DEMO_HOD_PIN",
  };

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
    setPinPortalKey(null);
    setPinValue("");
    setPinError(null);
  };

  // ── Demo auto-login ───────────────────────────────────────────────────────

  const handleDemoLogin = async (portal: typeof DEMO_PORTALS[number]) => {
    setDemoLoading(portal.key);
    try {
      // Mock network delay
      await new Promise(r => setTimeout(r, 600));
      
      // Determine fake user data based on portal key
      const roleMap: Record<string, string> = { "student": "student", "faculty": "professor", "hod": "hod" };
      const emailMap: Record<string, string> = { "student": "kavya.nair.demo@example.com", "faculty": "arjun.mehta.demo@example.com", "hod": "priya.sharma.demo@example.com" };
      const nameMap: Record<string, string> = { "student": "Kavya Nair", "faculty": "Dr. Arjun Mehta", "hod": "Dr. Priya Sharma" };
      
      const user = {
        id: 999,
        name: nameMap[portal.key] || portal.label, // changed from fullName
        fullName: nameMap[portal.key] || portal.label,
        email: emailMap[portal.key] || "demo@example.com",
        role: roleMap[portal.key] || "student",
        departmentId: 1,
        studentProfileId: portal.key === "student" ? 1 : undefined,
        token: "demo-token",
        isDemoMode: true
      };
      
      saveToken(user.token);
      window.sessionStorage.setItem("elogbook-user", JSON.stringify(user));
      onSignIn();
    } catch (err: any) {
      toast.error(err.message || "Demo login failed. Please try again.");
    } finally {
      setDemoLoading(null);
    }
  };

  // ── Real sign-in ─────────────────────────────────────────────────────────

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username || !password) return;

    try {
      setIsLoading(true);
      setError(null);

      const user = await apiPost("/api/auth/login", { username, password });

      if (user.token) saveToken(user.token);
      window.sessionStorage.setItem("elogbook-user", JSON.stringify(user));
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
                    className="flex w-full items-center gap-4 rounded-2xl border-2 border-teal-500 bg-teal-500 p-5 text-left text-white shadow-md transition-all hover:bg-teal-600 hover:shadow-lg hover:-translate-y-0.5"
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
                    onClick={() => setMode("demo")}
                    className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-teal-300 hover:bg-teal-50 hover:shadow-md hover:-translate-y-0.5"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 ring-1 ring-amber-100">
                      <Sparkles className="h-6 w-6 text-amber-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800">Explore the Demo</p>
                      <p className="mt-0.5 text-xs text-slate-500">Try all three portals — no account needed</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* ── MODE: Demo ───────────────────────────────────────────── */}
            {mode === "demo" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                <button
                  type="button"
                  onClick={() => {
                    if (pinPortalKey) {
                      setPinPortalKey(null);
                      setPinValue("");
                      setPinError(null);
                    } else {
                      goBack();
                    }
                  }}
                  className="mb-6 flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
                >
                  <ChevronLeft className="h-3 w-3" /> Back
                </button>

                {/* ── PIN entry screen (Faculty or HOD) ────────────────── */}
                {pinPortalKey ? (() => {
                  const portal = DEMO_PORTALS.find(p => p.key === pinPortalKey)!;
                  return (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-slate-500" />
                        <p className="page-eyebrow text-slate-500">Access restricted</p>
                      </div>
                      <h2 className="mt-2 text-3xl font-bold text-slate-900">{portal.label} Demo</h2>
                      <p className="mt-2 text-sm text-slate-500">
                        This portal requires an access code. Contact the system administrator if you need it.
                      </p>

                      <div className="mt-8 space-y-5">
                        <div className="space-y-3">
                          <Label className="text-sm font-medium text-slate-700">Enter 4-digit access code</Label>
                          <div className="flex justify-center">
                            <InputOTP
                              maxLength={4}
                              value={pinValue}
                              onChange={(v) => { setPinValue(v); setPinError(null); }}
                            >
                              <InputOTPGroup>
                                <InputOTPSlot index={0} />
                                <InputOTPSlot index={1} />
                                <InputOTPSlot index={2} />
                                <InputOTPSlot index={3} />
                              </InputOTPGroup>
                            </InputOTP>
                          </div>
                          {pinError && (
                            <p className="text-center text-sm text-red-600 font-medium">{pinError}</p>
                          )}
                        </div>

                        <Button
                          type="button"
                          className="h-11 w-full"
                          disabled={pinValue.length !== 4 || demoLoading !== null}
                          onClick={() => {
                            const envKey = PIN_ENV_MAP[pinPortalKey];
                            const correctPin = (import.meta.env as Record<string, string>)[envKey];
                            if (!correctPin) {
                              setPinError("Demo access not configured. Contact the administrator.");
                              return;
                            }
                            if (pinValue !== correctPin) {
                              setPinError("Incorrect code. Please try again.");
                              setPinValue("");
                              return;
                            }
                            // PIN correct — proceed with demo login
                            const key = pinPortalKey;
                            setPinPortalKey(null);
                            setPinValue("");
                            setPinError(null);
                            handleDemoLogin(DEMO_PORTALS.find(p => p.key === key)!);
                          }}
                        >
                          {demoLoading === pinPortalKey ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <ShieldCheck className="mr-2 h-4 w-4" />
                          )}
                          {demoLoading === pinPortalKey ? "Signing in…" : `Access ${portal.label} Demo`}
                        </Button>
                      </div>
                    </div>
                  );
                })() : (
                  /* ── Portal cards ──────────────────────────────────── */
                  <>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      <p className="page-eyebrow text-amber-600">Demo mode</p>
                    </div>
                    <h2 className="mt-2 text-3xl font-bold text-slate-900">Try a portal</h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Sign in instantly as any role. Demo accounts are read-only — no real records are affected.
                    </p>

                    <div className="mt-7 space-y-3">
                      {DEMO_PORTALS.map((portal) => {
                        const loading = demoLoading === portal.key;
                        const requiresPin = portal.key in PIN_ENV_MAP;
                        return (
                          <button
                            key={portal.key}
                            onClick={() => {
                              if (requiresPin) {
                                setPinPortalKey(portal.key);
                              } else {
                                handleDemoLogin(portal);
                              }
                            }}
                            disabled={demoLoading !== null}
                            className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-teal-300 hover:bg-teal-50 hover:shadow-md hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 ring-1 ring-teal-100">
                              {loading ? <Loader2 className="h-5 w-5 text-teal-600 animate-spin" /> : portal.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-slate-800">{portal.label}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{portal.subtitle}</p>
                            </div>
                            {requiresPin && <Lock className="h-4 w-4 shrink-0 text-slate-400" />}
                          </button>
                        );
                      })}
                    </div>

                    <p className="mt-6 text-center text-[10px] text-slate-400">
                      Demo data is shared. Do not enter personal or patient information.
                    </p>
                  </>
                )}
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
    </div>
  );
}



