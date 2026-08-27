import { BusinessProfile } from "../types/business";
import {
  LeadFields,
  SalesIntent,
  SalesObjective,
  SalesState,
  UrgencyLevel,
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
  /\b(clogged|broken|leaking|leak|damaged|flooding|not working|isn'?t working|won'?t|stopped|out of|making (a )?noise|no (hot )?water|too (hot|cold)|overheating|repair|fix|install|replace|replacement|cracked|missing|failed|faulty|pipe|infestat|infested|pests?|termite|new)\b/i;

const FAKE_CAPABILITY_RE =
  /\b(i('ll| will)?\s+(dispatch|schedule|book)|i('ve| have)\s+(scheduled|booked|dispatched|sent this to dispatch|confirmed (your )?appointment)|check(ing)?\s+(live\s+)?availability|contact(ed|ing)?\s+(a\s+)?technician|we (can|will) (send|dispatch) (someone|a technician)|you(?:'re| are) (all )?set|confirmed for)\b/i;

const FAKE_AVAILABILITY_RE =
  /\b(we (are|have|do have) availability|available (today|tomorrow|this (morning|afternoon|evening))|come (out )?(today|tomorrow)|between\s+\d{1,2}\s*(am|pm)?\s*[-–]\s*\d{1,2}|from\s+\d{1,2}\s*(am|pm)|\d{1,2}\s*[-–]\s*\d{1,2}\s*(am|pm)|8\s*[-–]\s*12|12\s*[-–]\s*4|4\s*[-–]\s*8|same[- ]day service is available|early window|late morning)\b/i;

const DIY_RE =
  /\b(you can try|try (this|these|the following)|steps you can|before (you )?call|do it yourself|diy|home remed|pour boiling|use a plunger|snake (the )?drain|vinegar and baking|clear it yourself)\b/i;

const TECHNICIAN_DUMP_RE =
  /\b(trap inspection|hydro-?jet|auger|snake\/auger|garbage disposal testing|30[–-]90 minutes|most visits take|access constraints)\b/i;

const FALSE_HANDOFF_RE =
  /\b(i('ve| have) (sent|forwarded|handed)|sent (this|your request|your details|it) to (the )?team|the team (has|already has) your (details|request|information)|the team will (call|contact|reach|get in touch)|our (office|team|staff) will (call|contact|reach|get in touch)|office will contact|we('ll| will) (call|contact) you|handed (this|it) off|notification (was |has been )?sent)\b/i;

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
    /\b(come (out|over)|send someone|schedule|book|get started|as soon as possible|asap|right away|today|emergency)\b/.test(
      t
    )
  ) {
    return "READY_TO_ACT";
  }

  if (CONCRETE_PROBLEM_RE.test(t)) {
    return "HIGH";
  }

  if (
    /\b(i need|i want|need help|need a|need an|fix this|repair|estimate|quote)\b/.test(
      t
    )
  ) {
    return "HIGH";
  }

  // Actionable buying interest, not vague browsing ("just interested", "maybe someday").
  if (
    /\binterested in\s+(getting|installing|buying|purchasing)\b/.test(t) &&
    !/\b(maybe|might|someday|just curious|just looking)\b/.test(t)
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

function detectUrgency(text: string): UrgencyLevel | null {
  const t = text.toLowerCase();
  if (
    /\b(immediate|immediately|asap|emergency|urgent|right now|right away|as soon as possible|need someone today)\b/.test(
      t
    )
  ) {
    return "IMMEDIATE";
  }
  if (/\b(soon|this week|quickly|tomorrow)\b/.test(t)) {
    return "SOON";
  }
  return null;
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

function extractName(
  text: string,
  objective: SalesObjective,
  options?: { securingLead?: boolean; nameAlreadyCaptured?: boolean }
): string | null {
  const labeled = text.match(
    /(?:my name(?:'s| is)|this is|call me)\s+([A-Za-z][A-Za-z.'-]{1,40}(?:\s+[A-Za-z][A-Za-z.'-]{1,40})?)/i
  )?.[1];

  if (labeled) {
    const cleaned = labeled
      .replace(/\b(and|my|phone|number|email|address)\b.*$/i, "")
      .trim();
    if (cleaned && !/^(just|only|still|not|looking|browsing)$/i.test(cleaned)) {
      return cleaned;
    }
  }

  const allowBareName =
    objective === "COLLECT_NAME" ||
    (Boolean(options?.securingLead) && !options?.nameAlreadyCaptured);

  if (allowBareName) {
    const cleaned = text.trim().replace(/^["']|["']$/g, "");
    if (
      /^[A-Za-z][A-Za-z.'-]{1,40}(?:\s+[A-Za-z][A-Za-z.'-]{1,40})?$/.test(
        cleaned
      ) &&
      !/^(just|only|still|yes|no|ok|okay|looking|browsing)$/i.test(cleaned)
    ) {
      return cleaned;
    }
  }

  return null;
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
  const match = text.match(
    /\b((today|tomorrow|this (morning|afternoon|evening)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)[^.]{0,40}|between\s+\d{1,2}[^.]{0,24}|\d{1,2}\s*(?::\d{2})?\s*[-–]\s*\d{1,2}\s*(?::\d{2})?\s*(am|pm)?|after\s+\d{1,2}\s*(am|pm)?|before\s+\d{1,2}\s*(am|pm)?)/i
  );
  return match ? match[0].trim() : null;
}

const DAY_RE =
  /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this (morning|afternoon|evening))\b/i;
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

/** Question / options / sourcing / clarification — not a new primary need. */
function looksLikeBuyingOrClarifyingQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\?/.test(t)) return true;
  if (
    /\b(do you|will you|can you|should i|is there|are there|what (kind|type|options)|which (one|type|option)|multiple options|one type|bring the|supply|sourc|buy (a|the|one)|what to buy|not sure|cost extra|how much|before that)\b/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

function inferCustomerNeed(
  text: string,
  previous: string | null
): string | null {
  const t = text.trim();
  if (t.length < 3) return previous;

  // Once a concrete primary need exists, do not replace it with Q&A.
  if (
    previous &&
    isCustomerNeedSpecific(previous) &&
    looksLikeBuyingOrClarifyingQuestion(t)
  ) {
    return previous;
  }

  const looksLikeNeedUpdate =
    /\b(i need|i want|looking for|interested in|help with|problem with|issue with|i have)\b/i.test(
      t
    ) ||
    /\b(repair|install|replace|service|quote|estimate)\b/i.test(t) ||
    CONCRETE_PROBLEM_RE.test(t);

  if (!looksLikeNeedUpdate) {
    return previous;
  }

  if (
    previous &&
    isCustomerNeedSpecific(previous) &&
    detectUrgency(t) &&
    !CONCRETE_PROBLEM_RE.test(t)
  ) {
    return previous;
  }

  const next = t.length > 160 ? `${t.slice(0, 157)}...` : t;

  // Prefer keeping a concrete problem description over a later generic/urgency phrase.
  if (
    previous &&
    isCustomerNeedSpecific(previous) &&
    !isCustomerNeedSpecific(next)
  ) {
    return previous;
  }

  // Prefer keeping an established concrete need over another concrete-looking sentence
  // that is still primarily a clarification/options question (belt-and-suspenders).
  if (
    previous &&
    isCustomerNeedSpecific(previous) &&
    looksLikeBuyingOrClarifyingQuestion(t)
  ) {
    return previous;
  }

  return next;
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

  // Ownership denial ≠ acceptance of sourcing/supply.
  if (
    /\b(don'?t|do not|do not currently|i (don'?t|do not)|we (don'?t|do not))\b.{0,40}\b(own|have)\b/.test(
      t
    ) ||
    /\b(i |we )?(don'?t|do not) own (one|anything|it|a|an)\b/.test(t) ||
    /\bhaven'?t (bought|purchased|gotten|got)\b/.test(t) ||
    /\bnot (yet )?(purchased|bought)\b/.test(t)
  ) {
    notes.push("Customer does not currently own the item.");
  }

  // Only store sourcing when the customer explicitly accepts/asks for it.
  if (
    /\b(please (source|supply|provide|bring)|yes[,.]?\s*(please\s+)?(source|supply|bring)|help (me )?sourc|sourc(e|ing) (it|one|for me)|i want (you|the business|the team) to (source|supply|bring)|you (can|should) (source|supply|bring))\b/.test(
      t
    )
  ) {
    notes.push("Customer wants help sourcing / supplying the item.");
  } else if (
    /\b(do you (supply|provide|source)|will you (supply|provide|source|bring)|can you (supply|provide|source|bring))\b/.test(
      t
    )
  ) {
    notes.push("Customer asked whether sourcing / supply is available.");
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

  if (/\b(modern|contemporary|stylish|minimal)\b/.test(t)) {
    notes.push(
      /\bminimal\b/.test(t)
        ? "Customer prefers a modern/minimal style."
        : "Customer wants a modern option."
    );
  }

  if (
    /\b(too expensive|pricey|concerned about (the )?(price|cost)|how much will it cost)\b/.test(
      t
    )
  ) {
    notes.push("Customer is concerned about price.");
  }

  if (/\b(saturday|sunday|weekend)\b/.test(t)) {
    notes.push("Customer mentioned weekend timing.");
  }

  if (/\b(safe|safety|dangerous|spark|shock|gas leak)\b/.test(t)) {
    notes.push("Customer expressed a safety concern.");
  }

  if (/\b(repair (it|this|the)|rather than replace|instead of replac)\b/.test(t)) {
    notes.push("Customer prefers repair rather than replacement.");
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

  const looksLikeGenericProviderRequest =
    /^(hi[,!.]?\s*)?(i\s+)?(need|want|looking for)\s+(a|an|some|someone|help)?\s*[\w\s-]{1,40}\.?$/i.test(
      t
    ) ||
    /\bi need (a|an)\s+[\w-]+(\s+(company|service|person|tech|technician|contractor))?\b/i.test(
      t
    ) ||
    /\bneed help with (my )?(house|home|place|property)\b/i.test(t);

  if (hasConcreteProblem) return true;
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

/** Only explicit "<field> is required before ..." profile instructions block a handoff. */
function requiredBusinessFieldLabels(business: BusinessProfile): string[] {
  const labels = [business.systemPrompt, ...business.leadQuestions].flatMap((item) =>
    [
      ...item.matchAll(/\b([a-z][a-z0-9 -]{2,48}?)\s+(?:is|are)\s+(?:required|mandatory)\s+(?:before|prior to)\b/gi),
      ...item.matchAll(/\b(?:require|need)\s+(?:the\s+)?([a-z][a-z0-9 -]{2,48}?)\s+(?:before|prior to)\b/gi),
    ].map((match) => match[1].trim().toLowerCase())
  );
  return Array.from(new Set(labels)).filter((label) => !/^(name|phone|address|email)$/.test(label));
}

function captureRequiredBusinessFields(text: string, required: string[], captured: string[]): string[] {
  const next = [...captured];
  for (const field of required) {
    const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b\\s*(?:is|:|#)?\\s*[^\\s.?!]{1,}`, "i").test(text)) {
      if (!next.some((value) => value.toLowerCase() === field)) next.push(field);
    }
  }
  return next;
}

function missingLeadFields(state: SalesState): Array<keyof LeadFields> {
  return state.requiredLeadFields.filter(
    (field) => !state.lead[field] && !state.refusedLeadFields.includes(field)
  );
}

function isLeadSecured(state: SalesState): boolean {
  return state.requiredLeadFields.every((field) => !!state.lead[field]);
}

/** Pain/repair vs aspirational upgrade — drives sales-tone copy only, not lead rules. */
function salesNeedTone(
  state: SalesState
): "pain" | "aspirational" | "neutral" {
  const need = (state.customerNeed || "").toLowerCase();
  if (!need) return "neutral";
  if (
    /\b(not working|isn'?t working|won'?t|broken|leaking|leak|clogged|flooding|outage|emergency|repair|stopped|no (hot )?water|too (hot|cold)|overheating|infestat|infested|pests?|termite|faulty|failed|cracked|damaged|urgent|asap)\b/i.test(
      need
    )
  ) {
    return "pain";
  }
  if (
    /\b(install|installation|solar|jacuzzi|spa|remodel|modern|upgrade|landscape|landscaping|getting|buying|purchasing|new (kitchen|sink|hvac|system|unit|panel)|want a|interested in getting)\b/i.test(
      need
    )
  ) {
    return "aspirational";
  }
  return "neutral";
}

function businessKnowledgeBlob(business: BusinessProfile): string {
  return [
    business.businessName,
    business.tagline,
    business.systemPrompt,
    ...business.services,
    ...business.serviceAreas,
    ...business.faqs.map((f) => `${f.question} ${f.answer}`),
    ...business.leadQuestions,
  ]
    .join("\n")
    .toLowerCase();
}

function profileSupportsResponseTimePromise(
  business: BusinessProfile | undefined
): boolean {
  if (!business) return false;
  return /\b(as soon as possible|asap|within\s+\d+|same[- ]day|response time|call (you |back )?(within|in)|follow up within|get back (to you )?(within|in))\b/i.test(
    businessKnowledgeBlob(business)
  );
}

const UNSUPPORTED_RESPONSE_TIME_RE =
  /\b(as soon as possible|asap|shortly|within\s+\d+\s*(?:hours?|minutes?|days?|business days?)|follow up (?:with you )?(?:soon|quickly|shortly)|get back to you (?:soon|shortly|quickly)|contact you (?:soon|shortly|asap))\b/i;

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
  return /\b(let'?s do it|let'?s (move forward|proceed|schedule)|go ahead|please go ahead|please proceed|sign me up|i(?:'d| would) like to (move forward|proceed|get this done)|okay[,.]? let'?s|yes[,.]? let'?s|book it|schedule it|i want (the|that) service|please have someone (contact|call|come)|send (this|it) to the team)\b/i.test(
    t
  );
}

/** Bare affirmative to the immediately preceding proposal (visit/estimate/etc.). */
export function isBareAffirmative(text: string): boolean {
  return /^(yes|yeah|yep|sure|ok|okay|sounds good|that works)[.!]?$/i.test(
    text.trim()
  );
}

/**
 * Contextual acceptance of a proposed next step or soft finish —
 * broader than bare yes, but not factual answers like "Yes, there is standing water."
 */
export function isContextualAcceptance(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isBareAffirmative(t)) return true;
  if (
    /^(yes|yeah|yep|sure)[,.]?\s+(that works|please|sounds good|go ahead|that'?s fine|perfect)[.!]?$/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /^(please do|go ahead|that'?s fine|sounds good|perfect|please)\.?$/i.test(t)
  ) {
    return true;
  }
  if (/^(thanks|thank you)([,.]?\s*(so much|again)?)?[.!]?$/i.test(t)) {
    return true;
  }
  if (
    t.split(/\s+/).length <= 4 &&
    /\b(thanks|thank you)\b/i.test(t) &&
    !/\?/.test(t)
  ) {
    return true;
  }
  // Short "yes, <agreement to proposed step>" e.g. "yes, an on-site assessment sounds good"
  if (
    /^(yes|yeah|yep|sure)[,.]?\s+/i.test(t) &&
    t.split(/\s+/).length <= 14 &&
    /\b(sounds good|that works|please|go ahead|works for me|assessment|estimate|visit|diagnostic|inspection|arrange|schedule)\b/i.test(
      t
    ) &&
    !/\b(standing water|leak|broken|not working|how much|cost|price|do you|can you)\b/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
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
  return /\b(visit|estimate|inspection|appointment|come out|schedule|arrange|on[- ]?site|next step|move forward|diagnostic)\b/i.test(
    assistantText
  );
}

function assistantProposedOnSiteNextStep(assistantText: string): boolean {
  return /\b(on[- ]?site|site visit|come out|send (a )?technician|inspection|appointment|diagnostic|assessment|estimate|technician (visit|come))\b/i.test(
    assistantText
  );
}

function hasOnSiteNextStep(state: SalesState): boolean {
  return state.establishedFacts.some((fact) => fact === "nextStepKind=on-site");
}

function needsOnSiteAvailability(state: SalesState): boolean {
  return (
    isV1LeadComplete(state) &&
    state.appointmentIntent === true &&
    !state.preferredTiming &&
    hasOnSiteNextStep(state)
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

function isV1LeadComplete(state: SalesState): boolean {
  return (
    state.leadStatus === "SECURED" &&
    isLeadSecured(state) &&
    isCustomerNeedSpecific(state.customerNeed) &&
    missingLeadFields(state).length === 0
  );
}

/** A complete lead with an expressed next-step preference should not become an intake questionnaire. */
function isActionableV1Lead(state: SalesState): boolean {
  return (
    isV1LeadComplete(state) &&
    state.appointmentIntent === true &&
    !!state.preferredTiming
  );
}

const INFORMATION_GATHERING_OBJECTIVES: SalesObjective[] = [
  "COLLECT_NAME",
  "COLLECT_PHONE",
  "COLLECT_EMAIL",
  "COLLECT_ADDRESS",
  "UNDERSTAND_NEED",
];

/**
 * handoffReady ≠ SECURED. True only at a natural endpoint when gathering is done.
 */
function computeHandoffReady(state: SalesState, latestUserText: string): boolean {
  if (state.leadStatus !== "SECURED") return false;
  if (state.intent !== "HIGH" && state.intent !== "READY_TO_ACT") return false;
  if (!isLeadSecured(state)) return false;
  if (!isCustomerNeedSpecific(state.customerNeed)) return false;
  if (missingLeadFields(state).length > 0) return false;
  if (state.requiredBusinessFields.some((field) => !state.capturedBusinessFields.some((captured) => captured.toLowerCase() === field.toLowerCase()))) return false;
  if (state.awaitingCustomerResponse || state.unresolvedCustomerIssue) return false;

  if (INFORMATION_GATHERING_OBJECTIVES.includes(state.currentObjective)) {
    return false;
  }

  if (needsOnSiteAvailability(state) && !detectCustomerFinished(latestUserText)) {
    return false;
  }

  const naturalEndpoint =
    state.customerAgreed ||
    state.currentObjective === "CLOSE" ||
    state.salesStage === "COMPLETED" ||
    detectCustomerFinished(latestUserText) ||
    (isV1LeadComplete(state) &&
      state.appointmentIntent === true &&
      !!state.preferredTiming);

  return naturalEndpoint;
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
    /\b(too expensive|more than i expected|cost too much|pricey|how much|what(?:'s| is) the (price|cost)|pricing|diagnostic fee|is there a fee)\b/.test(
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
    /\b(can you come|are you available|come tomorrow|come today|schedule|appointment)\b/.test(
      t
    )
  ) {
    return "ADVANCE_TO_NEXT_STEP";
  }

  if (
    /\b(do you (supply|install|handle|work on|guarantee|come)|can you (handle|install|supply|come|do)|why should i (use|choose|go with))\b/.test(
      t
    )
  ) {
    return "PRESENT_SOLUTION";
  }

  return null;
}

/** "Can you help me?" / "Can you help with this?" — not a buying/clarifying question. */
function textWithoutGenericHelpAsks(text: string): string {
  return text
    .replace(
      /\b(can|could|would) you help(?:\s+(?:me|us))(?:\s+with\s+(?:this|that|it))?\s*[?.!]*/gi,
      " "
    )
    .replace(
      /\b(can|could|would) you help\s+with\s+(?:this|that|it)\s*[?.!]*/gi,
      " "
    )
    .replace(/\b(can|could|would) you help\s*[?.!]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Meaningful sales/help question that must be answered before the next form field or close. */
function isOpenSalesQuestion(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikeLeadFieldOnlyReply(t)) return false;
  if (detectCustomerFinished(t) || detectCustomerAgreement(t)) return false;

  const remainder = textWithoutGenericHelpAsks(t);
  if (!remainder) return false;

  if (looksLikeBuyingOrClarifyingQuestion(remainder)) return true;
  if (/\?/.test(remainder)) return true;
  // Capability/price interrupts only — do not treat need verbs like "install" as questions.
  return /\b(how much|too expensive|can you|do you|will you|why should|guarantee|warranty|options|not sure what)\b/i.test(
    remainder
  );
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

function selectObjective(
  state: SalesState,
  latestUserText: string
): SalesObjective {
  // After successful handoff, answer new questions — do not reopen lead capture.
  if (state.leadDeliveryStatus === "SENT") {
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

  const missingBusinessRequirement = state.requiredBusinessFields.find(
    (field) => !state.capturedBusinessFields.some((captured) => captured.toLowerCase() === field.toLowerCase())
  );
  if (isLeadSecured(state) && missingBusinessRequirement && state.urgency !== "IMMEDIATE") {
    return "ADVANCE_TO_NEXT_STEP";
  }

  if (needsOnSiteAvailability(state) && !detectCustomerFinished(latestUserText)) {
    const interrupt = detectSalesObjective(latestUserText);
    const isQuestion =
      /\?/.test(latestUserText) ||
      /\b(how much|what(?:'s| is) the (price|cost)|why|can you|do you)\b/i.test(
        latestUserText
      );
    if (
      interrupt !== "HANDLE_PRICE_OBJECTION" &&
      interrupt !== "HANDLE_COMPETITOR_OBJECTION" &&
      interrupt !== "HANDLE_HESITATION" &&
      interrupt !== "EXPLAIN_VALUE" &&
      interrupt !== "PRESENT_SOLUTION" &&
      !isQuestion
    ) {
      return "ADVANCE_TO_NEXT_STEP";
    }
  }

  if (state.customerAgreed || detectCustomerAgreement(latestUserText)) {
    // Still answer genuine new questions after agreement/close — do not ignore them.
    if (
      isOpenSalesQuestion(latestUserText) &&
      !detectCustomerFinished(latestUserText)
    ) {
      return "ANSWER";
    }
    return "CLOSE";
  }

  // After a natural close path: answer new questions, then return to CLOSE.
  // Do not reopen optional PRESENT_SOLUTION discovery when handoff is ready.
  if (
    isV1LeadComplete(state) &&
    (state.handoffReady || state.currentObjective === "CLOSE")
  ) {
    const postClose = detectSalesObjective(latestUserText);
    if (
      postClose === "HANDLE_PRICE_OBJECTION" ||
      postClose === "HANDLE_COMPETITOR_OBJECTION" ||
      postClose === "HANDLE_HESITATION"
    ) {
      return postClose;
    }
    if (
      isOpenSalesQuestion(latestUserText) &&
      !detectCustomerFinished(latestUserText)
    ) {
      return "ANSWER";
    }
    if (needsOnSiteAvailability(state)) {
      return "ADVANCE_TO_NEXT_STEP";
    }
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
      salesObjective === "HANDLE_HESITATION" ||
      salesObjective === "PRESENT_SOLUTION" ||
      salesObjective === "EXPLAIN_VALUE"
    ) {
      return salesObjective;
    }

    if (isOpenSalesQuestion(latestUserText)) {
      return "ANSWER";
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
    // Timing preference already captured with a complete lead: CLOSE, do not reopen sell.
    if (
      salesObjective === "ADVANCE_TO_NEXT_STEP" &&
      isV1LeadComplete(state) &&
      !!state.preferredTiming
    ) {
      return "CLOSE";
    }
    return salesObjective;
  }

  if (isOpenSalesQuestion(latestUserText) && !detectCustomerFinished(latestUserText)) {
    return "ANSWER";
  }

  if (state.salesStage === "CLOSING" || state.salesStage === "COMPLETED") {
    if (needsOnSiteAvailability(state) && !detectCustomerFinished(latestUserText)) {
      return "ADVANCE_TO_NEXT_STEP";
    }
    return "CLOSE";
  }

  // The customer has supplied the essential lead, accepted the next step, and
  // given useful timing. Close naturally unless they ask a new sales question.
  if (isActionableV1Lead(state)) {
    return "CLOSE";
  }

  if (!isCustomerNeedSpecific(state.customerNeed)) {
    return "UNDERSTAND_NEED";
  }

  // MINIMUM NECESSARY DISCOVERY after lead is secured:
  // - one concise next-step sell right after the last lead field
  // - ask availability only when an on-site next step was accepted and timing is missing
  // - contextual acceptance / thanks / timing → CLOSE (or ADVANCE once for timing)
  if (isV1LeadComplete(state)) {
    if (needsOnSiteAvailability(state)) {
      return "ADVANCE_TO_NEXT_STEP";
    }
    if (looksLikeLeadFieldOnlyReply(latestUserText)) {
      return "PRESENT_SOLUTION";
    }
    if (
      detectCustomerFinished(latestUserText) ||
      state.customerAgreed ||
      isContextualAcceptance(latestUserText) ||
      (!!extractPreferredTiming(latestUserText) &&
        state.appointmentIntent === true)
    ) {
      return "CLOSE";
    }
    return "PRESENT_SOLUTION";
  }

  if (looksLikeLeadFieldOnlyReply(latestUserText)) {
    return isCustomerNeedSpecific(state.customerNeed)
      ? "PRESENT_SOLUTION"
      : "UNDERSTAND_NEED";
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
    `leadDelivery=${state.leadDeliveryStatus}`,
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
  business: BusinessProfile
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
      })
    : createInitialSalesState();

  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  const text = latestUser?.content?.trim() || "";

  if (!text) {
    state.summary = buildSummary(state);
    return state;
  }

  state.awaitingCustomerResponse = false;
  state.unresolvedCustomerIssue = /\?|\b(how much|what(?:'s| is) the|can you|do you|is there|why|concern|too expensive|pricey|think about it|cheaper)\b/i.test(text);
  state.requiredBusinessFields = requiredBusinessFieldLabels(business);
  state.capturedBusinessFields = captureRequiredBusinessFields(text, state.requiredBusinessFields, state.capturedBusinessFields);

  const detectedIntent = detectIntent(text);
  const leadFieldOnlyReply =
    looksLikeLeadFieldOnlyReply(text) ||
    !!extractPhone(text) ||
    !!extractEmail(text) ||
    !!extractAddress(text, state.currentObjective);
  // Low-intent browsing should not permanently overwrite an active high-intent journey
  // unless the conversation is still in discovery with no lead progress.
  // A volunteered name/phone/email/address is continuation, not a browse.
  if (
    detectedIntent === "LOW" &&
    state.leadStatus === "NOT_SECURED" &&
    !state.lead.name &&
    !leadFieldOnlyReply
  ) {
    state.intent = "LOW";
  } else {
    state.intent = maxIntent(state.intent, detectedIntent);
  }

  const urgency = detectUrgency(text);
  if (urgency) {
    state.urgency = urgency;
    state.establishedFacts = addFact(
      state.establishedFacts,
      `Customer stated urgency: ${urgency}`
    );
  }

  const timing = extractPreferredTiming(text);
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

  if (detectCustomerAgreement(text)) {
    state.customerAgreed = true;
    state.establishedFacts = addFact(
      state.establishedFacts,
      "Customer agreed to proceed"
    );
  } else if (isContextualAcceptance(text)) {
    // Agreeing to the prior proposal (visit/estimate) — not final conversation closure
    // unless timing is already known or on-site timing is not required.
    const priorAssistant = lastAssistantMessage(messages);
    if (
      assistantProposedNextStep(priorAssistant) &&
      state.appointmentIntent !== false
    ) {
      state.appointmentIntent = true;
      state.establishedFacts = addFact(
        state.establishedFacts,
        "Customer agreed to the proposed next step"
      );
      if (assistantProposedOnSiteNextStep(priorAssistant)) {
        state.establishedFacts = addFact(state.establishedFacts, "nextStepKind=on-site");
      }
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
  state.customerNeed = inferCustomerNeed(text, state.customerNeed);

  for (const note of extractCustomerContextNotes(text)) {
    state.customerContext = addFact(state.customerContext, note);
  }

  const name = extractName(text, state.currentObjective, {
    securingLead:
      state.leadStatus === "SECURING" ||
      state.intent === "HIGH" ||
      state.intent === "READY_TO_ACT",
    nameAlreadyCaptured: Boolean(state.lead.name),
  });
  if (name && !state.lead.name) {
    state.lead.name = name;
    state.establishedFacts = addFact(state.establishedFacts, `name=${name}`);
    state.refusedLeadFields = state.refusedLeadFields.filter((f) => f !== "name");
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

  if (
    state.urgency === "IMMEDIATE" &&
    isLeadSecured(state) &&
    isCustomerNeedSpecific(state.customerNeed) &&
    !isOpenSalesQuestion(text) &&
    objective !== "HANDLE_PRICE_OBJECTION" &&
    objective !== "HANDLE_COMPETITOR_OBJECTION" &&
    objective !== "HANDLE_HESITATION"
  ) {
    state.currentObjective = "CLOSE";
    state.salesStage = "COMPLETED";
  }

  state.handoffReady = computeHandoffReady(state, text);

  state.summary = buildSummary(state);
  return state;
}

/** Apply facts that are only knowable after the assistant reply has been generated. */
export function finalizeSalesTurn(state: SalesState, reply: string): SalesState {
  const handledIssue = ["ANSWER", "HANDLE_PRICE_OBJECTION", "HANDLE_COMPETITOR_OBJECTION", "HANDLE_HESITATION", "EXPLAIN_VALUE"].includes(state.currentObjective);
  const next: SalesState = {
    ...state,
    awaitingCustomerResponse: /\?/.test(reply) && state.currentObjective !== "CLOSE",
    unresolvedCustomerIssue: state.unresolvedCustomerIssue && !handledIssue,
    objections: handledIssue ? [] : state.objections,
  };
  next.handoffReady = computeHandoffReady(next, "");
  next.summary = buildSummary(next);
  return next;
}

export function buildTurnControlBlock(state: SalesState): string {
  const leadLines = Object.entries(state.lead)
    .map(([key, value]) => `- ${key}: ${value ?? "not collected"}`)
    .join("\n");

  const facts =
    state.establishedFacts.length > 0
      ? state.establishedFacts.map((f) => `- ${f}`).join("\n")
      : "- none yet";

  const refused =
    state.refusedLeadFields.length > 0
      ? state.refusedLeadFields.join(", ")
      : "none";

  const objectiveDirective = objectiveInstruction(state);

  return `
==================================================
SALES CONTROLLER — CURRENT TURN (AUTHORITATIVE FOR THIS RESPONSE)
==================================================
The Sales Controller decides WHAT to accomplish this turn.
You decide HOW to say it naturally.
Do not invent a different objective.
Do not ask about already-established facts unless there is genuine ambiguity.

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
- leadDeliveryStatus: ${state.leadDeliveryStatus}
- refusedLeadFields: ${refused}
- requiredLeadFields: ${state.requiredLeadFields.join(", ")}
- requiredBusinessFields: ${state.requiredBusinessFields.join(", ") || "none"}
- capturedBusinessFields: ${state.capturedBusinessFields.join(", ") || "none"}

Lead fields:
${leadLines}

Established facts (DO NOT ask again):
${facts}

Objections noted:
${state.objections.length ? state.objections.map((o) => `- ${o}`).join("\n") : "- none"}

Summary: ${state.summary}

${
  state.leadDeliveryStatus === "SENT"
    ? `Lead notification already delivered (leadDeliveryStatus=SENT). Do NOT re-ask for name, phone, address, or other already-captured lead fields. You may still answer new customer questions.`
    : ""
}

LEAD HANDOFF TRUTH:
${
  state.leadDeliveryStatus === "SENT"
    ? `leadDeliveryStatus=SENT. You MAY truthfully say the request/details were sent to the team / notification was delivered.`
    : state.leadDeliveryStatus === "FAILED"
      ? `leadDeliveryStatus=FAILED. Delivery did NOT succeed. Do NOT claim the team was notified or that you sent the request. Say the details are captured and the team still needs to be reached / follow-up will be arranged.`
      : state.currentObjective === "CLOSE" && state.handoffReady
        ? `leadDeliveryStatus=NOT_SENT, but this is a CLOSE turn with handoffReady=true. You MAY say you are sending the request to the team now (present tense) so they can coordinate the next step. Do NOT invent response-time promises (as soon as possible / shortly / soon / within X) unless BusinessProfile explicitly supports them. Do NOT use past tense ("I've sent"), and do NOT say the office/team will call or contact them.`
      : `leadDeliveryStatus=NOT_SENT. Do NOT claim you sent the request, handed it off, or that the office/team will call or contact the customer. You may say the details are captured.`
}

${objectiveDirective}

HARD RULES FOR THIS RESPONSE:
1. Pursue ONLY the currentObjective above.
2. Ask at most ONE question if a question is needed.
3. Do not ask for multiple lead fields in one response.
4. Do not ask for fields already collected.
5. Do not ask for refusedLeadFields. If leadCapturePaused is true, do not resume lead capture unless the customer volunteers information.
6. Never claim to dispatch, schedule, book, confirm availability, reserve a slot, or send a technician — those capabilities are not connected.
7. Never invent prices, fees, warranties, visit durations, response times, brands, catalogs, portfolio photos, discounts, or product availability unless explicitly in BusinessProfile or owner-provided knowledge (systemPrompt/FAQs). Owner-provided knowledge captured through Peter is authoritative — including visit fees credited toward the bill when stored there.
8. Do not provide DIY repair tutorials when the customer wants professional service. Brief safety-while-waiting guidance is allowed only for genuine hazards.
9. Do not dump the full BusinessProfile or unrelated services.
10. Sales mode is not technician mode — do not give long technical procedure dumps unless needed for the buying decision.
11. If customerAgreed is true / objective is CLOSE: stop overselling, no questionnaire, no extra questions — deliver the positive final message only. Never use "I can't book / can't complete the booking" language. Do NOT ask "Anything else?", "One quick question...", or "Would you like me to...".
12. Prefer preserving the opportunity over forcing lead capture.
13. For COLLECT_* and UNDERSTAND_NEED: 1 short contextual reaction + exactly one lead/useful question. Optional: one NEW grounded confidence point only if it was not already said. Do not sound like a form. Do not dump the brochure. Do not mechanically repeat "we can help", service area, credentials, proposal contents, incentives, or savings claims.
14. Only claim that a notification was already delivered, or that the office/team will call, if leadDeliveryStatus=SENT. If currentObjective is CLOSE and handoffReady is true, you MAY say you are sending the request to the team now (present tense) so they can coordinate the next step. Do NOT invent response-time promises unless BusinessProfile explicitly supports them.
15. Do NOT proactively ask for gate codes, pets, parking, doorman, or access instructions — the human team can collect those later unless the customer brings them up.
16. If preferredTiming is already established, do NOT keep refining appointment windows into smaller slots. Capture the preference and move on.
17. BusinessProfile is AVAILABLE knowledge, not a brochure. For ordinary service requests, answer only what is relevant to the current need. Do not volunteer promotions, financing, emergency phone numbers, replacement/new-equipment offers, or unrelated services unless the customer asked or genuine urgency/safety requires it. Normally one concise next-step explanation + one useful question.
18. BusinessProfile is the sole source of customer actions and business process. Do not present a customer submission, communication channel, inspection/triage workflow, measurement/document requirement, virtual/video consultation, consultation fee, or operational procedure unless BusinessProfile explicitly supports it. Owner-provided process/fee knowledge in systemPrompt/FAQs counts as supported.
19. MINIMUM NECESSARY DISCOVERY: once name/phone/address and the concrete need are known, and there is no unresolved customer question and no BusinessProfile-required field remaining, move toward CLOSE/handoff. Do not invent optional discovery just because more information could help.
20. Do not restate facts/value points already communicated earlier unless the customer asks about them or they are required to answer the current question. Keep replies short.
21. If the customer accepted the supported next step and timing is already known (or timing is not required), do NOT ask "shall I submit", weekday/weekend, or another permission question — CLOSE and hand off.
22. Do not invent electrician/subcontractor coordination, quote inclusion for third-party trades, or partner scheduling unless BusinessProfile explicitly supports it. A brief grounded limitation is allowed.
23. Do NOT treat an AI-suggested option as a customer preference unless the customer explicitly accepted it. Example: offering "own vs source" and hearing "I don't own one" only means they do not own it — NOT that they want sourcing.
24. If preferredTiming is already known, do NOT ask the customer to reconfirm that same timing ("confirm for tomorrow morning?"). Acknowledge and proceed.
25. After CLOSE/handoffReady: answer a new genuine question truthfully from grounded knowledge only, capture any voluntary preference they state, then return to closure — do not reopen optional discovery questionnaires.
`.trim();
}

function objectiveInstruction(state: SalesState): string {
  const tone = salesNeedTone(state);
  const toneHint =
    tone === "pain"
      ? `TONE: this is a PAIN/PROBLEM need. Use brief empathy and competence — not cheerfulness or "great project" language.`
      : tone === "aspirational"
        ? `TONE: this is an ASPIRATIONAL / IMPROVEMENT need. Show concise positive energy and commercial confidence that the business wants the work. Vary wording — do not default to "we can help" every turn.`
        : `TONE: be warm, confident, and concise.`;

  switch (state.currentObjective) {
    case "COLLECT_NAME":
      return `YOUR OBJECTIVE: collect the customer's first name while sounding like a knowledgeable sales employee, not a form.
${toneHint}
1. Acknowledge the specific need the customer just stated (1 short reaction — aspirational enthusiasm OR pain reassurance as appropriate).
2. Optionally add ONE grounded confidence/value point from BusinessProfile that applies to THIS need. Do not dump extra services, promotions, financing, service-area lists, or unrelated credentials.
3. Then ask exactly ONE question for their first name.
Do not ask for last name, phone, email, address, ZIP, city, main goal, availability, pets, parking, or technical details.
IMPORTANT: If this is not the first reply of the conversation, do not restart with the same apology + licensed/insured sentence — acknowledge briefly and ask for the name.`;
    case "COLLECT_PHONE":
      return `YOUR OBJECTIVE: collect the customer's phone number while remaining a sales employee, not a form.
${toneHint}
Use a short, varied acknowledgement tied to progress or their need (e.g. making it easy for the team to reach them). Then ask exactly ONE question for the best phone number.
Do NOT restate the full service pitch, service area, licensed/insured credentials, or "we can help" as filler.
Do NOT repeat "Sorry you're dealing with that" if already used. Do not ask ZIP, city, main goal, or extra fields. No brochure. No DIY.`;
    case "COLLECT_EMAIL":
      return `YOUR OBJECTIVE: collect the customer's email naturally.
${toneHint}
One brief relevant sentence + exactly ONE question.`;
    case "COLLECT_ADDRESS":
      return `YOUR OBJECTIVE: collect the service address naturally.
${toneHint}
One brief sentence explaining why the property location helps the next useful step for THEIR need + exactly ONE question for the service address.
Do not ask apartment number unless the customer volunteers ambiguity.
Do NOT restate the brochure, service area, licensed/insured credentials, or the same apology line from prior turns. No DIY. No extra operational questions.`;
    case "UNDERSTAND_NEED":
      return `YOUR ONLY OBJECTIVE: understand the customer's need with the minimum necessary information.
${toneHint}
Exactly ONE natural question.
Do not diagnose like a technician.
Do not ask leakage/timeline/equipment questions unless truly required for the next sales move.
No brochure. No DIY tutorial.`;
    case "ANSWER":
      return `YOUR ONLY OBJECTIVE: answer helpfully using BusinessProfile / owner-provided knowledge only.
${toneHint}
Do not force lead capture.
Keep it concise — no huge brochure.
Do NOT invent catalogs, past-work photo portfolios, technician show-and-tell workflows, sourcing catalogs, or other resources unless BusinessProfile/owner knowledge explicitly supports them.
If information is unavailable, say so briefly and note any useful preference the customer already stated.
Do NOT treat an AI-suggested option as the customer's preference unless they explicitly accepted it.
${
  state.handoffReady || state.customerAgreed
    ? `After answering: do NOT reopen optional discovery (materials, sizes, colors, pump types, etc.). Capture only voluntary preferences they stated, then return toward natural closure on the next turn.`
    : ""
}`;
    case "PRESENT_SOLUTION":
      return `YOUR ONLY OBJECTIVE: connect THIS customer's established need to the single most relevant BusinessProfile-supported solution.
${toneHint}
Make it feel personalized ("based on what you've described...").
After the lead is secured: give positive next-step momentum — customer goal + one grounded value/trust point + ONE clear useful next step supported by BusinessProfile.
Explain benefit and a logical next step.
Do NOT list all services or dump technical procedure details.
Do NOT volunteer promotions, financing, emergency contact numbers, replacement/new-equipment options, or unrelated offerings unless the customer asked or urgency/safety makes them relevant.
Do NOT invent operational claims, brands, catalogs, prices, warranties, discounts, system sizes (kW), projected savings, consultation fees, or appointment formats not in BusinessProfile.
Do NOT invent virtual/video/phone consultations, remote estimates, or battery consultations unless BusinessProfile explicitly supports them.
Do NOT introduce a customer task or business workflow unless BusinessProfile explicitly supports it.
Do NOT proactively ask about gate codes, pets, parking, access instructions, electric bills, weekday vs Saturday preference, phone vs video, roof type, panel count, or "main goal" unless BusinessProfile explicitly requires that field.
MINIMUM NECESSARY DISCOVERY: if the lead is complete and you can propose the BusinessProfile-supported next step, do that and stop inventing more questions.
${
  state.preferredTiming
    ? `preferredTiming is already known (${state.preferredTiming}). Do NOT ask another timing/refinement question.`
    : "Ask at most ONE question if needed (e.g. whether they want the supported next step, or preferred day/time) — not optional discovery."
}
If the lead is already complete (name/phone/address/need) and the customer is not raising a new issue, prefer advancing toward natural closure rather than inventing another "quick question". If next-step interest and preferredTiming are also known, do not ask proactive technical or operational discovery questions.`;
    case "EXPLAIN_VALUE":
      return `YOUR ONLY OBJECTIVE: explain why the relevant offering matters to THIS customer.
${toneHint}
Use only BusinessProfile-supported differentiators. Ask at most ONE question if needed.
Do NOT invent brands, catalogs, prices, or warranties. Do NOT ask access/pet/parking questions.`;
    case "HANDLE_PRICE_OBJECTION":
      return `YOUR ONLY OBJECTIVE: handle the price/fee concern.
Acknowledge → answer honestly from BusinessProfile/owner knowledge only.
Never invent prices.
If leadCapturePaused, do NOT ask for refused lead fields.
Continue selling the value of the next step. Ask at most ONE clarifying question if needed.`;
    case "HANDLE_COMPETITOR_OBJECTION":
      return `YOUR ONLY OBJECTIVE: handle competitor/price comparison.
No invented superiority. Use BusinessProfile-supported facts only. Ask at most ONE clarifying question if needed.`;
    case "HANDLE_HESITATION":
      return `YOUR ONLY OBJECTIVE: handle hesitation without pressure.
If the customer is unsure what to buy or how to proceed, help with a brief grounded recommendation using BusinessProfile only, then continue toward the next sales step.
Ask at most ONE clarifying question if needed. Do not ignore the hesitation just to collect another lead field.`;
    case "CROSS_SELL":
      return `YOUR ONLY OBJECTIVE: introduce ONE naturally relevant additional BusinessProfile offering only if useful and timely.
Do not ambush before the primary need is handled.`;
    case "ADVANCE_TO_NEXT_STEP":
      return `YOUR ONLY OBJECTIVE: advance toward the business's real next step.
${toneHint}
When the customer has accepted an estimate/assessment/visit, briefly reinforce why that next step is useful (property-specific recommendation, not guessing) — then ask for timing if needed.
Do not invent availability windows or claim booking/dispatch.
Do NOT invent time slots such as 8–10, 10–12, 12–4, etc.
${
  state.preferredTiming
    ? `preferredTiming is already known (${state.preferredTiming}). Acknowledge it and do NOT ask to refine into a smaller window.`
    : needsOnSiteAvailability(state)
      ? `The customer agreed to an on-site visit/inspection/appointment and has not given a time preference. Ask exactly ONE concise availability question such as "What day or time works best for you?" Do not reopen technical discovery.`
      : "If the next step is only a later callback with no on-site visit, do not force a timing question. Otherwise, if useful, ask at most ONE open preference question (e.g. preferred day/time) without inventing windows."
}
${
  state.requiredBusinessFields.find(
    (field) => !state.capturedBusinessFields.some((captured) => captured.toLowerCase() === field.toLowerCase())
  )
    ? `BusinessProfile explicitly requires ${state.requiredBusinessFields.find(
        (field) => !state.capturedBusinessFields.some((captured) => captured.toLowerCase() === field.toLowerCase())
      )} before this next step. Ask only for that required item.`
    : ""
}
Do NOT ask for gate codes, pets, parking, or access instructions.
Capture the customer's preference for the team — you do not have live scheduling.`;
    case "CLOSE":
      return `YOUR ONLY OBJECTIVE: close / hand off cleanly with a positive FINAL message — then STOP.
Do NOT ask any question (no "Anything else?", no "One quick question...", no "Would you like me to...", no access/timing/confirmation questions).
Do NOT repeat the service explanation or visit/estimate process.
Do NOT pretend the appointment is already booked or that availability is already confirmed.
Do NOT say "I can't book", "I can't complete the booking", or similar limitation language.
Do NOT invent response-time promises (as soon as possible / shortly / soon / within X) unless BusinessProfile explicitly supports them.
${
  state.urgency === "IMMEDIATE"
    ? `URGENCY: the customer stated this is urgent/ASAP. Acknowledge that calmly in one short phrase (e.g. you've flagged it as urgent for the team). Do NOT invent an ETA, dispatch, or live availability.`
    : ""
}

Preferred closing style (adapt with the customer's name and known facts only):
${
  state.leadDeliveryStatus === "SENT"
    ? `"Perfect${state.lead.name ? `, ${state.lead.name}` : ""}. I have everything we need: your contact details, ${state.customerNeed || "your service request"}${state.preferredTiming ? `, and your preferred time ${state.preferredTiming}` : ""}${state.urgency === "IMMEDIATE" ? ", and I've flagged this as urgent" : ""}. Our team will get in touch with you to confirm the next step."`
    : state.handoffReady
      ? `"Perfect${state.lead.name ? `, ${state.lead.name}` : ""}. I have everything I need for ${state.customerNeed || "your service request"}${state.preferredTiming ? `, including your preferred time ${state.preferredTiming}` : ""}${state.urgency === "IMMEDIATE" ? ". I've flagged this as urgent for the team" : ""}. I'm sending this request to the team now so they can coordinate the next step with you."`
      : `"Perfect${state.lead.name ? `, ${state.lead.name}` : ""}. I have everything we need: your contact details and ${state.customerNeed || "your service request"}${state.preferredTiming ? `, plus your preferred time ${state.preferredTiming}` : ""}${state.urgency === "IMMEDIATE" ? ". I've noted the urgency for the team" : ""}. Your request is captured."`
}

Handoff language MUST match leadDeliveryStatus=${state.leadDeliveryStatus}:
- SENT: you may say the request was sent/captured and that the office/team will contact them.
- NOT_SENT or FAILED: if handoffReady is true, you MAY say you are sending the request to the team now so they can coordinate the next step. Do NOT use past tense ("I've sent"), do NOT invent response-time promises, and do NOT say the office/team will call them. If handoffReady is false, say the details are captured only.
Then STOP.`;
    default:
      return `YOUR ONLY OBJECTIVE: ${state.currentObjective}
Ask at most ONE question if needed.`;
  }
}

function leadFieldAskPatterns(field: keyof LeadFields): RegExp[] {
  switch (field) {
    case "name":
      return [
        /\b(what(?:'s| is) your (first )?name|may i (have|get) your (first )?name|can i (get|have) your (first )?name)\b/i,
      ];
    case "phone":
      return [
        /\b(what(?:'s| is) (the )?best (number|phone)|(?:what(?:'s| is)|may i (have|get)|can i (get|have)) (?:your )?(phone number|number)|phone number to reach|reach you)\b/i,
      ];
    case "email":
      return [/\b(what(?:'s| is) your (email|e-mail)|may i (have|get) your (email|e-mail)|email address)\b/i];
    case "address":
      return [
        /\b(what(?:'s| is) (the |your )?(service )?address|where (are you|is the)|property address|service address for)\b/i,
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
  const hintMatches =
    reply.match(
      /\b(we offer|our services|emergency (service|instructions)|service areas?|free estimates?|licensed|insured|available 24|financing|warranty|24\s*\/\s*7|promotions?)\b/gi
    ) || [];
  // A single grounded "licensed" mention is not a brochure; require denser credential dumping.
  const denseHints = hintMatches.length >= 3;
  const long = reply.trim().length > 480;
  return (
    (bulletLike >= 3 && hintMatches.length >= 2) ||
    (long && denseHints) ||
    bulletLike >= 4
  );
}

function customerAskedAbout(text: string, topic: RegExp): boolean {
  return topic.test(text);
}

/**
 * True BusinessProfile facts can still be brochure-like if volunteered
 * without the customer asking. Length is not sufficient.
 */
function unsolicitedOfferDumpReasons(
  reply: string,
  state: SalesState,
  latestUserText: string
): string[] {
  const asked = `${latestUserText} ${state.customerNeed || ""}`.toLowerCase();
  const reasons: string[] = [];

  if (
    /\bfinanc(e|ing|ial (plans?|options?))\b/i.test(reply) &&
    !customerAskedAbout(asked, /\bfinanc/i)
  ) {
    reasons.push("Volunteered financing that was not requested.");
  }
  if (
    /\b(promotion|special offer|limited[- ]time)\b/i.test(reply) &&
    !customerAskedAbout(asked, /\b(promotion|discount|offer|special)\b/i)
  ) {
    reasons.push("Volunteered a promotion that was not requested.");
  }
  if (
    /\b(24\s*\/\s*7|24-hour emergency|emergency service)\b/i.test(reply) &&
    state.urgency !== "IMMEDIATE" &&
    !customerAskedAbout(asked, /\b(emergenc|urgent|asap|right now|flooding|gas leak)\b/i)
  ) {
    reasons.push("Volunteered emergency-service advertising without urgency context.");
  }
  if (
    /\b(call us (at|on)|give us a call|call\s+\(?\d{3})/i.test(reply) &&
    !customerAskedAbout(asked, /\b(phone|call|number|contact)\b/i)
  ) {
    reasons.push("Volunteered a phone/call-us pitch without the customer asking.");
  }
  if (
    /\bfree (diagnostic|estimate|inspection)\b/i.test(reply) &&
    !customerAskedAbout(asked, /\b(free|diagnostic fee|estimate|promotion)\b/i)
  ) {
    reasons.push("Volunteered promotional free diagnostic/estimate language.");
  }
  if (
    /\b(new equipment|free estimates? on new|recommend repair or replacement)\b/i.test(reply) &&
    !customerAskedAbout(asked, /\b(replace|replacement|new (unit|system|equipment)|install)\b/i)
  ) {
    reasons.push("Volunteered replacement/new-equipment options that were not requested.");
  }

  return reasons;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function isNormalSalesObjective(objective: SalesObjective): boolean {
  return [
    "PRESENT_SOLUTION",
    "EXPLAIN_VALUE",
    "HANDLE_PRICE_OBJECTION",
    "HANDLE_COMPETITOR_OBJECTION",
    "HANDLE_HESITATION",
    "ADVANCE_TO_NEXT_STEP",
    "CLOSE",
  ].includes(objective);
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

/**
 * A customer-facing task is a business capability, not a generic sales tactic.
 * Only allow it when the relevant material/action is present in owner knowledge.
 */
function replyIntroducesUnsupportedCustomerAction(
  reply: string,
  business: BusinessProfile
): boolean {
  const knowledge = businessKnowledgeBlob(business);
  // Only flag instructions that put a deliverable task on the customer.
  const actionRe =
    /\b(?:please\s+)?(?:send|share|upload|submit|provide|text|email|call|take|measure|complete|fill out|bring)\s+(?:a|an|the|your|any|some)?\s*([a-z][a-z-]{2,})\b/gi;
  const customerDeliverable =
    /^(photos?|pictures?|images?|videos?|forms?|documents?|docs?|measurements?|application|receipts?|invoices?|utility|bill|bills|gate|code|codes)$/i;

  for (const match of reply.matchAll(actionRe)) {
    const full = match[0];
    const subject = match[1].toLowerCase();
    const start = match.index ?? 0;
    const before = reply.slice(Math.max(0, start - 28), start).toLowerCase();
    // Business/team providing a plan/estimate/cost is not a customer action.
    if (/\b(we|our team|i)\b[\s\S]{0,20}$/i.test(before)) {
      continue;
    }
    if (/\b(we|our team|i)\s+(can|will|could|may|'ll)\s+$/i.test(before)) {
      continue;
    }
    if (!customerDeliverable.test(subject) && !customerDeliverable.test(full)) {
      // Ignore generic verbs like "provide an accurate plan".
      continue;
    }
    const singular = subject.replace(/s$/, "");
    const contactAction = /\b(text|email|call)\b/i.test(full);
    const contactSupported =
      contactAction && /\b(phone|email|text|call)\b/.test(knowledge);

    if (!knowledge.includes(subject) && !knowledge.includes(singular) && !contactSupported) {
      return true;
    }
  }

  return false;
}

function replyIntroducesUnsupportedProcess(
  reply: string,
  business: BusinessProfile
): boolean {
  const knowledge = businessKnowledgeBlob(business);
  // Invented electrician / third-party coordination when profile doesn't support it.
  if (replyInventedThirdPartyCoordination(reply, knowledge)) {
    return true;
  }

  // Portfolio / catalog / past-work photo resources require explicit grounding.
  if (replyInventedPortfolioOrCatalog(reply, knowledge)) {
    return true;
  }

  const processMentions =
    /\b(process|inspection|triage|consultation|assessment|measurement|documentation|submission|virtual consult(?:ation)?|video (?:call|consult(?:ation)?|meeting)|phone (?:consult(?:ation)?|meeting)|remote (?:estimate|assessment|consult)|site assessment|battery consult(?:ation)?)\b/i.test(
      reply
    );
  if (!processMentions) return false;

  // Generic "process/consultation/assessment" words must appear in knowledge if used.
  if (
    /\b(process|inspection|triage|consultation|assessment|measurement|documentation|submission)\b/i.test(
      reply
    ) &&
    !/\b(process|inspection|triage|consultation|assessment|measurement|documentation|submission)\b/.test(
      knowledge
    )
  ) {
    return true;
  }

  // Specific invented formats require explicit BusinessProfile support.
  const inventedFormats: Array<{ claim: RegExp; support: RegExp }> = [
    {
      claim: /\bvirtual consult(?:ation)?\b/i,
      support: /\bvirtual consult/i,
    },
    {
      claim: /\bvideo (?:call|consult(?:ation)?|meeting)\b/i,
      support: /\bvideo (?:call|consult|meeting)/i,
    },
    {
      claim: /\bphone (?:consult(?:ation)?|meeting)\b/i,
      support: /\bphone (?:consult|meeting)/i,
    },
    {
      claim: /\bremote (?:estimate|assessment|consult)\b/i,
      support: /\bremote (?:estimate|assessment|consult)/i,
    },
    {
      claim: /\bbattery consult(?:ation)?\b/i,
      support: /\bbattery consult/i,
    },
  ];
  for (const { claim, support } of inventedFormats) {
    if (claim.test(reply) && !support.test(knowledge)) {
      return true;
    }
  }

  return false;
}

/**
 * Past-work photos, catalogs, design portfolios, and technician show-and-tell
 * require explicit BusinessProfile / owner knowledge — do not invent them.
 */
function replyInventedPortfolioOrCatalog(
  reply: string,
  knowledge: string
): boolean {
  const claims: Array<{ claim: RegExp; support: RegExp }> = [
    {
      claim:
        /\b(photos?|pictures?|images?)\b[\s\S]{0,80}\b(past|previous|prior|completed)\b[\s\S]{0,40}\b(install|work|project|job)s?\b/i,
      support: /\b(photo|picture|image|portfolio|gallery|catalog)/i,
    },
    {
      claim:
        /\b(past|previous|prior|completed)\b[\s\S]{0,40}\b(install|work|project|job)s?\b[\s\S]{0,60}\b(photos?|pictures?|images?)\b/i,
      support: /\b(photo|picture|image|portfolio|gallery|catalog)/i,
    },
    {
      claim: /\b(catalog(?:ue)?s?|portfolios?|galleries)\b/i,
      support: /\b(catalog(?:ue)?|portfolio|gallery)\b/i,
    },
    {
      claim:
        /\b(technician|tech|team)\b[\s\S]{0,50}\b(show|bring|share)\b[\s\S]{0,40}\b(photos?|pictures?|images?|catalog|examples?|designs?)\b/i,
      support: /\b(photo|picture|image|portfolio|gallery|catalog|example designs?)\b/i,
    },
    {
      claim:
        /\b(show|share|send)\b[\s\S]{0,40}\b(you )?(photos?|pictures?|images?|catalog(?:ue)?s?)\b[\s\S]{0,40}\b(past|previous|prior|install|design|style)/i,
      support: /\b(photo|picture|image|portfolio|gallery|catalog)\b/i,
    },
  ];

  for (const { claim, support } of claims) {
    if (claim.test(reply) && !support.test(knowledge)) {
      return true;
    }
  }
  return false;
}

/**
 * Do not claim the customer wants an AI-suggested option they never accepted.
 */
function replyInventsUnstatedCustomerPreference(
  reply: string,
  state: SalesState
): boolean {
  const context = (state.customerContext || []).join("\n");
  const claimsSourcing =
    /\b(you(?:'d| would) like us to source|you want (?:us|the (?:team|business)) to source|source and install|we(?:'ll| will) source (?:and|a|the|one)|help sourcing)\b/i.test(
      reply
    );
  if (claimsSourcing) {
    return !/\bCustomer wants help sourcing \/ supplying the item\b/i.test(
      context
    );
  }
  return false;
}

/**
 * May state a grounded limitation ("electrical would be separate").
 * Must NOT invent coordinating, quoting, or arranging third-party trades.
 */
function replyInventedThirdPartyCoordination(
  reply: string,
  knowledge: string
): boolean {
  if (!/\belectric(?:al|ian)?\b/i.test(reply)) return false;
  // Profile already covers electrical work — claims may be grounded.
  if (/\belectric/i.test(knowledge)) return false;

  const inventsCoordination =
    /\b(coordinate|arrang(?:e|ing)|include(?:ing)?\s+(?:that|it|the electrical)?.{0,40}\bquote|we(?:'ll| will) bring|partner with|our (?:tech|technician|team) will (?:identify|handle|arrange|include).{0,60}electric)\b/i.test(
      reply
    ) ||
    /\b(electrical (?:hookup|work)|electric(?:al)? (?:needs?|hookups?)).{0,80}\b(include|quote|coordinate|arrang)\b/i.test(
      reply
    ) ||
    /\bis (?:typically )?done by a licensed electrician\b/i.test(reply);

  if (!inventsCoordination) return false;

  // Allow clear separate-limitation language without coordination.
  const groundedLimitation =
    /\b(separately|separate(ly)?|not (something )?we (do|handle|perform)|outside (?:our|the) scope|you(?:'d| would) need (?:to hire|a licensed)|handled by (?:a |your )?own)\b/i.test(
      reply
    ) &&
    !/\b(coordinate|arrang(?:e|ing)|include.{0,20}quote|we(?:'ll| will) bring)\b/i.test(
      reply
    );

  return !groundedLimitation;
}

/** Quantified commercial claims that must be grounded in BusinessProfile. */
function replyInventedUnsupportedClaims(
  reply: string,
  business: BusinessProfile
): boolean {
  const knowledge = businessKnowledgeBlob(business).toLowerCase();

  // System sizing / production figures (e.g. 6–8 kW) unless profile states them.
  const sizeMatches = reply.match(/\b\d+(?:\.\d+)?\s*(?:[-–]\s*\d+(?:\.\d+)?)?\s*kW\b/gi) || [];
  for (const raw of sizeMatches) {
    const normalized = raw.toLowerCase().replace(/\s+/g, "");
    const digits = raw.replace(/[^\d.–-]/g, "");
    if (
      !knowledge.includes(normalized) &&
      !knowledge.includes(digits.toLowerCase() + "kw") &&
      !new RegExp(digits.replace(/[–-]/g, "\\s*[-–]?\\s*") + "\\s*kw", "i").test(knowledge)
    ) {
      return true;
    }
  }

  // Monthly savings / bill figures not in profile (replyInventedPrice covers $; catch "/month" prose).
  if (
    /\b\d+\s*%\s*(savings|less|reduction)\b/i.test(reply) &&
    !/\b\d+\s*%\b/.test(knowledge)
  ) {
    return true;
  }

  // Consultation / visit fees unless profile states a fee.
  if (
    /\b(consultation|diagnostic|service)\s+fee\b|\bfee\s+(?:of\s+)?\$?\d+/i.test(reply) &&
    !/\bfee\b/.test(knowledge)
  ) {
    return true;
  }

  // Invented Saturday/weekday availability promises.
  if (
    /\b(saturday|sunday|weekday|tomorrow|today)\b[\s\S]{0,40}\b(available|availability|openings?|slots?)\b/i.test(
      reply
    ) ||
    /\b(we (?:are|have|do have) availability|available (?:this )?(saturday|sunday|weekday|tomorrow|today))\b/i.test(
      reply
    )
  ) {
    if (!/\b(available|availability|saturday|sunday)\b/i.test(knowledge)) {
      return true;
    }
  }

  return false;
}

const REPEATABLE_PITCH_MARKERS: RegExp[] = [
  /\bgreat project\b/i,
  /\blocal (?:dfw|dallas|texas) installer\b/i,
  /\bresidential solar systems?\b/i,
  /\btailored proposal\b/i,
  /\bsystem[- ]size estimate\b/i,
  /\bexpected production\b/i,
  /\bprojected savings\b/i,
  /\bpersonalized savings estimate\b/i,
  /\blocal incentives?\b/i,
  /\blicensed and insured\b/i,
  /\blicensed and experienced\b/i,
  /\blicense\s*(?:#|number|no\.?)\b/i,
  /\bon[- ]?site (?:assessment|estimate|diagnos(?:is|tic)|inspection|visit)\b/i,
  /\baccurate (?:quote|price|estimate)\b/i,
  /\bwritten estimate\b/i,
  /\bpricing (?:depends|factors|varies|based on)\b/i,
  /\bdesign (?:the right|a) system\b/i,
  /\bno[- ]obligation on[- ]?site assessment\b/i,
  /\bwe (?:design and )?install (?:roof|residential)\b/i,
  /\bhandle(?:s|ing)? (?:heater repairs?|jacuzzi|spa plumbing|kitchen sink)\b/i,
];

function replyRepeatsPriorPitch(
  reply: string,
  priorAssistantReplies: string[] | undefined,
  state?: SalesState
): boolean {
  if (!priorAssistantReplies || priorAssistantReplies.length === 0) return false;
  // Prefer recent memory (last few assistant turns).
  const prior = priorAssistantReplies.slice(-4).join("\n");
  let hits = 0;
  for (const marker of REPEATABLE_PITCH_MARKERS) {
    if (marker.test(reply) && marker.test(prior)) {
      hits += 1;
    }
  }
  // After the lead is secured, even one repeated trust/next-step pitch is too much
  // unless we are answering a direct question about that topic.
  if (
    state &&
    isV1LeadComplete(state) &&
    !["ANSWER", "HANDLE_PRICE_OBJECTION", "HANDLE_COMPETITOR_OBJECTION", "HANDLE_HESITATION"].includes(
      state.currentObjective
    )
  ) {
    return hits >= 1;
  }
  return hits >= 2;
}

function asksProactiveScopeDiscovery(reply: string): boolean {
  return (
    /\?/.test(reply) &&
    /\b(size|dimension|style|model|type|material|existing|current|condition|age|brand|owner(?:ship)?|utility|connection|hookup|configuration)\b/i.test(
      reply
    )
  );
}

function businessExplicitlyRequiresQuestion(
  reply: string,
  business: BusinessProfile
): boolean {
  const requirementText = [business.systemPrompt, ...business.leadQuestions]
    .filter((text) => /\b(required|must|need to)\b[\s\S]{0,80}\b(before|prior to)\b/i.test(text))
    .join(" ")
    .toLowerCase();
  if (!requirementText) return false;

  const replyTerms = new Set(
    reply.toLowerCase().match(/[a-z]{4,}/g)?.filter((term) => !/^(what|when|where|would|could|should|please|before|proceed)$/.test(term)) || []
  );
  let overlap = 0;
  for (const term of replyTerms) {
    if (requirementText.includes(term) && ++overlap >= 2) return true;
  }
  return false;
}

export function validateSalesReply(
  reply: string,
  state: SalesState,
  business?: BusinessProfile,
  priorAssistantReplies?: string[]
): ValidationResult {
  const reasons: string[] = [];

  if (FAKE_CAPABILITY_RE.test(reply)) {
    reasons.push("Unsupported scheduling/dispatch/availability claim.");
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
    (state.currentObjective === "COLLECT_NAME" ||
      state.currentObjective === "COLLECT_PHONE") &&
    /\?/.test(reply) &&
    /\b(main goal|what(?:'s| is) your (main )?goal|zip code|\bzip\b|what city|what(?:'s| is) your (zip|city))\b/i.test(
      reply
    )
  ) {
    reasons.push(
      "Asked discovery or service-area qualification before the next required lead field."
    );
  }

  if (
    (state.currentObjective === "COLLECT_PHONE" ||
      state.currentObjective === "COLLECT_ADDRESS" ||
      state.currentObjective === "COLLECT_EMAIL") &&
    /\bsorry you'?re dealing with that\b/i.test(reply)
  ) {
    reasons.push(
      "Repeated the same pain apology during later lead-field collection."
    );
  }

  if (
    state.leadStatus === "SECURED" &&
    /\bsorry you'?re dealing with that\b/i.test(reply)
  ) {
    reasons.push("Re-opened the same pain apology after the lead was secured.");
  }

  if (
    (state.currentObjective === "COLLECT_PHONE" ||
      state.currentObjective === "COLLECT_ADDRESS") &&
    /\bwe can (definitely )?help\b/i.test(reply) &&
    /\b(we serve|across (the )?(dfw|texas)|service area)\b/i.test(reply)
  ) {
    reasons.push(
      "Mechanical we-can-help / service-area restatement during lead-field collection."
    );
  }

  if (
    salesNeedTone(state) === "pain" &&
    /\b(great project|worthwhile upgrade|sounds (like )?(a )?(great|wonderful|exciting)|excited to|can'?t wait)\b/i.test(
      reply
    )
  ) {
    reasons.push("Used aspirational enthusiasm on a pain/problem request.");
  }

  if (
    UNSUPPORTED_RESPONSE_TIME_RE.test(reply) &&
    !profileSupportsResponseTimePromise(business)
  ) {
    reasons.push(
      "Invented response-time promise not supported by BusinessProfile."
    );
  }

  (Object.keys(state.lead) as Array<keyof LeadFields>).forEach((field) => {
    if (!state.lead[field]) return;
    if (leadFieldAskPatterns(field).some((re) => re.test(reply))) {
      reasons.push(`Asked for already-collected field: ${field}.`);
    }
  });

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

  if (
    tightTurn ||
    state.currentObjective === "PRESENT_SOLUTION" ||
    state.currentObjective === "EXPLAIN_VALUE" ||
    state.currentObjective === "ADVANCE_TO_NEXT_STEP" ||
    state.currentObjective === "ANSWER"
  ) {
    reasons.push(
      ...unsolicitedOfferDumpReasons(reply, state, state.customerNeed || "")
    );
  }

  if (tightTurn && wordCount(reply) > 70) {
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
    isNormalSalesObjective(state.currentObjective) &&
    wordCount(reply) > 90
  ) {
    reasons.push("Normal sales response is too long; keep it concise and avoid repeating the pitch.");
  }

  if (
    (state.currentObjective === "ADVANCE_TO_NEXT_STEP" ||
      state.currentObjective === "CLOSE") &&
    looksLikeBrochureDump(reply)
  ) {
    reasons.push("Advance/close response repeated a brochure-style service pitch.");
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

  if (business && replyInventedUnsupportedClaims(reply, business)) {
    reasons.push(
      "Invented sizing, fee, savings, or availability claim not supported by BusinessProfile."
    );
  }

  if (business && replyIntroducesUnsupportedCustomerAction(reply, business)) {
    reasons.push("Introduced a customer action not supported by BusinessProfile.");
  }

  if (business && replyIntroducesUnsupportedProcess(reply, business)) {
    reasons.push("Introduced a business process not supported by BusinessProfile.");
  }

  if (replyInventsUnstatedCustomerPreference(reply, state)) {
    reasons.push(
      "Claimed a customer preference/fact that was only AI-suggested, not explicitly accepted."
    );
  }

  if (replyRepeatsPriorPitch(reply, priorAssistantReplies, state)) {
    reasons.push(
      "Repeated trust/value pitch points already communicated earlier in the conversation."
    );
  }

  if (
    (isActionableV1Lead(state) ||
      (isV1LeadComplete(state) &&
        !!state.preferredTiming &&
        state.appointmentIntent === true)) &&
    state.currentObjective !== "CLOSE" &&
    state.currentObjective !== "ANSWER" &&
    /\b(shall i|should i|may i|can i)\b.{0,40}\b(submit|send|pass|go ahead)\b/i.test(
      reply
    ) &&
    /\?/.test(reply)
  ) {
    reasons.push(
      "Asked permission to submit after the lead was already actionable — CLOSE instead."
    );
  }

  if (
    isV1LeadComplete(state) &&
    state.currentObjective !== "ANSWER" &&
    state.currentObjective !== "HANDLE_PRICE_OBJECTION" &&
    state.currentObjective !== "HANDLE_COMPETITOR_OBJECTION" &&
    state.currentObjective !== "HANDLE_HESITATION" &&
    /\?/.test(reply) &&
    /\b(main goal|electric bill|utility bill|average bill|weekday or saturday|phone or video|video or phone|battery backup|how many panels|roof type|shade)\b/i.test(
      reply
    ) &&
    !(business && businessExplicitlyRequiresQuestion(reply, business))
  ) {
    reasons.push(
      "Invented optional discovery question after the lead was already complete."
    );
  }

  if (
    isActionableV1Lead(state) &&
    state.currentObjective !== "ANSWER" &&
    state.currentObjective !== "CLOSE" &&
    asksProactiveScopeDiscovery(reply)
  ) {
    reasons.push("Asked proactive technical or operational discovery after the actionable lead was complete.");
  }

  if (
    business &&
    isActionableV1Lead(state) &&
    state.currentObjective !== "ANSWER" &&
    state.currentObjective !== "CLOSE" &&
    /\?/.test(reply) &&
    !businessExplicitlyRequiresQuestion(reply, business)
  ) {
    reasons.push("Asked an unnecessary follow-up after the actionable lead was complete.");
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
    state.currentObjective === "ADVANCE_TO_NEXT_STEP" &&
    needsOnSiteAvailability(state) &&
    questionMarks < 1
  ) {
    reasons.push("On-site next step agreement requires one availability question.");
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
    state.currentObjective !== "CLOSE" &&
    (/\b(what time|which (window|slot)|narrow(er)?|more specific|morning or afternoon|between\s+\d)/i.test(
      reply
    ) ||
      /\b(confirm|reconfirm|still (good|work)|works for you)\b[\s\S]{0,60}\b(tomorrow|morning|afternoon|timing|time|assessment|visit|estimate)\b/i.test(
        reply
      ) ||
      /\bwould you like to confirm\b/i.test(reply)) &&
    /\?/.test(reply)
  ) {
    reasons.push("Re-asked timing refinement after preferredTiming was already established.");
  }

  if (
    state.handoffReady &&
    asksProactiveScopeDiscovery(reply)
  ) {
    reasons.push(
      "Asked optional discovery after handoff-ready close — answer then return to closure instead."
    );
  }

  if (
    tightTurn &&
    /\b(what|where|when|how|can you|could you)\b[^?]{0,80}\band\b[^?]{0,80}\b(what|where|when|how|can you|could you|your)\b/i.test(
      reply
    )
  ) {
    reasons.push("Compound multi-part question in a single-objective turn.");
  }

  if (
    state.leadDeliveryStatus !== "SENT" &&
    FALSE_HANDOFF_RE.test(reply)
  ) {
    reasons.push(
      "Claimed successful lead handoff/notification when leadDeliveryStatus is not SENT."
    );
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function buildValidationCorrection(
  state: SalesState,
  reasons: string[]
): string {
  const needsAvailabilityAsk = reasons.some((r) =>
    /On-site next step agreement requires one availability question/i.test(r)
  );
  const bansPainApology = reasons.some((r) =>
    /pain apology/i.test(r)
  );
  return `
CORRECTION — previous draft violated Sales Controller rules:
${reasons.map((r) => `- ${r}`).join("\n")}

Rewrite the response.
Pursue ONLY currentObjective=${state.currentObjective}.
Ask at most ONE question.
${
  needsAvailabilityAsk
    ? `REQUIRED: because the customer agreed to an on-site next step and preferredTiming is not established, end with exactly ONE availability question such as "What day or time works best for you?"`
    : ""
}
${
  bansPainApology
    ? `FORBIDDEN PHRASE: do not use "Sorry you're dealing with that" anywhere in this rewrite. Use a short varied acknowledgement instead.`
    : ""
}
Do not ask for already-collected or refused lead fields.
Do not invent prices, availability, booking, or dispatch.
Do not invent response-time promises (as soon as possible / shortly / soon / within X) unless BusinessProfile supports them.
Do not claim lead handoff/notification unless leadDeliveryStatus=SENT.
Do not give DIY tutorials or technician dumps.
Match tone to the need: empathy for pain/problems; positive concise momentum for aspirational projects — never cheerful on breakdowns.
If objective is CLOSE: give the positive final captured-request message using known name/need/timing only, then STOP. No questions. No access asks. No "anything else?".
Keep it natural and concise.
`.trim();
}
