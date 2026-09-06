import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CalendarDays,
  ShieldCheck,
  CheckCircle,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { expectedCompletionDate, formatLogbookDate, todayForInput } from "@/lib/logbook-config";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { apiGet, apiPost } from "@/lib/apiClient";
import { PaymentStep } from "@/components/PaymentStep";

export function RegistrationPage({
  onBack,
  onRegistered,
}: {
  onBack: () => void;
  onRegistered: () => void;
}) {
  const [submitting, setSubmitting] = React.useState(false);
  const [paymentToken, setPaymentToken] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    fullName: "",
    email: "",
    department: "",
    kuhsId: "",
    registrationNumber: "",
    joiningDate: todayForInput(),
    password: "",
    confirmPassword: "",
  });

  const [emailVerified, setEmailVerified] = React.useState(false);
  const [verificationToken, setVerificationToken] = React.useState("");
  const [departments, setDepartments] = React.useState<Array<{ id: number; name: string; programDurationMonths: number | null }>>([]);
  const [departmentError, setDepartmentError] = React.useState("");
  const [departmentsLoading, setDepartmentsLoading] = React.useState(true);
  const loadDepartments = React.useCallback(async () => {
    setDepartmentsLoading(true); setDepartmentError("");
    try { setDepartments(await apiGet("/api/departments")); }
    catch (err) { setDepartmentError(err instanceof Error ? err.message : "Could not load departments"); }
    finally { setDepartmentsLoading(false); }
  }, []);
  React.useEffect(() => { void loadDepartments(); }, [loadDepartments]);
  const [otpSent, setOtpSent] = React.useState(false);
  const [otp, setOtp] = React.useState("");
  const [countdown, setCountdown] = React.useState(0);
  const [sendingOtp, setSendingOtp] = React.useState(false);
  const [verifyingOtp, setVerifyingOtp] = React.useState(false);

  React.useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const completionDate = expectedCompletionDate(form.joiningDate, departments.find((d) => String(d.id) === form.department)?.programDurationMonths);
  const joiningYear = form.joiningDate ? new Date(`${form.joiningDate}T00:00:00`).getFullYear() : "";
  const passwordsMatch = Boolean(form.password) && form.password === form.confirmPassword;

  const sendOtp = async () => {
    if (!form.email) return;
    setSendingOtp(true);
    try {
      await apiPost("/api/auth/send-otp", { email: form.email });
      setOtpSent(true);
      setCountdown(60);
      toast.success("Verification code sent to your email");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send code");
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    if (!form.email || otp.length !== 6) return;
    setVerifyingOtp(true);
    try {
      const verified = await apiPost("/api/auth/verify-otp", { email: form.email, otp });
      setVerificationToken(verified.verificationToken);
      setEmailVerified(true);
      setOtpSent(false); // Hide OTP input on success
      toast.success("Email successfully verified");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid or expired code");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const completeRegistration = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordsMatch || !emailVerified) return;
    
    setSubmitting(true);
    try {
      const result = await apiPost("/api/auth/register", {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        registrationNumber: form.registrationNumber,
        batch: joiningYear.toString(),
        dateOfJoining: form.joiningDate,
        kuhsId: form.kuhsId,
        departmentId: Number(form.department),
        verificationToken,
      });
      setPaymentToken(result.paymentToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Registration could not be completed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (paymentToken) {
    return (
      <PaymentStep
        paymentToken={paymentToken}
        onPaid={() => {
          toast.success("Registration submitted", {
            description: "HOD verification is pending. You will be able to log in after approval.",
          });
          onRegistered();
        }}
        onExit={onBack}
      />
    );
  }

  return (
    <div className="medical-grid min-h-screen p-4 md:p-8">
      <div className="glass-panel mx-auto max-w-5xl overflow-hidden rounded-[30px] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-500 motion-reduce:animate-none">
        <header className="flex items-center justify-between border-b border-white/80 bg-white/65 px-5 py-4 md:px-8">
          <button onClick={onBack} className="flex items-center gap-2 text-xs font-bold text-teal-800">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </button>
          <div className="flex items-center gap-2 text-teal-800">
            <BookOpenCheck className="h-5 w-5" />
            <span className="text-sm font-bold">Student self-registration</span>
          </div>
        </header>

        <div className="grid lg:grid-cols-[.72fr_1.28fr]">
          <aside className="bg-gradient-to-br from-teal-700 to-cyan-600 p-7 text-white md:p-9 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-4 motion-safe:duration-500 motion-reduce:animate-none">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-teal-100">Registration progress</p>
            <h1 className="mt-3 text-3xl font-bold">Create your E-Logbook account</h1>
            <p className="mt-3 text-xs leading-5 text-teal-50/85">
              Register using the official university registration number, exact joining date and department.
            </p>
            <div className="mt-8 space-y-3">
              <Step number="1" title="Student & course details" active={true} complete={false} />
            </div>
            <div className="mt-8 rounded-2xl border border-white/15 bg-white/10 p-4">
              <p className="flex items-center gap-2 text-xs font-bold"><CalendarDays className="h-4 w-4" /> Course duration check</p>
              <p className="mt-2 text-[11px] leading-5 text-teal-50">
                The system calculates the expected completion date from the exact day, month and year of joining.
              </p>
            </div>
          </aside>

          <main className="bg-white/82 p-6 md:p-9">
              <form onSubmit={completeRegistration} className="space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-3 motion-safe:duration-500 motion-reduce:animate-none">
                <div>
                  <h2 className="mt-1 text-3xl font-bold">Student details</h2>
                  <p className="mt-2 text-sm text-slate-500">All fields must match the official admission record.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="registration-full-name"><Input id="registration-full-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></Field>
                  
                  <Field label="Email address" htmlFor="registration-email">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input 
                          id="registration-email" 
                          type="email" 
                          value={form.email} 
                          onChange={(e) => {
                            setForm({ ...form, email: e.target.value });
                            if (emailVerified || otpSent) {
                              setEmailVerified(false);
                              setOtpSent(false);
                              setOtp("");
                            }
                          }} 
                          required 
                          disabled={emailVerified}
                        />
                        {emailVerified && <CheckCircle className="absolute right-3 top-2.5 h-4 w-4 text-emerald-500" />}
                      </div>
                      {!emailVerified && (
                        <Button type="button" variant="outline" onClick={sendOtp} disabled={!form.email || sendingOtp || countdown > 0}>
                          {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : (countdown > 0 ? `Resend (${countdown}s)` : (otpSent ? "Resend" : "Send Code"))}
                        </Button>
                      )}
                    </div>
                    {otpSent && !emailVerified && (
                      <div className="mt-3 flex flex-col gap-3 rounded-lg border bg-slate-50 p-3">
                        <Label className="text-xs text-slate-600">Enter 6-digit code</Label>
                        <div className="flex items-center gap-3">
                          <InputOTP maxLength={6} value={otp} onChange={setOtp} disabled={verifyingOtp}>
                            <InputOTPGroup>
                              <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
                              <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
                            </InputOTPGroup>
                          </InputOTP>
                          <Button type="button" size="sm" onClick={verifyOtp} disabled={otp.length !== 6 || verifyingOtp}>
                            {verifyingOtp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Verify
                          </Button>
                        </div>
                      </div>
                    )}
                  </Field>

                  <Field label="Department" htmlFor="registration-department">
                    <Select value={form.department} onValueChange={(department) => setForm({ ...form, department })}>
                      <SelectTrigger id="registration-department"><SelectValue /></SelectTrigger>
                      <SelectContent>{departments.map((department) => <SelectItem key={department.id} value={String(department.id)}>{department.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  {departmentsLoading && <p role="status" className="text-sm text-slate-500">Loading departments…</p>}
                  {departmentError && <p role="alert" className="text-sm text-rose-700">We could not load the department directory. Check that the API is running with the current branch, then <button type="button" className="font-semibold underline underline-offset-2" onClick={loadDepartments}>try again</button>.</p>}
                  {!departmentsLoading && !departmentError && !departments.length && <p className="text-sm text-slate-500">No departments are accepting registrations yet. Contact your institution.</p>}
                  <Field label="University ID" htmlFor="registration-university-id"><Input id="registration-university-id" value={form.kuhsId} onChange={(e) => setForm({ ...form, kuhsId: e.target.value })} required /></Field>
                  <Field label="University registration number" htmlFor="registration-number"><Input id="registration-number" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} required /></Field>
                  <Field label="Exact joining date" htmlFor="registration-joining-date">
                    <Input id="registration-joining-date" type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} required />
                    <p className="text-[10px] text-slate-500">Day, month and year are required.</p>
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Summary label="Joining year" value={String(joiningYear)} />
                    <Summary label="Expected completion" value={completionDate ? formatLogbookDate(completionDate) : "—"} />
                  </div>
                  <Field label="Create password" htmlFor="registration-password"><Input id="registration-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required /></Field>
                  <Field label="Confirm password" htmlFor="registration-confirm-password">
                    <Input id="registration-confirm-password" type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} minLength={8} required />
                    {form.confirmPassword && !passwordsMatch && <p className="text-[10px] text-rose-600">Passwords do not match.</p>}
                  </Field>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center mt-6">
                  <Button type="submit" disabled={!passwordsMatch || submitting || !emailVerified || !form.department || departmentsLoading} className="w-full sm:w-auto">
                    {submitting ? "Submitting Registration..." : "Complete Registration"} <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  {!emailVerified && <p className="text-xs font-medium text-slate-500">Please verify your email to continue</p>}
                </div>
              </form>
          </main>
        </div>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={htmlFor}>{label}</Label>{children}</div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-teal-100 bg-white/80 p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-teal-700">{label}</p><p className="mt-1 truncate text-xs font-bold text-slate-900">{value || "—"}</p></div>;
}

function Step({ number, title, active, complete }: { number: string; title: string; active: boolean; complete: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3 ${active ? "border-white/35 bg-white/15 motion-safe:animate-pulse-soft motion-reduce:animate-none" : "border-white/10 bg-white/5"}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-xs font-bold text-teal-700">
        {complete ? <BadgeCheck className="h-4 w-4" /> : number}
      </span>
      <p className="text-xs font-bold">{title}</p>
    </div>
  );
}
