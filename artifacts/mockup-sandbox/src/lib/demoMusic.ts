// Background music synthesizer for Demo Auto-Movie using Web Audio API
// High-energy, upbeat 2010s synth-pop / electro-dance groove (~124 BPM)
// Zero-dependency, ultra-reliable, handles browser autoplay policies smoothly

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let duckGain: GainNode | null = null;
let isPlaying = false;
let isMuted = false;
let schedulerTimer: number | null = null;
let nextNoteTime = 0;
let currentStep = 0;

const MUSIC_STORAGE_KEY = "arogya-demo-music-muted";
export const DEMO_MUSIC_CHANGED_EVENT = "arogya-demo-music-changed";

// 124 BPM is the classic 2010s EDM / dance-pop tempo
const BPM = 124;
const SECONDS_PER_BEAT = 60 / BPM; // ~0.4839s
const EIGHTH_NOTE = SECONDS_PER_BEAT / 2; // ~0.2419s

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextConstructor) return null;

  try {
    audioCtx ??= new AudioContextConstructor();
    return audioCtx;
  } catch {
    return null;
  }
}

// Global unlock on any user gesture to satisfy browser autoplay policy
if (typeof window !== "undefined") {
  const handleUserGesture = () => {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  };
  window.addEventListener("pointerdown", handleUserGesture, { capture: true, passive: true });
  window.addEventListener("click", handleUserGesture, { capture: true, passive: true });
  window.addEventListener("keydown", handleUserGesture, { capture: true, passive: true });
}

export function unlockDemoAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

export function isDemoMusicMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUSIC_STORAGE_KEY) === "true";
}

export function setDemoMusicMuted(muted: boolean): void {
  isMuted = muted;
  try {
    window.localStorage.setItem(MUSIC_STORAGE_KEY, String(muted));
  } catch {}

  if (masterGain && audioCtx) {
    const targetVol = isMuted ? 0 : 0.18;
    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.linearRampToValueAtTime(targetVol, now + 0.15);
  }

  window.dispatchEvent(new Event(DEMO_MUSIC_CHANGED_EVENT));
}

export function toggleDemoMusic(): boolean {
  unlockDemoAudio();
  const next = !isDemoMusicMuted();
  setDemoMusicMuted(next);
  return next;
}

// ── Synthesizer Sound Design (2010s Electro-Pop) ─────────────────────────────

// Noise buffer cache for snare and hi-hats
let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const bufferSize = ctx.sampleRate * 1;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

// Punchy 4-on-the-floor kick with pitch drop
function playKick(ctx: AudioContext, dest: AudioNode, time: number) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Pitch sweep: drops from 150 Hz to 42 Hz fast
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.08);

    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + 0.24);

    // Apply sidechain ducking on the synth bus on every kick!
    if (duckGain) {
      duckGain.gain.cancelScheduledValues(time);
      duckGain.gain.setValueAtTime(0.2, time);
      duckGain.gain.exponentialRampToValueAtTime(1.0, time + 0.26);
    }
  } catch {}
}

// Snappy 2010s clap / snare on beats 2 and 4
function playSnare(ctx: AudioContext, dest: AudioNode, time: number) {
  try {
    // Noise snap
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1200, time);
    filter.Q.setValueAtTime(1.2, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    // Tonal body pop
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = "triangle";
    bodyOsc.frequency.setValueAtTime(180, time);
    bodyOsc.frequency.exponentialRampToValueAtTime(80, time + 0.07);

    bodyGain.gain.setValueAtTime(0.3, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(dest);

    noise.start(time);
    noise.stop(time + 0.18);
    bodyOsc.start(time);
    bodyOsc.stop(time + 0.1);
  } catch {}
}

// Crisp off-beat hi-hat on the "&" of every beat
function playHiHat(ctx: AudioContext, dest: AudioNode, time: number, open = false) {
  try {
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(7500, time);

    const gain = ctx.createGain();
    const dur = open ? 0.12 : 0.045;
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    noise.start(time);
    noise.stop(time + dur + 0.02);
  } catch {}
}

// Bouncy electro bass (saw wave through envelope-modulated lowpass filter)
function playBassNote(ctx: AudioContext, dest: AudioNode, freq: number, time: number, duration: number) {
  try {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, time);

    // Punchy filter envelope
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(850, time);
    filter.frequency.exponentialRampToValueAtTime(220, time + duration);
    filter.Q.setValueAtTime(4.0, time);

    gain.gain.setValueAtTime(0.24, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + duration + 0.05);
  } catch {}
}

// Upbeat supersaw synth stabs
function playChordStab(ctx: AudioContext, dest: AudioNode, freqs: number[], time: number, duration: number) {
  try {
    freqs.forEach((freq) => {
      // Create slight detuning for rich 2010s supersaw sound
      [-4, 4].forEach((detune) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, time);
        osc.detune.setValueAtTime(detune, time);

        gain.gain.setValueAtTime(0.045, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(time);
        osc.stop(time + duration + 0.05);
      });
    });
  } catch {}
}

// Bright uplifting melodic lead hook
function playMelodyNote(ctx: AudioContext, dest: AudioNode, freq: number, time: number, duration: number) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.035, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(time);
    osc.stop(time + duration + 0.05);
  } catch {}
}

// ── 2010s Chord Progression & Notes ──────────────────────────────────────────
// Iconic Am -> F -> C -> G (vi - IV - I - V)
// Root frequencies for bass:
// A1 = 55.00 Hz, F1 = 43.65 Hz, C2 = 65.41 Hz, G1 = 49.00 Hz
const BASS_ROOTS = [55.00, 43.65, 65.41, 49.00];

// Chords (frequencies in Hz):
// Am: A3 (220.00), C4 (261.63), E4 (329.63)
// F:  F3 (174.61), A3 (220.00), C4 (261.63)
// C:  E3 (164.81), G3 (196.00), C4 (261.63)
// G:  D3 (146.83), G3 (196.00), B3 (246.94)
const CHORD_VOICINGS = [
  [220.00, 261.63, 329.63],
  [174.61, 220.00, 261.63],
  [164.81, 196.00, 261.63],
  [146.83, 196.00, 246.94]
];

// Lead melody hook notes (pentatonic, uplifting, high register):
// E5: 659.25, G5: 783.99, A5: 880.00, C6: 1046.50, D6: 1174.66
const LEAD_HOOK = [
  659.25, 783.99, 880.00, 1046.50, 880.00, 783.99, 659.25, 783.99,
  880.00, 1046.50, 1174.66, 1046.50, 880.00, 783.99, 659.25, 587.33
];

// ── Audio Lookahead Scheduler ────────────────────────────────────────────────
// The Web Audio lookahead pattern schedules audio events slightly ahead in time.
// This guarantees rock-solid, jitter-free rhythm regardless of main thread load.

function scheduleBeat(ctx: AudioContext, drumBus: AudioNode, synthBus: AudioNode, beatTime: number, beatIndex: number) {
  const barIndex = Math.floor(beatIndex / 4) % 4; // 4-bar loop
  const beatInBar = beatIndex % 4; // 0, 1, 2, 3

  // 1. Four-on-the-floor kick!
  playKick(ctx, drumBus, beatTime);

  // 2. Snare / Clap on beats 2 and 4 (beatInBar 1 and 3)
  if (beatInBar === 1 || beatInBar === 3) {
    playSnare(ctx, drumBus, beatTime);
  }

  // 3. Off-beat 8th-note Hi-Hat (on the "&")
  playHiHat(ctx, drumBus, beatTime + EIGHTH_NOTE, beatInBar === 3);

  // 4. Bouncy electro bassline (two 8th notes per beat)
  const rootFreq = BASS_ROOTS[barIndex];
  // 1st eighth note: root
  playBassNote(ctx, synthBus, rootFreq, beatTime, EIGHTH_NOTE * 0.85);
  // 2nd eighth note: octave jump or fifth on offbeat
  const octaveFreq = beatInBar % 2 === 1 ? rootFreq * 2 : rootFreq;
  playBassNote(ctx, synthBus, octaveFreq, beatTime + EIGHTH_NOTE, EIGHTH_NOTE * 0.85);

  // 5. Synth chord stabs (classic 2010s syncopated rhythm)
  const chordNotes = CHORD_VOICINGS[barIndex];
  // Stab on the downbeat
  playChordStab(ctx, synthBus, chordNotes, beatTime, 0.18);
  // Stabs on offbeat
  if (beatInBar === 1 || beatInBar === 2) {
    playChordStab(ctx, synthBus, chordNotes, beatTime + EIGHTH_NOTE, 0.16);
  }

  // 6. Melodic Lead Hook (one note every 8th note)
  const leadIdx = (beatIndex * 2) % LEAD_HOOK.length;
  playMelodyNote(ctx, synthBus, LEAD_HOOK[leadIdx], beatTime, 0.18);
  playMelodyNote(ctx, synthBus, LEAD_HOOK[(leadIdx + 1) % LEAD_HOOK.length], beatTime + EIGHTH_NOTE, 0.18);
}

// Master audio nodes
let drumBus: GainNode | null = null;
let synthBus: GainNode | null = null;

export function startDemoMusic(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  unlockDemoAudio();

  if (isPlaying) {
    // If already playing, make sure gain is up and unmuted
    if (masterGain && ctx.state === "running") {
      const now = ctx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.linearRampToValueAtTime(isDemoMusicMuted() ? 0 : 0.18, now + 0.3);
    }
    return;
  }

  isPlaying = true;
  isMuted = isDemoMusicMuted();

  // Reset audio routing graph
  try {
    const now = ctx.currentTime;

    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.linearRampToValueAtTime(isMuted ? 0 : 0.18, now + 0.8);
    masterGain.connect(ctx.destination);

    // Ducking gain for sidechain pump effect
    duckGain = ctx.createGain();
    duckGain.gain.setValueAtTime(1.0, now);
    duckGain.connect(masterGain);

    // Drum bus (not sidechained, kicks punch through cleanly)
    drumBus = ctx.createGain();
    drumBus.gain.setValueAtTime(0.85, now);
    drumBus.connect(masterGain);

    // Synth bus (chords + bass + lead, subject to sidechain pumping)
    synthBus = ctx.createGain();
    synthBus.gain.setValueAtTime(0.75, now);
    synthBus.connect(duckGain);
  } catch {
    return;
  }

  currentStep = 0;
  nextNoteTime = ctx.currentTime + 0.05;

  const scheduleAheadTime = 0.25; // seconds to schedule ahead
  const lookaheadIntervalMs = 50; // poll every 50ms

  const scheduler = () => {
    if (!isPlaying || !audioCtx || !drumBus || !synthBus) return;

    // Keep context awake
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }

    const currentTime = audioCtx.currentTime;
    while (nextNoteTime < currentTime + scheduleAheadTime) {
      scheduleBeat(audioCtx, drumBus, synthBus, nextNoteTime, currentStep);
      nextNoteTime += SECONDS_PER_BEAT;
      currentStep++;
    }

    schedulerTimer = window.setTimeout(scheduler, lookaheadIntervalMs);
  };

  scheduler();
}

export function stopDemoMusic(fadeDuration = 0.8): void {
  if (!isPlaying) return;
  isPlaying = false;

  if (schedulerTimer !== null) {
    window.clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  if (masterGain && audioCtx) {
    try {
      const now = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(now);
      masterGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);
    } catch {}

    // Disconnect old nodes after fade-out to prevent orphan accumulation on replay
    const oldMaster = masterGain;
    const oldDuck = duckGain;
    const oldDrum = drumBus;
    const oldSynth = synthBus;
    window.setTimeout(() => {
      try { oldMaster?.disconnect(); } catch {}
      try { oldDuck?.disconnect(); } catch {}
      try { oldDrum?.disconnect(); } catch {}
      try { oldSynth?.disconnect(); } catch {}
    }, (fadeDuration + 0.5) * 1000);
  }

  masterGain = null;
  duckGain = null;
  drumBus = null;
  synthBus = null;
}
