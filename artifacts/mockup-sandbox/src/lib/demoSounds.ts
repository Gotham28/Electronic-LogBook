import { isDemoMode } from "@/lib/session";

export type DemoSound = "click" | "success" | "pop";

export const DEMO_SOUND_STORAGE_KEY = "arogya-demo-sounds-muted";
export const DEMO_SOUND_PREFERENCE_CHANGED_EVENT = "arogya-demo-sound-preference-changed";

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return null;

  try {
    audioContext ??= new AudioContextConstructor();
    return audioContext;
  } catch {
    return null;
  }
}

export function isDemoSoundMuted(): boolean {
  try {
    return window.localStorage.getItem(DEMO_SOUND_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function setDemoSoundMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(DEMO_SOUND_STORAGE_KEY, String(muted));
  } catch {
    // Sounds remain usable for this page even when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(DEMO_SOUND_PREFERENCE_CHANGED_EVENT));
}

/** Call directly from the demo-entry click so the browser can unlock audio. */
export function unlockDemoAudio(): void {
  const context = getAudioContext();
  if (context?.state === "suspended") void context.resume().catch(() => {});
}

export function playDemoSound(sound: DemoSound): void {
  if (!isDemoMode() || isDemoSoundMuted()) return;

  const context = getAudioContext();
  if (!context) return;
  if (context.state === "suspended") void context.resume().catch(() => {});

  const now = context.currentTime;
  const tones = sound === "click"
    ? [{ frequency: 920, start: 0, duration: 0.022, volume: 0.012 }]
    : sound === "success"
      ? [
          { frequency: 660, start: 0, duration: 0.16, volume: 0.018 },
          { frequency: 880, start: 0.12, duration: 0.2, volume: 0.014 },
        ]
      : [{ frequency: 430, endFrequency: 300, start: 0, duration: 0.095, volume: 0.012 }];

  for (const tone of tones) {
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + tone.start;
      const end = start + tone.duration;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(tone.frequency, start);
      if ("endFrequency" in tone && tone.endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
      }
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(tone.volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.01);
    } catch {
      // Audio is an enhancement; unavailable or blocked playback fails silently.
    }
  }
}
