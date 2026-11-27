import * as React from "react";

export type MochiDictationStatus =
  | "checking"
  | "ready"
  | "downloadable"
  | "installing"
  | "listening"
  | "denied"
  | "unsupported"
  | "error";

type LocalAvailability = "unavailable" | "downloadable" | "downloading" | "available";

const DOWNLOADING_RECHECK_INTERVAL_MS = 1500;
const MAX_DOWNLOADING_RECHECKS = 40;

interface SpeechRecognitionConstructorLike {
  new (): SpeechRecognitionInstanceLike;
  available?: (options: { langs: string[]; processLocally?: boolean }) => Promise<LocalAvailability>;
  install?: (options: { langs: string[]; processLocally?: boolean }) => Promise<boolean>;
}

interface SpeechRecognitionInstanceLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: { transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructorLike | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructorLike;
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function getAppEnglishLang(): string {
  if (typeof navigator !== "undefined" && typeof navigator.language === "string") {
    const lang = navigator.language.trim();
    if (/^en-[a-z]{2,}$/i.test(lang)) {
      return lang;
    }
  }
  return "en-US";
}

function supportsOnDeviceSpeech(ctor: SpeechRecognitionConstructorLike | null): ctor is SpeechRecognitionConstructorLike {
  if (!ctor) return false;
  const proto = ctor.prototype as Record<string, unknown> | undefined;
  const hasProcessLocally = Boolean(proto && "processLocally" in proto);
  return hasProcessLocally && typeof ctor.available === "function";
}

export function useMochiDictation({
  onFinalTranscript,
  enabled = true,
}: {
  onFinalTranscript: (transcript: string) => void;
  enabled?: boolean;
}) {
  const [status, setStatus] = React.useState<MochiDictationStatus>("checking");
  const [announcement, setAnnouncement] = React.useState<string>("");
  const recognitionSessionRef = React.useRef(0);
  const packSessionRef = React.useRef(0);
  const installInFlightRef = React.useRef(false);
  const recheckTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const recheckCountRef = React.useRef(0);
  const recognitionRef = React.useRef<SpeechRecognitionInstanceLike | null>(null);
  const receivedTranscriptRef = React.useRef(false);
  const onFinalTranscriptRef = React.useRef(onFinalTranscript);
  onFinalTranscriptRef.current = onFinalTranscript;
  const lang = React.useMemo(() => getAppEnglishLang(), []);

  const statusRef = React.useRef<MochiDictationStatus>(status);
  statusRef.current = status;
  const enabledRef = React.useRef(enabled);
  enabledRef.current = enabled;

  const cleanupRecognition = React.useCallback((mode: "stop" | "abort") => {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (!rec) return;
    rec.onstart = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      if (mode === "abort") {
        rec.abort();
      } else {
        rec.stop();
      }
    } catch {
      // Ignore already-stopped recognition instances
    }
  }, []);

  const clearRecheckTimer = React.useCallback(() => {
    if (recheckTimerRef.current !== null) {
      clearTimeout(recheckTimerRef.current);
      recheckTimerRef.current = null;
    }
  }, []);

  const checkAvailability = React.useCallback(async (background = false) => {
    const isBackground = background === true;
    clearRecheckTimer();
    const ctor = getSpeechRecognitionConstructor();
    if (!supportsOnDeviceSpeech(ctor)) {
      recheckCountRef.current = 0;
      setStatus("unsupported");
      setAnnouncement("On-device voice input is not supported in this browser.");
      return;
    }

    const packSession = ++packSessionRef.current;
    if (!isBackground) {
      setStatus("checking");
    }
    try {
      const availability = await ctor.available!({ langs: [lang], processLocally: true });
      if (packSession !== packSessionRef.current) return;
      if (isBackground && !enabledRef.current) return;

      if (availability === "available") {
        const wasInstalling = statusRef.current === "installing";
        recheckCountRef.current = 0;
        setStatus("ready");
        setAnnouncement(wasInstalling ? "On-device English voice pack is ready." : "");
      } else if (availability === "downloading") {
        setStatus("installing");
        if (enabledRef.current && !installInFlightRef.current) {
          if (recheckCountRef.current < MAX_DOWNLOADING_RECHECKS) {
            recheckCountRef.current += 1;
            setAnnouncement("Downloading on-device English voice pack...");
            recheckTimerRef.current = setTimeout(() => {
              recheckTimerRef.current = null;
              if (enabledRef.current && !installInFlightRef.current) {
                void checkAvailability(true);
              }
            }, DOWNLOADING_RECHECK_INTERVAL_MS);
          } else {
            setAnnouncement("On-device English voice pack is still downloading. Reopen to check again.");
          }
        } else {
          setAnnouncement("Downloading on-device English voice pack...");
        }
      } else if (availability === "downloadable") {
        recheckCountRef.current = 0;
        setStatus("downloadable");
        setAnnouncement("On-device English voice pack is available to download.");
      } else {
        recheckCountRef.current = 0;
        setStatus("unsupported");
        setAnnouncement("On-device English voice input is unavailable on this device.");
      }
    } catch {
      if (packSession !== packSessionRef.current) return;
      if (isBackground && !enabledRef.current) return;
      recheckCountRef.current = 0;
      setStatus("unsupported");
      setAnnouncement("On-device voice input is unavailable on this browser.");
    }
  }, [clearRecheckTimer, lang]);

  const abortCapture = React.useCallback(() => {
    recognitionSessionRef.current += 1;
    cleanupRecognition("abort");
    const current = statusRef.current;
    if (current === "listening" || current === "denied" || current === "error") {
      setStatus("ready");
      setAnnouncement("");
    }
  }, [cleanupRecognition]);

  const abort = React.useCallback(() => {
    recognitionSessionRef.current += 1;
    packSessionRef.current += 1;
    installInFlightRef.current = false;
    clearRecheckTimer();
    recheckCountRef.current = 0;
    cleanupRecognition("abort");
    const current = statusRef.current;
    if (current === "listening" || current === "denied" || current === "error") {
      setStatus("ready");
      setAnnouncement("");
      return;
    }
    if (current === "checking" || current === "installing") {
      setAnnouncement("");
      if (enabledRef.current) {
        void checkAvailability();
      } else {
        setStatus("ready");
      }
    }
  }, [checkAvailability, cleanupRecognition, clearRecheckTimer]);

  const stop = React.useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      cleanupRecognition("abort");
      setStatus("ready");
    }
  }, [cleanupRecognition]);

  React.useEffect(() => {
    if (!enabled) {
      clearRecheckTimer();
      recheckCountRef.current = 0;
      abortCapture();
      return;
    }
    if (!installInFlightRef.current) {
      recheckCountRef.current = 0;
      void checkAvailability();
    }
  }, [enabled, checkAvailability, abortCapture, clearRecheckTimer]);

  React.useEffect(() => {
    return () => {
      recognitionSessionRef.current += 1;
      packSessionRef.current += 1;
      installInFlightRef.current = false;
      clearRecheckTimer();
      recheckCountRef.current = 0;
      cleanupRecognition("abort");
    };
  }, [cleanupRecognition, clearRecheckTimer]);

  const installPack = React.useCallback(async () => {
    if (installInFlightRef.current) return;
    clearRecheckTimer();
    recheckCountRef.current = 0;
    const ctor = getSpeechRecognitionConstructor();
    if (!supportsOnDeviceSpeech(ctor) || typeof ctor.install !== "function") {
      setStatus("unsupported");
      setAnnouncement("On-device voice pack installation is not supported in this browser.");
      return;
    }

    const packSession = ++packSessionRef.current;
    installInFlightRef.current = true;
    setStatus("installing");
    setAnnouncement("Downloading on-device English voice pack...");
    try {
      const installed = await ctor.install({ langs: [lang], processLocally: true });
      if (packSession !== packSessionRef.current) return;
      if (installed) {
        setStatus("ready");
        setAnnouncement("On-device English voice pack is ready.");
      } else {
        setStatus("downloadable");
        setAnnouncement("Voice pack download was declined. You can still type your prompt.");
      }
    } catch {
      if (packSession !== packSessionRef.current) return;
      setStatus("downloadable");
      setAnnouncement("Could not download the on-device voice pack. You can still type your prompt.");
    } finally {
      if (packSession === packSessionRef.current) {
        installInFlightRef.current = false;
      }
    }
  }, [clearRecheckTimer, lang]);

  const recheckAvailability = React.useCallback(() => {
    if (installInFlightRef.current) return Promise.resolve();
    recheckCountRef.current = 0;
    return checkAvailability(false);
  }, [checkAvailability]);

  const start = React.useCallback(() => {
    const ctor = getSpeechRecognitionConstructor();
    if (!supportsOnDeviceSpeech(ctor)) {
      setStatus("unsupported");
      setAnnouncement("On-device voice input is not supported in this browser.");
      return;
    }

    if (status === "downloadable") {
      setAnnouncement("Download the on-device English voice pack to use voice input.");
      return;
    }
    if (status === "unsupported" || status === "installing" || status === "checking") {
      return;
    }

    cleanupRecognition("abort");
    const recognitionSession = ++recognitionSessionRef.current;
    receivedTranscriptRef.current = false;

    try {
      const recognition = new ctor();
      if (!("processLocally" in recognition)) {
        setStatus("unsupported");
        setAnnouncement("On-device voice input is not supported in this browser.");
        return;
      }

      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.processLocally = true;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        if (recognitionSession !== recognitionSessionRef.current) return;
        setStatus("listening");
        setAnnouncement("Listening on-device...");
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        if (recognitionSession !== recognitionSessionRef.current) return;
        const finals: string[] = [];
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (result?.isFinal && result[0]?.transcript) {
            finals.push(result[0].transcript);
          }
        }
        const combined = finals.join(" ").trim();
        if (combined) {
          receivedTranscriptRef.current = true;
          onFinalTranscriptRef.current(combined);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        if (recognitionSession !== recognitionSessionRef.current) return;
        cleanupRecognition("abort");
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setStatus("denied");
          setAnnouncement("Microphone permission was denied. You can still type your prompt.");
        } else if (event.error === "language-not-supported") {
          setStatus("unsupported");
          setAnnouncement("On-device English voice input is unavailable on this device.");
        } else if (event.error === "no-speech") {
          setStatus("ready");
          setAnnouncement("No speech detected.");
        } else if (event.error === "aborted") {
          setStatus("ready");
          setAnnouncement("");
        } else {
          setStatus("error");
          setAnnouncement("Voice input stopped unexpectedly. You can still type your prompt.");
        }
      };

      recognition.onend = () => {
        if (recognitionSession !== recognitionSessionRef.current) return;
        recognitionRef.current = null;
        setStatus((current) => {
          if (current === "listening") {
            setAnnouncement(
              receivedTranscriptRef.current
                ? "Voice input complete. Review your prompt and press Send."
                : "Voice input stopped."
            );
            return "ready";
          }
          return current;
        });
      };

      setStatus("listening");
      setAnnouncement("Listening on-device...");
      recognition.start();
    } catch {
      if (recognitionSession !== recognitionSessionRef.current) return;
      cleanupRecognition("abort");
      setStatus("error");
      setAnnouncement("Could not start on-device voice input.");
    }
  }, [cleanupRecognition, lang, status]);

  const toggleListening = React.useCallback(() => {
    if (status === "listening") {
      stop();
    } else {
      start();
    }
  }, [start, status, stop]);

  return {
    status,
    announcement,
    isListening: status === "listening",
    isSupported: status !== "unsupported",
    canInstall: status === "downloadable",
    isInstalling: status === "installing",
    toggleListening,
    installPack,
    recheckAvailability,
    stop,
    abortCapture,
    abort,
  };
}
