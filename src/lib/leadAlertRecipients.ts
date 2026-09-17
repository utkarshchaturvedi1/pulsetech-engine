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

  if (!isValidLeadAlertEmail(email) || !sms) {
    return { ok: false, error: LEAD_ALERT_SETUP_NEEDED_ERROR };
  }

  return { ok: true, email: email.toLowerCase(), sms };
}

export function shouldCollectLeadAlertSetup(profile: BusinessProfile): boolean {
  if (isShowcaseLeadAlertProfile(profile)) return false;
  return resolveWebsiteChatLeadAlert(profile).ok === false;
}

export function hasConfiguredWebsiteChatLeadAlerts(
  profile: BusinessProfile
): boolean {
  if (isShowcaseLeadAlertProfile(profile)) return true;
  return resolveWebsiteChatLeadAlert(profile).ok;
}
