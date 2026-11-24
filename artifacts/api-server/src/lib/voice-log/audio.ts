export const VOICE_LOG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const VOICE_LOG_MIN_BYTES = 128;

export function detectAudioFileType(bytes: Buffer): { mimeType: string; ext: string } | null {
  if (!Buffer.isBuffer(bytes) || bytes.length < 4) {
    return null;
  }

  // WebM: 0x1A 0x45 0xDF 0xA3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return { mimeType: "audio/webm", ext: "webm" };
  }

  // OGG: bytes 0..3 ASCII "OggS"
  if (bytes.subarray(0, 4).toString("latin1") === "OggS") {
    return { mimeType: "audio/ogg", ext: "ogg" };
  }

  // MP4 / M4A: bytes 4..7 ASCII "ftyp"
  if (bytes.length >= 8 && bytes.subarray(4, 8).toString("latin1") === "ftyp") {
    return { mimeType: "audio/mp4", ext: "m4a" };
  }

  // WAV: bytes 0..3 ASCII "RIFF" and bytes 8..11 ASCII "WAVE"
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WAVE"
  ) {
    return { mimeType: "audio/wav", ext: "wav" };
  }

  return null;
}
