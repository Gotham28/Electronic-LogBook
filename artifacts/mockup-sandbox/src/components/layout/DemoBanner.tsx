import * as React from "react";
import { useLocation } from "wouter";
import { Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser, isDemoMode } from "@/lib/session";
import { demoDepartmentOptions, getActiveDemoDepartmentId, setActiveDemoDepartmentId } from "@/lib/demoDepartments";
import {
  DEMO_SOUND_PREFERENCE_CHANGED_EVENT,
  isDemoSoundMuted,
  playDemoSound,
  setDemoSoundMuted,
} from "@/lib/demoSounds";
import {
  DemoRole,
  DEMO_SESSION_CHANGED_EVENT,
  startDemoSession,
  requestDemoMovieReplay,
  demoPortalHome,
} from "@/lib/demoSession";
import { unlockDemoAudio, startDemoMusic } from "@/lib/demoMusic";

export const DEMO_TOUR_SEEN_STORAGE_PREFIX = "arogya-demo-tour-seen-";

const getCurrentDemoRole = (): DemoRole => {
  const userRole = getCurrentUser()?.role;
  if (userRole === "professor") return "faculty";
  if (userRole === "hod") return "hod";
  return "student";
};

export function DemoBanner() {
  const [, setLocation] = useLocation();
  const [soundMuted, setSoundMuted] = React.useState(isDemoSoundMuted);
  const [role, setRole] = React.useState<DemoRole>(getCurrentDemoRole);

  React.useEffect(() => {
    const refreshSoundPreference = () => setSoundMuted(isDemoSoundMuted());
    const handleRoleChange = () => setRole(getCurrentDemoRole());

    window.addEventListener(DEMO_SESSION_CHANGED_EVENT, handleRoleChange);
    window.addEventListener(DEMO_SOUND_PREFERENCE_CHANGED_EVENT, refreshSoundPreference);
    window.addEventListener("storage", refreshSoundPreference);
    return () => {
      window.removeEventListener(DEMO_SESSION_CHANGED_EVENT, handleRoleChange);
      window.removeEventListener(DEMO_SOUND_PREFERENCE_CHANGED_EVENT, refreshSoundPreference);
      window.removeEventListener("storage", refreshSoundPreference);
    };
  }, []);

  if (!isDemoMode()) return null;

  const resetDemo = () => {
    playDemoSound("click");
    setActiveDemoDepartmentId(1);
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(DEMO_TOUR_SEEN_STORAGE_PREFIX)) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Reloading still restores the in-memory sample data when storage is unavailable.
    }

    window.location.reload();
  };

  const changeDepartment = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const departmentId = Number(event.target.value);
    if (!Number.isInteger(departmentId) || !setActiveDemoDepartmentId(departmentId)) return;
    playDemoSound("click");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => window.location.reload(), reducedMotion ? 0 : 190);
  };

  const changeRole = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = event.target.value as DemoRole;
    playDemoSound("click");
    startDemoSession(newRole, { skipLoginSummary: true });
    setLocation(demoPortalHome(newRole));
  };

  const replayDemo = () => {
    playDemoSound("click");
    unlockDemoAudio();
    startDemoMusic();
    if (window.location.pathname === "/print") {
      setLocation(demoPortalHome(role));
    }
    requestDemoMovieReplay();
  };

  return (
    <aside
      aria-label="Demo environment"
      className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 transition-colors duration-200 sm:justify-between"
      style={{
        borderColor: "color-mix(in srgb, var(--demo-accent) 22%, white)",
        backgroundColor: "color-mix(in srgb, var(--demo-accent) 7%, white)",
        color: "var(--demo-accent-readable)",
      }}
    >
      <p className="w-full min-w-0 text-xs font-medium leading-5 sm:w-auto sm:flex-1">
        Demo — sample data. Nothing here is a real patient or resident.
      </p>

      <label className="flex min-h-11 items-center gap-2 text-xs font-semibold">
        <span className="sr-only">Demo role</span>
        <select
          aria-label="Demo role"
          value={role}
          onChange={changeRole}
          className="h-11 max-w-full rounded-lg border border-white/80 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 sm:max-w-[13rem]"
          style={{ "--tw-ring-color": "var(--demo-accent)" } as React.CSSProperties}
        >
          <option value="student">Resident</option>
          <option value="faculty">Faculty</option>
          <option value="hod">HOD</option>
        </select>
      </label>

      <label className="flex min-h-11 min-w-0 items-center gap-2 text-xs font-semibold">
        <span className="sr-only">Demo department</span>
        <select
          aria-label="Demo department"
          value={String(getActiveDemoDepartmentId())}
          onChange={changeDepartment}
          className="h-11 max-w-full rounded-lg border border-white/80 bg-white px-2.5 text-xs font-semibold text-slate-800 shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 sm:max-w-[13rem]"
          style={{ "--tw-ring-color": "var(--demo-accent)" } as React.CSSProperties}
        >
          {demoDepartmentOptions.map((option) => (
            <option key={option.id ?? "general-medicine"} value={option.id ?? "general-medicine"} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={replayDemo}
        className="h-11 shrink-0 gap-1.5 border-white/80 bg-white/80 px-2.5 text-xs transition-colors hover:bg-white"
        style={{ color: "var(--demo-accent-readable)" }}
      >
        <Play aria-hidden="true" className="h-3.5 w-3.5" />
        Replay demo
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={resetDemo}
        className="h-11 shrink-0 gap-1.5 border-white/80 bg-white/80 px-2.5 text-xs transition-colors hover:bg-white"
        style={{ color: "var(--demo-accent-readable)" }}
      >
        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
        Reset demo
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={soundMuted ? "Unmute demo sounds" : "Mute demo sounds"}
        title={soundMuted ? "Unmute demo sounds" : "Mute demo sounds"}
        onClick={() => {
          setDemoSoundMuted(!soundMuted);
          setSoundMuted(!soundMuted);
          if (soundMuted) playDemoSound("click");
        }}
        className="h-11 shrink-0 gap-1.5 border-white/80 bg-white/80 px-2.5 text-xs transition-colors hover:bg-white"
        style={{ color: "var(--demo-accent-readable)" }}
      >
        {soundMuted ? <VolumeX aria-hidden="true" className="h-3.5 w-3.5" /> : <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{soundMuted ? "Sound off" : "Sound on"}</span>
      </Button>
    </aside>
  );
}
