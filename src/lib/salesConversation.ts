import type { BusinessProfile } from "../types/business";
import {
  pricingRulesKnowledgeText,
  verifiedPricingRulesText,
} from "./businessProfile";
import type { SalesState } from "./salesState";

export const PRE_CONTACT_ASK_FIRST_NAME = "What's your first name?";
export const PRE_CONTACT_ASK_PHONE =
  "What's the best phone number to reach you?";
export const PRE_CONTACT_ASK_ADDRESS = "What's the service address?";

/** Visitor-need tone for acknowledgement and next-step wording. */
export type ConversationNeedTone =
  | "PROBLEM"
  | "ASPIRATIONAL"
  | "CELEBRATION"
  | "CONSULTATION";

/** Broad intent cues only — no industry/example noun lists. */
const PROBLEM_NEED_RE =
  /\b(break(?:s|ing|down)?|broken|not working|isn'?t working|won'?t work|repair|fix|urgent|emergency|help needed|need help|leaking|leak|damaged|outage|flood(?:ing)?|clog(?:ged)?|block(?:age|ed)?|backup|backing up|overflow|faulty|failed|stopped|no (?:heat(?:ing)?|cooling|power|(?:hot )?water)|cracked|won'?t|infestation|pest|termite|rodent|nest|spread)\b/i;

const CELEBRATION_NEED_RE =
  /\b(celebrat(?:e|ion|ing)?|event|party|ceremony|occasion|reception|venue)\b/i;

const ASPIRATIONAL_NEED_RE =
  /\b(project|improv(?:e|ement)|install|build|design|upgrade|renovat(?:e|ion)|remodel|create|add (?:a|an|the)|looking to (?:install|build|add|upgrade)|want to (?:install|build|add|upgrade))\b/i;

const CONSULTATION_NEED_RE =
  /\b(consult(?:ation|ing)?|advice|advisor|advisory|strategy|quote|information|guidance|coaching|planning|how (?:do|can) (?:we|i) improve)\b/i;

export function agreedToArrange(state: SalesState): boolean {
  return state.customerAgreed === true || state.appointmentIntent === true;
}

export function profileKnowledgeBlob(business: BusinessProfile): string {
  return [
    business.businessName,
    business.tagline,
    business.systemPrompt,
    pricingRulesKnowledgeText(business.pricingRules),
    ...business.services,
    ...business.faqs.map((f) => `${f.question} ${f.answer}`),
  ]
    .join("\n")
    .toLowerCase();
}

/**
 * Profile-aware field-service detection from capability language in the
 * BusinessProfile — not from a hardcoded vertical list.
 */
export function isFieldServiceProfile(business: BusinessProfile): boolean {
  const blob = profileKnowledgeBlob(business);
  // Ignore negated capability phrases so "not technicians" does not flip field-service on.
  const capabilityBlob = blob
    .replace(/\b(?:do )?not\s+send\s+technicians?\s+on\s+site\b/gi, " ")
    .replace(/\b(?:do )?not\s+(?:send\s+)?technicians?\b/gi, " ")
    .replace(/\bnot\s+technician(?:\s+service)?\s+visits?\b/gi, " ")
    .replace(/\bno\s+technicians?\b/gi, " ")
    .replace(/\bdo not\s+(?:perform\s+)?on[- ]site\b/gi, " ");
  const consultOnly =
    /\b(consult(?:ing|ation)|advisor|advisory|coaching|strategy session|venue|event planning)\b/.test(
      blob
    ) &&
    !/\b(technician|on[- ]site|service visit|house call|service call|field service|come out|dispatch|repair|fix|install|replacement)\b/.test(
      capabilityBlob
    );
  if (consultOnly) return false;
  return /\b(technician|on[- ]site|service visit|house call|service call|field service|come out|dispatch|repair|fix|install|replacement|inspect(?:ion)?|clearing)\b/.test(
    capabilityBlob
  );
}

/**
 * Classify the visitor's stated need for emotionally appropriate acknowledgement.
 * Uses broad intent cues only; safe fallback is confident neutral help.
 */
export function classifyConversationNeedTone(
  need: string | null | undefined,
  _business?: BusinessProfile
): ConversationNeedTone {
  const t = (need || "").trim();
  if (!t) return "CONSULTATION";

  if (CELEBRATION_NEED_RE.test(t)) return "CELEBRATION";
  if (PROBLEM_NEED_RE.test(t)) return "PROBLEM";
  if (CONSULTATION_NEED_RE.test(t)) return "CONSULTATION";
  if (ASPIRATIONAL_NEED_RE.test(t)) return "ASPIRATIONAL";
  return "CONSULTATION";
}

export function nextStepNoun(
  business: BusinessProfile,
  tone?: ConversationNeedTone
): string {
  const resolved = tone || classifyConversationNeedTone(null, business);
  if (resolved === "PROBLEM" && isFieldServiceProfile(business)) {
    const blob = profileKnowledgeBlob(business);
    if (/\bestimat/.test(blob)) return "estimate";
    return "visit";
  }
  return "consultation";
}

export function nextStepArticleNoun(
  business: BusinessProfile,
  tone?: ConversationNeedTone
): string {
  const noun = nextStepNoun(business, tone);
  return /^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`;
}

function stripHelpRequest(text: string): string {
  return text
    .replace(/[?.!]+/g, " ")
    .replace(
      /\b(can you help(?: me)?|please help|i need (it|this) fixed|can you (fix|do|help with) (it|this)|and i need it fixed)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Short natural restatement of the stated need — no industry noun hardcoding. */
export function briefNeedPhrase(need: string | null | undefined): string | null {
  if (!need) return null;
  const cleaned = stripHelpRequest(need);
  if (!cleaned) return null;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  if (words.length > 14) {
    return cleaned
      .split(/\s+/)
      .slice(0, 10)
      .join(" ")
      .replace(/^(the |my |our |a |an )/i, "")
      .toLowerCase();
  }
  return cleaned.replace(/^(the |my |our |a |an )/i, "").toLowerCase();
}

export function buildEmpatheticNameAsk(
  need: string | null | undefined,
  business?: BusinessProfile
): string {
  const tone = classifyConversationNeedTone(need, business);
  const brief = briefNeedPhrase(need);
  let ack: string;

  switch (tone) {
    case "PROBLEM": {
      // Keep the name ask to one question; avoid "and ... ?" compound patterns.
      const safeBrief =
        brief && !/\band\b/i.test(brief) && brief.split(/\s+/).length <= 8
          ? brief
          : null;
      ack = safeBrief
        ? `I'm sorry you're dealing with ${safeBrief}. We can help.`
        : "I'm sorry you're dealing with that. We can help.";
      break;
    }
    case "ASPIRATIONAL":
      ack = "That sounds like a great project. We'd be happy to help.";
      break;
    case "CELEBRATION":
      ack =
        "How exciting—congratulations! We'd be glad to help make it special.";
      break;
    case "CONSULTATION":
    default:
      ack = "Absolutely, I'd be glad to help with that.";
      break;
  }

  return `${ack} ${PRE_CONTACT_ASK_FIRST_NAME}`;
}

export function startsWithMechanicalNameThanks(reply: string): boolean {
  return /^\s*thanks,\s+[A-Za-z][A-Za-z.'-]{0,40}\b/i.test(reply.trim());
}

function needToneFromState(
  state: SalesState,
  business: BusinessProfile
): ConversationNeedTone {
  return classifyConversationNeedTone(
    state.customerNeed || state.primaryNeed,
    business
  );
}

/**
 * Persuasive post-contact invitation: tangible benefit + confident arrange ask.
 * No free/booking/availability promises unless verified elsewhere in profile facts.
 */
export function buildPersuasiveArrangeInvitation(
  business: BusinessProfile,
  tone?: ConversationNeedTone,
  need?: string | null
): string {
  const resolved = tone || "CONSULTATION";
  const step = nextStepArticleNoun(business, resolved);
  const fieldProblem =
    resolved === "PROBLEM" && isFieldServiceProfile(business);
  const brief = briefNeedPhrase(need);

  switch (resolved) {
    case "PROBLEM":
      if (fieldProblem) {
        const shortBrief =
          brief &&
          brief.split(/\s+/).length <= 6 &&
          !/^(i |we |my |our )/i.test(brief)
            ? brief
            : null;
        const concern = shortBrief
          ? `I understand you're dealing with ${shortBrief}. `
          : "I understand this is concerning. ";
        return `${concern}A visit lets the professional assess the situation on site, explain the options, and give you a clear quote before any work begins. Would you like to arrange ${step}?`;
      }
      return `A short conversation lets the team understand your goals and recommend the right next step. Would you like to arrange ${step}?`;
    case "ASPIRATIONAL":
      return `A consultation lets the team understand the space, discuss the options, and give you a clear quote before you commit to anything. Would you like to arrange ${step}?`;
    case "CELEBRATION":
      return `A short consultation lets the team understand the occasion and your plans, then prepare options that fit. Would you like to arrange ${step}?`;
    case "CONSULTATION":
    default:
      return `A short conversation lets the team understand your goals and recommend the right next step. Would you like to arrange ${step}?`;
  }
}

export function buildPostContactNextStepReply(
  state: SalesState,
  business: BusinessProfile
): string {
  return buildPersuasiveArrangeInvitation(
    business,
    needToneFromState(state, business),
    state.customerNeed || state.primaryNeed
  );
}

export function buildAgreedPreferredTimeAsk(
  business: BusinessProfile,
  tone?: ConversationNeedTone
): string {
  return `What day or time would you prefer for the ${nextStepNoun(business, tone)}?`;
}

/** Short arrange ask for appending after a price/scope answer that already explained benefit. */
export function buildArrangeDecisionAsk(
  business: BusinessProfile,
  tone?: ConversationNeedTone
): string {
  const resolved = tone || "CONSULTATION";
  return `Would you like to arrange ${nextStepArticleNoun(business, resolved)}?`;
}

/** Cost/options hesitation after product detail — acknowledge, do not replay the first invite. */
export function isCostOptionsHesitation(
  message: string | null | undefined
): boolean {
  const t = (message || "").toLowerCase();
  if (!t.trim()) return false;
  if (/\bfinancial implication/.test(t)) return true;
  if (
    /\b(decid(?:e|ing)|see(?:ing)?|review(?:ing)?|look(?:ing)? at)\b/.test(t) &&
    /\b(cost|price|pricing|financial|options?|implication|quote)\b/.test(t)
  ) {
    return true;
  }
  return /\bafter seeing\b/.test(t) && /\b(options?|cost|price|financial)\b/.test(t);
}

function extractDecisionTopic(
  ...texts: Array<string | null | undefined>
): string | null {
  const blob = texts.filter(Boolean).join(" ");
  if (!blob) return null;
  const match = blob.match(
    /\b(fixtures?|materials?|finishes?|packages?|models?|designs?|layouts?)\b/i
  );
  if (!match) return null;
  const raw = match[1].toLowerCase();
  // Prefer natural plural customer-facing phrasing when detected.
  if (raw === "fixture") return "fixtures";
  return raw;
}

export function buildCostOptionsHesitationReply(
  state: SalesState,
  business: BusinessProfile,
  recentContext?: string | null
): string {
  const tone = needToneFromState(state, business);
  const topic = extractDecisionTopic(
    recentContext,
    state.customerNeed,
    state.primaryNeed
  );
  const beforeDeciding = topic
    ? ` before deciding on ${topic}`
    : " before deciding";
  const fieldProblem = tone === "PROBLEM" && isFieldServiceProfile(business);

  if (fieldProblem) {
    return `That makes sense. A visit lets you review the options and likely cost${beforeDeciding}. Would you like to arrange one?`;
  }
  if (tone === "CELEBRATION") {
    return `That makes sense. A short consultation lets you review the options and likely cost${beforeDeciding}. Would you like to arrange one?`;
  }
  return `That makes sense. A consultation lets you review the options and likely cost${beforeDeciding}. Would you like to arrange one?`;
}

/** Verified hourly/fixed approach line without diagnosis or work jargon. */
function describeVerifiedApproach(business: BusinessProfile): string | null {
  const blob = profileKnowledgeBlob(business);
  const hasHourly =
    /\bhourly\b/.test(blob) ||
    /\bper hour\b/.test(blob) ||
    /\bby the hour\b/.test(blob);
  const hasFixed =
    /\b(fixed|flat)\s+(price|rate|fee)\b/.test(blob) ||
    /\b(project|job)\s+(price|rate|pricing|fee)\b/.test(blob) ||
    /\blump sum\b/.test(blob);

  if (hasHourly && !hasFixed) {
    return "This business typically charges hourly.";
  }
  if (hasFixed && !hasHourly) {
    return "This business typically prices the full job rather than by the hour.";
  }
  if (hasHourly && hasFixed) {
    return "Depending on the scope, pricing may be hourly or for the full project.";
  }
  return null;
}

function toneAwareUnverifiedScope(
  tone: ConversationNeedTone,
  business: BusinessProfile
): string {
  switch (tone) {
    case "PROBLEM":
      return isFieldServiceProfile(business)
        ? "Exact pricing depends on what is found on site — for example the extent of the issue, access, and the repair or treatment path. A visit lets the professional assess that and give you a clear quote before work begins."
        : "Exact pricing depends on your requirements and the consultation scope. A short conversation lets the team understand your needs and recommend the right next step.";
    case "ASPIRATIONAL":
      return "Exact pricing depends on design choices, materials, site conditions, and project scope. A short consultation lets the team review those variables with you and provide a clear quote.";
    case "CELEBRATION":
      return "Exact pricing depends on the date, guest count, venue requirements, and the options you choose. A short consultation lets the team map those variables to suitable options.";
    case "CONSULTATION":
    default:
      return "Exact pricing depends on your goals, the depth of advice needed, and the scope of work that follows. A short conversation lets the team understand those variables and recommend the right next step.";
  }
}

/**
 * Profile- and tone-aware price answer.
 * Never routes ASPIRATIONAL / CELEBRATION / CONSULTATION through diagnosis,
 * technician, site-visit, or "what the work includes" fallbacks.
 */
export function buildIntentAwarePriceAnswer(
  state: SalesState,
  business: BusinessProfile
): string {
  const tone = needToneFromState(state, business);
  // Only non-empty string pricingRules are customer-facing verified text.
  // Structured/non-string shapes fall through to truthful no-invented-price.
  const rules = verifiedPricingRulesText(business.pricingRules);
  if (rules) return rules;

  const approach = describeVerifiedApproach(business);
  const scope = toneAwareUnverifiedScope(tone, business);
  if (approach) {
    return `${approach} ${scope}`.trim();
  }
  return scope;
}

export function buildPostContactPriceReply(
  state: SalesState,
  business: BusinessProfile
): string {
  const tone = needToneFromState(state, business);
  const price = buildIntentAwarePriceAnswer(state, business);
  if (state.preferredTiming && agreedToArrange(state)) {
    return price;
  }
  if (agreedToArrange(state) && !state.preferredTiming) {
    return `${price} ${buildAgreedPreferredTimeAsk(business, tone)}`.trim();
  }
  if (/would you like to arrange/i.test(price)) {
    return price;
  }
  return `${price} ${buildArrangeDecisionAsk(business, tone)}`.trim();
}

export function buildTimeWithoutAgreementReply(
  state: SalesState,
  business: BusinessProfile
): string {
  const tone = needToneFromState(state, business);
  const step = nextStepArticleNoun(business, tone);
  const timing = state.preferredTiming?.trim();
  if (timing) {
    return `I can note ${timing} as a preferred time. Would you like to arrange ${step}?`;
  }
  return buildPostContactNextStepReply(state, business);
}

export function resolveWarmPreContactReply(
  state: SalesState,
  missingField: "name" | "phone" | "address",
  latestUserMessage?: string,
  business?: BusinessProfile
): string {
  if (missingField === "name") {
    return buildEmpatheticNameAsk(
      state.customerNeed || state.primaryNeed || latestUserMessage,
      business
    );
  }
  if (missingField === "phone") return PRE_CONTACT_ASK_PHONE;
  return PRE_CONTACT_ASK_ADDRESS;
}

export function replyAsksToArrangeNextStep(reply: string): boolean {
  return /\b(would you like to (arrange|book|schedule|set up)|shall i arrange|want (me )?to arrange|would you like (a |an )?(visit|consultation|assessment|appointment|estimate|follow-up))\b/i.test(
    reply
  );
}

/** Field-service-only jargon banned for project / event / consultation copy. */
export function replyUsesFieldServiceJargon(reply: string): boolean {
  return /\b(technician|service visit|site visit|on[- ]site assessment|diagnosis|the work required|what the work includes)\b/i.test(
    reply
  );
}

/**
 * True when the customer is asking for sales conversation value — not merely
 * submitting a lead field or bare agreement. Used to avoid replacing the AI
 * with generic consultation templates after contacts are secured.
 */
export function isSubstantiveSalesFollowUp(
  message: string | null | undefined
): boolean {
  const t = (message || "").trim();
  if (!t) return false;

  if (/\?/.test(t)) return true;

  const lower = t.toLowerCase();

  if (
    /^(yes|yeah|yep|yup|sure|ok|okay|sounds good|that works|yes please|no|nope|no thanks)[.!]?$/i.test(
      t
    )
  ) {
    return false;
  }

  if (
    /\b(worried|concerned|nervous|afraid|scared|anxious|how far|spread|getting worse|before it (gets|becomes) worse)\b/i.test(
      lower
    )
  ) {
    return true;
  }

  if (
    /\b(efficient|efficiency|energy|electricity|power (bill|usage|consumption)|consumption|options?|compare|comparison|difference|recommend|what (system|unit|model|type)|which (system|unit|model|type)|how (does|do|would|will)|why (do|does|would|should)|do you (know|offer|handle|provide|install)|can you (explain|tell|help|advise)|tell me (about|more)|what about)\b/i.test(
      lower
    )
  ) {
    return true;
  }

  if (
    /\b(too expensive|cost too much|pricey|not sure|need to think|hesitat|why (should|would) i|worth it|financial)\b/i.test(
      lower
    )
  ) {
    return true;
  }

  if (isCostOptionsHesitation(t)) return true;

  // Multi-sentence concern / explanation after contacts — treat as conversation.
  if (t.split(/\s+/).filter(Boolean).length >= 10) return true;

  return false;
}

/**
 * Detects first-person business capability claims ("we handle/provide/...").
 * Used to reject converting general industry knowledge into unsupported
 * claims about the specific business when the profile does not support them.
 */
export function replyMakesFirstPersonCapabilityClaim(reply: string): boolean {
  return /\b(we|our (team|technicians?|crew|company|staff))\s+(?:can |will |could |also )?(handle|handles|provide|provides|offer|offers|do|does|perform|performs|coordinate|coordinates|take care of|cover|covers)\b/i.test(
    reply
  );
}

/**
 * Extracts rough capability phrases after first-person claim verbs for
 * profile support checks. Industry-agnostic; not a vertical allowlist.
 */
export function extractClaimedCapabilities(reply: string): string[] {
  const claims: string[] = [];
  const re =
    /\b(?:we|our (?:team|technicians?|crew|company|staff))\s+(?:can |will |could |also )?(?:handle|handles|provide|provides|offer|offers|do|does|perform|performs|coordinate|coordinates|take care of|cover|covers)\s+([^.;!?]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(reply))) {
    const phrase = (match[1] || "").trim().toLowerCase();
    if (phrase.length >= 4) claims.push(phrase.slice(0, 80));
  }
  return claims;
}

/**
 * True when a first-person capability claim is not supported by the loaded
 * BusinessProfile. General industry wording ("installations commonly require")
 * is not flagged.
 */
export function replyHasUnsupportedBusinessCapabilityClaim(
  reply: string,
  business: BusinessProfile
): boolean {
  if (!replyMakesFirstPersonCapabilityClaim(reply)) return false;

  const knowledge = profileKnowledgeBlob(business);
  const claims = extractClaimedCapabilities(reply);
  if (claims.length === 0) {
    return /\b(we|our (team|technicians?|crew))\s+(?:can |will |could |also )?(handle|provide|coordinate|offer)\b/i.test(
      reply
    );
  }

  return claims.some((claim) => {
    const tokens = claim
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4);
    if (tokens.length === 0) return false;
    const supported = tokens.some((token) => knowledge.includes(token));
    return !supported;
  });
}

/** Generic consultation-boilerplate only — no substantive answer content. */
export function replyIsGenericConsultationBoilerplate(reply: string): boolean {
  const t = reply.trim();
  if (!t) return false;
  const arrangeOnly =
    /\bwould you like to arrange\b/i.test(t) &&
    /\b(visit|consultation|assessment|appointment|estimate)\b/i.test(t);
  if (!arrangeOnly) return false;
  const hasBoilerplateBenefit =
    /\b(lets the (professional|team)|short (conversation|consultation) lets|understand (the space|your goals|the occasion|your plans|your needs)|identify the cause|clear quote before)\b/i.test(
      t
    );
  const hasSubstantiveAnswer =
    /\b(efficiency|electric|energy|consumption|cost (is|depends|varies)|pricing depends|exact pricing|typically|commonly|usually|in general|options include|newer systems|high[- ]efficiency|can extend|helps determine|activity can|for example|variables|extent of the issue|design choices|guest count|depth of advice)\b/i.test(
      t
    );
  return hasBoilerplateBenefit && !hasSubstantiveAnswer;
}
