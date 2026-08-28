import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TourStep = {
  target: string;
  title: string;
  description: string;
};

interface GuidedTourProps {
  open: boolean;
  steps: TourStep[];
  onClose: () => void;
}

type Rect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

const SPOTLIGHT_PADDING = 6;
const SPOTLIGHT_RADIUS = 14;
const BUBBLE_WIDTH = 340;
const BUBBLE_HEIGHT_ESTIMATE = 220;
const VIEWPORT_GUTTER = 12;

function getVisibleElement(target: string) {
  const element = document.querySelector<HTMLElement>(`[data-tour-id="${target}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? element : null;
}

function toSpotlightRect(element: HTMLElement): Rect {
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, rect.left - SPOTLIGHT_PADDING);
  const top = Math.max(0, rect.top - SPOTLIGHT_PADDING);
  const right = Math.min(window.innerWidth, rect.right + SPOTLIGHT_PADDING);
  const bottom = Math.min(window.innerHeight, rect.bottom + SPOTLIGHT_PADDING);

  return {
    top,
    right,
    bottom,
    left,
    width: right - left,
    height: bottom - top,
  };
}

function getBubblePosition(rect: Rect) {
  const width = Math.min(BUBBLE_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2);
  const roomRight = window.innerWidth - rect.right;
  const roomLeft = rect.left;

  if (roomRight >= width + 24) {
    return {
      left: rect.right + 16,
      top: Math.min(
        Math.max(VIEWPORT_GUTTER, rect.top + rect.height / 2 - BUBBLE_HEIGHT_ESTIMATE / 2),
        window.innerHeight - BUBBLE_HEIGHT_ESTIMATE - VIEWPORT_GUTTER,
      ),
      width,
    };
  }

  if (roomLeft >= width + 24) {
    return {
      left: rect.left - width - 16,
      top: Math.min(
        Math.max(VIEWPORT_GUTTER, rect.top + rect.height / 2 - BUBBLE_HEIGHT_ESTIMATE / 2),
        window.innerHeight - BUBBLE_HEIGHT_ESTIMATE - VIEWPORT_GUTTER,
      ),
      width,
    };
  }

  const placeBelow = window.innerHeight - rect.bottom >= BUBBLE_HEIGHT_ESTIMATE + 20;
  return {
    left: Math.min(Math.max(VIEWPORT_GUTTER, rect.left), window.innerWidth - width - VIEWPORT_GUTTER),
    top: placeBelow
      ? rect.bottom + 14
      : Math.max(VIEWPORT_GUTTER, rect.top - BUBBLE_HEIGHT_ESTIMATE - 14),
    width,
  };
}

export function GuidedTour({ open, steps, onClose }: GuidedTourProps) {
  const [activeSteps, setActiveSteps] = React.useState<TourStep[]>([]);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [spotlight, setSpotlight] = React.useState<Rect | null>(null);
  const nextButtonRef = React.useRef<HTMLButtonElement>(null);
  const maskId = React.useId().replace(/:/g, "");

  React.useEffect(() => {
    if (!open) return;

    const visibleSteps = steps.filter((step) => getVisibleElement(step.target));
    if (visibleSteps.length === 0) {
      onClose();
      return;
    }

    setActiveSteps(visibleSteps);
    setStepIndex(0);
  }, [open, steps, onClose]);

  const activeStep = activeSteps[stepIndex];

  React.useEffect(() => {
    if (!open || !activeStep) return;

    const updateSpotlight = () => {
      const element = getVisibleElement(activeStep.target);
      if (!element) {
        setSpotlight(null);
        return;
      }
      setSpotlight(toSpotlightRect(element));
    };

    const element = getVisibleElement(activeStep.target);
    element?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const animationFrame = window.requestAnimationFrame(updateSpotlight);
    const scrollListenerOptions: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener("resize", updateSpotlight);
    window.addEventListener("scroll", updateSpotlight, scrollListenerOptions);
    nextButtonRef.current?.focus();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateSpotlight);
      window.removeEventListener("scroll", updateSpotlight, scrollListenerOptions);
    };
  }, [open, activeStep]);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !activeStep || !spotlight) return null;

  const bubble = getBubblePosition(spotlight);
  const isLastStep = stepIndex === activeSteps.length - 1;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-description">
      <svg
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[90] h-full w-full"
        width={window.innerWidth}
        height={window.innerHeight}
        viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
        preserveAspectRatio="none"
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect width={window.innerWidth} height={window.innerHeight} fill="white" />
            <rect
              x={spotlight.left}
              y={spotlight.top}
              width={spotlight.width}
              height={spotlight.height}
              rx={SPOTLIGHT_RADIUS}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width={window.innerWidth}
          height={window.innerHeight}
          fill="#334155"
          fillOpacity="0.65"
          mask={`url(#${maskId})`}
        />
      </svg>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-[91] border-2 border-teal-400"
        style={{
          left: spotlight.left,
          top: spotlight.top,
          width: spotlight.width,
          height: spotlight.height,
          borderRadius: SPOTLIGHT_RADIUS,
        }}
      />

      <section
        className="pointer-events-auto fixed z-[92] rounded-[22px] border border-white/80 bg-white p-5 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.28)]"
        style={bubble}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">
              Quick tour · {stepIndex + 1}/{activeSteps.length}
            </p>
            <h2 id="tour-title" className="mt-1.5 text-lg font-bold text-slate-950">
              {activeStep.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            aria-label="Skip website tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p id="tour-description" className="mt-3 text-sm leading-6 text-slate-600">
          {activeStep.description}
        </p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-slate-500">
            Skip tour
          </Button>
          <Button
            ref={nextButtonRef}
            type="button"
            size="sm"
            onClick={() => (isLastStep ? onClose() : setStepIndex((current) => current + 1))}
            className="bg-teal-600 text-white hover:bg-teal-700"
          >
            {isLastStep ? (
              <><Check className="mr-2 h-4 w-4" /> Finish</>
            ) : (
              <>Next <ArrowRight className="ml-2 h-4 w-4" /></>
            )}
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
