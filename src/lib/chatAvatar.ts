/** Deterministic 1–2 letter monogram from a business or agent label. */
export function chatAvatarMonogram(label: string): string {
  const words = label
    .trim()
    .split(/[\s/_.-]+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  const single = words[0] || "A";
  return single.slice(0, Math.min(2, single.length)).toUpperCase();
}

/** Neutral mid-tone so transparent/light logos stay visible in the header. */
export const CHAT_AVATAR_SURFACE =
  "linear-gradient(145deg, #eef2f7 0%, #e2e8f0 48%, #cbd5e1 100%)";

/** Tracked PulseTech identity mark for Peter / left-panel chat headers. */
export const PULSETECH_CHAT_ICON = "/branding/pulsetech-icon-color.svg";
