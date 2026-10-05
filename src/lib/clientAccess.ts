export function safeClientRedirect(value: string | null | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/client";
}

export function isPulseTechAdmin(email: string | null | undefined, configured: string | undefined): boolean {
  if (!email || !configured) return false;
  const allowlist = configured.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
}

export function normalizeClientEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}
