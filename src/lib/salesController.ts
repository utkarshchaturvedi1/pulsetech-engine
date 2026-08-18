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
  /\b(clogged|broken|leaking|leak|damaged|flooding|not working|isn'?t working|won'?t|stopped|out of|making (a )?noise|no (hot )?water|too (hot|cold)|overheating|repair|fix|install|replace|cracked|missing|failed|faulty|pipe)\b/i;

const FAKE_CAPABILITY_RE =
  /\b(i('ll| will)?\s+(dispatch|schedule|book)|i('ve| have)\s+(scheduled|booked|dispatched|sent this to dispatch|confirmed (your )?appointment)|check(ing)?\s+(live\s+)?availability|contact(ed|ing)?\s+(a\s+)?technician|we (can|will) (send|dispatch) (someone|a technician)|you(?:'re| are) (all )?set|confirmed for)\b/i;

const FAKE_AVAILABILITY_RE =
  /\b(we (are|have|do have) availability|available (today|tomorrow|this (morning|afternoon|evening))|come (out )?(today|tomorrow)|between\s+\d{1,2}\s*(am|pm)?\s*[-–]\s*\d{1,2}|from\s+\d{1,2}\s*(am|pm)|\d{1,2}\s*[-–]\s*\d{1,2}\s*(am|pm)|8\s*[-–]\s*12|12\s*[-–]\s*4|4\s*[-–]\s*8|same[- ]day service is available|early window|late morning)\b/i;

const DIY_RE =
  /\b(you can try|try (this|these|the following)|steps you can|before (you )?call|do it yourself|diy|home remed|pour boiling|use a plunger|snake (the )?drain|vinegar and baking|clear it yourself)\b/i;

const TECHNICIAN_DUMP_RE =
  /\b(trap inspection|hydro-?jet|auger|snake\/auger|garbage disposal testing|30[–-]90 minutes|most visits take|access constraints)\b/i;

const FALSE_HANDOFF_RE =
  /\b(i('ve| have) (sent|forwarded|handed)|sent (this|your request|your details|it) to (the )?team|the team (has|already has) your (details|request|information)|the team will (call|contact|reach)|our scheduling team has|handed (this|it) off|notification (was |has been )?sent)\b/i;

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

function extractName(text: string, objective: SalesObjective): string | null {
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

  if (objective === "COLLECT_NAME") {
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
    /\b(do you|will you|can you|should i|is there|are there|what (kind|type|options)|which (one|type|option)|multiple options|one type|bring the|supply|sourc|buy (a|the|one)|cost extra|how much|before that)\b/i.test(
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

function isV1LeadComplete(state: SalesState): boolean {
  return (
    state.leadStatus === "SECURED" &&
    isLeadSecured(state) &&
    isCustomerNeedSpecific(state.customerNeed) &&
    missingLeadFields(state).length === 0
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

  if (INFORMATION_GATHERING_OBJECTIVES.includes(state.currentObjective)) {
    return false;
  }

  const naturalEndpoint =
    state.customerAgreed ||
    state.currentObjective === "CLOSE" ||
    state.salesStage === "COMPLETED" ||
    detectCustomerFinished(latestUserText);

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

  if (state.customerAgreed || detectCustomerAgreement(latestUserText)) {
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
      !!state.preferredTiming
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
      })
    : createInitialSalesState();

  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  const text = latestUser?.content?.trim() || "";

  if (!text) {
    state.summary = buildSummary(state);
    return state;
  }

  const detectedIntent = detectIntent(text);
  // Low-intent browsing should not permanently overwrite an active high-intent journey
  // unless the conversation is still in discovery with no lead progress.
  if (detectedIntent === "LOW" && state.leadStatus === "NOT_SECURED" && !state.lead.name) {
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
  } else if (isBareAffirmative(text)) {
    // Agreeing to the prior proposal (visit/estimate) — not final conversation closure.
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

  const name = extractName(text, state.currentObjective);
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

  state.handoffReady = computeHandoffReady(state, text);

  state.summary = buildSummary(state);
  return state;
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
      : `leadDeliveryStatus=NOT_SENT. Do NOT claim you sent the request, handed it off, or that the team already has/will call about a delivered notification. You may say the details are captured.`
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
14. Only claim successful lead handoff/email/notification if leadDeliveryStatus=SENT.
15. Do NOT proactively ask for gate codes, pets, parking, doorman, or access instructions — the human team can collect those later unless the customer brings them up.
16. If preferredTiming is already established, do NOT keep refining appointment windows into smaller slots. Capture the preference and move on.
`.trim();
}

function objectiveInstruction(state: SalesState): string {
  switch (state.currentObjective) {
    case "COLLECT_NAME":
      return `YOUR ONLY OBJECTIVE: naturally collect the customer's first name only.
Respond with about one short sentence + exactly ONE question.
Do not ask for last name, phone, email, address, availability, or technical details.
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
Respond with about one short sentence + exactly ONE question.
Do not ask apartment number unless the customer volunteers ambiguity.
No brochure. No DIY. No solution pitch.`;
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
${
  state.preferredTiming
    ? `preferredTiming is already known (${state.preferredTiming}). Do NOT ask another timing/refinement question.`
    : "Ask at most ONE question if needed (e.g. rough preferred timing) — not operational access details."
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
If leadCapturePaused, do NOT ask for refused lead fields.
Continue selling the value of the next step. Ask at most ONE clarifying question if needed.`;
    case "HANDLE_COMPETITOR_OBJECTION":
      return `YOUR ONLY OBJECTIVE: handle competitor/price comparison.
No invented superiority. Use BusinessProfile-supported facts only. Ask at most ONE clarifying question if needed.`;
    case "HANDLE_HESITATION":
      return `YOUR ONLY OBJECTIVE: handle hesitation without pressure.
Ask at most ONE clarifying question if needed.`;
    case "CROSS_SELL":
      return `YOUR ONLY OBJECTIVE: introduce ONE naturally relevant additional BusinessProfile offering only if useful and timely.
Do not ambush before the primary need is handled.`;
    case "ADVANCE_TO_NEXT_STEP":
      return `YOUR ONLY OBJECTIVE: advance toward the business's real next step.
Do not invent availability windows or claim booking/dispatch.
Do NOT invent time slots such as 8–10, 10–12, 12–4, etc.
${
  state.preferredTiming
    ? `preferredTiming is already known (${state.preferredTiming}). Acknowledge it and do NOT ask to refine into a smaller window.`
    : "If useful, ask at most ONE open preference question (e.g. preferred day/time) without inventing windows."
}
Do NOT ask for gate codes, pets, parking, or access instructions.
Capture the customer's preference for the team — you do not have live scheduling.`;
    case "CLOSE":
      return `YOUR ONLY OBJECTIVE: close / hand off cleanly with a positive FINAL message — then STOP.
Do NOT ask any question (no "Anything else?", no "One quick question...", no "Would you like me to...", no access/timing/confirmation questions).
Do NOT repeat the service explanation or visit/estimate process.
Do NOT pretend the appointment is already booked or that availability is already confirmed.
Do NOT say "I can't book", "I can't complete the booking", or similar limitation language.

Preferred closing style (adapt with the customer's name and known facts only):
"Perfect${state.lead.name ? `, ${state.lead.name}` : ""}. I have everything we need: your contact details, ${state.customerNeed || "your service request"}${state.preferredTiming ? `, and your preferred time ${state.preferredTiming}` : ""}. Our team will get in touch with you to confirm availability and finalize the appointment."

Handoff language MUST match leadDeliveryStatus=${state.leadDeliveryStatus}:
- SENT: you may say the request was sent/captured for the team as above.
- NOT_SENT or FAILED: say the request/details are captured; do NOT claim a notification email was delivered.
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
        /\b(what(?:'s| is) your name|may i (have|get) your name|your name\??|last name)\b/i,
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
  business?: BusinessProfile
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
  return `
CORRECTION — previous draft violated Sales Controller rules:
${reasons.map((r) => `- ${r}`).join("\n")}

Rewrite the response.
Pursue ONLY currentObjective=${state.currentObjective}.
Ask at most ONE question.
Do not ask for already-collected or refused lead fields.
Do not invent prices, availability, booking, or dispatch.
Do not claim lead handoff/notification unless leadDeliveryStatus=SENT.
Do not give DIY tutorials or technician dumps.
If objective is CLOSE: give the positive final captured-request message using known name/need/timing only, then STOP. No questions. No access asks. No "anything else?".
Keep it natural and concise.
`.trim();
}
