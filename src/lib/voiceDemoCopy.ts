/** Client-safe voice demo copy (no Node/fs imports). */

export const VOICE_DEMO_DISCLAIMER =
  "This code is only for testing your voice AI. After you go live, your customers will simply call your assigned business number—no code will ever be required.";

export const VOICE_DEMO_INACTIVITY_MS = 20 * 60 * 1000;
export const VOICE_DEMO_CODE_LENGTH = 6;
export const VOICE_DEMO_MAX_INVALID_ATTEMPTS = 5;
export const VOICE_DEMO_RATE_WINDOW_MS = 15 * 60 * 1000;
