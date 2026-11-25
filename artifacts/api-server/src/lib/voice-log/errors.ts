export class VoiceLogError extends Error {
  constructor(
    readonly code:
      | "VOICE_LOG_UNAVAILABLE"
      | "VOICE_LOG_INVALID_AUDIO"
      | "VOICE_LOG_TOO_LARGE"
      | "VOICE_LOG_LIMIT_REACHED"
      | "VOICE_LOG_INVALID_OUTPUT"
  ) {
    super(code);
    this.name = "VoiceLogError";
  }
}
