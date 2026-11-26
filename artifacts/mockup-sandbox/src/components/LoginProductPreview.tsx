import * as React from "react";
import { CheckCircle2, Mic, Play, RotateCcw } from "lucide-react";
import { ArogyaCharacter, type ArogyaState } from "@/components/arogya/ArogyaCharacter";

type PreviewPhase =
  | "idle"
  | "listening"
  | "thinking"
  | "filling-1"
  | "filling-2"
  | "filling-3"
  | "ready";

const SAMPLE_DICTATION =
  "Performed peripheral IV cannulation under supervision on 12 May.";

const SAMPLE_FIELDS = [
  { key: "procedure", label: "Procedure", value: "Peripheral IV cannulation", fillAt: 1 },
  { key: "supervision", label: "Supervision", value: "Supervised", fillAt: 2 },
  { key: "date", label: "Date", value: "12 May", fillAt: 3 },
] as const;

function getFilledCount(phase: PreviewPhase): number {
  if (phase === "filling-1") return 1;
  if (phase === "filling-2") return 2;
  if (phase === "filling-3" || phase === "ready") return 3;
  return 0;
}

function getPhaseLabel(phase: PreviewPhase): string {
  switch (phase) {
    case "listening":
      return "Listening";
    case "thinking":
      return "Thinking";
    case "filling-1":
    case "filling-2":
    case "filling-3":
      return "Filling";
    case "ready":
      return "Ready to review";
    default:
      return "Sample";
  }
}

function getInitialReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function LoginProductPreview({ active = true }: { active?: boolean }) {
  const [reducedMotion, setReducedMotion] = React.useState(getInitialReducedMotion);
  const [phase, setPhase] = React.useState<PreviewPhase>(() =>
    !active || getInitialReducedMotion() ? "ready" : "idle"
  );
  const [mascotState, setMascotState] = React.useState<ArogyaState>("resting");
  const [hasStarted, setHasStarted] = React.useState(false);

  const timersRef = React.useRef<number[]>([]);
  const runIdRef = React.useRef(0);
  const isRunningRef = React.useRef(false);

  const clearScheduled = React.useCallback(() => {
    for (const timerId of timersRef.current) {
      window.clearTimeout(timerId);
    }
    timersRef.current = [];
  }, []);

  const scheduleStep = React.useCallback(
    (delayMs: number, runId: number, callback: () => void) => {
      const timerId = window.setTimeout(() => {
        if (runIdRef.current !== runId) return;
        callback();
      }, delayMs);
      timersRef.current.push(timerId);
    },
    []
  );

  React.useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = (matches: boolean) => {
      setReducedMotion(matches);
      if (matches) {
        runIdRef.current += 1;
        clearScheduled();
        isRunningRef.current = false;
        setMascotState("resting");
        setPhase("ready");
      }
    };
    syncPreference(preference.matches);
    const onChange = () => syncPreference(preference.matches);
    preference.addEventListener("change", onChange);
    return () => preference.removeEventListener("change", onChange);
  }, [clearScheduled]);

  React.useEffect(() => {
    clearScheduled();
    isRunningRef.current = false;
    const runId = ++runIdRef.current;

    if (!active || reducedMotion) {
      setMascotState("resting");
      setHasStarted(false);
      setPhase("ready");
      return () => {
        runIdRef.current += 1;
        clearScheduled();
        isRunningRef.current = false;
      };
    }

    setHasStarted(false);
    setPhase("idle");
    setMascotState("waving");
    scheduleStep(650, runId, () => {
      setMascotState("resting");
    });

    return () => {
      runIdRef.current += 1;
      clearScheduled();
      isRunningRef.current = false;
    };
  }, [active, reducedMotion, clearScheduled, scheduleStep]);

  const startSequence = React.useCallback(() => {
    const prefersReducedNow =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || prefersReducedNow || !active || isRunningRef.current) return;

    clearScheduled();
    const runId = ++runIdRef.current;
    isRunningRef.current = true;
    setHasStarted(true);
    setPhase("listening");
    setMascotState("listening");

    scheduleStep(750, runId, () => {
      setPhase("thinking");
      setMascotState("thinking");
    });
    scheduleStep(1500, runId, () => {
      setPhase("filling-1");
      setMascotState("resting");
    });
    scheduleStep(1850, runId, () => {
      setPhase("filling-2");
    });
    scheduleStep(2200, runId, () => {
      setPhase("filling-3");
    });
    scheduleStep(2550, runId, () => {
      isRunningRef.current = false;
      setPhase("ready");
      setMascotState("resting");
    });
  }, [active, reducedMotion, clearScheduled, scheduleStep]);

  const filledCount = getFilledCount(phase);
  const isRunning =
    active &&
    !reducedMotion &&
    phase !== "idle" &&
    phase !== "ready";
  const isAnimating =
    !reducedMotion &&
    active &&
    (mascotState === "waving" || isRunning);
  const phaseLabel = getPhaseLabel(phase);

  return (
    <div className="signed-out-preview mt-5" data-playing={isAnimating}>
      <div className="rounded-[22px] border border-line-soft bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-line-soft pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ArogyaCharacter
              state={mascotState}
              initialState="resting"
              size={44}
              decorative
              scopedSampleMotion
              sampleReducedMotion={reducedMotion}
            />
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-forest">
              Sample entry
            </p>
          </div>

          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={`inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
              phase === "ready"
                ? "border-line bg-sage text-ink"
                : phase === "listening" || phase === "thinking"
                  ? "border-forest bg-mist text-forest"
                  : "border-line-soft bg-mist text-helper"
            }`}
          >
            {phase === "ready" && (
              <CheckCircle2 className="size-3.5 text-forest" aria-hidden="true" />
            )}
            {phase === "listening" && (
              <Mic className="size-3.5 text-forest" aria-hidden="true" />
            )}
            <span>{phaseLabel}</span>
          </span>
        </div>

        <div
          className={`mt-3 rounded-xl border p-3 ${
            phase === "listening"
              ? "border-forest bg-mist"
              : "border-line-soft bg-mist"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-forest">
            Sample dictation
          </p>
          <p className="mt-1 text-sm leading-snug text-ink">
            &ldquo;{SAMPLE_DICTATION}&rdquo;
          </p>
        </div>

        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {SAMPLE_FIELDS.map((field) => {
            const isFilled = filledCount >= field.fillAt;
            return (
              <div
                key={field.key}
                className="rounded-xl border border-line-soft bg-background px-3 py-2"
              >
                <dt className="text-[11px] font-bold uppercase tracking-[0.08em] text-forest">
                  {field.label}
                </dt>
                <dd className="mt-1 min-h-5 text-sm font-semibold text-ink">
                  {isFilled ? (
                    field.value
                  ) : (
                    <span className="text-helper" aria-label="Pending">
                      &mdash;
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>

        <p className="mt-3 text-xs font-medium text-helper">
          Fictional example &mdash; no recording or live submit
        </p>
      </div>

      {active && !reducedMotion && (
        <button
          type="button"
          aria-disabled={isRunning || undefined}
          className={`mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-forest bg-white px-4 text-sm font-semibold text-forest ${
            isRunning ? "cursor-default" : "hover:bg-sage"
          }`}
          onClick={startSequence}
        >
          {hasStarted ? (
            <RotateCcw className="size-4" aria-hidden="true" />
          ) : (
            <Play className="size-4" aria-hidden="true" />
          )}
          {hasStarted ? "Replay" : "See Mochi in action"}
        </button>
      )}
    </div>
  );
}
