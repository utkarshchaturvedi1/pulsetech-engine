import { BusinessProfile } from "../types/business";
import { evaluateHandoffReadiness } from "./leadHandoffShared";
import {
  INVENTED_SCHEDULE_RANGE_RE,
  INTERNAL_HANDOFF_STATUS_RE,
  SAME_DAY_PROMISE_RE,
  SITE_ASSESSMENT_TEAM_ALERT_ASK,
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

const PREMATURE_SUCCESS_CLOSE_RE =
  /\b(i('ve| have) recorded your request|shared your request with the team|i('ll| will) alert the team|alert(ed)? the team|the team will (confirm|contact|call|reach)|our team will confirm)\b/i;

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
    business.pricingRules || "",
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
    /\b(i need|i want|need help|need a|need an|needs? to be|fix this|repair|estimate|quote)\b/.test(
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
    !/^[A-Za-z](?:[A-Za-z.'-]{0,40})?(?:\s+[A-Za-z][A-Za-z.'-]{1,40})?$/.test(
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
    /\b(treatment|inspection|repair|install|replace|service|quote|estimate)\b/i.test(
      t
    );

  const looksLikeGenericProviderRequest =
    /^(hi[,!.]?\s*)?(i\s+)?(need|want|looking for)\s+(a|an|some|someone|help)?\s*[\w\s-]{1,40}\.?$/i.test(
      t
    ) ||
    /\bi need (a|an)\s+[\w-]+(\s+(company|service|person|tech|technician|contractor))?\b/i.test(
      t
    ) ||
    /\bneed help with (my )?(house|home|place|property)\b/i.test(t);

  if (hasConcreteProblem) return true;
  if (hasServiceRequestNoun) return true;
  if (/\b(i need|i want|can you (do|help|fix)|looking for|help with)\b/i.test(t)) {
    const wordCount = t.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 4) return true;
  }
  if (looksLikeGenericProviderRequest) return false;

  const wordCount = t.split(/\s+/).filter(Boolean).length;
  return wordCount >= 8 && !/^i need .+$/i.test(t);
}

function requiredFieldsForIntent(intent: SalesIntent): Array<keyof LeadFields> {
  if (intent === "HIGH" || intent === "READY_TO_ACT") {
    return ["name", "phone", "address"];
  }
  return ["name", "phone", "address"];
}

function missingLeadFields(state: SalesState): Array<keyof LeadFields> {
  return state.requiredLeadFields.filter(
    (field) => !state.lead[field] && !state.refusedLeadFields.includes(field)
  );
}

function isLeadSecured(state: SalesState): boolean {
  return state.requiredLeadFields.every((field) => !!state.lead[field]);
}

function detectLeadRefusal(text: string): {
  refused: Array<keyof LeadFields>;
  priceGated: boolean;
} {
  const t = text.toLowerCase();
  const priceGated =
    /\b(until|before|without).{0,40}(price|cost|know how much|pricing)\b/.test(
      t
    ) ||
    /\b(don'?t|do not|won'?t|will not|not).{0,40}(give|share|provide).{0,40}(info|information|details|name|phone|number|address).{0,40}(until|before|without).{0,40}(price|cost)\b/.test(
      t
    );

  const refused: Array<keyof LeadFields> = [];

  if (
    /\b(don'?t|do not|won'?t|will not|not).{0,40}(give|share|provide).{0,40}(my )?name\b/.test(
      t
    )
  ) {
    refused.push("name");
  }
  if (
    /\b(don'?t|do not|won'?t|will not|not).{0,40}(give|share|provide).{0,40}(my )?(phone|number)\b/.test(
      t
    )
  ) {
    refused.push("phone");
  }
  if (
    /\b(don'?t|do not|won'?t|will not|not).{0,40}(give|share|provide).{0,40}(my )?address\b/.test(
      t
    )
  ) {
    refused.push("address");
  }
  if (
    /\b(don'?t|do not|won'?t|will not|not).{0,40}(give|share|provide).{0,40}(my )?(info|information|details|personal)\b/.test(
      t
    ) ||
    priceGated
  ) {
    (["name", "phone", "address"] as Array<keyof LeadFields>).forEach(
      (field) => {
        if (!refused.includes(field)) refused.push(field);
      }
    );
  }

  return { refused, priceGated };
}

/**
 * Final conversation closure / proceed language.
 * Bare "yes" / "okay" alone is NOT final closure — that is next-step agreement only.
 */
export function detectCustomerAgreement(text: string): boolean {
  const t = text.trim().toLowerCase();
  // Explicit proceed / book language (not bare affirmatives).
  if (
    /\b(let'?s do it|let'?s (move forward|proceed|schedule)|go ahead|please go ahead|please proceed|sign me up|i(?:'d| would) like to (move forward|proceed|get this done)|okay[,.]? let'?s|yes[,.]? let'?s|yes[,.]?\s*please|book it|schedule it|i want (the|that) service|please have someone (contact|call|come)|send (this|it) to the team)\b/i.test(
      t
    )
  ) {
    return true;
  }
  return /^yes[,.]?\s*please[.!]?$/i.test(t);
}

/** Bare affirmative to the immediately preceding proposal (visit/estimate/etc.). */
export function isBareAffirmative(text: string): boolean {
  return /^(yes|yeah|yep|sure|ok|okay|sounds good|that works|yes please)[.!]?$/i.test(
    text.trim()
  );
}

function lastAssistantMessage(
  messages: Array<{ role: string; content: string }>
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "assistant") return messages[i].content || "";
  }
  return "";
}

function assistantProposedNextStep(assistantText: string): boolean {
  return /\b(visit|estimate|inspection|appointment|come out|schedule|arrange|on[- ]?site|next step|move forward)\b/i.test(
    assistantText
  );
}

/** Customer indicates the conversation/info capture is finished (natural endpoint). */
function detectCustomerFinished(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /\b(that'?s (all|everything|it)|nothing (else|more)|no more|i (think i )?have (it |everything )?(all )?covered|that'?s all i needed|i(?:'m| am) (all )?good|all set|no more (questions|info|information)|i think that'?s (it|all)|everything (is )?covered)\b/i.test(
      t
    ) ||
    /^(no[,.]?\s*)?(that'?s (all|everything|it)|nothing (else|more)|i'?m good|all set)\.?$/i.test(
      t
    ) ||
    /^(no[,.]?\s*)?that'?s it\.?$/i.test(t)
  );
}

function isLeadContactComplete(state: SalesState): boolean {
  return Boolean(
    state.lead.name?.trim() &&
      state.lead.phone?.trim() &&
      state.lead.address?.trim()
  );
}

export const PRE_CONTACT_ASK_FIRST_NAME = "What's your first name?";
export const PRE_CONTACT_ASK_PHONE =
  "What's the best phone number to reach you?";
export const PRE_CONTACT_ASK_ADDRESS = "What's the service address?";

export function resolveDeterministicPreContactReply(
  state: SalesState,
  business?: BusinessProfile,
  latestUserMessage?: string
): string | null {
  if (state.leadCapturePaused) return null;
  if (
    state.leadDeliveryStatus === "QUEUED" ||
    state.leadDeliveryStatus === "SENT"
  ) {
    return null;
  }
  const highIntent =
    state.intent === "HIGH" ||
    state.intent === "READY_TO_ACT" ||
    state.leadStatus === "SECURING";
  if (!highIntent || isLeadContactComplete(state)) return null;

  const missing = missingLeadFields(state);
  const first = state.lead.name?.trim().split(/\s+/)[0];
  let prefix = "We can help with that.";
  let ask = PRE_CONTACT_ASK_FIRST_NAME;
  if (missing[0] === "phone") {
    prefix = first ? `Thanks, ${first}.` : "Thanks.";
    ask = PRE_CONTACT_ASK_PHONE;
  } else if (missing[0] === "address") {
    prefix = first ? `Thanks, ${first}.` : "Thanks.";
    ask = PRE_CONTACT_ASK_ADDRESS;
  } else if (missing[0] && missing[0] !== "name") {
    return null;
  }

  let reply = `${prefix} ${ask}`;
  if (
    visitorAllowsBusinessPhone(
      latestUserMessage,
      state.leadDeliveryStatus === "FAILED"
    ) &&
    business?.phone?.trim()
  ) {
    reply = `You can reach us at ${business.phone.trim()}. ${reply}`;
  }
  return reply;
}

function isV1LeadComplete(state: SalesState): boolean {
  return (
    state.leadStatus === "SECURED" &&
    isLeadSecured(state) &&
    isCustomerNeedSpecific(state.customerNeed) &&
    missingLeadFields(state).length === 0
  );
}

function visitorAllowsBusinessPhone(
  latestUserMessage: string | undefined,
  deliveryFailed: boolean
): boolean {
  if (deliveryFailed) return true;
  const t = (latestUserMessage || "").toLowerCase();
  if (!t) return false;
  if (
    /\b(what(?:'s| is) (your|the) (phone )?number|your (phone )?number|number to (call|reach)|give me (your|the) number|can i (have|get) (your|the) number)\b/.test(
      t
    )
  ) {
    return true;
  }
  return /\b(emergency|danger|dangerous|immediate help|life[- ]threat|gas leak|carbon monoxide|on fire)\b/.test(
    t
  );
}

function replyExposesBusinessPhone(
  reply: string,
  business?: BusinessProfile
): boolean {
  if (/\bif you prefer to call\b/i.test(reply)) return true;
  if (!business?.phone) return false;
  const digits = business.phone.replace(/\D/g, "");
  if (digits.length < 7) return false;
  return reply.replace(/\D/g, "").includes(digits);
}

/**
 * handoffReady is the central capture+proceed decision — not SECURED and not
 * service-keyword matching.
 */
function computeHandoffReady(state: SalesState, latestUserText: string): boolean {
  return evaluateHandoffReadiness(state, latestUserText).handoffReady;
}

function detectSalesObjective(text: string): SalesObjective | null {
  const t = text.toLowerCase();

  if (
    /\b(another (company|one|provider|plumber|contractor)|competitor|cheaper|less expensive|quoted me less)\b/.test(
      t
    )
  ) {
    return "HANDLE_COMPETITOR_OBJECTION";
  }

  if (
    /\b(too expensive|more than i expected|cost too much|pricey|how much|what(?:'s| is) the (price|cost|charge|fee)|pricing|diagnostic fee|is there a fee|how (do|does|are) (you|y'?all|the (company|team)) charge|hourly or|fixed (price|rate|fee)|full work|billing)\b/.test(
      t
    )
  ) {
    return "HANDLE_PRICE_OBJECTION";
  }

  if (
    /\b(not sure|need to think|think about it|hesitat|why (should|would) i (choose|go with)|worth it)\b/.test(
      t
    )
  ) {
    if (/\bwhy (should|would) i (choose|go with)\b/.test(t)) {
      return "EXPLAIN_VALUE";
    }
    return "HANDLE_HESITATION";
  }

  if (
    /\b(recommend|what (should|would) you|what(?:'s| is) (my|the) (best|option))\b/.test(
      t
    )
  ) {
    return "PRESENT_SOLUTION";
  }

  if (detectCustomerAgreement(text)) {
    return "CLOSE";
  }

  if (/\b(next step|how do i (start|proceed)|get started)\b/.test(t)) {
    return "ADVANCE_TO_NEXT_STEP";
  }

  if (
    /\b(can you come|are you available|come tomorrow|come today|schedule|appointment|arrange)\b/.test(
      t
    )
  ) {
    return "ADVANCE_TO_NEXT_STEP";
  }

  return null;
}

function looksLikeLeadFieldOnlyReply(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (extractPhone(t) && t.replace(PHONE_RE, "").trim().length < 8) return true;
  if (extractEmail(t) && t.replace(EMAIL_RE, "").trim().length < 8) return true;
  if (ADDRESS_HINT_RE.test(t) && t.split(/\s+/).length <= 12) return true;
  if (/^[A-Za-z][A-Za-z.'-]{1,40}(?:\s+[A-Za-z][A-Za-z.'-]{1,40})?$/.test(t)) {
    return true;
  }
  return false;
}


function selectObjective(state: SalesState, latestUserText: string): SalesObjective {
  // After lead capture / handoff attempt, answer new questions — do not reopen lead capture.
  if (
    state.leadDeliveryStatus === "SENT" ||
    state.leadDeliveryStatus === "QUEUED" ||
    state.leadDeliveryStatus === "FAILED"
  ) {
    const postSend = detectSalesObjective(latestUserText);
    if (
      postSend === "HANDLE_PRICE_OBJECTION" ||
      postSend === "HANDLE_COMPETITOR_OBJECTION" ||
      postSend === "HANDLE_HESITATION" ||
      postSend === "PRESENT_SOLUTION" ||
      postSend === "EXPLAIN_VALUE"
    ) {
      return postSend;
    }
    if (
      /\?/.test(latestUserText) ||
      /\b(what|how|can you|do you|is there|how much|cost|price)\b/i.test(
        latestUserText
      )
    ) {
      return "ANSWER";
    }
    return "ANSWER";
  }

  const visitPreference = detectVisitPreferenceRequest(latestUserText);

  if (visitPreference) {
    const missing = missingLeadFields(state);
    if (missing[0] === "name") return "COLLECT_NAME";
    if (missing[0] === "phone") return "COLLECT_PHONE";
    if (missing[0] === "address") return "COLLECT_ADDRESS";
    if (messageAsksPricingOrBilling(latestUserText) && isV1LeadComplete(state)) {
      return "HANDLE_PRICE_OBJECTION";
    }
    return "ADVANCE_TO_NEXT_STEP";
  }

  if (state.customerAgreed || detectCustomerAgreement(latestUserText)) {
    const missing = missingLeadFields(state);
    if (missing[0] === "name") return "COLLECT_NAME";
    if (missing[0] === "phone") return "COLLECT_PHONE";
    if (missing[0] === "address") return "COLLECT_ADDRESS";
    if (!state.preferredTiming) return "ADVANCE_TO_NEXT_STEP";
    return "CLOSE";
  }

  // Natural completion + V1 lead complete → close immediately (no more questions).
  if (isV1LeadComplete(state) && detectCustomerFinished(latestUserText)) {
    return "CLOSE";
  }

  const salesObjective = detectSalesObjective(latestUserText);

  // Lead refusal / price-gated: preserve opportunity over form capture.
  if (state.leadCapturePaused && state.leadStatus !== "SECURED") {
    if (salesObjective === "HANDLE_PRICE_OBJECTION") {
      return "HANDLE_PRICE_OBJECTION";
    }
    if (salesObjective === "HANDLE_COMPETITOR_OBJECTION") {
      return "HANDLE_COMPETITOR_OBJECTION";
    }
    if (salesObjective === "HANDLE_HESITATION") {
      return "HANDLE_HESITATION";
    }
    if (!isCustomerNeedSpecific(state.customerNeed)) {
      return "UNDERSTAND_NEED";
    }
    return salesObjective || "PRESENT_SOLUTION";
  }

  if (state.leadStatus !== "SECURED") {
    // Price/objection while still securing: handle it instead of forcing next field.
    if (
      salesObjective === "HANDLE_PRICE_OBJECTION" ||
      salesObjective === "HANDLE_COMPETITOR_OBJECTION" ||
      salesObjective === "HANDLE_HESITATION"
    ) {
      return salesObjective;
    }

    const missing = missingLeadFields(state);
    if (
      state.intent === "HIGH" ||
      state.intent === "READY_TO_ACT" ||
      state.leadStatus === "SECURING"
    ) {
      if (missing[0] === "name") return "COLLECT_NAME";
      if (missing[0] === "phone") return "COLLECT_PHONE";
      if (missing[0] === "email") return "COLLECT_EMAIL";
      if (missing[0] === "address") return "COLLECT_ADDRESS";
    }

    if (state.intent === "LOW") {
      return "ANSWER";
    }

    if (state.intent === "MEDIUM") {
      return isCustomerNeedSpecific(state.customerNeed)
        ? "EXPLAIN_VALUE"
        : "UNDERSTAND_NEED";
    }

    return "UNDERSTAND_NEED";
  }

  if (salesObjective) {
    // Timing preference already captured: do not keep refining windows.
    if (
      salesObjective === "ADVANCE_TO_NEXT_STEP" &&
      isV1LeadComplete(state) &&
      !!state.preferredTiming &&
      !detectVisitPreferenceRequest(latestUserText) &&
      !extractPreferredTiming(latestUserText)
    ) {
      return "PRESENT_SOLUTION";
    }
    return salesObjective;
  }

  if (state.salesStage === "CLOSING" || state.salesStage === "COMPLETED") {
    return "CLOSE";
  }

  if (!isCustomerNeedSpecific(state.customerNeed)) {
    return "UNDERSTAND_NEED";
  }

  if (looksLikeLeadFieldOnlyReply(latestUserText)) {
    if (isV1LeadComplete(state) && !state.preferredTiming) {
      return "ADVANCE_TO_NEXT_STEP";
    }
    return isCustomerNeedSpecific(state.customerNeed)
      ? "PRESENT_SOLUTION"
      : "UNDERSTAND_NEED";
  }

  if (isV1LeadComplete(state) && !state.preferredTiming) {
    if (/\?/.test(latestUserText) && !detectVisitPreferenceRequest(latestUserText)) {
      return "ANSWER";
    }
    return "ADVANCE_TO_NEXT_STEP";
  }

  return "PRESENT_SOLUTION";
}

function buildSummary(state: SalesState): string {
  const leadParts = Object.entries(state.lead)
    .filter(([, value]) => !!value)
    .map(([key, value]) => `${key}=${value}`);

  return [
    `intent=${state.intent}`,
    `stage=${state.salesStage}`,
    `leadStatus=${state.leadStatus}`,
    `objective=${state.currentObjective}`,
    state.customerNeed ? `need=${state.customerNeed}` : null,
    `urgency=${state.urgency}`,
    state.preferredTiming ? `timing=${state.preferredTiming}` : null,
    state.leadCapturePaused ? "leadCapture=PAUSED" : null,
    state.customerAgreed ? "customerAgreed=true" : null,
    state.handoffReady ? "handoffReady=true" : "handoffReady=false",
    state.siteVisitFeeMentioned ? "siteVisitFeeMentioned=true" : null,
    state.refusedLeadFields.length
      ? `refused=${state.refusedLeadFields.join(",")}`
      : null,
    leadParts.length ? `lead{${leadParts.join(", ")}}` : "lead{}",
    state.objections.length
      ? `objections=${state.objections.join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function updateSalesStateFromTurn(
  previous: SalesState | null | undefined,
  messages: ChatTurnMessage[],
  _business: BusinessProfile
): SalesState {
  const state: SalesState = previous
    ? normalizeSalesState({
        ...previous,
        lead: { ...previous.lead },
        establishedFacts: [...(previous.establishedFacts || [])],
        customerContext: [...(previous.customerContext || [])],
        objections: [...(previous.objections || [])],
        requiredLeadFields: [...(previous.requiredLeadFields || [])],
        refusedLeadFields: [...(previous.refusedLeadFields || [])],
        siteVisitFeeMentioned: previous.siteVisitFeeMentioned ?? false,
      })
    : createInitialSalesState();

  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  const text = latestUser?.content?.trim() || "";

  state.customerAskedAboutFee = customerAskedAboutFee(text);
  state.siteVisitFeeLabel = extractSiteVisitFeeLabel(_business);
  const priorAssistantFee = messages.some(
    (m) => m.role === "assistant" && mentionsSiteVisitFee(m.content)
  );
  if (priorAssistantFee) {
    state.siteVisitFeeMentioned = true;
  }

  if (!text) {
    state.summary = buildSummary(state);
    return state;
  }

  const detectedIntent = detectIntent(text);
  const confirmationReply = isFieldConfirmationReply(text);
  // Low-intent browsing should not permanently overwrite an active high-intent journey
  // unless the conversation is still in discovery with no lead progress.
  // Confirmation replies ("yes", "correct") never reset an in-progress capture.
  if (
    detectedIntent === "LOW" &&
    state.leadStatus === "NOT_SECURED" &&
    !state.lead.name &&
    !confirmationReply &&
    !isBareAffirmative(text)
  ) {
    state.intent = "LOW";
  } else {
    state.intent = maxIntent(state.intent, detectedIntent);
  }

  const urgency = detectSchedulingUrgency(text);
  if (urgency) {
    state.urgency = maxUrgency(state.urgency, urgency);
    state.establishedFacts = addFact(
      state.establishedFacts,
      `Customer stated urgency: ${state.urgency}`
    );
  }

  const timing =
    extractPreferredTiming(text) ||
    state.preferredTiming ||
    extractPreferredTimingFromHistory(messages);
  if (timing) {
    const refined = refinePreferredTiming(state.preferredTiming, timing);
    state.preferredTiming = refined;
    state.establishedFacts = addFact(
      state.establishedFacts,
      `preferredTiming=${refined}`
    );
  }

  const contactPreference = extractContactPreference(text);
  if (contactPreference) {
    state.contactPreference = contactPreference;
    state.establishedFacts = addFact(
      state.establishedFacts,
      `contactPreference=${contactPreference}`
    );
  }

  if (/\b(i(?:'m| am) home|someone (will be|is) home|i(?:'ll| will) be home)\b/i.test(text)) {
    state.customerAvailable = true;
    state.establishedFacts = addFact(
      state.establishedFacts,
      "Customer indicated someone will be available"
    );
  }

  if (
    /\b(don'?t want (an )?appointment|no appointment|not ready to (book|schedule))\b/i.test(
      text
    )
  ) {
    state.appointmentIntent = false;
    state.establishedFacts = addFact(
      state.establishedFacts,
      "Customer does not want an appointment right now"
    );
  }

  if (
    /\b(schedule|book|come out|send someone|appointment)\b/i.test(text) &&
    state.appointmentIntent !== false
  ) {
    state.appointmentIntent = true;
  }

  const priorAssistant = lastAssistantMessage(messages);
  const confirmingName =
    confirmationReply && assistantAskedToConfirmName(priorAssistant);
  if (confirmingName && !isAuthoritativePersonName(state.lead.name)) {
    const candidate =
      extractName(previousUserMessage(messages), "COLLECT_NAME") ||
      extractNameCandidateFromAssistant(priorAssistant) ||
      (state.lead.name && isPlausiblePersonName(state.lead.name)
        ? state.lead.name
        : null);
    if (candidate) {
      assignLeadName(state, candidate);
    }
  }

  if (detectCustomerAgreement(text)) {
    state.customerAgreed = true;
    state.establishedFacts = addFact(
      state.establishedFacts,
      "Customer agreed to proceed"
    );
  } else if (!confirmingName && isBareAffirmative(text)) {
    // Agreeing to the prior proposal (visit/estimate) — not final conversation closure.
    if (
      assistantProposedNextStep(priorAssistant) &&
      state.appointmentIntent !== false
    ) {
      state.appointmentIntent = true;
      state.establishedFacts = addFact(
        state.establishedFacts,
        "Customer agreed to the proposed next step"
      );
    }
  }

  const refusal = detectLeadRefusal(text);
  if (refusal.refused.length > 0) {
    state.refusedLeadFields = Array.from(
      new Set([...state.refusedLeadFields, ...refusal.refused])
    );
    state.leadCapturePaused = true;
    state.objections = addObjection(
      state.objections,
      refusal.priceGated
        ? "Customer refused lead details until pricing is clear"
        : "Customer refused to provide lead information"
    );
    state.establishedFacts = addFact(
      state.establishedFacts,
      `Lead capture paused; refused fields: ${refusal.refused.join(", ")}`
    );
  }

  // If customer later volunteers a refused field, clear that refusal.
  state.customerNeed = inferCustomerNeed(
    text,
    state.primaryNeed || state.customerNeed
  );
  if (!state.primaryNeed && state.customerNeed) {
    state.primaryNeed = state.customerNeed;
  } else if (state.primaryNeed) {
    state.customerNeed = state.primaryNeed;
  }

  for (const note of extractCustomerContextNotes(text)) {
    state.customerContext = addFact(state.customerContext, note);
  }

  if (!confirmationReply) {
    const name = extractName(text, state.currentObjective, priorAssistant);
    if (name) {
      if (!state.lead.name || shouldReplaceCapturedName(state.lead.name, name, text)) {
        assignLeadName(state, name);
      }
    }
  }

  const phone = extractPhone(text);
  if (phone && !state.lead.phone) {
    state.lead.phone = phone;
    state.establishedFacts = addFact(state.establishedFacts, `phone=${phone}`);
    state.refusedLeadFields = state.refusedLeadFields.filter((f) => f !== "phone");
  }

  const email = extractEmail(text);
  if (email && !state.lead.email) {
    state.lead.email = email;
    state.establishedFacts = addFact(state.establishedFacts, `email=${email}`);
    state.refusedLeadFields = state.refusedLeadFields.filter((f) => f !== "email");
  }

  const address = extractAddress(text, state.currentObjective);
  if (address && !state.lead.address) {
    state.lead.address = address;
    state.establishedFacts = addFact(
      state.establishedFacts,
      `address=${address}`
    );
    state.refusedLeadFields = state.refusedLeadFields.filter(
      (f) => f !== "address"
    );
  }

  if (
    state.leadCapturePaused &&
    state.requiredLeadFields.every(
      (field) => !!state.lead[field] || state.refusedLeadFields.includes(field)
    ) === false &&
    state.requiredLeadFields.some((field) => !!state.lead[field])
  ) {
    // Keep paused until customer resumes OR all required are filled.
  }

  if (
    state.leadCapturePaused &&
    state.requiredLeadFields.every((field) => !!state.lead[field])
  ) {
    state.leadCapturePaused = false;
  }

  if (detectSalesObjective(text) === "HANDLE_COMPETITOR_OBJECTION") {
    state.objections = addObjection(state.objections, "Competitor price concern");
  }
  if (
    detectSalesObjective(text) === "HANDLE_PRICE_OBJECTION" &&
    /\b(too expensive|more than i expected|cost too much|pricey)\b/i.test(text)
  ) {
    state.objections = addObjection(state.objections, "Price concern");
  }
  if (detectSalesObjective(text) === "HANDLE_HESITATION") {
    state.objections = addObjection(state.objections, "Hesitation / uncertainty");
  }

  if (state.intent === "HIGH" || state.intent === "READY_TO_ACT") {
    const required = requiredFieldsForIntent(state.intent);
    const merged = Array.from(
      new Set([...state.requiredLeadFields, ...required])
    ) as Array<keyof LeadFields>;
    state.requiredLeadFields = merged;
  }

  if (state.intent === "HIGH" || state.intent === "READY_TO_ACT") {
    if (isLeadSecured(state)) {
      state.leadStatus = "SECURED";
      state.salesStage = state.customerAgreed ? "CLOSING" : "SALES_MODE";
      state.leadCapturePaused = false;
    } else {
      state.leadStatus = "SECURING";
      state.salesStage = "SECURING_LEAD";
    }
  } else if (state.leadStatus !== "SECURED") {
    state.leadStatus = "NOT_SECURED";
    state.salesStage = "DISCOVERY";
  }

  const objective = selectObjective(state, text);
  state.currentObjective = objective;

  if (
    objective === "HANDLE_PRICE_OBJECTION" ||
    objective === "HANDLE_COMPETITOR_OBJECTION" ||
    objective === "HANDLE_HESITATION"
  ) {
    state.salesStage =
      state.leadStatus === "SECURED" || state.leadCapturePaused
        ? "OBJECTION"
        : state.salesStage;
  }

  if (objective === "CLOSE" || objective === "ADVANCE_TO_NEXT_STEP") {
    state.salesStage = "CLOSING";
  }

  if (state.leadStatus === "SECURED" && state.salesStage === "SECURING_LEAD") {
    state.salesStage = "SALES_MODE";
  }

  if (state.customerAgreed && isLeadSecured(state)) {
    state.salesStage = "COMPLETED";
  }

  state.handoffReady = computeHandoffReady(state, text);

  state.summary = buildSummary(state);
  return state;
}

export function buildTurnControlBlock(
  state: SalesState,
  business?: BusinessProfile
): string {
  const leadLines = Object.entries(state.lead)
    .map(([key, value]) => `- ${key}: ${value ?? "not collected"}`)
    .join("\n");

  const visibleFacts = state.establishedFacts.filter(
    (f) => !f.startsWith("leadDelivery=")
  );
  const facts =
    visibleFacts.length > 0
      ? visibleFacts.map((f) => `- ${f}`).join("\n")
      : "- none yet";

  const refused =
    state.refusedLeadFields.length > 0
      ? state.refusedLeadFields.join(", ")
      : "none";

  const objectiveDirective = objectiveInstruction(state, business);
  const failedFallback = business
    ? buildFailedLeadHandoffCustomerMessage(business)
    : "We're unable to send your request to the team at the moment. Please contact the business directly.";
  const successClose = buildSuccessfulLeadHandoffCustomerMessage(
    state.lead.name,
    state.preferredTiming
  );

  return `
==================================================
SALES CONTROLLER — CURRENT TURN (AUTHORITATIVE FOR THIS RESPONSE)
==================================================
The Sales Controller decides WHAT to accomplish this turn.
You decide HOW to say it naturally.
Do not invent a different objective.
Do not ask about already-established facts unless there is genuine ambiguity.
${
  isAuthoritativePersonName(state.lead.name)
    ? `Captured customer name (${state.lead.name}) is authoritative. Do not ask the visitor to confirm it.`
    : ""
}

Current state:
- intent: ${state.intent}
- salesStage: ${state.salesStage}
- leadStatus: ${state.leadStatus}
- currentObjective: ${state.currentObjective}
- customerNeed: ${state.customerNeed || "not established"}
- urgency: ${state.urgency}
- preferredTiming: ${state.preferredTiming || "not established"}
- customerAvailable: ${state.customerAvailable === null ? "unknown" : state.customerAvailable}
- appointmentIntent: ${state.appointmentIntent === null ? "unknown" : state.appointmentIntent}
- leadCapturePaused: ${state.leadCapturePaused}
- customerAgreed: ${state.customerAgreed}
- handoffReady: ${state.handoffReady}
- siteVisitFeeMentioned: ${state.siteVisitFeeMentioned}
- customerAskedAboutFee: ${state.customerAskedAboutFee}
- siteVisitFeeLabel: ${state.siteVisitFeeLabel || "none"}
- refusedLeadFields: ${refused}
- requiredLeadFields: ${state.requiredLeadFields.join(", ")}

Lead fields:
${leadLines}

Established facts (DO NOT ask again):
${facts}

Objections noted:
${state.objections.length ? state.objections.map((o) => `- ${o}`).join("\n") : "- none"}

Summary: ${state.summary}

${
  state.leadDeliveryStatus === "SENT" ||
  state.leadDeliveryStatus === "QUEUED" ||
  state.leadDeliveryStatus === "FAILED"
    ? `Lead capture is complete. Do NOT re-ask for name, phone, address, or other already-captured lead fields. You may still answer new customer questions (including price) without repeating closing/handoff language.`
    : ""
}

CUSTOMER-FACING REQUEST LANGUAGE:
Never mention email, SMS, delivery status, "lead", "handoff", or internal systems.
Never say "the lead hasn't been sent", "the office hasn't been reached", or "handoff failed".
Never claim an appointment is booked.
${
  state.leadDeliveryStatus === "SENT"
    ? `If this turn is a closing acknowledgement, use this meaning only: "${successClose}" If the customer asked a new question, answer that question and do not repeat the closing message.`
    : state.leadDeliveryStatus === "QUEUED"
      ? `Do NOT say you have shared the request with the team. If this turn is a closing acknowledgement, use this meaning only: "${buildQueuedLeadHandoffCustomerMessage(state.lead.name, state.preferredTiming)}" If the customer asked a new question, answer that question and do not repeat delivery language.`
    : state.leadDeliveryStatus === "FAILED"
      ? `Do NOT say the team was alerted or that the request was shared. If this turn is a closing acknowledgement, use this meaning only: "${failedFallback}" If the customer asked a new question, answer that question and do not mention request-delivery.`
      : `Do not claim the request was shared with the team. Continue capturing missing details one question at a time.`
}

${objectiveDirective}

HARD RULES FOR THIS RESPONSE:
1. Pursue ONLY the currentObjective above.
2. Ask at most ONE question if a question is needed.
3. Do not ask for multiple lead fields in one response.
4. Do not ask for fields already collected.
5. Do not ask for refusedLeadFields. If leadCapturePaused is true, do not resume lead capture unless the customer volunteers information.
6. Never claim to dispatch, schedule, book, confirm availability, reserve a slot, or send a technician — those capabilities are not connected.
7. Never invent prices, fees, warranties, visit durations, response times, brands, catalogs, discounts, or product availability unless explicitly in BusinessProfile / owner knowledge.
8. Do not provide DIY repair tutorials when the customer wants professional service. Brief safety-while-waiting guidance is allowed only for genuine hazards.
9. Do not dump the full BusinessProfile or unrelated services.
10. Sales mode is not technician mode — do not give long technical procedure dumps unless needed for the buying decision.
11. If customerAgreed is true / objective is CLOSE: stop overselling, no questionnaire, no extra questions — deliver the positive final handoff message only (request captured; team will confirm availability). Never use "I can't book / can't complete the booking" language. Do NOT ask "Anything else?", "One quick question...", or "Would you like me to...".
12. Prefer preserving the opportunity over forcing lead capture.
13. For COLLECT_* and UNDERSTAND_NEED: roughly one short sentence + one question.
14. Never expose internal delivery status. Never claim an appointment is booked.
15. Do NOT proactively ask for gate codes, pets, parking, doorman, or access instructions — the human team can collect those later unless the customer brings them up.
16. If preferredTiming is already established, do NOT keep refining appointment windows into smaller slots. Capture the preference and move on.
17. Keep the reply concise: normally 1–3 sentences unless the customer explicitly asked for a detailed explanation.
18. SITE VISIT FEE: mention an owner-provided site-visit fee at most once unless the customer asks about it again. If mentioning it, use a brief neutral line only: "A {fee} site-visit fee applies. The team can explain the details before any visit is confirmed." Never say arrange payment, pay now, or imply the AI collects payment. After a visit-timing question, do not mention the fee at all.
19. Never invent availability, dates, scheduling ranges, or a menu of time windows (no "next week, 2–4 weeks, or later"). Never imply a visit is booked or confirmed. Do not promise same-day service unless BusinessProfile explicitly includes that promise.
`.trim();
}

function objectiveInstruction(
  state: SalesState,
  business?: BusinessProfile
): string {
  switch (state.currentObjective) {
    case "COLLECT_NAME":
      return `YOUR ONLY OBJECTIVE: naturally collect the customer's first name only.
Respond with about one short sentence + exactly ONE question.
${
  isAuthoritativePersonName(state.lead.name)
    ? `A valid first name is already captured (${state.lead.name}). Do NOT ask the customer to confirm it. Move on — this objective should not re-open name confirmation.`
    : `If the customer just gave a normal first name (letters, not a sentence), treat it as captured. Do not ask "is your first name ...?". Ask for clarification only when the input is clearly not a name, is a single initial, or contains no usable letters.`
}
Respond with about one short sentence + exactly ONE question.
Do not ask for last name, phone, email, address, availability, property type, or technical details.
Do not diagnose, interrogate, or sell the service first.
Do not provide DIY instructions or a company brochure.`;
    case "COLLECT_PHONE":
      return `YOUR ONLY OBJECTIVE: naturally collect the customer's phone number.
Respond with about one short sentence + exactly ONE question.
Do not ask any other question. No brochure. No DIY.`;
    case "COLLECT_EMAIL":
      return `YOUR ONLY OBJECTIVE: naturally collect the customer's email.
Respond with about one short sentence + exactly ONE question.`;
    case "COLLECT_ADDRESS":
      return `YOUR ONLY OBJECTIVE: naturally collect the service address.
${
  state.preferredTiming
    ? `The customer already gave a preferred visit time (${state.preferredTiming}). Acknowledge it briefly without confirming availability and without claiming you already alerted the team. Then ask exactly ONE question for the service address. Do not re-ask name or phone.`
    : "Respond with about one short sentence + exactly ONE question."
}
Do not ask apartment number unless the customer volunteers ambiguity.
No brochure. No DIY. No solution pitch.
Never confirm an appointment or availability.`;
    case "UNDERSTAND_NEED":
      return `YOUR ONLY OBJECTIVE: understand the customer's need with the minimum necessary information.
Exactly ONE natural question.
Do not diagnose like a technician.
Do not ask leakage/timeline/equipment questions unless truly required for the next sales move.
No brochure. No DIY tutorial.`;
    case "ANSWER":
      return `YOUR ONLY OBJECTIVE: answer helpfully using BusinessProfile.
Do not force lead capture.
Keep it concise — no huge brochure.`;
    case "PRESENT_SOLUTION":
      return `YOUR ONLY OBJECTIVE: connect THIS customer's established need to the single most relevant BusinessProfile-supported solution.
Make it feel personalized ("based on what you've described...").
Explain benefit and a logical next step.
Do NOT list all services or dump technical procedure details.
Do NOT invent operational claims, brands, catalogs, prices, warranties, or discounts not in BusinessProfile.
Do NOT proactively ask about gate codes, pets, parking, or access instructions.
Do NOT offer invented timing menus such as next week / 2–4 weeks / later.
${
  state.preferredTiming
    ? `preferredTiming is already known (${state.preferredTiming}). Do NOT ask another timing/refinement question.`
    : "Do not ask for a preferred visit time here unless the Sales Controller objective is ADVANCE_TO_NEXT_STEP."
}
If the lead is already complete (name/phone/address/need) and the customer is not raising a new issue, prefer advancing toward natural closure rather than inventing another "quick question".`;
    case "EXPLAIN_VALUE":
      return `YOUR ONLY OBJECTIVE: explain why the relevant offering matters to THIS customer.
Use only BusinessProfile-supported differentiators. Ask at most ONE question if needed.
Do NOT invent brands, catalogs, prices, or warranties. Do NOT ask access/pet/parking questions.`;
    case "HANDLE_PRICE_OBJECTION":
      return `YOUR ONLY OBJECTIVE: handle the price/fee concern.
Acknowledge → answer honestly from BusinessProfile/owner knowledge only.
Never invent prices.
If the BusinessProfile does not establish hourly versus fixed/project pricing, say pricing depends on scope, fixtures/materials, and site assessment — the team will confirm the applicable approach. Do not invent hourly or fixed pricing.
${
  state.preferredTiming
    ? `Also acknowledge the preferred visit time (${state.preferredTiming}) naturally: note it for the team and that they will confirm availability. Do not claim the appointment is booked.`
    : ""
}
If leadCapturePaused, do NOT ask for refused lead fields.
Continue selling the value of the next step. Ask at most ONE clarifying question if needed.
Do not mention whether a request was shared, emailed, texted, or delivered unless this turn is the successful handoff acknowledgement.`;
    case "HANDLE_COMPETITOR_OBJECTION":
      return `YOUR ONLY OBJECTIVE: handle competitor/price comparison.
No invented superiority. Use BusinessProfile-supported facts only. Ask at most ONE clarifying question if needed.`;
    case "HANDLE_HESITATION":
      return `YOUR ONLY OBJECTIVE: handle hesitation without pressure.
Ask at most ONE clarifying question if needed.`;
    case "CROSS_SELL":
      return `YOUR ONLY OBJECTIVE: introduce ONE naturally relevant additional BusinessProfile offering only if useful and timely.
Do not ambush before the primary need is handled.`;
    case "ADVANCE_TO_NEXT_STEP": {
      const leadComplete = isV1LeadComplete(state);
      const needsTeamAck = leadComplete && !!state.preferredTiming;
      const successClose = buildSuccessfulLeadHandoffCustomerMessage(
        state.lead.name,
        state.preferredTiming
      );
      const failedFallback = business
        ? buildFailedLeadHandoffCustomerMessage(business)
        : "We're unable to send your request to the team at the moment. Please contact the business directly.";
      return `YOUR ONLY OBJECTIVE: advance toward the business's real next step.
Do not invent availability windows, dates, scheduling ranges, or a menu of time choices.
Never say "next week, 2–4 weeks, or later" or similar invented options.
Do NOT invent time slots such as 8–10, 10–12, 12–4, etc.
Never confirm an appointment or availability.
Never promise same-day service unless BusinessProfile explicitly includes that promise.
${
  needsTeamAck && state.leadDeliveryStatus === "SENT"
    ? `preferred_visit_time / preferredTiming is ${state.preferredTiming || "the earliest available time"}.
Do NOT ask for name, phone, or address if they are already captured.
Do NOT mention any site-visit fee, dollar amount, or payment.
Reply with this meaning (do not add extra scheduling options): "${successClose}"
Do NOT ask another timing/refinement question.`
    : needsTeamAck && state.leadDeliveryStatus === "QUEUED"
      ? `Do NOT claim the request was shared with the team. Reply with this meaning only: "${buildQueuedLeadHandoffCustomerMessage(state.lead.name, state.preferredTiming)}"`
    : needsTeamAck && state.leadDeliveryStatus === "FAILED"
      ? `Do NOT claim the team was alerted. Reply with this meaning only: "${failedFallback}"`
    : leadComplete
      ? `Lead is captured. Preferred time is still missing, so this is not a completed handoff. After the customer agrees to a site assessment / next step, reply with this meaning only: "${SITE_ASSESSMENT_TEAM_ALERT_ASK}"
Never say the request was recorded or shared with the team until preferred time is captured and delivery is queued or sent.
Never say "we'll arrange a site assessment" or otherwise imply the appointment is already confirmed or booked.
Do not offer arbitrary future options.`
      : `Name, customer phone, and service address are not all captured yet. Ask exactly ONE question for the next missing field only (${missingLeadFields(state)[0] || "name"}). Do not diagnose, interrogate, or sell the service. Do not ask property type or preferred time. Do not give the business phone number. Do not say the request was recorded or that the team will contact them.`
}
Do NOT ask for gate codes, pets, parking, or access instructions.
Capture the customer's preference for the team — you do not have live scheduling.`;
    }
    case "CLOSE": {
      const successClose = buildSuccessfulLeadHandoffCustomerMessage(
        state.lead.name,
        state.preferredTiming
      );
      const failedFallback = business
        ? buildFailedLeadHandoffCustomerMessage(business)
        : "We're unable to send your request to the team at the moment. Please contact the business directly.";
      return `YOUR ONLY OBJECTIVE: close / hand off cleanly with a positive FINAL message — then STOP.
Do NOT ask any question (no "Anything else?", no "One quick question...", no "Would you like me to...", no access/timing/confirmation questions).
Do NOT repeat the service explanation or visit/estimate process.
Do NOT pretend the appointment is already booked or that availability is already confirmed.
Do NOT say "I can't book", "I can't complete the booking", or similar limitation language.
Never mention email, SMS, delivery status, or internal systems.

Preferred closing style:
${
  state.leadDeliveryStatus === "SENT"
    ? `"${successClose}"`
    : state.leadDeliveryStatus === "QUEUED"
      ? `"${buildQueuedLeadHandoffCustomerMessage(state.lead.name, state.preferredTiming)}"`
    : state.leadDeliveryStatus === "FAILED"
      ? `"${failedFallback}"`
      : !isLeadContactComplete(state)
        ? `"Thanks${state.lead.name ? `, ${state.lead.name}` : ""}. ${
            missingLeadFields(state)[0] === "phone"
              ? "What's the best phone number to reach you?"
              : missingLeadFields(state)[0] === "address"
                ? "What's the service address?"
                : "What's your name?"
          }"`
      : !state.preferredTiming
        ? `"Thanks${state.lead.name ? `, ${state.lead.name}` : ""}. What day or time would you prefer? The team will confirm availability."`
      : `"Thanks${state.lead.name ? `, ${state.lead.name}` : ""}. I have your details${state.preferredTiming ? ` and preferred time (${state.preferredTiming})` : ""}. Our team will confirm the earliest available appointment. Nothing is booked yet."`
}
Then STOP.`;
    }
    default:
      return `YOUR ONLY OBJECTIVE: ${state.currentObjective}
Ask at most ONE question if needed.`;
  }
}

function leadFieldAskPatterns(field: keyof LeadFields): RegExp[] {
  switch (field) {
    case "name":
      return [
        /\b(what(?:'s| is) your (first )?name|may i (have|get) your (first )?name|your (first )?name\??|last name)\b/i,
      ];
    case "phone":
      return [
        /\b(what(?:'s| is) (the )?best (number|phone)|phone number|reach you|call you)\b/i,
      ];
    case "email":
      return [/\b(email|e-mail)\b/i];
    case "address":
      return [
        /\b(service address|what(?:'s| is) (the |your )?address|where (are you|is the)|property address|apartment)\b/i,
      ];
  }
}

function countLeadFieldAsks(reply: string): number {
  const fields: Array<keyof LeadFields> = ["name", "phone", "email", "address"];
  return fields.reduce((count, field) => {
    return (
      count +
      (leadFieldAskPatterns(field).some((re) => re.test(reply)) ? 1 : 0)
    );
  }, 0);
}

export type ValidationResult = {
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
    business.pricingRules || "",
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

  if (!contactComplete && PREFERRED_TIME_ASK_RE.test(reply)) {
    reasons.push(
      "Asked for preferred time before name, customer phone, and service address were captured."
    );
  }

  if (!contactComplete && PREMATURE_SUCCESS_CLOSE_RE.test(reply)) {
    reasons.push(
      "Claimed the request was recorded, shared, or that the team will follow up before name, customer phone, and service address were captured."
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
    (state.customerAgreed || state.currentObjective === "ADVANCE_TO_NEXT_STEP") &&
    !/\bwhat day or time would you prefer\b/i.test(reply)
  ) {
    reasons.push("Preferred time is missing; ask once for a preferred day or time.");
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
    sentenceCount > 3 &&
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
      : isLeadContactComplete(state) && !state.preferredTiming
        ? `Do not claim the request was already shared with the team. If the customer just said yes to a site assessment and no preferred time is known yet, reply with this meaning: "${SITE_ASSESSMENT_TEAM_ALERT_ASK}"`
        : `Do not claim the request was recorded, shared, or that the team will contact them. Ask only for the next missing field among name, customer phone, and service address. Do not ask preferred time, property type, or troubleshooting. Do not give the business phone number.`
}
Do not give DIY tutorials or technician dumps.
If objective is CLOSE: give the final message then STOP. No questions. No access asks. No "anything else?".
If the customer asked about price, answer the price question and do not repeat request-delivery language.
Keep it natural and concise.
`.trim();
}
