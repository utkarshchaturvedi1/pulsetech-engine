Warning: truncated output (original token count: 23579)
Total output lines: 2432

import { BusinessProfile } from "../types/business";
import { captureExplicitOwnerAnswers, captureOwnerQuestionAnswer, synchronizeOwnerQuestions } from "./ownerQuestions";
import { feeOnlyPriceReply } from "./pricingScope";
import { pricingRulesKnowledgeText } from "./businessProfile";
import { evaluateHandoffReadiness } from "./leadHandoffShared";
import {
  agreedToArrange,
  buildAgreedPreferredTimeAsk,
  buildPostContactNextStepReply,
  buildPostContactPriceReply,
  buildTimeWithoutAgreementReply,
  classifyConversationNeedTone,
  isCostOptionsHesitation,
  isSubstantiveSalesFollowUp,
  nextStepArticleNoun,
  replyHasUnsupportedBusinessCapabilityClaim,
  replyIsGenericConsultationBoilerplate,
  resolveWarmPreContactReply,
  startsWithMechanicalNameThanks,
} from "./salesConversation";
import {
  INVENTED_SCHEDULE_RANGE_RE,
  INTERNAL_HANDOFF_STATUS_RE,
  SAME_DAY_PROMISE_RE,
  SITE_ASSESSMENT_TEAM_ALERT_ASK,
  ASK_EXPLICIT_AGREEMENT,
  PRE_QUEUE_ALERT_PROMISE_RE,
  buildFailedLeadHandoffCustomerMessage,
  buildQueuedLeadHandoffCustomerMessage,
  buildSuccessfulLeadHandoffCustomerMessage,
  detectSchedulingUrgency,
  detectVisitPreferenceRequest,
  extractPreferredVisitTimeFromText,
  impliesConfirmedSiteAssessment,
  isFailedLeadHandoffCustomerMessage,
  isQueuedLeadHandoffCustomerMessage,
  isSuccessfulLeadHandoffCustomerMessage,
  knowledgeAllowsSameDay,
  maxUrgency,
  messageAsksPricingOrBilling,
} from "./schedulingPolicy";
import {
  LeadFields,
  SalesIntent,
  SalesObjective,
  SalesState,
  createInitialSalesState,
  normalizeSalesState,
} from "./salesState";

export type ChatTurnMessage = {
  role: "user" | "assistant";
  content: string;
};

const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}|\b\d{7,15}\b/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const ADDRESS_HINT_RE =
  /\b\d{1,6}\s+[A-Za-z0-9.'\- ]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|circle|cir|place|pl)\b/i;

const CONCRETE_PROBLEM_RE =
  /\b(clogged|broken|leaking|leak|damaged|flooding|not working|isn'?t working|won'?t|stopped|out of|making (a )?noise|no (hot )?water|no (heat|cooling|air(?:flow)?)|not (heat(?:ing)?|cool(?:ing)?)|won'?t (heat|cool)|too (hot|cold)|overheating|repair|fix|install|replace|cracked|missing|failed|faulty|pipe|hornet|wasp|yellowjacket|bee|pest|rodent|termite|ant|spider|infestation|nest|removed?|removal)\b/i;

const PREFERRED_TIME_ASK_RE =
  /\bwhat day or time would you prefer\b|\bpreferred (day|time|visit)\b|\bwhen (would|do) you (like|prefer|want) (us|someone|a technician)?\b|\bwhat time (works|would you like)\b/i;

const PROPERTY_TYPE_ASK_RE =
  /\b(residential or commercial|commercial or residential|home or (a )?business|house or (a )?(business|commercial)|property type)\b/i;

const TROUBLESHOOT_ASK_RE =
  /\b(have you tried|did you (already )?check|check the (filter|thermostat|breaker)|reset (the )?(unit|system)|how long has (it|this) been|is it making (a )?noise|what error (code|message))\b/i;

const FAKE_CAPABILITY_RE =
  /\b(i('ll| will)?\s+(dispatch|schedule|book)|i('ve| have)\s+(scheduled|booked|dispatched|sent this to dispatch|confirmed (your )?appointment)|check(ing)?\s+(live\s+)?availability|contact(ed|ing)?\s+(a\s+)?technician|we (can|will) (send|dispatch) (someone|a technician)|you(?:'re| are) (all )?set|confirmed for)\b/i;

const FAKE_AVAILABILITY_RE =
  /\b(we (are|have|do have) availability|available (today|tomorrow|this (morning|afternoon|evening))|come (out )?(today|tomorrow)|between\s+\d{1,2}\s*(am|pm)?\s*[-–]\s*\d{1,2}|from\s+\d{1,2}\s*(am|pm)|\d{1,2}\s*[-–]\s*\d{1,2}\s*(am|pm)|8\s*[-–]\s*12|12\s*[-–]\s*4|4\s*[-–]\s*8|same[- ]day service is available|early window|late morning)\b/i;

const DIY_RE =
  /\b(you can try|try (this|these|the following)|steps you can|before (you )?call|do it yourself|diy|home remed|pour boiling|use a plunger|snake (the )?drain|vinegar and baking|clear it yourself)\b/i;

const TECHNICIAN_DUMP_RE =
  /\b(trap inspection|hydro-?jet|auger|snake\/auger|garbage disposal testing|30[–-]90 minutes|most visits take|access constraints)\b/i;

const FALSE_HANDOFF_RE =
  /\b(i('ve| have) (sent|forwarded|handed|shared)|shared your request|sent (this|your request|your details|it) to (the )?team|the team (has|already has) your (details|request|information)|the team will (call|contact|reach)|our scheduling team has|handed (this|it) off|notification (was |has been )?sent)\b/i;

const PAYMENT_PUSH_RE =
  /\b(arrange (the |your |a )?(\$\s?\d[\d,]*(?:\.\d{2})?\s+)?payment|pay now|pay (the |this |that )?(fee|charge)|collect(ing)? (the |your )?payment|process(ing)? (your )?payment|i('ll| will) (take|collect|process) (your )?payment)\b/i;

function mentionsSiteVisitFee(text: string): boolean {
  return (
    /\bsite[- ]visit fee\b/i.test(text) ||
    /\bvisit fee\b/i.test(text) ||
    (/\$\s?\d/.test(text) && /\b(visit|call-?out)\b/i.test(text))
  );
}

function customerAskedAboutFee(text: string): boolean {
  return /\b(how much|what(?:'s| is) the (cost|price|charge|fee)|visit fee|site[- ]visit fee|call-?out fee|do i (need to |have to )?pay|payment)\b/i.test(
    text
  );
}

function extractSiteVisitFeeLabel(business: BusinessProfile): string | null {
  const blob = [
    pricingRulesKnowledgeText(business.pricingRules),
    business.systemPrompt || "",
  ].join("\n");
  if (!/\b(visit|call-?out|site)\b/i.test(blob) || !/\b(fee|charge)\b/i.test(blob)) {
    return null;
  }
  const amount = blob.match(/\$\s?\d{1,4}(?:\.\d{2})?/);
  return amount ? amount[0].replace(/\s+/g, "") : null;
}

function rankIntent(intent: SalesIntent): number {
  switch (intent) {
    case "LOW":
      return 0;
    case "MEDIUM":
      return 1;
    case "HIGH":
      return 2;
    case "READY_TO_ACT":
      return 3;
  }
}

function maxIntent(a: SalesIntent, b: SalesIntent): SalesIntent {
  return rankIntent(a) >= rankIntent(b) ? a : b;
}

function addFact(facts: string[], fact: string): string[] {
  const normalized = fact.trim();
  if (!normalized) return facts;
  if (facts.some((f) => f.toLowerCase() === normalized.toLowerCase())) {
    return facts;
  }
  return [...facts, normalized].slice(-24);
}

function addObjection(list: string[], item: string): string[] {
  return addFact(list, item);
}

function detectIntent(text: string): SalesIntent {
  const t = text.toLowerCase();

  if (
    /\b(just looking|just browsing|only looking|researching|do you offer|what services|how does (this|it) work)\b/.test(
      t
    )
  ) {
    return "LOW";
  }

  if (
    /\b(come (out|over)|send someone|schedule|book|arrange|get started|as soon as possible|asap|right away|today|emergency)\b/.test(
      t
    )
  ) {
    return "READY_TO_ACT";
  }

  if (CONCRETE_PROBLEM_RE.test(t)) {
    return "HIGH";
  }

  if (
    /\b(i need|i want|i'?d like|i would like|we(?:'d| would) like|need help|need a|need an|needs? to be|fix this|repair|estimate|quote|looking for|want to (install|build|add|upgrade|book)|interested in (a |an |the )?(wedding|venue|consultation|install|project))\b/.test(
      t
    )
  ) {
    return "HIGH";
  }

  if (
    /\b(can you help|please help)\b/.test(t) &&
    (CONCRETE_PROBLEM_RE.test(t) || looksLikeServiceRequest(t))
  ) {
    return "HIGH";
  }

  if (
    /\b(thinking about|considering|looking into|interested in|maybe|might)\b/.test(
      t
    )
  ) {
    return "MEDIUM";
  }

  return "LOW";
}


function extractPhone(text: string): string | null {
  const match = text.match(PHONE_RE);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, "");
  if (digits.length < 7) return null;
  return match[0].trim();
}

function extractEmail(text: string): string | null {
  const match = text.match(EMAIL_RE);
  return match ? match[0].trim() : null;
}

/** Affirmative answers to the immediately pending confirmation question. */
export function isFieldConfirmationReply(text: string): boolean {
  return /^(yes|yeah|yep|yup|correct|that'?s? (right|correct)|that is right|that is correct)[.!]?$/i.test(
    text.trim()
  );
}

const NAME_TOKEN_BLOCKLIST =
  /^(your|you|yours|request|preferred|this|that|what|when|where|with|from|have|been|thanks|thank|me|my|our|the|and|for|not|are|was|were|to|of|in|on|at|a|an|is|good)$/i;

function isNameTimePhrase(value: string): boolean {
  const t = value.trim();
  if (!t) return true;
  if (extractPreferredVisitTimeFromText(t)) return true;
  return /^(today|tomorrow|tonight|morning|afternoon|evening|night|weekend|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|anytime|any\s+time)$/i.test(
    t
  );
}

function isPlausiblePersonName(value: string): boolean {
  const cleaned = value.trim().replace(/^["']|["']$/g, "");
  if (
    !/^[A-Za-z](?:[A-Za-z.'-]{0,40})?(?:\s+[A-Za-z][A-Za-z.'-]{1,40}){0,3}$/.test(
      cleaned
    )
  ) {
    return false;
  }
  if (cleaned.split(/\s+/).some((token) => NAME_TOKEN_BLOCKLIST.test(token))) {
    return false;
  }
  if (isNameTimePhrase(cleaned)) return false;
  if (
    /^(just|only|still|yes|no|ok|okay|looking|browsing|yes please|yeah|yep|sure|please|thanks|thank you|correct|right|hi|hello)$/i.test(
      cleaned
    )
  ) {
    return false;
  }
  if (
    detectCustomerAgreement(cleaned) ||
    isBareAffirmative(cleaned) ||
    isFieldConfirmationReply(cleaned)
  ) {
    return false;
  }
  return true;
}

/** A normal entered first name — store it; do not ask the visitor to confirm it. */
function isAuthoritativePersonName(value: string | null | undefined): boolean {
  const cleaned = (value || "").trim();
  return cleaned.length >= 2 && isPlausiblePersonName(cleaned);
}

function extractExplicitPersonName(text: string): string | null {
  const labeled = text.match(
    /(?:my\s+(?:first\s+)?name(?:'s| is)|(?:first\s+)?name(?:'s| is)|this is|call me)\s+([A-Za-z](?:[A-Za-z.'-]{0,40})?(?:\s+[A-Za-z][A-Za-z.'-]{1,40})?)/i
  )?.[1];
  if (!labeled) return null;
  const cleaned = labeled
    .replace(/\b(and|my|phone|number|email|address)\b.*$/i, "")
    .trim();
  return isPlausiblePersonName(cleaned) ? cleaned : null;
}

function assistantAskedForName(assistantText: string): boolean {
  const t = assistantText.trim();
  if (!t) return false;
  if (assistantAskedToConfirmName(t)) return true;
  return leadFieldAskPatterns("name").some((re) => re.test(t));
}

function extractName(
  text: string,
  objective: SalesObjective,
  priorAssistant = ""
): string | null {
  const explicit = extractExplicitPersonName(text);
  if (explicit) return explicit;

  const collectingName =
    objective === "COLLECT_NAME" || assistantAskedForName(priorAssistant);
  if (collectingName) {
    const cleaned = text.trim().replace(/^["']|["']$/g, "");
    if (extractPreferredVisitTimeFromText(cleaned) && !isPlausiblePersonName(cleaned)) {
      return null;
    }
    if (isPlausiblePersonName(cleaned)) return cleaned;
  }

  return null;
}

function isExplicitNameCorrection(text: string): boolean {
  return /(?:my\s+(?:first\s+)?name(?:'s| is)|(?:first\s+)?name(?:'s| is)|call me|actually)\b/i.test(
    text
  );
}

function shouldReplaceCapturedName(
  existing: string,
  incoming: string,
  text: string
): boolean {
  if (!isPlausiblePersonName(incoming)) return false;
  if (isExplicitNameCorrection(text)) return true;
  if (isAuthoritativePersonName(existing)) return false;
  const prev = existing.trim();
  const next = incoming.trim();
  return (
    prev.length <= 2 &&
    next.length > prev.length &&
    next.toLowerCase().startsWith(prev.toLowerCase())
  );
}

function assistantAskedToConfirmName(assistantText: string): boolean {
  const t = assistantText.trim();
  if (!t) return false;
  if (
    /\bwhat(?:'s| is) your (first )?name\b/i.test(t) &&
    !/\bis your first name\b/i.test(t)
  ) {
    return false;
  }
  return (
    /\bis your first name\b/i.test(t) ||
    /\bis\s+[A-Za-z][A-Za-z.'-]{0,40}\s+(?:the |your )?(?:first )?name(?: i should use)?\b/i.test(
      t
    ) ||
    (/\b(first name|your name|name to use|call you)\b/i.test(t) &&
      /\b(confirm|correct|right|did i get|just to (confirm|check)|should i (use|go with)|to use)\b/i.test(
        t
      ))
  );
}

function extractNameCandidateFromAssistant(assistantText: string): string | null {
  const quoted = assistantText.match(/["']([A-Za-z](?:[A-Za-z.'-]{0,40})?)["']/);
  if (quoted?.[1] && isPlausiblePersonName(quoted[1])) return quoted[1];
  const yourFirst = assistantText.match(
    /\bis your first name\s+([A-Za-z](?:[A-Za-z.'-]{0,40})?)/i
  );
  if (yourFirst?.[1] && isPlausiblePersonName(yourFirst[1])) return yourFirst[1];
  const isName = assistantText.match(
    /\bis\s+([A-Za-z](?:[A-Za-z.'-]{0,40})?)\s+(?:the |your )?(?:first )?name/i
  );
  if (isName?.[1] && isPlausiblePersonName(isName[1])) return isName[1];
  const useName = assistantText.match(
    /\b(?:use|using|call you)\s+([A-Za-z](?:[A-Za-z.'-]{0,40})?)\b/i
  );
  if (useName?.[1] && isPlausiblePersonName(useName[1])) return useName[1];
  return null;
}

function previousUserMessage(
  messages: Array<{ role: string; content: string }>
): string {
  const users = messages.filter((message) => message.role === "user");
  if (users.length < 2) return "";
  return users[users.length - 2]?.content || "";
}

function assignLeadName(state: SalesState, name: string): void {
  const next = name.trim();
  if (!next) return;
  if (state.lead.name === next) return;
  state.lead.name = next;
  state.establishedFacts = state.establishedFacts.filter(
    (fact) => !/^name=/i.test(fact)
  );
  state.establishedFacts = addFact(state.establishedFacts, `name=${next}`);
  state.refusedLeadFields = state.refusedLeadFields.filter((f) => f !== "name");
}

function extractAddress(
  text: string,
  objective: SalesObjective
): string | null {
  const labeled = text.match(
    /(?:my address(?: is)?|address is|i('?m| am) at|located at)\s+(.+)/i
  )?.[2];
  if (labeled) return labeled.trim().replace(/[.?!]$/, "");

  if (ADDRESS_HINT_RE.test(text)) {
    return text.trim();
  }

  if (objective === "COLLECT_ADDRESS") {
    const cleaned = text.trim();
    if (
      cleaned.length >= 8 &&
      /\d/.test(cleaned) &&
      /[A-Za-z]/.test(cleaned) &&
      !PHONE_RE.test(cleaned) &&
      !EMAIL_RE.test(cleaned)
    ) {
      return cleaned;
    }
  }

  return null;
}

function extractPreferredTiming(text: string): string | null {
  return extractPreferredVisitTimeFromText(text);
}

function extractPreferredTimingFromHistory(
  messages: Array<{ role: string; content: string }>
): string | null {
  const users = messages.filter((message) => message.role === "user");
  for (let i = users.length - 1; i >= 0; i -= 1) {
    const timing = extractPreferredTiming(users[i]?.content || "");
    if (timing) return timing;
  }
  return null;
}

const DAY_RE =
  /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this (morning|afternoon|evening|weekend|week)|next (weekend|week)|weekend)\b/i;
const WINDOW_RE =
  /\b(\d{1,2}\s*(?::\d{2})?\s*[-–]\s*\d{1,2}\s*(?::\d{2})?\s*(am|pm)?|between\s+\d{1,2}\s*(?:am|pm)?\s*(?:and|[-–])\s*\d{1,2}\s*(am|pm)?)\b/i;
const AFTER_BEFORE_RE = /\b((after|before)\s+\d{1,2}\s*(am|pm)?)\b/i;

function timingSpecificityScore(value: string): number {
  const t = value.toLowerCase();
  let score = 0;
  if (DAY_RE.test(t)) score += 2;
  if (AFTER_BEFORE_RE.test(t)) score += 3;
  if (WINDOW_RE.test(t)) score += 5;
  if (/\b\d{1,2}\s*(am|pm)\b/.test(t)) score += 2;
  if (/\b(sounds fine|works|anytime|whenever)\b/.test(t)) score -= 1;
  return score;
}

/** Refine preferredTiming toward the most specific non-contradictory value. */
function refinePreferredTiming(
  previous: string | null,
  incoming: string
): string {
  const next = incoming.trim().replace(/\s+/g, " ");
  if (!previous) {
    return next.replace(/\bsounds fine\b/i, "").trim() || next;
  }

  const prev = previous.trim();
  const day =
    next.match(DAY_RE)?.[0] || prev.match(DAY_RE)?.[0] || null;
  const window =
    next.match(WINDOW_RE)?.[0] || prev.match(WINDOW_RE)?.[0] || null;
  const afterBefore =
    next.match(AFTER_BEFORE_RE)?.[0] ||
    prev.match(AFTER_BEFORE_RE)?.[0] ||
    null;

  if (day && window) {
    const dayLabel = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
    return `${dayLabel}, ${window.replace(/\s+/g, " ")}`;
  }

  if (day && afterBefore && !window) {
    const dayLabel = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
    return `${dayLabel} ${afterBefore}`.replace(/\s+/g, " ");
  }

  if (timingSpecificityScore(next) > timingSpecificityScore(prev)) {
    return next;
  }

  return prev;
}

function looksLikeServiceRequest(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  if (PHONE_RE.test(t) && t.replace(/\D/g, "").length >= 7 && t.split(/\s+/).length <= 3) {
    return false;
  }
  if (ADDRESS_HINT_RE.test(t) && !/\b(need|want|repair|service|treatment|inspection)\b/i.test(t)) {
    return false;
  }
  if (extractPreferredVisitTimeFromText(t) && t.split(/\s+/).length <= 8 && !/\b(need|want|repair|service|treatment|inspection)\b/i.test(t)) {
    return false;
  }
  return (
    /\b(i need|i want|looking for|interested in|help with|problem with|issue with|i have)\b/i.test(
      t
    ) ||
    /\bcan you (do|fix|repair|treat|inspect|service|handle|help)\b/i.test(t) ||
    /\b(repair|install|replace|service|quote|estimate|treatment|inspection)\b/i.test(t) ||
    CONCRETE_PROBLEM_RE.test(t)
  );
}

function inferCustomerNeed(
  text: string,
  previous: string | null
): string | null {
  const t = text.trim();
  if (t.length < 3) return previous;

  if (previous) {
    return previous;
  }

  if (!looksLikeServiceRequest(t)) {
    return previous;
  }

  return t.length > 160 ? `${t.slice(0, 157)}...` : t;
}

/** Industry-agnostic concise buying-context notes from a customer turn. */
function extractCustomerContextNotes(text: string): string[] {
  const notes: string[] = [];
  const t = text.toLowerCase();

  if (
    /\b(multiple options|what (kind|type)s?|one type|different (types|options)|options (available|do you have)|do you have multiple)\b/.test(
      t
    )
  ) {
    notes.push("Customer wants to understand available options.");
  }

  if (
    /\b(should i buy|buy (a|the|one) first|haven'?t (bought|purchased)|not (yet )?purchased|i (didn'?t|have not) buy)\b/.test(
      t
    )
  ) {
    notes.push("Customer has not purchased the item yet / asked whether to buy first.");
  }

  if (/\b(bring the|will you bring|do you (supply|provide|sourc)|sourc(e|ing))\b/.test(t)) {
    notes.push("Customer is interested in reviewing sourcing / supply options.");
  }

  if (
    /\b(cost extra|extra cost|additional (cost|charge|fee)|how much.*(sourc|supply|bring|option))\b/.test(
      t
    )
  ) {
    notes.push("Customer asked whether sourcing would cost extra.");
  }

  if (
    /\b(on[- ]?site|come (out|over)|send someone|estimate|inspection|visit)\b/.test(
      t
    ) &&
    /\b(want|need|interested|like|prefer|can you)\b/.test(t)
  ) {
    notes.push("Customer is interested in an on-site visit or estimate.");
  }

  return notes;
}

function extractContactPreference(text: string): string | null {
  const t = text.toLowerCase();
  if (
    /\b(phone call|call (me|is) fine|prefer (a )?phone( call)?|prefer (a )?call|contact (me )?by phone|a call is fine)\b/.test(
      t
    )
  ) {
    return "Phone call";
  }
  if (/\b(email (is fine|me|preferred)|prefer email|contact (me )?by email)\b/.test(t)) {
    return "Email";
  }
  if (/\b(text (me|is fine)|sms|prefer text)\b/.test(t)) {
    return "Text";
  }
  return null;
}

function isCustomerNeedSpecific(need: string | null): boolean {
  if (!need) return false;

  const t = need.trim().toLowerCase();
  if (t.length < 8) return false;

  const hasConcreteProblem = CONCRETE_PROBLEM_RE.test(t);
  const hasServiceRequestNoun =
    /\b(treatment|inspection|repair|install|replace…13579 tokens truncated…alidationResult = {
  ok: boolean;
  reasons: string[];
};

function looksLikeBrochureDump(reply: string): boolean {
  const bulletLike = (reply.match(/(?:^|\n)\s*[-•*]/g) || []).length;
  const sectionHints =
    /\b(we offer|our services|emergency (service|instructions)|service areas?|free estimates?|licensed|insured|available 24)\b/i.test(
      reply
    );
  const long = reply.trim().length > 420;
  return (bulletLike >= 3 && sectionHints) || (long && sectionHints) || bulletLike >= 4;
}

function businessKnowledgeBlob(business: BusinessProfile): string {
  return [
    business.businessName,
    business.tagline,
    business.systemPrompt,
    pricingRulesKnowledgeText(business.pricingRules),
    business.businessHours || "",
    ...business.services,
    ...business.serviceAreas,
    ...business.faqs.map((f) => `${f.question} ${f.answer}`),
    ...business.leadQuestions,
  ]
    .join("\n")
    .toLowerCase();
}

function replyInventedPrice(
  reply: string,
  business: BusinessProfile
): boolean {
  const amounts = reply.match(/\$\s?\d[\d,]*(?:\.\d{2})?/g);
  if (!amounts || amounts.length === 0) return false;

  const knowledge = businessKnowledgeBlob(business);
  return amounts.some((amount) => {
    const normalized = amount.replace(/\s+/g, "").toLowerCase();
    const digits = normalized.replace(/[^\d.]/g, "");
    return !knowledge.includes(normalized) && !knowledge.includes(digits);
  });
}

export function validateSalesReply(
  reply: string,
  state: SalesState,
  business?: BusinessProfile,
  latestUserMessage?: string
): ValidationResult {
  const reasons: string[] = [];
  if (business && messageAsksPricingOrBilling(latestUserMessage || "") && feeOnlyPriceReply(reply, business, latestUserMessage)) {
    reasons.push("Visit/diagnostic fee is not an answer to the overall service/project price question. Explain relevant price drivers and separate the fee.");
  }

  if (FAKE_CAPABILITY_RE.test(reply)) {
    reasons.push("Unsupported scheduling/dispatch/availability claim.");
  }

  if (impliesConfirmedSiteAssessment(reply)) {
    reasons.push(
      "Implied a confirmed site assessment (use team-alert wording, not we'll arrange)."
    );
  }

  // CLOSE may restate the customer's already-captured preferredTiming window.
  if (
    state.currentObjective !== "CLOSE" &&
    FAKE_AVAILABILITY_RE.test(reply)
  ) {
    reasons.push("Unsupported scheduling/dispatch/availability claim.");
  }

  const leadAsks = countLeadFieldAsks(reply);
  const collecting =
    state.currentObjective === "COLLECT_NAME" ||
    state.currentObjective === "COLLECT_PHONE" ||
    state.currentObjective === "COLLECT_EMAIL" ||
    state.currentObjective === "COLLECT_ADDRESS";

  const tightTurn =
    collecting || state.currentObjective === "UNDERSTAND_NEED";

  if (collecting && leadAsks > 1) {
    reasons.push("Multiple lead-field questions in one response.");
  }

  if (
    collecting &&
    (state.currentObjective === "COLLECT_PHONE" ||
      state.currentObjective === "COLLECT_ADDRESS") &&
    startsWithMechanicalNameThanks(reply)
  ) {
    reasons.push("Started with a mechanical Thanks, {name} on a contact-capture turn.");
  }

  if (
    state.currentObjective === "COLLECT_NAME" &&
    /\bwe can help with that\.\s*what(?:'s| is) your first name\?/i.test(reply) &&
    !/\b(sorry|frustrating|glad to help with)\b/i.test(reply)
  ) {
    reasons.push("Cold form name ask; acknowledge the stated problem first.");
  }

  (Object.keys(state.lead) as Array<keyof LeadFields>).forEach((field) => {
    if (!state.lead[field]) return;
    if (leadFieldAskPatterns(field).some((re) => re.test(reply))) {
      reasons.push(`Asked for already-collected field: ${field}.`);
    }
  });

  if (
    isAuthoritativePersonName(state.lead.name) &&
    assistantAskedToConfirmName(reply)
  ) {
    reasons.push("Asked to confirm an already-captured name.");
  }

  state.refusedLeadFields.forEach((field) => {
    if (leadFieldAskPatterns(field).some((re) => re.test(reply))) {
      reasons.push(`Asked for refused lead field: ${field}.`);
    }
  });

  if (state.leadCapturePaused && collecting) {
    // Controller should not choose COLLECT_* while paused; if it somehow did, reject asks.
    if (leadAsks > 0) {
      reasons.push("Lead capture asked while leadCapturePaused is true.");
    }
  }

  if (
    /\b(last name|apartment number|preferred contact|email address|what time are you available)\b/i.test(
      reply
    ) &&
    state.currentObjective !== "ADVANCE_TO_NEXT_STEP" &&
    state.currentObjective !== "CLOSE"
  ) {
    reasons.push("Asked for unnecessary extra personal/detail fields.");
  }

  if (state.urgency === "IMMEDIATE" && /\b(is this an emergency|urgent\?)\b/i.test(reply)) {
    reasons.push("Re-asked urgency after customer already stated immediate need.");
  }

  const questionMarks = (reply.match(/\?/g) || []).length;
  if (tightTurn && questionMarks > 1) {
    reasons.push("More than one question while pursuing a single tight objective.");
  }

  if (tightTurn && looksLikeBrochureDump(reply)) {
    reasons.push("Brochure/service-list dump during a tight collection/understanding turn.");
  }

  if (tightTurn && reply.trim().length > 280) {
    reasons.push("Response too long for a one-question collection/understanding turn.");
  }

  if (
    state.currentObjective === "COLLECT_ADDRESS" &&
    !/\b(address|where (should|can) we|service location|property)\b/i.test(reply)
  ) {
    if (questionMarks >= 1 && leadAsks === 0) {
      reasons.push("COLLECT_ADDRESS turn did not ask for the service address.");
    }
  }

  if (
    state.currentObjective === "PRESENT_SOLUTION" &&
    looksLikeBrochureDump(reply)
  ) {
    reasons.push("PRESENT_SOLUTION turned into a full company brochure.");
  }

  for (const [question, answer] of Object.entries(state.ownerQuestionAnswers || {})) {
    if (answer && reply.includes(question)) {
      reasons.push(`Re-asked an owner question the customer already answered: ${question}`);
    }
  }

  if (
    (state.currentObjective === "PRESENT_SOLUTION" ||
      state.currentObjective === "CLOSE" ||
      state.currentObjective === "ADVANCE_TO_NEXT_STEP") &&
    TECHNICIAN_DUMP_RE.test(reply)
  ) {
    reasons.push("Unnecessary technician-style operational dump during a sales turn.");
  }

  if (
    DIY_RE.test(reply) &&
    (state.intent === "HIGH" ||
      state.intent === "READY_TO_ACT" ||
      isCustomerNeedSpecific(state.customerNeed))
  ) {
    reasons.push("Proactive DIY repair instructions after a service request.");
  }

  if (business && replyInventedPrice(reply, business)) {
    reasons.push("Invented price/fee not present in BusinessProfile knowledge.");
  }

  if (
    state.customerAgreed &&
    state.currentObjective === "CLOSE" &&
    (questionMarks > 1 || looksLikeBrochureDump(reply) || TECHNICIAN_DUMP_RE.test(reply))
  ) {
    reasons.push("Over-questioning or overselling after customer agreement.");
  }

  if (state.currentObjective === "CLOSE" && questionMarks > 0) {
    reasons.push("CLOSE turn must not ask another question.");
  }

  if (
    state.currentObjective === "CLOSE" &&
    /\b(one quick question|anything else|would you like me to|any (other |additional )?access|gate code|parking|pet(s)?\b)/i.test(
      reply
    )
  ) {
    reasons.push("CLOSE turn continued with unnecessary follow-up/operational prompts.");
  }

  if (
    isV1LeadComplete(state) &&
    state.currentObjective !== "ANSWER" &&
    /\b(gate code|access (code|instructions|notes)|parking|doorman|pet(s)? (on site|at (the )?home|in the (house|home))|anyone (home|there)|who will be home)\b/i.test(
      reply
    ) &&
    /\?/.test(reply)
  ) {
    reasons.push("Asked unnecessary operational access/pet/parking question after lead is complete.");
  }

  if (
    !!state.preferredTiming &&
    isV1LeadComplete(state) &&
    state.currentObjective !== "CLOSE" &&
    /\b(what time|which (window|slot)|narrow(er)?|more specific|morning or afternoon|between\s+\d)/i.test(
      reply
    ) &&
    /\?/.test(reply)
  ) {
    reasons.push("Re-asked timing refinement after preferredTiming was already established.");
  }

  if (
    /\band\b.+\?/i.test(reply) &&
    /\b(what|where|when|how|can you|could you)\b/i.test(reply) &&
    tightTurn
  ) {
    reasons.push("Compound multi-part question in a single-objective turn.");
  }

  if (INTERNAL_HANDOFF_STATUS_RE.test(reply)) {
    reasons.push("Exposed internal lead-handoff delivery status to the customer.");
  }

  const contactComplete = isLeadContactComplete(state);
  const allowsBusinessPhone = visitorAllowsBusinessPhone(
    latestUserMessage,
    state.leadDeliveryStatus === "FAILED"
  );

  if (
    (state.leadDeliveryStatus === "QUEUED" ||
      state.leadDeliveryStatus === "SENT") &&
    replyExposesBusinessPhone(reply, business)
  ) {
    reasons.push(
      "Success close must not include the business phone number or invite the customer to call it."
    );
  }

  if (
    replyExposesBusinessPhone(reply, business) &&
    state.leadDeliveryStatus !== "QUEUED" &&
    state.leadDeliveryStatus !== "SENT" &&
    !allowsBusinessPhone
  ) {
    reasons.push(
      "Must not expose the business phone unless the customer asked for it, stated emergency/danger/immediate help, or delivery failed."
    );
  }

  if (!contactComplete && PROPERTY_TYPE_ASK_RE.test(reply)) {
    reasons.push(
      "Asked property type before name, customer phone, and service address were captured."
    );
  }

  if (!contactComplete && TROUBLESHOOT_ASK_RE.test(reply)) {
    reasons.push(
      "Asked a troubleshooting question before name, customer phone, and service address were captured."
    );
  }

  if (
    state.leadDeliveryStatus !== "QUEUED" &&
    state.leadDeliveryStatus !== "SENT" &&
    PRE_QUEUE_ALERT_PROMISE_RE.test(reply)
  ) {
    reasons.push(
      "Promised an alert, recording, share, or team contact before a handoff was queued."
    );
  }

  if (!contactComplete && PREFERRED_TIME_ASK_RE.test(reply)) {
    reasons.push(
      "Asked for preferred time before name, customer phone, and service address were captured."
    );
  }

  if (
    !state.preferredTiming &&
    (/\bi('ve| have) recorded your request\b/i.test(reply) ||
      /\bshared your request with the team\b/i.test(reply))
  ) {
    reasons.push("Claimed the request was recorded or shared before preferred time was captured.");
  }

  if (
    !state.preferredTiming &&
    contactComplete &&
    agreedToArrange(state) &&
    (state.currentObjective === "ADVANCE_TO_NEXT_STEP" ||
      state.currentObjective === "PRESENT_SOLUTION") &&
    !/\bwhat day or time would you prefer\b/i.test(reply)
  ) {
    reasons.push("Preferred time is missing; ask once for a preferred day or time.");
  }

  if (
    !state.preferredTiming &&
    contactComplete &&
    !agreedToArrange(state) &&
    PREFERRED_TIME_ASK_RE.test(reply) &&
    state.currentObjective !== "CLOSE"
  ) {
    reasons.push(
      "Asked for preferred time before the customer agreed to arrange the next step."
    );
  }

  if (
    contactComplete &&
    !agreedToArrange(state) &&
    !state.preferredTiming &&
    (state.currentObjective === "PRESENT_SOLUTION" ||
      state.currentObjective === "ADVANCE_TO_NEXT_STEP" ||
      state.currentObjective === "ANSWER") &&
    !!latestUserMessage?.trim() &&
    isCustomerNeedSpecific(state.customerNeed || state.primaryNeed) &&
    (looksLikeLeadFieldOnlyReply(latestUserMessage) ||
      isSubstantiveSalesFollowUp(latestUserMessage)) &&
    !messageAsksPricingOrBilling(latestUserMessage) &&
    replyIsGenericConsultationBoilerplate(reply) &&
    state.leadDeliveryStatus !== "QUEUED" &&
    state.leadDeliveryStatus !== "SENT"
  ) {
    reasons.push(
      "After contact details, resume the customer's sticky need with a real sales conversation instead of a generic consultation template."
    );
  }

  if (
    contactComplete &&
    business &&
    replyHasUnsupportedBusinessCapabilityClaim(reply, business)
  ) {
    reasons.push(
      "Claimed a business capability not supported by BusinessProfile; use general industry wording instead of we-handle/we-provide claims."
    );
  }

  if (
    contactComplete &&
    !!latestUserMessage?.trim() &&
    isSubstantiveSalesFollowUp(latestUserMessage) &&
    !messageAsksPricingOrBilling(latestUserMessage) &&
    (state.currentObjective === "ANSWER" ||
      state.currentObjective === "PRESENT_SOLUTION" ||
      state.currentObjective === "HANDLE_HESITATION" ||
      state.currentObjective === "EXPLAIN_VALUE") &&
    replyIsGenericConsultationBoilerplate(reply)
  ) {
    reasons.push(
      "Replied with generic consultation boilerplate instead of answering the customer's substantive question or concern."
    );
  }

  if (
    state.leadDeliveryStatus === "FAILED" &&
    /\b(shared your request with the team|alert(ed)? the team|the team (has been|was) (notified|alerted)|i('ve| have) (sent|shared) (your|the) request)\b/i.test(
      reply
    ) &&
    !isFailedLeadHandoffCustomerMessage(reply)
  ) {
    reasons.push("Claimed the team was alerted after the request could not be sent.");
  }

  if (
    state.leadDeliveryStatus === "QUEUED" &&
    isQueuedLeadHandoffCustomerMessage(reply) === false &&
    FALSE_HANDOFF_RE.test(reply)
  ) {
    reasons.push(
      "Claimed the request was shared with the team while delivery is still queued."
    );
  }

  if (
    state.leadDeliveryStatus !== "SENT" &&
    FALSE_HANDOFF_RE.test(reply)
  ) {
    const allowedFailedFallback =
      state.leadDeliveryStatus === "FAILED" &&
      isFailedLeadHandoffCustomerMessage(reply);
    const allowedQueuedContact =
      state.leadDeliveryStatus === "QUEUED" &&
      isQueuedLeadHandoffCustomerMessage(reply);
    if (!allowedFailedFallback && !allowedQueuedContact) {
      reasons.push(
        "Claimed successful lead handoff/notification when the request was not shared with the team."
      );
    }
  }

  if (
    state.leadDeliveryStatus === "SENT" &&
    isSuccessfulLeadHandoffCustomerMessage(reply) === false &&
    state.currentObjective === "CLOSE" &&
    /\b(lead hasn'?t|office hasn'?t|not been sent|not been reached)\b/i.test(reply)
  ) {
    reasons.push("Closing message must not expose internal delivery status.");
  }

  if (PAYMENT_PUSH_RE.test(reply)) {
    reasons.push("Pushed payment collection / arrange-payment language.");
  }

  if (
    INVENTED_SCHEDULE_RANGE_RE.test(reply) &&
    !(
      state.preferredTiming &&
      reply.toLowerCase().includes(state.preferredTiming.toLowerCase())
    )
  ) {
    reasons.push("Invented future scheduling range or time-window menu.");
  }

  if (
    SAME_DAY_PROMISE_RE.test(reply) &&
    (!business || !knowledgeAllowsSameDay(businessKnowledgeBlob(business)))
  ) {
    reasons.push("Promised same-day service that is not configured in BusinessProfile.");
  }

  const timingAckTurn =
    state.currentObjective === "ADVANCE_TO_NEXT_STEP" &&
    (!!state.preferredTiming || state.urgency === "IMMEDIATE")
      ? true
      : state.currentObjective === "COLLECT_ADDRESS" && !!state.preferredTiming;
  if (timingAckTurn && mentionsSiteVisitFee(reply)) {
    reasons.push("Repeated site-visit fee after the customer asked about visit timing.");
  }

  if (
    mentionsSiteVisitFee(reply) &&
    state.siteVisitFeeMentioned &&
    !state.customerAskedAboutFee
  ) {
    reasons.push("Repeated site-visit fee after it was already mentioned.");
  }

  if (mentionsSiteVisitFee(reply)) {
    const allowedContext =
      state.customerAskedAboutFee ||
      state.currentObjective === "PRESENT_SOLUTION" ||
      state.currentObjective === "EXPLAIN_VALUE" ||
      state.currentObjective === "HANDLE_PRICE_OBJECTION" ||
      (state.currentObjective === "ADVANCE_TO_NEXT_STEP" && !state.preferredTiming);
    if (!allowedContext) {
      reasons.push("Mentioned site-visit fee when it was not relevant.");
    }
  }

  const sentenceCount = reply
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
  if (
    sentenceCount > (messageAsksPricingOrBilling(latestUserMessage || "") ? 6 : 3) &&
    (timingAckTurn ||
      mentionsSiteVisitFee(reply) ||
      state.currentObjective === "ADVANCE_TO_NEXT_STEP")
  ) {
    reasons.push("Reply longer than 1–3 sentences without a request for detail.");
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function recordSiteVisitFeeMention(
  state: SalesState,
  reply: string
): SalesState {
  if (!mentionsSiteVisitFee(reply)) return state;
  return { ...state, siteVisitFeeMentioned: true };
}

export function buildValidationCorrection(
  state: SalesState,
  reasons: string[],
  business?: BusinessProfile
): string {
  const successClose = buildSuccessfulLeadHandoffCustomerMessage(
    state.lead.name,
    state.preferredTiming
  );
  const failedFallback = business
    ? buildFailedLeadHandoffCustomerMessage(business)
    : "We're unable to send your request to the team at the moment. Please contact the business directly.";
  return `
CORRECTION — previous draft violated Sales Controller rules:
${reasons.map((r) => `- ${r}`).join("\n")}

Rewrite the response.
Pursue ONLY currentObjective=${state.currentObjective}.
Ask at most ONE question.
Do not ask for already-collected or refused lead fields.
Do not re-ask an owner-required question the customer already answered.
Do not invent prices, availability, booking, or dispatch.
Never arrange payment, say pay now, or collect a fee.
Mention an owner-set site-visit fee at most once unless the customer asks about it again.
If the customer just asked about visit timing, do not mention the fee.
Never say "we'll arrange a site assessment" or imply the appointment is confirmed.
Never invent next week / 2–4 weeks / later menus.
Keep the reply to 1–3 sentences unless they asked for more detail.
Never mention email, SMS, delivery status, "the lead hasn't been sent", "the office hasn't been reached", or "handoff failed".
Never claim an appointment is booked.
${
  state.leadDeliveryStatus === "SENT"
    ? `If acknowledging the captured request, use this meaning: "${successClose}"`
    : state.leadDeliveryStatus === "QUEUED"
      ? `If acknowledging the captured request, use this meaning: "${buildQueuedLeadHandoffCustomerMessage(state.lead.name, state.preferredTiming)}" Do not say the request was shared with the team.`
    : state.leadDeliveryStatus === "FAILED"
      ? `If acknowledging the captured request, use this meaning: "${failedFallback}" Do not claim the team was alerted.`
      : isLeadContactComplete(state) && !state.preferredTiming && agreedToArrange(state)
        ? `Do not claim an alert, recording, or team contact. Ask once for preferred time: "${SITE_ASSESSMENT_TEAM_ALERT_ASK}"`
        : isLeadContactComplete(state) && !agreedToArrange(state)
          ? `Do not claim an alert, recording, or team contact. Give a short helpful next-step explanation and ask whether they would like to arrange it. Do not ask preferred time yet. Do not start with Thanks, {name}.`
          : isLeadContactComplete(state) && !state.customerAgreed && !!state.preferredTiming
          ? `Do not claim an alert, recording, or team contact. Preferred time is known. Ask once for agreement: "${ASK_EXPLICIT_AGREEMENT}"`
        : `Do not claim the request was recorded, shared, or that the team will contact them. Ask only for the next missing field among name, customer phone, and service address. Acknowledge the stated problem briefly before the name question. Do not ask preferred time, property type, or troubleshooting. Do not give the business phone number.`
}
Do not give DIY tutorials or technician dumps.
If objective is CLOSE: give the final message then STOP. No questions. No access asks. No "anything else?".
If the customer asked about price, answer the price question and do not repeat request-delivery language.
Keep it natural and concise.
`.trim();
}
