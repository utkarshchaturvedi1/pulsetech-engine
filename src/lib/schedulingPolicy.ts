import type { BusinessProfile } from "../types/business";
import type { SalesObjective, UrgencyLevel } from "./salesState";

/**
 * Website chat: after contact fields are in, ask preferred time without
 * promising that an alert has already been sent.
 */
export const SITE_ASSESSMENT_TEAM_ALERT_ASK =
  "Thanks. We can help with that. What day or time would you prefer for the visit?";

/** Ban delivery/booking promises until a handoff is actually queued or sent. */
export const PRE_QUEUE_ALERT_PROMISE_RE =
  /\b(i('ll| will) alert|we('ll| will) alert|alert(ed)? the team|i('ve| have) recorded your request|recorded your request|shared your request|(the |our )?team will (confirm|contact|call|reach)|they('ll| will) contact you)\b/i;

/** Shared preferred-time acknowledgement (inbound voice). No alert claim — post-call queues the handoff. */
export const PREFERRED_TIME_TEAM_ALERT_ACK =
  "I've noted your preference for tomorrow morning. Would you like me to proceed with that?";

/** After preferred time is known, ask for explicit agreement without claiming an alert. */
export const ASK_EXPLICIT_AGREEMENT =
  "Would you like me to proceed with that visit time?";

/** Inbound voice: explicit callback request — no callback/alert/delivery promise. */
export const CALLBACK_REQUEST_VOICE_ACK =
  "I'll make sure your request is included for the team.";

export function formatBusinessDirectContact(business: BusinessProfile): string {
  const phone = business.phone?.trim();
  const email = business.email?.trim();
  if (phone && email) return `${phone} or ${email}`;
  if (phone) return phone;
  if (email) return email;
  return "the business using the contact details on their website";
}

export function buildSuccessfulLeadHandoffCustomerMessage(
  name?: string | null,
  preferredTiming?: string | null
): string {
  const first = name?.trim().split(/\s+/)[0];
  const thanks = first ? `Thanks, ${first}` : "Thanks";
  const timing = preferredTiming?.trim();
  const timingLine = timing
    ? `We'll note ${timing} as your preferred time.`
    : `They'll contact you to confirm the earliest available appointment.`;
  return `${thanks} — I've shared your request with the team so they can help with your visit. ${timingLine} The team will contact you at the number you provided to confirm availability.`;
}

/** Used while delivery is queued / in progress — never claims the team already received it. */
export function buildQueuedLeadHandoffCustomerMessage(
  name?: string | null,
  preferredTiming?: string | null
): string {
  const first = name?.trim().split(/\s+/)[0];
  const thanks = first ? `Thanks, ${first}` : "Thanks";
  const timing = preferredTiming?.trim();
  const recorded = timing
    ? `I've recorded your request and noted ${timing} as your preferred time.`
    : `I've recorded your request.`;
  return `${thanks} — ${recorded} The team will contact you at the number you provided to confirm availability.`;
}

export function buildFailedLeadHandoffCustomerMessage(
  business: BusinessProfile
): string {
  return `We're unable to send your request to the team at the moment. Please contact ${formatBusinessDirectContact(business)} directly.`;
}

export function isSuccessfulLeadHandoffCustomerMessage(reply: string): boolean {
  return (
    /\bshared your request with the team\b/i.test(reply) &&
    (/\bpreferred time\b/i.test(reply) ||
      /\bearliest available appointment\b/i.test(reply)) &&
    (/\bteam will confirm\b/i.test(reply) ||
      /\bteam will contact you at the number you provided\b/i.test(reply))
  );
}

export function isFailedLeadHandoffCustomerMessage(reply: string): boolean {
  return (
    /\bunable to send your request to the team\b/i.test(reply) &&
    /\bplease contact\b/i.test(reply) &&
    /\bdirectly\b/i.test(reply)
  );
}

export function isQueuedLeadHandoffCustomerMessage(reply: string): boolean {
  return (
    /\bi('ve| have) recorded your request\b/i.test(reply) &&
    /\bpreferred time\b/i.test(reply) &&
    (/\bteam will confirm availability\b/i.test(reply) ||
      /\bteam will contact you at the number you provided\b/i.test(reply)) &&
    !/\bshared your request with the team\b/i.test(reply)
  );
}

/** True when the visitor is asking about pricing, billing, or how charges work. */
export function messageAsksPricingOrBilling(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(how (do|does|are) (you|y'?all|the (company|team|business)) charge|how (is|are) (pricing|billing|charges?)|hourly or|fixed (price|rate|fee)|project (price|rate|pricing)|full work|for the (full )?job|billing|how much|what(?:'s| is) the (price|cost|charge|fee)|pricing|diagnostic fee|is there a fee|too expensive|cost too much)\b/i.test(
      t
    ) || /\b(hourly|per hour|flat (rate|fee)|lump sum)\b/i.test(t)
  );
}

const SCOPE_DEPENDENT_PRICING_ANSWER =
  "The final amount depends on the diagnosis and the scope of work.";

/**
 * Answer hourly-vs-fixed (or similar) from BusinessProfile only.
 * Never invents an approach the profile does not establish.
 */
export function buildPricingApproachAnswer(
  business: BusinessProfile
): string {
  const blob = [
    business.pricingRules || "",
    business.systemPrompt || "",
    ...business.faqs.map((f) => `${f.question} ${f.answer}`),
  ]
    .join("\n")
    .toLowerCase();

  const hasHourly =
    /\bhourly\b/.test(blob) ||
    /\bper hour\b/.test(blob) ||
    /\bby the hour\b/.test(blob);
  const hasFixed =
    /\b(fixed|flat)\s+(price|rate|fee)\b/.test(blob) ||
    /\b(project|job)\s+(price|rate|pricing|fee)\b/.test(blob) ||
    /\blump sum\b/.test(blob) ||
    /\bfor the (full )?job\b/.test(blob);

  if (hasHourly && !hasFixed) {
    const rules = business.pricingRules?.trim();
    return rules
      ? rules
      : "This business typically charges hourly. The exact rate depends on the diagnosis and what the work includes.";
  }
  if (hasFixed && !hasHourly) {
    const rules = business.pricingRules?.trim();
    return rules
      ? rules
      : "This business typically prices the full job rather than by the hour. The exact price depends on the diagnosis and scope.";
  }
  if (hasHourly && hasFixed) {
    const rules = business.pricingRules?.trim();
    return rules
      ? rules
      : "Depending on the work, pricing may be hourly or for the full job. The applicable approach depends on the scope.";
  }

  const rules = business.pricingRules?.trim();
  if (rules) return rules;

  return SCOPE_DEPENDENT_PRICING_ANSWER;
}

export function buildHandoffReplyWithOptionalPricing(params: {
  customerName?: string | null;
  preferredTiming?: string | null;
  business: BusinessProfile;
  latestUserMessage?: string;
  deliveryStatus?: "QUEUED" | "SENT" | "FAILED" | "NOT_SENT";
}): string {
  const handoff =
    params.deliveryStatus === "QUEUED"
      ? buildQueuedLeadHandoffCustomerMessage(
          params.customerName,
          params.preferredTiming
        )
      : buildSuccessfulLeadHandoffCustomerMessage(
          params.customerName,
          params.preferredTiming
        );
  if (
    params.latestUserMessage &&
    messageAsksPricingOrBilling(params.latestUserMessage)
  ) {
    return `${buildPricingApproachAnswer(params.business)} ${handoff}`;
  }
  return handoff;
}

export const INTERNAL_HANDOFF_STATUS_RE =
  /\b(lead hasn.t been sent|the lead has not been sent|office hasn.t been reached|the office has not been reached|handoff failed|leadDeliveryStatus|smtp|twilio|notification (email|sms)|email\/sms|delivery status)\b/i;

export function resolveWebsiteChatCustomerHandoffReply(params: {
  attempted: boolean;
  status: "NOT_SENT" | "QUEUED" | "SENT" | "FAILED";
  currentObjective: SalesObjective;
  customerName?: string | null;
  preferredTiming?: string | null;
  business: BusinessProfile;
  latestUserMessage?: string;
}): string | null {
  if (!params.attempted) return null;
  if (params.status === "SENT") {
    return buildHandoffReplyWithOptionalPricing({
      customerName: params.customerName,
      preferredTiming: params.preferredTiming,
      business: params.business,
      latestUserMessage: params.latestUserMessage,
      deliveryStatus: "SENT",
    });
  }
  if (params.status === "QUEUED") {
    return buildHandoffReplyWithOptionalPricing({
      customerName: params.customerName,
      preferredTiming: params.preferredTiming,
      business: params.business,
      latestUserMessage: params.latestUserMessage,
      deliveryStatus: "QUEUED",
    });
  }
  if (params.status === "FAILED") {
    return buildFailedLeadHandoffCustomerMessage(params.business);
  }
  return null;
}

/** Shorter preferred-day ask used when no site-assessment framing is needed (e.g. voice). */
export const ASK_PREFERRED_DAY_TIME = "What day or time would you prefer?";

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
    /\bwe can help with that\b/i.test(reply) &&
    /\bwhat day or time would you prefer\b/i.test(reply) &&
    !PRE_QUEUE_ALERT_PROMISE_RE.test(reply)
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
    /\b(arrange|schedule|appointment|come out|come by|come over|come tomorrow|come today|visit me|send someone|need someone)\b/.test(
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
    /\b(arrange|come|visit|schedule|appointment|asap)\b/.test(t)
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

function normalizeTimingPhrase(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function canonicalizeTimingText(text: string): string {
  return text.replace(/\btom+or+ow\b/gi, "tomorrow");
}

function withoutTrailingPricingAsk(text: string): string {
  return text
    .replace(
      /[.?!,]?\s*(but\s+)?(how much|what(?:'s| is) the (cost|price|charge|fee)|what do you charge|how do you charge|how (do|does|are) (you|y'?all|the (company|team|business)) charge)\b[\s\S]*$/i,
      " "
    )
    .trim();
}

function extractPreferredVisitTimeFromNormalized(source: string): string | null {
  if (!source) return null;

  const relativeWindow = source.match(
    /\b((?:early\s+)?(?:morning|afternoon|evening|night)\s+(?:this|next)\s+(?:weekend|week)|(?:this|next)\s+(?:weekend|week)(?:\s+(?:morning|afternoon|evening|night))?)\b/i
  );
  if (relativeWindow) return normalizeTimingPhrase(relativeWindow[0]);

  const asap = source.match(
    /\b(as soon as possible|asap|right away|today(?:\s+(?:morning|afternoon|evening))?|tonight)\b/i
  );
  if (asap && /\b(come|visit|need|arrange|schedule|asap|possible|today|tonight)\b/i.test(source)) {
    return normalizeTimingPhrase(asap[0]);
  }

  const dayAndPart = source.match(
    /\b((?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening|night))?|this\s+(?:morning|afternoon|evening))\b/i
  );
  const clock = source.match(
    /\b(between\s+\d{1,2}[^.]{0,24}|\d{1,2}\s*(?::\d{2})?\s*[-–]\s*\d{1,2}\s*(?::\d{2})?\s*(am|pm)?|after\s+\d{1,2}\s*(am|pm)?|before\s+\d{1,2}\s*(am|pm)?)\b/i
  );
  if (dayAndPart) {
    const day = normalizeTimingPhrase(dayAndPart[0]);
    if (clock && !day.includes(normalizeTimingPhrase(clock[0]))) {
      return normalizeTimingPhrase(`${day} ${clock[0]}`);
    }
    return day;
  }

  return clock ? normalizeTimingPhrase(clock[0]) : null;
}

export function extractPreferredVisitTimeFromText(text: string): string | null {
  const source = canonicalizeTimingText(text.trim());
  if (!source) return null;

  const candidates = [
    source,
    withoutTrailingPricingAsk(source),
    ...source.split(/[.!?]+/).map((part) => part.trim()),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const hit = extractPreferredVisitTimeFromNormalized(candidate);
    if (hit) return hit;
  }
  return null;
}

export function knowledgeAllowsSameDay(knowledge: string): boolean {
  return /\bsame[- ]day\b/i.test(knowledge);
}
