export const SESSION_TOKEN_LIFETIME = "1d";
export const SESSION_COOKIE_MAX_AGE_MS = 86400000;
export const IMPERSONATION_TOKEN_LIFETIME = "20m";

// Renewal keeps an active session alive, but never past these limits from the original sign-in.
export const SESSION_ABSOLUTE_CAP_SECONDS = 7 * 24 * 60 * 60;
export const IMPERSONATION_ABSOLUTE_CAP_SECONDS = 8 * 60 * 60;
