import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiGet, getOwnProfile, updateOwnName, type OwnProfile } from "@/lib/apiClient";
import { saveCurrentUser } from "@/lib/session";
import { ProfileNameHistory, emailStatusLabel } from "@/components/ProfileNameHistory";

function canonicalName(value: string): string {
  return value.trim();
}

function validateName(value: string): string | null {
  const canonical = canonicalName(value);
  if (!canonical) return "Enter your full name.";
  if (canonical.length > 160) return "Name must be 160 characters or fewer.";
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) return "Name cannot contain control characters or line breaks.";
  return null;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="space-y-1"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="text-sm text-slate-900">{value || "Not available"}</dd></div>;
}

export function ProfilePage({ adminShell = false }: { adminShell?: boolean }) {
  const [profile, setProfile] = useState<OwnProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  const loadProfile = useCallback(async (initial = false) => {
    const requestId = ++requestIdRef.current;
    if (initial) setLoading(true);
    setLoadError(null);
    try {
      const result = await getOwnProfile();
      if (requestId !== requestIdRef.current) return result;
      setProfile(result);
      if (!editing) setDraft(result.user.fullName);
      return result;
    } catch (cause) {
      if (requestId === requestIdRef.current) setLoadError(cause instanceof Error ? cause.message : "Your profile could not be loaded.");
      return null;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [editing]);

  useEffect(() => { void loadProfile(true); }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void loadProfile(false);
        setHistoryRefresh((value) => value + 1);
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadProfile]);

  useEffect(() => { if (editing) nameInputRef.current?.focus(); }, [editing]);

  const beginEdit = () => {
    if (!profile) return;
    setDraft(profile.user.fullName);
    setMessage(null);
    setErrorMessage(null);
    setNameError(null);
    setEditing(true);
  };
  const cancelEdit = () => {
    setDraft(profile?.user.fullName ?? "");
    setNameError(null);
    setErrorMessage(null);
    setEditing(false);
    window.requestAnimationFrame(() => editButtonRef.current?.focus());
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile || saving) return;
    const validationError = validateName(draft);
    setNameError(validationError);
    setErrorMessage(null);
    setMessage(null);
    setEmailStatus(null);
    if (validationError) return;
    const name = canonicalName(draft);
    if (name === profile.user.fullName) return;

    setSaving(true);
    try {
      const result = await updateOwnName(name, profile.user.fullName);
      saveCurrentUser(result.session);
      setProfile(result.profile);
      setDraft(result.profile.user.fullName);
      setEditing(false);
      setHistoryRefresh((value) => value + 1);
      setMessage(result.changed && result.profile.user.role === "student"
        ? "Name updated. A notification has been saved for your department HOD."
        : result.changed ? "Your name has been updated." : "Your name is already up to date.");
      if (result.notification) setEmailStatus(emailStatusLabel(result.notification.emailStatus));
      window.requestAnimationFrame(() => editButtonRef.current?.focus());
    } catch (cause) {
      if (cause instanceof ApiError && cause.data?.code === "PROFILE_NAME_CONFLICT") {
        const latest = await loadProfile(false);
        if (latest?.user.fullName === name) {
          const currentSession = await apiGet("/api/auth/me").catch(() => null);
          if (currentSession) saveCurrentUser(currentSession);
          setDraft(latest.user.fullName);
          setEditing(false);
          setHistoryRefresh((value) => value + 1);
          setMessage("Your name is already saved.");
          window.requestAnimationFrame(() => editButtonRef.current?.focus());
        } else if (latest) setErrorMessage("Your profile name changed elsewhere. The latest saved name is shown; review your draft and save again if you still want this change.");
        else setErrorMessage("Your profile name changed elsewhere, but the latest name could not be loaded. Retry the profile load before saving again.");
      } else if (cause instanceof ApiError && cause.status === 400) {
        setNameError(cause.message || "Please enter a valid name.");
      } else {
        // The server may have committed before the response was lost. Reconcile before showing
        // a retryable error so a second submission cannot create a duplicate history event.
        const [latest, currentSession] = await Promise.all([
          getOwnProfile().catch(() => null),
          apiGet("/api/auth/me").catch(() => null),
        ]);
        if (latest?.user.fullName === name) {
          if (currentSession) saveCurrentUser(currentSession);
          setProfile(latest);
          setDraft(latest.user.fullName);
          setEditing(false);
          setHistoryRefresh((value) => value + 1);
          setMessage("Your name is already saved.");
          window.requestAnimationFrame(() => editButtonRef.current?.focus());
        } else {
          if (latest) setProfile(latest);
          setErrorMessage(cause instanceof Error ? cause.message : "Your name could not be saved. Your draft is still here.");
        }
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading && !profile) return <div role="status" className="mx-auto max-w-4xl p-6 text-sm text-slate-500">Loading your profile…</div>;
  if (!profile) return <main className="mx-auto max-w-4xl p-6"><Card><CardContent className="space-y-3 p-6"><h1 className="text-xl font-bold">Your profile could not be loaded</h1><p role="alert" className="text-sm text-rose-700">{loadError || "Please try again."}</p><Button onClick={() => void loadProfile(true)}>Retry</Button></CardContent></Card></main>;

  const readOnlyText = profile.capabilities.readOnlyReason === "impersonation"
    ? "Name changes are unavailable while viewing an account through impersonation."
    : profile.capabilities.readOnlyReason === "demo" ? "Profile editing is unavailable in the demo." : null;
  const initials = profile.user.fullName.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return <main className="mx-auto w-full max-w-4xl space-y-6 p-1 sm:p-2">
    {adminShell ? <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:underline"><ArrowLeft className="h-4 w-4" />Back to portal</Link> : null}
    <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Account</p><h1 className="mt-1 text-3xl font-bold text-slate-950">My Profile</h1><p className="mt-2 text-sm text-slate-600">View your account details and manage the name shown in your logbook.</p></header>
    {loadError ? <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Profile refresh failed: {loadError}<Button variant="link" className="h-auto p-0" onClick={() => void loadProfile(false)}>Retry</Button></div> : null}
    {message ? <p role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p> : null}
    {emailStatus ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{emailStatus}</p> : null}
    {errorMessage ? <p role="alert" aria-live="assertive" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{errorMessage}</p> : null}
    <Card className="rounded-2xl border-slate-200/80 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0"><CardTitle className="text-lg">Account details</CardTitle>
        {!editing && profile.capabilities.canEditName ? <Button ref={editButtonRef} variant="outline" onClick={beginEdit}><Pencil className="mr-2 h-4 w-4" />Edit name</Button> : null}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4"><div aria-label={`Initials ${initials}`} className="grid h-12 w-12 place-items-center rounded-full bg-teal-100 text-sm font-bold text-teal-900">{initials}</div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</p><p className="text-lg font-semibold text-slate-950">{profile.user.fullName}</p></div></div>
        {editing ? <form onSubmit={handleSave} className="space-y-3" noValidate>
          <div className="space-y-2"><Label htmlFor="profile-full-name">Full name</Label><Input ref={nameInputRef} id="profile-full-name" name="fullName" autoComplete="name" maxLength={200} value={draft} aria-invalid={!!nameError} aria-describedby={nameError ? "profile-name-error" : "profile-name-help"} onChange={(event) => { setDraft(event.target.value); setNameError(null); }} />
            {nameError ? <p id="profile-name-error" role="alert" className="text-sm text-rose-700">{nameError}</p> : null}
            <p id="profile-name-help" className="text-xs text-slate-600">{profile.user.role === "student" ? "Your updated name will appear in your logbook. Your department HOD will be notified." : "Your updated name will appear throughout your account."}</p>
          </div>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving || !!validateName(draft) || canonicalName(draft) === profile.user.fullName}>{saving ? "Saving…" : "Save changes"}</Button><Button type="button" variant="outline" disabled={saving} onClick={cancelEdit}>Cancel</Button></div>
        </form> : readOnlyText ? <p className="text-sm text-slate-600">{readOnlyText}</p> : null}
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2"><Field label="Email" value={profile.user.email} /><Field label="Role" value={profile.user.role[0]?.toUpperCase() + profile.user.role.slice(1)} /><Field label="Department" value={profile.user.departmentName} /></dl>
      </CardContent>
    </Card>
    {profile.student ? <Card className="rounded-2xl border-slate-200/80 shadow-sm"><CardHeader><CardTitle className="text-lg">Academic details</CardTitle></CardHeader><CardContent><dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2"><Field label="Registration number" value={profile.student.registrationNumber} /><Field label="KUHS ID" value={profile.student.kuhsId} /><Field label="Batch" value={profile.student.batch} /><Field label="Date of joining" value={profile.student.dateOfJoining} /></dl></CardContent></Card> : null}
    <ProfileNameHistory refreshKey={historyRefresh} />
  </main>;
}
