import { normalizePhoneNumber } from "./phoneNumbers";

/**
 * Shared public Twilio numbers for prospect voice demos.
 * Comma/space/JSON-array separated. Never permanently assigned to one prospect.
 */
export function getVoiceDemoPublicNumbers(
  env: NodeJS.Dict<string> = process.env
): string[] {
  const raw = env.PULSETECH_VOICE_DEMO_NUMBERS?.trim();
  if (!raw) return [];

  let values: string[] = [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        values = parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      values = [];
    }
  } else {
    values = raw.split(/[,;]+/).map((v) => v.trim()).filter(Boolean);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = normalizePhoneNumber(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function isVoiceDemoPublicNumber(
  calledNumberRaw: string,
  env: NodeJS.Dict<string> = process.env
): boolean {
  const key = normalizePhoneNumber(calledNumberRaw);
  if (!key) return false;
  return getVoiceDemoPublicNumbers(env).includes(key);
}

/** Pretty display for US E.164 numbers; otherwise return as-is. */
export function formatVoiceDemoPhoneDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return (
      "+1 (" +
      digits.slice(1, 4) +
      ") " +
      digits.slice(4, 7) +
      "-" +
      digits.slice(7)
    );
  }
  return e164;
}

export function getPrimaryVoiceDemoPhone(
  env: NodeJS.Dict<string> = process.env
): string | null {
  return getVoiceDemoPublicNumbers(env)[0] || null;
}

/**
 * Show the "enabled shortly" empty state only in development/testing.
 * Production with no configured numbers hides the card entirely.
 */
export function shouldShowVoiceDemoComingSoon(
  env: NodeJS.Dict<string> = process.env
): boolean {
  if (getPrimaryVoiceDemoPhone(env)) return false;
  if (env.PULSETECH_VOICE_DEMO_PREVIEW === "1") return true;
  return env.NODE_ENV !== "production";
}
