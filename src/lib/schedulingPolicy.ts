import type { BusinessProfile } from "../types/business";
import type { SalesObjective, UrgencyLevel } from "./salesState";

/**
 * Website chat: after the customer says yes to a site assessment / next step,
 * acknowledge team alert + ask preference. Never imply the visit is already arranged.
 */
export const SITE_ASSESSMENT_TEAM_ALERT_ASK =
  "I'll alert the team to arrange a site assessment. What day or time would you prefer? The team will confirm availability.";

/** Shared preferred-time acknowledgement (inbound voice). Website chat uses lead-handoff copy. */
export const PREFERRED_TIME_TEAM_ALERT_ACK =
  "I've noted your preference for tomorrow morning. I'll alert the team now; they'll contact you as soon as possible to confirm the earliest available appointment.";

export function formatBusinessDirectContact(business: BusinessProfile): string {
  const phone = business.phone?.trim();
  const email = business.email?.trim();
  if (phone && email) return `${phone} or ${email}`;
  if (phone) return phone;
  if (email) return email;
  return "the business using the contact details on their website";
}

export function buildSuccessfulLeadHandoffCustomerMessage(
  name?: string | null
): string {
  const first = name?.trim().split(/\s+/)[0];
  const thanks = first ? `Thanks, ${first}` : "Thanks";
  return `${thanks} — I've shared your request with the team. They'll contact you to confirm the earliest available appointment. Your preferred time is noted, but not booked yet.`;
}

export function buildFailedLeadHandoffCustomerMessage(
  business: BusinessProfile
): string {
  return `We're unable to send your request to the team at the moment. Please contact ${formatBusinessDirectContact(business)} directly.`;
}

export function isSuccessfulLeadHandoffCustomerMessage(reply: string): boolean {
  return (
    /\bshared your request with the team\b/i.test(reply) &&
    /\bearliest available appointment\b/i.test(reply) &&
    /\bnot booked yet\b/i.test(reply)
  );
}

export function isFailedLeadHandoffCustomerMessage(reply: string): boolean {
  return (
    /\bunable to send your request to the team\b/i.test(reply) &&
    /\bplease contact\b/i.test(reply) &&
    /\bdirectly\b/i.test(reply)
  );
}

export const INTERNAL_HANDOFF_STATUS_RE =
  /\b(lead hasn.t been sent|the lead has not been sent|office hasn.t been reached|the office has not been reached|handoff failed|leadDeliveryStatus|smtp|twilio|notification (email|sms)|email\/sms|delivery status)\b/i;

export function resolveWebsiteChatCustomerHandoffReply(params: {
  attempted: boolean;
  status: "NOT_SENT" | "SENT" | "FAILED";
  currentObjective: SalesObjective;
  customerName?: string | null;
  business: BusinessProfile;
}): string | null {
  // Never claim the request was shared unless the handoff was actually scheduled.
  if (!params.attempted) return null;
  if (params.status === "SENT") {
    return buildSuccessfulLeadHandoffCustomerMessage(params.customerName);
  }
  if (params.status === "FAILED") {
    return buildFailedLeadHandoffCustomerMessage(params.business);
  }
  return null;
}

/** Shorter preferred-day ask used when no site-assessment framing is needed (e.g. voice). */
export const ASK_PREFERRED_DAY_TIME =
  "What day or time would you prefer? The team will confirm availability.";

export const INVENTED_SCHEDULE_RANGE_RE =
  /\b(next week,\s*(2|two)|2\s*[-–]\s*4\s*weeks|two to four weeks|or later|this month or next|next month or the month after|would you (prefer|like) next week)\b/i;

export const SAME_DAY_PROMISE_RE =
  /\b(same[- ]day service is available|we (can|will) (definitely )?(come|be there) today|guaranteed (same[- ]day|today)|i can (get|send) (someone|a technician) today)\b/i;

export function isImmediateVisitFollowupLanguage(text: string): boolean {
  if (detectVisitPreferenceRequest(text)) return true;
  const t = text.toLowerCase();
  if (/\bwhen can you (come|be here|visit|get here|make it)\b/.test(t)) return true;
  if (/\b(need someone today|come (out )?today|as soon as possible|\basap\b)\b/.test(t)) {
    return true;
  }
  return false;
}

export function isPreferredTimeTeamAck(reply: string): boolean {
  const notedPreference =
    /\b(i('ve| have) noted your preference|i('ll| will) note that as your preferred time)\b/i.test(
      reply
    );
  return (
    notedPreference &&
    /\balert the team now\b/i.test(reply) &&
    /\bearliest available (time|appointment)\b/i.test(reply)
  );
}

/** Detects confirming / self-arranging site-assessment language (forbidden). */
export function impliesConfirmedSiteAssessment(reply: string): boolean {
  return /\bwe('ll| will) arrange (a |your )?site assessment\b/i.test(reply);
}

export function isSiteAssessmentTeamAlertAsk(reply: string): boolean {
  return (
    /\bi('ll| will) alert the team to arrange a site assessment\b/i.test(reply) &&
    /\bwhat day or time would you prefer\b/i.test(reply) &&
    /\bteam will confirm availability\b/i.test(reply)
  );
}

export function detectVisitPreferenceRequest(text: string): boolean {
  const t = text.toLowerCase();
  if (
    /\bwhen can you (come|be here|visit|get here|make it)\b/.test(t) ||
    /\bwhen (can|could) (someone|a technician|you guys|y'?all) come\b/.test(t)
  ) {
    return true;
  }
  if (
    /\b(arrange|schedule|appointment|come out|come by|come over|come tomorrow|come today|visit me|send someone)\b/.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(can you|could you|would you)\b/.test(t) &&
    /\b(tomorrow|today|morning|afternoon|evening|visit|come|asap|as soon as)\b/.test(
      t
    )
  ) {
    return true;
  }
  return (
    extractPreferredVisitTimeFromText(text) !== null &&
    /\b(arrange|come|visit|schedule|appointment|morning|afternoon|evening|asap)\b/.test(
      t
    )
  );
}

export function detectSchedulingUrgency(text: string): UrgencyLevel | null {
  const t = text.toLowerCase();
  if (/\b(i(?:'m| am) home|someone (will be|is) home)\b/.test(t) && !/\b(come|visit|need someone|asap)\b/.test(t)) {
    return null;
  }
  if (
    /\b(immediate|immediately|asap|emergency|urgent|right away|as soon as possible|need someone (today|now)|come (out )?today|need (it|this|you|help) (today|now))\b/.test(
      t
    )
  ) {
    return "IMMEDIATE";
  }
  if (/\bwhen can you (come|be here|visit|get here|make it)\b/.test(t)) {
    return "IMMEDIATE";
  }
  if (
    /\btoday\b/.test(t) &&
    /\b(come|visit|need|fix|repair|out|over|service|help|asap)\b/.test(t)
  ) {
    return "IMMEDIATE";
  }
  if (/\b(soon|this week|quickly|tomorrow)\b/.test(t)) {
    return "SOON";
  }
  return null;
}

export function maxUrgency(a: UrgencyLevel, b: UrgencyLevel): UrgencyLevel {
  const rank = (u: UrgencyLevel) =>
    u === "IMMEDIATE" ? 2 : u === "SOON" ? 1 : 0;
  return rank(a) >= rank(b) ? a : b;
}

export function extractPreferredVisitTimeFromText(text: string): string | null {
  const asap = text.match(
    /\b(as soon as possible|asap|right away|today(?:\s+(?:morning|afternoon|evening))?|tonight)\b/i
  );
  if (asap && /\b(come|visit|need|arrange|schedule|asap|possible|today|tonight)\b/i.test(text)) {
    return asap[0].trim();
  }
  const match = text.match(
    /\b((today|tomorrow|this (morning|afternoon|evening)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)[^.]{0,40}|between\s+\d{1,2}[^.]{0,24}|\d{1,2}\s*(?::\d{2})?\s*[-–]\s*\d{1,2}\s*(?::\d{2})?\s*(am|pm)?|after\s+\d{1,2}\s*(am|pm)?|before\s+\d{1,2}\s*(am|pm)?)\b/i
  );
  return match ? match[0].trim() : null;
}

export function knowledgeAllowsSameDay(knowledge: string): boolean {
  return /\bsame[- ]day\b/i.test(knowledge);
}
