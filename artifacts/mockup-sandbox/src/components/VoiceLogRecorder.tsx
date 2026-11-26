import React from "react";
import {
  Mic,
  Square,
  Loader2,
  RotateCcw,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPostAudio, ApiError } from "@/lib/apiClient";
import type { VoiceLogExtractResponse } from "@workspace/api-zod";

export interface VoiceLogRecorderProps {
  studentId: number | string | null | undefined;
  logType: "case" | "procedure";
  disabled?: boolean;
  onExtracted: (result: VoiceLogExtractResponse) => void;
  skippedEditedCount?: number;
  onOverwriteEdited?: () => void;
  missingRequiredLabels?: string[];
  resetKey?: number | string;
}

type RecorderState = "idle" | "recording" | "processing" | "success" | "error";

function getSupportedMimeType(): string | undefined {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return undefined;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function VoiceLogRecorder({
  studentId,
  logType,
  disabled = false,
  onExtracted,
  skippedEditedCount = 0,
  onOverwriteEdited,
  missingRequiredLabels = [],
  resetKey,
}: VoiceLogRecorderProps) {
  const [state, setState] = React.useState<RecorderState>("idle");
  const [duration, setDuration] = React.useState(0);
  const [audioLevels, setAudioLevels] = React.useState<number[]>([20, 25, 20, 25, 20]);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [errorRetryable, setErrorRetryable] = React.useState(false);
  const [cachedBlob, setCachedBlob] = React.useState<Blob | null>(null);
  const [lastResult, setLastResult] = React.useState<VoiceLogExtractResponse | null>(null);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = React.useState(false);

  const mediaStreamRef = React.useRef<MediaStream | null>(null);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const timerIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  // Feature detection
  const isSupported =
    typeof window !== "undefined" &&
    Boolean(
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function" &&
      typeof MediaRecorder !== "undefined"
    );

  const cleanup = React.useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        audioContextRef.current.close();
      } catch {
        // Ignore
      }
    }
    audioContextRef.current = null;
    analyserRef.current = null;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Reset when resetKey changes
  React.useEffect(() => {
    cleanup();
    setState("idle");
    setDuration(0);
    setErrorMessage(null);
    setErrorRetryable(false);
    setCachedBlob(null);
    setLastResult(null);
    setIsTranscriptExpanded(false);
  }, [resetKey, cleanup]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const uploadAudio = async (blob: Blob) => {
    if (blob.size < 128) {
      setState("error");
      setErrorMessage("Recording was too short. Try speaking for a moment longer.");
      setErrorRetryable(false);
      return;
    }
    if (blob.size > 10 * 1024 * 1024) {
      setState("error");
      setErrorMessage("Recording exceeded the 10 MB limit. Keep dictations under 2 minutes.");
      setErrorRetryable(false);
      return;
    }
    if (!studentId) {
      setState("error");
      setErrorMessage("Student session not found. Please refresh and try again.");
      setErrorRetryable(false);
      return;
    }

    setState("processing");
    setErrorMessage(null);
    setErrorRetryable(false);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await apiPostAudio<VoiceLogExtractResponse>(
        `/api/students/${studentId}/voice-log/extract?logType=${logType}`,
        blob,
        { signal: abortController.signal }
      );
      setState("success");
      setLastResult(result);
      onExtracted(result);
    } catch (err: any) {
      if (abortController.signal.aborted) {
        setState("idle");
        return;
      }
      setState("error");
      setCachedBlob(blob);
      setErrorRetryable(true);
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setErrorMessage(err.message || "Voice log rate limit reached. Please try again later.");
        } else if (err.status === 413) {
          setErrorMessage("Recording exceeded the 10 MB limit. Keep dictations under 2 minutes.");
          setErrorRetryable(false);
        } else if (err.status === 502 || err.status === 503) {
          setErrorMessage(err.message || "Voice logging service is currently unavailable.");
        } else {
          setErrorMessage(err.message || "Failed to process audio recording.");
        }
      } else {
        setErrorMessage(err.message || "Network error. Please check your connection and retry.");
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const stopRecordingAndSubmit = React.useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        audioContextRef.current.close();
      } catch {
        // Ignore
      }
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  const startRecording = async () => {
    cleanup();
    setErrorMessage(null);
    setErrorRetryable(false);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaStreamRef.current = stream;

      // Audio analysis for live bars
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateLevels = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            const step = Math.floor(dataArray.length / 5) || 1;
            const levels = [0, 1, 2, 3, 4].map((i) => {
              const val = dataArray[i * step] || 0;
              return Math.min(100, Math.max(15, Math.round((val / 255) * 100)));
            });
            setAudioLevels(levels);
            animationFrameRef.current = requestAnimationFrame(updateLevels);
          };
          updateLevels();
        }
      } catch {
        // Fall back to CSS pulse
      }

      const mimeType = getSupportedMimeType();
      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const recordedBlob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        setCachedBlob(recordedBlob);
        uploadAudio(recordedBlob);
      };

      recorder.start(250); // collect chunks every 250ms
      setState("recording");
      setDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev + 1 >= 120) {
            stopRecordingAndSubmit();
            return 120;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      cleanup();
      setState("error");
      setErrorRetryable(false);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setErrorMessage("Microphone access was denied. Please allow microphone permissions in your browser settings.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setErrorMessage("No microphone detected. Please connect an audio input device.");
      } else {
        setErrorMessage("Could not start audio recording. Please check your microphone.");
      }
    }
  };

  const handleCancel = () => {
    cleanup();
    setState("idle");
    setDuration(0);
    setErrorMessage(null);
    setErrorRetryable(false);
    setCachedBlob(null);
  };

  const handleRetry = () => {
    if (cachedBlob) {
      uploadAudio(cachedBlob);
    }
  };

  if (!isSupported) {
    return (
      <div className="rounded-lg border border-line-soft bg-mist p-3 mb-4 text-xs text-muted-foreground flex items-center gap-2">
        <Mic className="h-4 w-4 text-helper shrink-0" />
        <span>Voice dictation is not supported in this browser.</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line-soft bg-mist p-3.5 mb-4 shadow-xs transition-all">
      {/* 1. IDLE STATE */}
      {state === "idle" && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-sage flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-forest" />
            </div>
            <div>
              <div className="text-xs font-semibold text-ink">
                Dictate with AI
              </div>
              <p className="text-[11px] text-muted-foreground line-clamp-1">
                Speak naturally about the case — you'll review every field before saving.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startRecording}
            disabled={disabled}
            className="w-full sm:w-auto h-8 text-xs font-medium border-line-soft hover:bg-mist text-forest gap-1.5 shrink-0"
          >
            <Mic className="h-3.5 w-3.5 text-forest" />
            <span>Dictate entry</span>
          </Button>
        </div>
      )}

      {/* 2. RECORDING STATE */}
      {state === "recording" && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
            </span>
            <div className="font-mono text-xs font-bold text-status-foreground">
              {formatTimer(duration)} / 02:00
            </div>
            {/* Live Audio Level Bars */}
            <div className="flex items-end gap-1 h-5 px-1.5 py-0.5 bg-sage rounded">
              {audioLevels.map((lvl, idx) => (
                <div
                  key={idx}
                  className="w-1 bg-destructive rounded-xs transition-all duration-75"
                  style={{ height: `${lvl}%` }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={stopRecordingAndSubmit}
              className="flex-1 sm:flex-initial h-8 text-xs font-medium bg-destructive hover:bg-deep text-white gap-1.5 shadow-xs"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>Stop & fill form</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-8 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* 3. PROCESSING STATE */}
      {state === "processing" && (
        <div className="flex items-center justify-between gap-3 py-1">
          <div className="flex items-center gap-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-forest" />
            <span className="text-xs font-medium text-ink">
              Transcribing and extracting fields...
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* 4. SUCCESS / RESULT BANNER */}
      {state === "success" && (
        <div className="space-y-2.5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-status flex items-center justify-center shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-status-foreground" />
              </div>
              <span className="text-xs font-semibold text-status-foreground">
                Fields extracted from dictation
              </span>
            </div>
            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
              {skippedEditedCount > 0 && onOverwriteEdited && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOverwriteEdited}
                  className="h-7 text-[11px] font-medium border-status-border text-status-foreground hover:bg-status"
                >
                  Apply to {skippedEditedCount} edited field{skippedEditedCount > 1 ? "s" : ""}
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={startRecording}
                disabled={disabled}
                className="h-7 text-[11px] text-muted-foreground hover:text-foreground gap-1"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Re-record</span>
              </Button>
            </div>
          </div>

          {/* Warnings callout */}
          {lastResult?.warnings && lastResult.warnings.length > 0 && (
            <div className="rounded-md bg-status border border-status-border p-2.5 text-xs text-status-foreground flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-status-foreground mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                {lastResult.warnings.map((w, idx) => (
                  <div key={idx} className="text-[11px] leading-relaxed">
                    {w}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing required callout */}
          {missingRequiredLabels.length > 0 && (
            <div className="text-[11px] text-soft-ink flex items-center gap-1.5 px-0.5">
              <span className="font-medium text-ink">Still needed:</span>
              <span className="truncate">{missingRequiredLabels.join(", ")}</span>
            </div>
          )}

          {/* Collapsible Transcript */}
          {lastResult?.transcript && (
            <div className="pt-1 border-t border-line-soft">
              <button
                type="button"
                onClick={() => setIsTranscriptExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-foreground py-1 transition-colors"
              >
                <span>AI Transcript</span>
                {isTranscriptExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {isTranscriptExpanded && (
                <div className="mt-1 p-2 bg-white rounded border border-line-soft text-xs text-ink italic max-h-32 overflow-y-auto leading-relaxed">
                  "{lastResult.transcript}"
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. ERROR STATE */}
      {state === "error" && (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2 text-xs text-status-foreground">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-status-foreground" />
              <span className="leading-tight">{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className="text-helper hover:text-soft-ink shrink-0"
              aria-label="Dismiss error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2 justify-end pt-1">
            {errorRetryable && cachedBlob && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="h-7 text-xs border-status-border text-status-foreground hover:bg-status"
              >
                Retry
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={startRecording}
              disabled={disabled}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              Record again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
