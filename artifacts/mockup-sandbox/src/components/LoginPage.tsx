import * as React from "react";
import { BookOpenCheck, CheckCircle2, KeyRound, ShieldCheck, UserPlus, Loader2, Building, Stethoscope, UserCheck, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { apiPost } from "@/lib/apiClient";

export function LoginPage({ onSignIn, onRegister }: { onSignIn: () => void; onRegister: () => void }) {
  const [role, setRole] = React.useState<"student" | "professor" | "hod">("student");
  
  // Credentials state
  const [username, setUsername] = React.useState("PG2024-PAED-014");
  const [password, setPassword] = React.useState("password123");
  
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const [forgotStep, setForgotStep] = React.useState<0 | 1 | 2 | 3>(0);
  const [resetEmail, setResetEmail] = React.useState("");
  const [resetOtp, setResetOtp] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmNewPassword, setConfirmNewPassword] = React.useState("");
  const [isResetting, setIsResetting] = React.useState(false);

  // Update pre-filled credentials when role changes
  React.useEffect(() => {
    if (role === "student") {
      setUsername("aravind@elogbook.com");
    } else if (role === "professor") {
      setUsername("radhamani@elogbook.com");
    } else if (role === "hod") {
      setUsername("hod@elogbook.com");
    }
    setPassword("password123");
    setError(null);
  }, [role]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username || !password) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const user = await apiPost('/api/auth/login', { 
        username, 
        password 
      });
      
      // We could optionally verify the returned user.role matches the selected tab
      if (user.role !== role) {
         // Optionally warn or just let it proceed since the AppLayout routes based on actual role
         console.warn(`Logged in as ${user.role} but ${role} tab was selected.`);
      }

      window.sessionStorage.setItem('elogbook-user', JSON.stringify(user));
      onSignIn();
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

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
      await apiPost("/api/auth/verify-reset-otp", { email: resetEmail, otp: resetOtp });
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
      await apiPost("/api/auth/reset-password", { email: resetEmail, newPassword });
      toast.success("Password reset. Please log in with your new password.");
      setForgotStep(0);
    } catch (err: any) {
      toast.error(err.message || "Failed to reset password");
    } finally {
      setIsResetting(false);
    }
  };

  const getLeftPanelContent = () => {
    if (role === "student") {
      return (
        <div className="mt-12 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          {[
            ["1", "Student completes self-registration"],
            ["2", "Registration payment is completed"],
            ["3", "Account activates for sign in"],
          ].map(([number, text]) => (
            <div key={number} className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-teal-700">{number}</span>
              <p className="mt-3 text-xs font-semibold leading-5 text-white">{text}</p>
            </div>
          ))}
        </div>
      );
    }
    if (role === "professor") {
      return (
        <div className="mt-12 space-y-4">
           <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="flex items-center gap-2 text-sm font-bold text-white"><CheckCircle2 className="h-5 w-5" /> Evaluate efficiently</p>
              <p className="mt-2 text-xs leading-5 text-teal-50">Review and verify student logbook entries directly from your personalized dashboard.</p>
           </div>
        </div>
      );
    }
    return (
        <div className="mt-12 space-y-4">
           <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <p className="flex items-center gap-2 text-sm font-bold text-white"><ShieldCheck className="h-5 w-5" /> Administer Department</p>
              <p className="mt-2 text-xs leading-5 text-teal-50">Manage leave approvals, add professor accounts, and monitor department-wide compliance.</p>
           </div>
        </div>
    );
  };

  return (
    <div className="medical-grid flex min-h-screen items-center justify-center p-4 md:p-8">
      <div className="glass-panel grid w-full max-w-6xl overflow-hidden rounded-[30px] lg:grid-cols-[1.08fr_.92fr]">
        <section className="relative overflow-hidden bg-gradient-to-br from-teal-700 via-teal-600 to-cyan-500 p-8 text-white md:p-12 transition-colors">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border-[42px] border-white/10" />
          <div className="absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-cyan-300/15 blur-2xl" />
          <div className="relative flex flex-col h-full justify-between">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/16 shadow-lg ring-1 ring-white/25">
                <BookOpenCheck className="h-7 w-7" />
              </div>
              <p className="mt-12 text-xs font-bold uppercase tracking-[0.2em] text-teal-50">Department of Pediatrics</p>
              <h1 className="mt-3 max-w-xl text-4xl font-bold leading-[1.05] md:text-5xl">
                Clinical training, clearly organised.
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-6 text-teal-50/85">
                Keep cases, procedures, academic work, assessments and milestones together.
              </p>
              {getLeftPanelContent()}
            </div>
          </div>
        </section>

        <section className="bg-white/80 p-8 md:p-12">
          <div className="mx-auto max-w-sm">
            
            {forgotStep === 0 && (
              <Tabs value={role} onValueChange={(v) => { setRole(v as any); setForgotStep(0); }} className="w-full mb-8">
                <TabsList className="grid w-full grid-cols-3 bg-teal-50/50 p-1">
                  <TabsTrigger value="student" className="rounded-xl text-xs data-[state=active]:bg-white data-[state=active]:text-teal-800 data-[state=active]:shadow-sm">
                    Student
                  </TabsTrigger>
                  <TabsTrigger value="professor" className="rounded-xl text-xs data-[state=active]:bg-white data-[state=active]:text-teal-800 data-[state=active]:shadow-sm">
                    Professor
                  </TabsTrigger>
                  <TabsTrigger value="hod" className="rounded-xl text-xs data-[state=active]:bg-white data-[state=active]:text-teal-800 data-[state=active]:shadow-sm">
                    HOD
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <p className="page-eyebrow">
               {role === "student" ? "Secure student access" : role === "professor" ? "Professor portal" : "HOD Administration"}
            </p>
            <h2 className="mt-2 text-4xl font-bold text-slate-900">Welcome back</h2>
            <p className="mt-2 text-sm text-slate-500">
              {role === "student" ? "Sign in with your university registration number and password." : "Sign in with your email address and password."}
            </p>

            {error && (
              <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                {error}
              </div>
            )}

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
                       <Input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} required />
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
                     <Button type="button" onClick={handleForgotVerifyOtp} className="w-full" disabled={isResetting || resetOtp.length !== 6}>{isResetting ? "Verifying..." : "Verify Code"}</Button>
                   </div>
                 )}

                 {forgotStep === 3 && (
                   <form onSubmit={handleForgotResetPassword} className="space-y-4">
                     <div className="space-y-2">
                       <Label>New Password</Label>
                       <Input type="password" minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                     </div>
                     <div className="space-y-2">
                       <Label>Confirm New Password</Label>
                       <Input type="password" minLength={8} value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} required />
                     </div>
                     <Button type="submit" className="w-full" disabled={isResetting}>{isResetting ? "Saving..." : "Reset Password"}</Button>
                   </form>
                 )}
               </div>
            ) : (
            <form onSubmit={signIn} className="mt-9 space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="space-y-2">
                <Label htmlFor="username">
                  {role === "student" ? "Registration number" : "Email address"}
                </Label>
                <div className="relative">
                  {role === "student" ? (
                    <UserPlus className="absolute left-3 top-3 h-4 w-4 text-teal-600" />
                  ) : (
                    <AtSign className="absolute left-3 top-3 h-4 w-4 text-teal-600" />
                  )}
                  <Input
                    id="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button type="button" onClick={() => { setResetEmail(username); setForgotStep(1); }} className="text-[11px] font-medium text-teal-700 hover:underline">Forgot password?</button>
                </div>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 h-4 w-4 text-teal-600" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="h-11 w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                {isLoading ? "Signing in..." : "Sign in to E-Logbook"}
              </Button>
            </form>
            )}

            {role === "student" && forgotStep === 0 && (
              <>
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-teal-100" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">New student</span>
                  <div className="h-px flex-1 bg-teal-100" />
                </div>
                <Button type="button" variant="outline" onClick={onRegister} className="h-11 w-full border-teal-200 text-teal-800">
                  <UserPlus className="h-4 w-4" /> Register and pay
                </Button>
              </>
            )}

            <div className="mt-6 rounded-2xl border border-teal-100 bg-teal-50/75 p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-teal-900">
                <CheckCircle2 className="h-4 w-4 text-teal-600" /> Demo account ready
              </p>
              <p className="mt-1 text-[11px] leading-5 text-teal-800/75">
                The sample credentials for the {role} account are pre-filled so the portal can be explored immediately.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
