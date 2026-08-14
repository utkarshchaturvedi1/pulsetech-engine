import { BusinessProfile } from "../types/business";
import {
  LeadFields,
  SalesIntent,
  SalesObjective,
  SalesState,
  UrgencyLevel,
  createInitialSalesState,
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

const FAKE_CAPABILITY_RE =
  /\b(i('ll| will)?\s+(dispatch|schedule|book)|i('ve| have)\s+(scheduled|booked|dispatched|sent this to dispatch)|check(ing)?\s+(live\s+)?availability|contact(ed|ing)?\s+(a\s+)?technician)\b/i;

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
  return [...facts, normalized].slice(-20);
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
    /\b(immediate|immediately|asap|emergency|urgent|right now|right away|as soon as possible)\b/.test(
      t
    )
  ) {
    return "IMMEDIATE";
  }
  if (/\b(soon|this week|quickly)\b/.test(t)) {
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

function inferCustomerNeed(
  text: string,
  previous: string | null
): string | null {
  const t = text.trim();
  if (t.length < 3) return previous;

  if (
    /\b(i need|i want|looking for|interested in|help with|problem with|issue with)\b/i.test(
      t
    ) ||
    /\b(repair|install|replace|service|quote|estimate)\b/i.test(t)
  ) {
    return t.length > 160 ? `${t.slice(0, 157)}...` : t;
  }

  return previous;
}

function requiredFieldsForIntent(intent: SalesIntent): Array<keyof LeadFields> {
  if (intent === "READY_TO_ACT") return ["name", "phone", "address"];
  if (intent === "HIGH") return ["name", "phone"];
  return ["name", "phone"];
}

function missingLeadFields(state: SalesState): Array<keyof LeadFields> {
  return state.requiredLeadFields.filter((field) => !state.lead[field]);
}

function isLeadSecured(state: SalesState): boolean {
  return missingLeadFields(state).length === 0;
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
    /\b(too expensive|more than i expected|cost too much|pricey|how much|what(?:'s| is) the (price|cost)|pricing)\b/.test(
      t
    )
  ) {
    if (/\b(how much|what(?:'s| is) the (price|cost)|pricing)\b/.test(t)) {
      return "HANDLE_PRICE_OBJECTION";
    }
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

  if (
    /\b(let'?s do it|go ahead|sign me up|i(?:'m| am) ready|book it|schedule it)\b/.test(
      t
    )
  ) {
    return "CLOSE";
  }

  if (/\b(next step|how do i (start|proceed)|get started)\b/.test(t)) {
    return "ADVANCE_TO_NEXT_STEP";
  }

  return null;
}

function selectObjective(state: SalesState, latestUserText: string): SalesObjective {
  if (state.leadStatus !== "SECURED") {
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
      return state.customerNeed ? "EXPLAIN_VALUE" : "UNDERSTAND_NEED";
    }

    return "UNDERSTAND_NEED";
  }

  const salesObjective = detectSalesObjective(latestUserText);
  if (salesObjective) return salesObjective;

  if (state.salesStage === "CLOSING") return "CLOSE";
  if (!state.customerNeed) return "UNDERSTAND_NEED";
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
    ? {
        ...previous,
        lead: { ...previous.lead },
        establishedFacts: [...previous.establishedFacts],
        objections: [...previous.objections],
        requiredLeadFields: [...previous.requiredLeadFields],
      }
    : createInitialSalesState();

  const latestUser = [...messages].reverse().find((m) => m.role === "user");
  const text = latestUser?.content?.trim() || "";

  if (!text) {
    state.summary = buildSummary(state);
    return state;
  }

  const detectedIntent = detectIntent(text);
  state.intent = maxIntent(state.intent, detectedIntent);

  const urgency = detectUrgency(text);
  if (urgency) {
    state.urgency = urgency;
    state.establishedFacts = addFact(
      state.establishedFacts,
      `Customer stated urgency: ${urgency}`
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

  state.customerNeed = inferCustomerNeed(text, state.customerNeed);

  const name = extractName(text, state.currentObjective);
  if (name && !state.lead.name) {
    state.lead.name = name;
    state.establishedFacts = addFact(state.establishedFacts, `name=${name}`);
  }

  const phone = extractPhone(text);
  if (phone && !state.lead.phone) {
    state.lead.phone = phone;
    state.establishedFacts = addFact(state.establishedFacts, `phone=${phone}`);
  }

  const email = extractEmail(text);
  if (email && !state.lead.email) {
    state.lead.email = email;
    state.establishedFacts = addFact(state.establishedFacts, `email=${email}`);
  }

  const address = extractAddress(text, state.currentObjective);
  if (address && !state.lead.address) {
    state.lead.address = address;
    state.establishedFacts = addFact(
      state.establishedFacts,
      `address=${address}`
    );
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
    // Expand requirements if intent escalates; never drop already required fields mid-securing.
    const merged = Array.from(
      new Set([...state.requiredLeadFields, ...required])
    ) as Array<keyof LeadFields>;
    state.requiredLeadFields = merged;
  }

  if (state.intent === "HIGH" || state.intent === "READY_TO_ACT") {
    if (isLeadSecured(state)) {
      state.leadStatus = "SECURED";
      state.salesStage = "SALES_MODE";
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

  if (objective === "HANDLE_PRICE_OBJECTION" ||
      objective === "HANDLE_COMPETITOR_OBJECTION" ||
      objective === "HANDLE_HESITATION") {
    state.salesStage = state.leadStatus === "SECURED" ? "OBJECTION" : state.salesStage;
  }

  if (objective === "CLOSE" || objective === "ADVANCE_TO_NEXT_STEP") {
    state.salesStage = "CLOSING";
  }

  if (state.leadStatus === "SECURED" && state.salesStage === "SECURING_LEAD") {
    state.salesStage = "SALES_MODE";
  }

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
- customerAvailable: ${state.customerAvailable === null ? "unknown" : state.customerAvailable}
- appointmentIntent: ${state.appointmentIntent === null ? "unknown" : state.appointmentIntent}
- requiredLeadFields: ${state.requiredLeadFields.join(", ")}

Lead fields:
${leadLines}

Established facts (DO NOT ask again):
${facts}

Objections noted:
${state.objections.length ? state.objections.map((o) => `- ${o}`).join("\n") : "- none"}

Summary: ${state.summary}

${objectiveDirective}

HARD RULES FOR THIS RESPONSE:
1. Pursue ONLY the currentObjective above.
2. Ask at most ONE question if a question is needed.
3. Do not ask for multiple lead fields in one response.
4. Do not ask for fields already collected.
5. Never claim to dispatch, schedule, book, check live availability, or contact a technician — those capabilities are not connected.
6. If leadStatus is SECURED, do not resume form-style lead collection.
`.trim();
}

function objectiveInstruction(state: SalesState): string {
  switch (state.currentObjective) {
    case "COLLECT_NAME":
      return `YOUR ONLY OBJECTIVE: naturally collect the customer's name.
Ask exactly ONE question.
Do not ask for phone, email, address, urgency, availability, technical details, or anything else.`;
    case "COLLECT_PHONE":
      return `YOUR ONLY OBJECTIVE: naturally collect the customer's phone number.
Ask exactly ONE question.
Do not ask any other question.`;
    case "COLLECT_EMAIL":
      return `YOUR ONLY OBJECTIVE: naturally collect the customer's email.
Ask exactly ONE question.
Do not ask any other question.`;
    case "COLLECT_ADDRESS":
      return `YOUR ONLY OBJECTIVE: naturally collect the service address.
Ask exactly ONE question.
Do not ask any other question.`;
    case "UNDERSTAND_NEED":
      return `YOUR ONLY OBJECTIVE: understand what the customer is trying to accomplish.
Ask at most ONE useful clarifying question if needed.
Do not collect contact fields unless already in SECURING_LEAD.`;
    case "ANSWER":
      return `YOUR ONLY OBJECTIVE: answer the customer's question helpfully using BusinessProfile.
Do not force lead capture.
Ask at most ONE natural follow-up if useful.`;
    case "PRESENT_SOLUTION":
      return `YOUR ONLY OBJECTIVE: present the relevant BusinessProfile-supported solution for this customer's need.
Sell clearly. Do not collect lead fields. Ask at most ONE question if needed.`;
    case "EXPLAIN_VALUE":
      return `YOUR ONLY OBJECTIVE: explain why the relevant offering matters to THIS customer.
Do not dump a catalogue. Ask at most ONE question if needed.`;
    case "HANDLE_PRICE_OBJECTION":
      return `YOUR ONLY OBJECTIVE: handle the price question/concern.
Acknowledge → understand → respond with BusinessProfile-supported information.
Do not invent prices. Ask at most ONE clarifying question if needed.`;
    case "HANDLE_COMPETITOR_OBJECTION":
      return `YOUR ONLY OBJECTIVE: handle the competitor/price comparison concern.
Do not attack competitors. Do not invent advantages. Ask at most ONE clarifying question if needed.`;
    case "HANDLE_HESITATION":
      return `YOUR ONLY OBJECTIVE: handle hesitation.
Understand the uncertainty, then help. Do not pressure. Ask at most ONE clarifying question if needed.`;
    case "CROSS_SELL":
      return `YOUR ONLY OBJECTIVE: introduce ONE naturally relevant additional offering from BusinessProfile, only if useful.
Do not ambush. Ask at most ONE question if needed.`;
    case "ADVANCE_TO_NEXT_STEP":
      return `YOUR ONLY OBJECTIVE: guide the customer toward the business's real next step.
Do not claim you have scheduled/dispatched anything. Ask at most ONE question if needed.`;
    case "CLOSE":
      return `YOUR ONLY OBJECTIVE: confidently close / confirm the next step the customer is ready for.
Do not invent application actions that are not connected. Ask at most ONE confirming question if needed.`;
    default:
      return `YOUR ONLY OBJECTIVE: ${state.currentObjective}
Ask at most ONE question if needed.`;
  }
}

function leadFieldAskPatterns(field: keyof LeadFields): RegExp[] {
  switch (field) {
    case "name":
      return [/\b(what(?:'s| is) your name|may i (have|get) your name|your name\??)\b/i];
    case "phone":
      return [
        /\b(what(?:'s| is) (the )?best (number|phone)|phone number|reach you|call you)\b/i,
      ];
    case "email":
      return [/\b(email|e-mail)\b/i];
    case "address":
      return [/\b(service address|what(?:'s| is) (the |your )?address|where (are you|is the)|property address)\b/i];
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

export function validateSalesReply(
  reply: string,
  state: SalesState
): ValidationResult {
  const reasons: string[] = [];

  if (FAKE_CAPABILITY_RE.test(reply)) {
    reasons.push("Unsupported capability claim (dispatch/schedule/availability).");
  }

  const leadAsks = countLeadFieldAsks(reply);
  const collecting =
    state.currentObjective === "COLLECT_NAME" ||
    state.currentObjective === "COLLECT_PHONE" ||
    state.currentObjective === "COLLECT_EMAIL" ||
    state.currentObjective === "COLLECT_ADDRESS";

  if (collecting && leadAsks > 1) {
    reasons.push("Multiple lead-field questions in one response.");
  }

  (Object.keys(state.lead) as Array<keyof LeadFields>).forEach((field) => {
    if (!state.lead[field]) return;
    if (leadFieldAskPatterns(field).some((re) => re.test(reply))) {
      reasons.push(`Asked for already-collected field: ${field}.`);
    }
  });

  if (state.urgency === "IMMEDIATE" && /\b(emergency service|is this an emergency|urgent\?)\b/i.test(reply)) {
    reasons.push("Re-asked urgency after customer already stated immediate need.");
  }

  const questionMarks = (reply.match(/\?/g) || []).length;
  if (collecting && questionMarks > 1) {
    reasons.push("More than one question while collecting a single lead field.");
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
Do not ask for already-collected lead fields.
Do not claim dispatch/scheduling/availability capabilities.
Keep it natural and concise.
`.trim();
}
