import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Sparkles, Stethoscope, Award, CheckCircle2, ShieldCheck, Cpu } from "lucide-react";
import type { InterstitialInfo } from "./scenes";

type MovieInterstitialProps = {
  info: InterstitialInfo;
};

export function MovieInterstitial({ info }: MovieInterstitialProps) {
  const reduceMotion = useReducedMotion();

  const getIcon = () => {
    switch (info.icon) {
      case "stethoscope":
        return <Stethoscope className="h-8 w-8 text-emerald-400" />;
      case "award":
        return <Award className="h-8 w-8 text-teal-400" />;
      case "cpu":
        return <Cpu className="h-8 w-8 text-cyan-400" />;
      case "sparkles":
      default:
        return <Sparkles className="h-8 w-8 text-teal-300" />;
    }
  };

  const badgeColors = {
    teal: "bg-teal-500/20 text-teal-300 border-teal-400/40 shadow-teal-500/20",
    emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-400/40 shadow-emerald-500/20",
    cyan: "bg-cyan-500/20 text-cyan-300 border-cyan-400/40 shadow-cyan-500/20",
    indigo: "bg-indigo-500/20 text-indigo-300 border-indigo-400/40 shadow-indigo-500/20",
  }[info.badgeTone || "teal"];

  return (
    <div className="pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <motion.div
        role="region"
        aria-label={info.title}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -12 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-teal-950/80 p-8 text-center text-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-2xl sm:p-10"
      >
        {/* Subtle decorative background glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl" />

        {/* Top Icon with pulsing aura */}
        <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-white/15 bg-white/5 shadow-inner backdrop-blur-sm">
          {!reduceMotion && (
            <motion.div
              className="absolute inset-0 rounded-2xl border border-teal-400/40"
              animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.9, 0.4] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
            />
          )}
          {getIcon()}
        </div>

        {/* Eyebrow / Tag */}
        {info.eyebrow && (
          <p className="mb-2 text-[11px] font-bold tracking-[0.2em] text-teal-400 uppercase">
            {info.eyebrow}
          </p>
        )}

        {/* Badge Pill */}
        {info.badge && (
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-semibold shadow-sm backdrop-blur-md">
            <span className={`inline-block h-2 w-2 rounded-full ${info.badgeTone === "emerald" ? "bg-emerald-400" : "bg-teal-400"} animate-pulse`} />
            <span className={badgeColors}>{info.badge}</span>
          </div>
        )}

        {/* Main Title */}
        <h2 className="mb-2 font-display text-2xl font-bold tracking-tight sm:text-3xl text-white">
          {info.title}
        </h2>

        {/* Subtitle */}
        <p className="mb-4 text-base font-medium text-teal-200/90 sm:text-lg">
          {info.subtitle}
        </p>

        {/* Tagline / Explainer */}
        {info.tagline && (
          <p className="mb-6 text-sm leading-relaxed text-slate-300">
            {info.tagline}
          </p>
        )}

        {/* Feature Highlights Pills */}
        {info.highlights && info.highlights.length > 0 && (
          <div className="mt-6 flex flex-col gap-2.5 text-left">
            {info.highlights.map((highlight, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs font-medium text-slate-200 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-400" />
                <span>{highlight}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
