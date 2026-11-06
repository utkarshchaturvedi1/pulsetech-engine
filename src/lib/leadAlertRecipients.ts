import { isBundledTestDemoId } from "../data/testBusinessProfiles";
import { BusinessProfile } from "../types/business";

export const LEAD_ALERT_EMAIL_PROMPT =
  "Where should we send new lead alerts? Please share the business email address.";

export const LEAD_ALERT_SMS_PROMPT =
  "What internal mobile number should receive lead-alert SMS? Please include the country code, for example +12145550189.";

export const LEAD_ALERT_SETUP_NEEDED_ERROR =
  "Lead alerts are not configured for this business. Set a business alert email and internal SMS number before customer leads can be sent.";

export function formatLeadAlertsConfigured(
  email: string,
  sms: string
): string {
  return `Lead alerts configured\nEmail: ${email}\nSMS: ${sms}`;
}

export function isValidLeadAlertEmail(value: string | null | undefined): boolean {
  const email = value?.trim() || "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Reserved example addresses and fictional NANP numbers must never count as configured recipients. */
export function isPlaceholderLeadAlertEmail(value: string | null | undefined): boolean {
  const email = value?.trim().toLowerCase() || "";
  return email === "alerts-test@example.com" || email.endsWith("@example.com");
}

/** E.164, or a US number that can be safely normalized to +1XXXXXXXXXX. */
export function normalizeLeadAlertSms(
  value: string | null | undefined
): string | null {
  const raw = value?.trim() || "";
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  const hasPlus = raw.startsWith("+");
  if (!hasPlus) {
    if (digits.length === 10) return "+1" + digits;
    if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
    return null;
  }

  const e164 = "+" + digits;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  return e164;
}

export function isPlaceholderLeadAlertSms(value: string | null | undefined): boolean {
  const normalized = normalizeLeadAlertSms(value);
  if (!normalized) return false;
  const digits = normalized.slice(1);
  // NANP 555-0100 through 555-0199 is reserved for fictional use.
  return digits.length === 11 && digits[0] === "1" && digits.slice(4, 7) === "555" && digits.slice(7, 9) === "01";
}

export function isShowcaseLeadAlertProfile(profile: BusinessProfile): boolean {
  return Boolean(profile.isTestData);
}

function fixtureEmail(profile: BusinessProfile): string {
  return (
    profile.leadNotificationEmail?.trim() ||
    process.env.LEAD_NOTIFICATION_EMAIL?.trim() ||
    ""
  );
}

function fixtureSms(profile: BusinessProfile): string {
  return (
    normalizeLeadAlertSms(profile.leadNotificationPhone) ||
    normalizeLeadAlertSms(process.env.PHONE_AGENT_ALERT_PHONE) ||
    ""
  );
}

export type WebsiteChatLeadAlertRecipients =
  | { ok: true; email: string; sms: string }
  | { ok: false; error: string };

export function resolveWebsiteChatLeadAlert(
  profile: BusinessProfile,
  demoId = ""
): WebsiteChatLeadAlertRecipients {
  const showcase =
    isShowcaseLeadAlertProfile(profile) || isBundledTestDemoId(demoId);

  const email = showcase
    ? fixtureEmail(profile)
    : profile.leadNotificationEmail?.trim() || "";
  const sms = showcase
    ? fixtureSms(profile)
    : normalizeLeadAlertSms(profile.leadNotificationPhone) || "";

  if (
    !isValidLeadAlertEmail(email) ||
    isPlaceholderLeadAlertEmail(email) ||
    !sms ||
    isPlaceholderLeadAlertSms(sms)
  ) {
    return { ok: false, error: LEAD_ALERT_SETUP_NEEDED_ERROR };
  }

  return { ok: true, email: email.toLowerCase(), sms };
}

export function shouldCollectLeadAlertSetup(profile: BusinessProfile): boolean {
  // Peter must confirm the business owner's own lead-alert destinations,
  // including on showcase/test demos. A test fixture fallback is not a
  // substitute for asking where this business wants real leads delivered.
  return (
    !isValidLeadAlertEmail(profile.leadNotificationEmail) ||
    isPlaceholderLeadAlertEmail(profile.leadNotificationEmail) ||
    !normalizeLeadAlertSms(profile.leadNotificationPhone) ||
    isPlaceholderLeadAlertSms(profile.leadNotificationPhone)
  );
}

export function hasConfiguredWebsiteChatLeadAlerts(
  profile: BusinessProfile
): boolean {
  return (
    isValidLeadAlertEmail(profile.leadNotificationEmail) &&
    !isPlaceholderLeadAlertEmail(profile.leadNotificationEmail) &&
    !isPlaceholderLeadAlertSms(profile.leadNotificationPhone) &&
    Boolean(normalizeLeadAlertSms(profile.leadNotificationPhone))
  );
}
