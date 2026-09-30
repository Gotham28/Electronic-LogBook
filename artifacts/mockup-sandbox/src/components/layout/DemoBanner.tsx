import * as React from "react";
import { RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isDemoMode } from "@/lib/session";
import { demoDepartmentOptions, getActiveDemoDepartmentId, setActiveDemoDepartmentId } from "@/lib/demoDepartments";
import {
  DEMO_SOUND_PREFERENCE_CHANGED_EVENT,
  isDemoSoundMuted,
  playDemoSound,
  setDemoSoundMuted,
} from "@/lib/demoSounds";

export const DEMO_TOUR_SEEN_STORAGE_PREFIX = "arogya-demo-tour-seen-";

export function DemoBanner() {
  const [soundMuted, setSoundMuted] = React.useState(isDemoSoundMuted);

  React.useEffect(() => {
    const refreshSoundPreference = () => setSoundMuted(isDemoSoundMuted());
    window.addEventListener(DEMO_SOUND_PREFERENCE_CHANGED_EVENT, refreshSoundPreference);
    window.addEventListener("storage", refreshSoundPreference);
    return () => {
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

  return (
    <aside
      aria-label="Demo environment"
      className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-3 py-2 transition-colors duration-200 sm:flex sm:flex-wrap sm:justify-between"
      style={{
        borderColor: "color-mix(in srgb, var(--demo-accent) 22%, white)",
        backgroundColor: "color-mix(in srgb, var(--demo-accent) 7%, white)",
        color: "var(--demo-accent)",
      }}
    >
      <p className="col-span-2 min-w-0 text-xs font-medium leading-5 sm:flex-1">
        Demo — sample data. Nothing here is a real patient or resident.
      </p>
      <label className="flex min-h-11 min-w-0 items-center gap-2 text-xs font-semibold sm:col-auto">
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
        onClick={resetDemo}
        className="col-start-2 row-start-2 h-11 shrink-0 justify-self-end gap-1.5 border-white/80 bg-white/80 px-2.5 text-xs transition-colors hover:bg-white sm:col-auto sm:row-auto"
        style={{ color: "var(--demo-accent)" }}
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
        className="col-start-1 row-start-2 h-11 shrink-0 justify-self-start gap-1.5 border-white/80 bg-white/80 px-2.5 text-xs transition-colors hover:bg-white sm:col-auto sm:row-auto"
        style={{ color: "var(--demo-accent)" }}
      >
        {soundMuted ? <VolumeX aria-hidden="true" className="h-3.5 w-3.5" /> : <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{soundMuted ? "Sound off" : "Sound on"}</span>
      </Button>
    </aside>
  );
}
