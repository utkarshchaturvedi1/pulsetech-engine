import { BusinessProfile } from "../types/business";
import { customerFacingBusinessProfile } from "./businessProfile";
import type { SalesObjective, SalesState } from "./salesState";

export type SalesEmotionMode =
  | "ASPIRATIONAL"
  | "PAIN"
  | "URGENT"
  | "UNCERTAIN"
  | "PRICE_CONCERN"
  | "SKEPTICAL"
  | "COMPARISON"
  | "READY"
  | "ROUTINE";

export type SalesMove =
  | "CONNECT"
  | "REASSURE"
  | "VALIDATE_PURCHASE"
  | "BUILD_TRUST"
  | "ANSWER_QUESTION"
  | "HANDLE_OBJECTION"
  | "REDUCE_RISK"
  | "CREATE_CLARITY"
  | "CREATE_MOMENTUM"
  | "SECURE_LEAD_FIELD"
  | "ADVANCE_NEXT_STEP"
  | "CLOSE"
  | "CLARIFY_SCOPE"
  | "ESTABLISH_CAPABILITY"
  | "ESTABLISH_LIMITATION"
  | "PRESERVE_PARTIAL_OPPORTUNITY";

export type ServiceScopeClass =
  | "SUPPORTED"
  | "PARTIALLY_SUPPORTED"
  | "UNKNOWN"
  | "UNSUPPORTED";

export type ServiceScopeResult = {
  classification: ServiceScopeClass;
  supportedParts: string[];
  unknownParts: string[];
  unsupportedParts: string[];
  pendingSupportedOpportunity: string | null;
};

export type CustomerSituationKind =
  | "ALREADY_OWNS_EQUIPMENT"
  | "REPLACING_WORKING"
  | "BROKEN_OR_FAILED"
  | "RENOVATING_OR_PROJECT"
  | "PRICE_FOCUSED"
  | "SKEPTICAL"
  | "READY_TO_PROCEED"
  | "GENERAL";

export type SalesCommitments = {
  estimateRequested: boolean;
  appointmentAccepted: boolean;
  preferredTiming: string | null;
  customerSaidYes: boolean;
  leadComplete: boolean;
  nextStepEstablished: boolean;
};

export type SalesBrainContext = {
  customerSituation: string;
  situationKind: CustomerSituationKind;
  customerEmotion: SalesEmotionMode;
  buyingStage: string;
  currentConcern: string;
  desiredCustomerFeeling: string;
  nextBeliefToCreate: string;
  smallestSalesContribution: string;
  recommendedSalesMove: SalesMove;
  operationalObjective: SalesObjective;
  alreadyCommunicatedSalesMoves: string[];
  groundedFactsAvailable: string[];
  relevantDifferentiator: string | null;
  commitments: SalesCommitments;
  oversellGuard: boolean;
  prohibitedUnsupportedClaims: string[];
  serviceScope: ServiceScopeClass | "";
  originalCustomerNeed: string | null;
  pendingSupportedOpportunity: string | null;
};

const PROHIBITED_UNSUPPORTED_CLAIMS = [
  "price",
  "discount",
  "unlisted service",
  "availability window",
  "appointment confirmation",
  "video / remote / phone consultation",
  "savings calculation",
  "system sizing",
  "portfolio / catalog",
  "subcontractor / electrician coordination",
  "response time",
  "warranty",
  "license",
  "experience years",
  "guarantee",
  "promotion",
];

type BrainInput = {
  state: SalesState;
  business: BusinessProfile;
  latestUserText: string;
  priorAssistantReplies?: string[];
};

export function inferSalesEmotion(
  latestUserText: string,
  state: SalesState
): SalesEmotionMode {
  const latest = latestUserText.trim();
  const need = (state.customerNeed || "").trim();
  const combined = `${latest}\n${need}`;

  if (isReadySignal(latest, state)) return "READY";
  if (isPriceConcern(latest)) return "PRICE_CONCERN";
  if (isComparison(latest)) return "COMPARISON";
  if (isSkeptical(latest)) return "SKEPTICAL";
  if (isUncertain(latest) && !isPainLanguage(combined)) return "UNCERTAIN";
  if (isUrgentLanguage(latest) || state.urgency === "IMMEDIATE") return "URGENT";
  if (isPainLanguage(latest) || isPainLanguage(need)) return "PAIN";
  if (isAspirationalLanguage(latest) || isAspirationalLanguage(need)) {
    return "ASPIRATIONAL";
  }
  return "ROUTINE";
}

/** Pain vs aspirational for existing reply validators — derived from words, not service category. */
export function salesNeedToneFromBrain(
  latestUserText: string,
  state: SalesState
): "pain" | "aspirational" | "neutral" {
  const emotion = inferSalesEmotion(latestUserText, state);
  if (emotion === "PAIN" || emotion === "URGENT") return "pain";
  if (emotion === "ASPIRATIONAL") return "aspirational";
  return "neutral";
}

export function inferCurrentConcern(
  latestUserText: string,
  state: SalesState
): string {
  const t = latestUserText.trim();
  if (!t) return state.customerNeed || "not yet established";
  if (isPriceConcern(t)) return "price / cost uncertainty";
  if (isComparison(t)) return "comparison with another option";
  if (isSkeptical(t)) return "trust / reliability of the company";
  if (isMaterialNeedClarification(t)) {
    return `clarified need: ${clip(state.customerNeed || t, 120)}`;
  }
  if (/\?/.test(t) || /\b(how much|can you|do you|are you|will you|warranty|licensed)\b/i.test(t)) {
    return `current question: ${clip(t, 120)}`;
  }
  if (isUncertain(t)) return "uncertainty about what to choose or whether to proceed";
  if (isPainLanguage(t) || isUrgentLanguage(t)) {
    return "getting the problem resolved";
  }
  if (isAspirationalLanguage(t)) return "moving the desired project forward";
  if (
    state.currentObjective.startsWith("COLLECT_") &&
    !scopeBlocksLeadCapture(state)
  ) {
    return "providing the next detail so the team can help";
  }
  return state.customerNeed || clip(t, 120);
}

export function chooseSalesMove(
  state: SalesState,
  latestUserText: string,
  emotion: SalesEmotionMode
): SalesMove {
  const objective = state.currentObjective;
  const askedQuestion = isGenuineQuestion(latestUserText);
  const fieldReply = looksLikeFieldProgressReply(latestUserText);
  const scopeMove = salesMoveForScope(state);

  if (fieldReply && (objective.startsWith("COLLECT_") || state.leadStatus === "SECURING")) {
    if (askedQuestion) {
      if (emotion === "SKEPTICAL") return "BUILD_TRUST";
      if (emotion === "PRICE_CONCERN") return "HANDLE_OBJECTION";
      return "ANSWER_QUESTION";
    }
    return "SECURE_LEAD_FIELD";
  }

  const situation = inferCustomerSituationKind(latestUserText, state);
  const commitments = listSalesCommitments(state);

  if (objective === "CLOSE") return "CLOSE";
  if (emotion === "READY" && state.leadStatus === "SECURED") return "CLOSE";
  if (
    commitments.leadComplete &&
    commitments.appointmentAccepted &&
    commitments.preferredTiming &&
    !askedQuestion &&
    emotion !== "PRICE_CONCERN" &&
    emotion !== "SKEPTICAL"
  ) {
    return "CLOSE";
  }

  if (objective === "HANDLE_PRICE_OBJECTION") {
    return "HANDLE_OBJECTION";
  }
  if (objective === "HANDLE_COMPETITOR_OBJECTION") return "HANDLE_OBJECTION";
  if (objective === "HANDLE_HESITATION") {
    return askedQuestion ? "CREATE_CLARITY" : "REDUCE_RISK";
  }
  if (objective === "ANSWER") {
    if (emotion === "SKEPTICAL") return "BUILD_TRUST";
    if (emotion === "PRICE_CONCERN") return "HANDLE_OBJECTION";
    return "ANSWER_QUESTION";
  }
  if (objective === "EXPLAIN_VALUE") return "BUILD_TRUST";
  if (objective === "ADVANCE_TO_NEXT_STEP") return "ADVANCE_NEXT_STEP";
  if (objective === "PRESENT_SOLUTION") {
    if (emotion === "READY" || commitments.appointmentAccepted) {
      return "ADVANCE_NEXT_STEP";
    }
    if (emotion === "ASPIRATIONAL") return "CREATE_MOMENTUM";
    if (emotion === "PAIN" || emotion === "URGENT") return "REASSURE";
    return "VALIDATE_PURCHASE";
  }
  if (objective === "UNDERSTAND_NEED") {
    return scopeMove || "CREATE_CLARITY";
  }

  if (
    objective === "COLLECT_NAME" ||
    objective === "COLLECT_PHONE" ||
    objective === "COLLECT_EMAIL" ||
    objective === "COLLECT_ADDRESS"
  ) {
    if (scopeMove && scopeBlocksLeadCapture(state)) {
      return scopeMove;
    }
    if (askedQuestion) {
      if (emotion === "SKEPTICAL") return "BUILD_TRUST";
      if (emotion === "PRICE_CONCERN") return "HANDLE_OBJECTION";
      return "ANSWER_QUESTION";
    }
    if (objective === "COLLECT_NAME") {
      if (situation === "ALREADY_OWNS_EQUIPMENT" || situation === "REPLACING_WORKING") {
        return "VALIDATE_PURCHASE";
      }
      if (emotion === "PAIN" || emotion === "URGENT" || situation === "BROKEN_OR_FAILED") {
        return "REASSURE";
      }
      if (emotion === "SKEPTICAL") return "BUILD_TRUST";
      if (emotion === "ASPIRATIONAL" || situation === "RENOVATING_OR_PROJECT") {
        return "CONNECT";
      }
      if (emotion === "READY" || situation === "READY_TO_PROCEED") {
        return "SECURE_LEAD_FIELD";
      }
      return "CONNECT";
    }
    return "SECURE_LEAD_FIELD";
  }

  if (askedQuestion) {
    if (emotion === "PRICE_CONCERN") return "HANDLE_OBJECTION";
    return "ANSWER_QUESTION";
  }
  if (scopeMove && scopeBlocksLeadCapture(state)) return scopeMove;
  return "CREATE_MOMENTUM";
}

export function detectCommunicatedSalesMoves(
  priorAssistantReplies: string[] | undefined
): string[] {
  const prior = (priorAssistantReplies || []).join("\n").toLowerCase();
  if (!prior.trim()) return [];

  const found: string[] = [];
  const mark = (label: string, re: RegExp) => {
    if (re.test(prior)) found.push(label);
  };

  mark("excitement_acknowledged", /\b(congrat|exciting|great (backyard |kitchen )?project|worthwhile|sounds like a (great|wonderful)|happy to help you get|we'd be glad|love to help|that's a (great|nice)|new (home|place)|auction)\b/i);
  mark("pain_acknowledged", /\b(sorry you'?re dealing|sorry to hear|let's get (this|it) resolved|house is freezing)\b/i);
  mark("license_trust_established", /\blicen[sc]ed\b/i);
  mark("insurance_established", /\binsured\b/i);
  mark("experience_established", /\b(experience|experienced|years|oldest|dealer|we('ve| have) (been|done)|regularly (handle|do)|family[- ]owned)\b/i);
  mark("local_service_area_established", /\b(we (serve|cover)|service area|local|in your area|dallas|dfw|university park|highland park)\b/i);
  mark("price_limitation_explained", /\b(do not publish|don'?t (publish|quote|give) (a )?(price|number)|pricing (depends|varies|based)|exact (price|cost)|without (seeing|an? (on[- ]site|visit))|can'?t (give|quote) .{0,24}(price|cost|number) without|depends on (the )?(property|equipment|scope))\b/i);
  mark("assessment_value_explained", /\b(on[- ]site (estimate|assessment|visit)|see(ing)? (the )?(property|home|house|unit|system)|property[- ]specific|rather than guessing)\b/i);
  mark("capability_explained", /\b(we (handle|do|offer|specialize|install|repair)|our team (handles|does)|hvac (install|repair|service|work))\b/i);
  mark("limitation_explained", /\b(don'?t have enough information|can(?:not|'t) confirm|not confirmed|not something (we|I) can confirm|available information|outside (our )?scope|don'?t (offer|handle) that)\b/i);
  mark("next_step_value_explained", /\b(on[- ]site (estimate|assessment|visit)|property[- ]specific|rather than guessing|team can (confirm|coordinate)|move forward with)\b/i);
  mark("warranty_explained", /\bwarrant(y|ies)\b/i);
  mark("diagnosis_needed_explained", /\b(diagnos|troubleshoot|see (the )?(unit|system|equipment)|inspect (the )?(unit|system))\b/i);
  mark("proceed_already_asked", /\b(would you like (to )?(proceed|move forward)|want to (proceed|move forward)|shall we (proceed|continue))\b/i);
  mark("owns_equipment_validated", /\b(already (have|bought|purchased)|you already have|since you already)\b/i);
  mark("generic_quality_claim", /\b(quality service|we(?:'re| are) (trusted|experienced)|trusted (local )?(company|team))\b/i);

  return found;
}

export function groundedFactsAvailable(business: BusinessProfile): string[] {
  const catalog = extractDifferentiatorCatalog(business);
  const facts = catalog.map((item) => item.fact);
  if (!facts.length) facts.push("only BusinessProfile facts may be used");
  return facts.slice(0, 10);
}

export function buildSalesBrainContext(input: BrainInput): SalesBrainContext {
  const { state, business, latestUserText, priorAssistantReplies } = input;
  const emotion = inferSalesEmotion(latestUserText, state);
  const situationKind = inferCustomerSituationKind(latestUserText, state);
  const currentConcern = inferCurrentConcern(latestUserText, state);
  const recommendedSalesMove = chooseSalesMove(state, latestUserText, emotion);
  const alreadyCommunicatedSalesMoves = detectCommunicatedSalesMoves(priorAssistantReplies);
  const commitments = listSalesCommitments(state);
  const catalog = extractDifferentiatorCatalog(business);
  const relevantDifferentiator = pickRelevantDifferentiator(
    emotion,
    situationKind,
    recommendedSalesMove,
    alreadyCommunicatedSalesMoves,
    catalog
  );
  const oversellGuard = shouldGuardOversell(emotion, situationKind, commitments, latestUserText);

  return {
    customerSituation: describeSituation(latestUserText, state, emotion, situationKind),
    situationKind,
    customerEmotion: emotion,
    buyingStage: describeBuyingStage(state),
    currentConcern,
    desiredCustomerFeeling: desiredFeeling(emotion, situationKind),
    nextBeliefToCreate: nextBeliefToCreate(emotion, situationKind, commitments, recommendedSalesMove),
    smallestSalesContribution: smallestSalesContribution(
      situationKind,
      recommendedSalesMove,
      commitments,
      relevantDifferentiator,
      oversellGuard
    ),
    recommendedSalesMove,
    operationalObjective: state.currentObjective,
    alreadyCommunicatedSalesMoves,
    groundedFactsAvailable: catalog.length
      ? catalog.map((item) => item.fact)
      : ["only BusinessProfile facts may be used"],
    relevantDifferentiator,
    commitments,
    oversellGuard,
    prohibitedUnsupportedClaims: PROHIBITED_UNSUPPORTED_CLAIMS,
    serviceScope: state.serviceScope || "",
    originalCustomerNeed: state.originalCustomerNeed,
    pendingSupportedOpportunity: state.pendingSupportedOpportunity,
  };
}

export function formatSalesBrainBlock(brain: SalesBrainContext): string {
  const communicated =
    brain.alreadyCommunicatedSalesMoves.length > 0
      ? brain.alreadyCommunicatedSalesMoves.map((item) => `- ${item}`).join("\n")
      : "- none yet";
  const grounded = brain.groundedFactsAvailable.map((item) => `- ${item}`).join("\n");
  const scopeBlocked =
    brain.serviceScope === "UNKNOWN" ||
    brain.serviceScope === "UNSUPPORTED" ||
    brain.serviceScope === "PARTIALLY_SUPPORTED";
  const c = brain.commitments;
  const commitments = [
    c.estimateRequested ? "- estimate/visit already requested or accepted" : null,
    c.appointmentAccepted ? "- appointment/visit intent already accepted" : null,
    c.preferredTiming ? `- preferred timing already supplied: ${c.preferredTiming}` : null,
    c.customerSaidYes ? "- customer already said yes / agreed to proceed" : null,
    c.leadComplete ? "- lead already complete" : null,
    c.nextStepEstablished ? "- next step already established" : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `
==================================================
SALES BRAIN — CONVERSATIONAL MOVE THIS TURN (DO NOT EXPOSE)
==================================================
Before writing, silently consider: "What does this customer need to understand, feel, or believe NEXT that would make choosing this business easier?"
Then: what operational step should advance (lead field, estimate, close)?
Choose the smallest useful sales contribution. Do not speechify.
Do not mention Sales Brain, modes, or these labels to the customer.
Operational lead fields are requirements/context, not an override script.

customerSituation: ${brain.customerSituation}
situationKind: ${brain.situationKind}
customerEmotion: ${brain.customerEmotion}
buyingStage: ${brain.buyingStage}
currentConcern: ${brain.currentConcern}
desiredCustomerFeeling: ${brain.desiredCustomerFeeling}
nextBeliefToCreate: ${brain.nextBeliefToCreate}
smallestSalesContribution: ${brain.smallestSalesContribution}
recommendedSalesMove: ${brain.recommendedSalesMove}
operationalObjective: ${brain.operationalObjective} (outstanding requirement — not automatic first words)
oversellGuard: ${brain.oversellGuard ? "ON — stop pitching; execute the next step" : "off"}
serviceScope: ${brain.serviceScope || "not classified"}
originalCustomerNeed: ${brain.originalCustomerNeed || "same as current / not set"}
pendingSupportedOpportunity: ${brain.pendingSupportedOpportunity || "none"}

PRIMARY MOVE THIS TURN: ${brain.recommendedSalesMove}
Do that move. Do not stack extra sales moves, credentials, or brochure points.
Do not invent capability, non-capability, prices, savings, or business facts.

SELL WHILE CAPTURING:
Lead-first remains. A short customer-specific value sentence MAY precede the lead question when useful.
Do not delay capture with a long sales speech.
COLLECT_NAME must not be only "Great, what's your first name?" when the customer gave a real situation — add one useful belief (understood / execution / compatibility / relief / project fit), then the name question.
Value must come from THIS customer's situation, not rotating "we're licensed / experienced / trusted / quality."
If they already own the equipment: they are further along — focus on correct installation/execution, not selling equipment.
If replacing working equipment: upgrade/smooth replacement/compatibility — not fear.
If something is broken: relief and restoring function — not cheerfulness.
If renovating: coordination / getting the project right.
If READY: make the next step easy; do not pitch.
Later COLLECT_* turns: a short thanks + the field is enough unless a NEW non-repeated situation line helps.

GROUNDED DIFFERENTIATION:
Use at most ONE relevant BusinessProfile proof point, and only if it helps the current concern.
Relevant unused differentiator this turn: ${brain.relevantDifferentiator || "none — do not volunteer generic credentials"}
Do not repeat a proof point already communicated.

PRICE / COST IS A BUYING MOMENT:
Acknowledge → answer truthfully (never invent a price) → reduce uncertainty → keep purchase momentum.
If an estimate/visit is already accepted, explain that the existing visit is how exact cost is determined. Do NOT ask whether they want an estimate. Do NOT ask them to reconfirm a next step they already agreed to. Preserve preferred timing. After answering, return to that existing next step or close.

COMMITMENTS ALREADY MADE (do not make the customer reconfirm these):
${commitments || "- none yet"}

Already communicated — do NOT repeat unless the customer asks:
${communicated}

Grounded facts available (only these / BusinessProfile):
${grounded}

Never invent: ${brain.prohibitedUnsupportedClaims.join(", ")}.
Do not manufacture fear. Do not pressure. Do not manipulate. Do not claim they will save money unless grounded.

LEAD FIELD REPLIES:
If the latest customer message is essentially a name, phone, address, email, or a bundle of those: do NOT reopen price, capability, scope, licensed/insured, empathy, or "would you like to proceed".
Say thanks (use their name if known) and ask only the next missing field.
Examples: "Thanks, JJ. What's the best phone number to reach you?" / "Thanks. What's the service address?"
If they already accepted the supported opportunity, never ask "Would you like to proceed?" again unless they withdraw or change scope.

RESPONSE SHAPE:
- 1–3 short sentences usually. One question maximum.
- One new trust/value point maximum, and only if it has not already been communicated.
- Respond to the customer's current meaning BEFORE advancing lead capture.
- If oversellGuard is ON or recommendedSalesMove is CLOSE: execute; do not add persuasion.
- If recommendedSalesMove is SECURE_LEAD_FIELD: a short thanks + the next field question is enough. Do not repeat PRICE_LIMITATION, DIAGNOSIS_NEEDED, SCOPE_LIMITATION, LICENSE_TRUST, PAIN_ACKNOWLEDGED, CAPABILITY, NEXT_STEP_VALUE, or ESTIMATE_VALUE.
- If recommendedSalesMove is VALIDATE_PURCHASE, CONNECT, or REASSURE during COLLECT_NAME: one situation-specific sentence + the name question.
- If recommendedSalesMove is BUILD_TRUST or ANSWER_QUESTION: do that first, then ask the next required field only if the opportunity is already a supported (or accepted partial) need.
- If recommendedSalesMove is HANDLE_OBJECTION and a next step is already accepted: answer the objection; never re-ask for that next step.
- If recommendedSalesMove is HANDLE_OBJECTION and serviceScope is not SUPPORTED: answer the concern honestly, do not invent the unknown service, and do not collect a lead field this turn.
- If recommendedSalesMove is CLARIFY_SCOPE, ESTABLISH_LIMITATION, ESTABLISH_CAPABILITY, or PRESERVE_PARTIAL_OPPORTUNITY: do NOT ask for name/phone/address this turn.
- If recommendedSalesMove is PRESERVE_PARTIAL_OPPORTUNITY: be honest that the unconfirmed part is not confirmed by available information; positively establish the supported part; ask if they want to move forward with that supported part — unless they already said yes, in which case collect the next lead field instead.
- UNKNOWN limitation language: "I don't have enough information here to confirm that service." Do NOT say "we don't offer that" unless serviceScope is UNSUPPORTED.
- If the customer asked a genuine question: answer it first, then return to operationalObjective only if a lead field is still required AND the need is supported AND they have not already completed that step. Capture any name/phone/address they included in the same message.
- If information is unavailable: acknowledge, be honest, do not start a fake questionnaire, then continue the real supported next step already in motion.
${scopeBlocked ? "- HARD GROUNDING: do not claim the unconfirmed work, invent electrical hookups, or sell an estimate/appointment for the unconfirmed scope." : ""}
`.trim();
}

function describeSituation(
  latestUserText: string,
  state: SalesState,
  emotion: SalesEmotionMode,
  situationKind: CustomerSituationKind
): string {
  const need = state.customerNeed || clip(latestUserText, 80) || "need not yet stated";
  const original =
    state.originalCustomerNeed && state.originalCustomerNeed !== state.customerNeed
      ? `originalContext=${clip(state.originalCustomerNeed, 60)}`
      : "originalContext=current";
  const lead =
    state.leadStatus === "SECURED"
      ? "lead secured"
      : state.leadStatus === "SECURING"
        ? "lead being secured"
        : "lead not secured";
  const scope = state.serviceScope || "scope-unclassified";
  const notes = (state.customerContext || []).slice(-4).join("; ") || "no extra buying notes";
  return `${emotion.toLowerCase()} / ${situationKind}; currentNeed=${need}; ${original}; ${scope}; ${lead}; urgency=${state.urgency}; notes=${clip(notes, 160)}`;
}

function describeBuyingStage(state: SalesState): string {
  if (state.currentObjective === "CLOSE" || state.customerAgreed) return "ready_to_close";
  if (state.leadStatus === "SECURED") return "evaluating_next_step";
  if (state.leadStatus === "SECURING") return "high_intent_capture";
  if (state.intent === "LOW") return "researching";
  if (state.intent === "MEDIUM") return "considering";
  return "expressing_need";
}

function desiredFeeling(emotion: SalesEmotionMode, situationKind: CustomerSituationKind): string {
  if (situationKind === "ALREADY_OWNS_EQUIPMENT") {
    return "They get that I already have the item and can install/execute it correctly.";
  }
  if (situationKind === "REPLACING_WORKING") {
    return "They understand this is an upgrade/replacement, not a panic repair.";
  }
  if (situationKind === "RENOVATING_OR_PROJECT") {
    return "They will help get this project coordinated and done right.";
  }
  switch (emotion) {
    case "ASPIRATIONAL":
      return "These people get the project and want to help me do it.";
    case "PAIN":
      return "They understand the problem and can handle it.";
    case "URGENT":
      return "They're taking this seriously and moving now.";
    case "UNCERTAIN":
      return "They can help me get clear without pressure.";
    case "PRICE_CONCERN":
      return "They're honest about cost and not pushing a fake number.";
    case "SKEPTICAL":
      return "They're actually a reliable company.";
    case "COMPARISON":
      return "There's a grounded reason to choose them.";
    case "READY":
      return "We're done talking and the next step is happening.";
    default:
      return "They understand what I need and want my business.";
  }
}

export function inferCustomerSituationKind(
  latestUserText: string,
  state: SalesState
): CustomerSituationKind {
  const latest = latestUserText.trim();
  const corpus = `${latest}\n${state.customerNeed || ""}\n${(state.customerContext || []).join("\n")}`;

  if (isReadySignal(latest, state) && state.leadStatus === "SECURED") {
    return "READY_TO_PROCEED";
  }
  if (isPriceConcern(latest)) return "PRICE_FOCUSED";
  if (isSkeptical(latest)) return "SKEPTICAL";
  if (alreadyOwnsEquipment(corpus)) return "ALREADY_OWNS_EQUIPMENT";
  if (replacingWorkingEquipment(corpus)) return "REPLACING_WORKING";
  if (isPainLanguage(latest) || isPainLanguage(state.customerNeed || "")) {
    return "BROKEN_OR_FAILED";
  }
  if (renovationOrProject(corpus)) return "RENOVATING_OR_PROJECT";
  if (isReadySignal(latest, state)) return "READY_TO_PROCEED";
  return "GENERAL";
}

export function listSalesCommitments(state: SalesState): SalesCommitments {
  const facts = (state.establishedFacts || []).join("\n");
  const notes = (state.customerContext || []).join("\n");
  const blob = `${facts}\n${notes}`;
  const estimateRequested =
    state.appointmentIntent === true ||
    /nextStepKind=on-site/i.test(blob) ||
    /agreed to the proposed next step/i.test(blob) ||
    /interested in an on-site visit or estimate/i.test(blob);
  const appointmentAccepted = state.appointmentIntent === true;
  const nextStepEstablished =
    appointmentAccepted ||
    /nextStepKind=on-site/i.test(blob) ||
    /agreed to the proposed next step/i.test(blob);

  return {
    estimateRequested,
    appointmentAccepted,
    preferredTiming: state.preferredTiming,
    customerSaidYes: state.customerAgreed || appointmentAccepted || state.opportunityAccepted,
    leadComplete: state.leadStatus === "SECURED",
    nextStepEstablished,
  };
}

function alreadyOwnsEquipment(text: string): boolean {
  return /\b(already (bought|purchased|have|got)|have already (bought|purchased|got)|i (bought|purchased) (a |an |the )?new)\b/i.test(
    text
  );
}

function replacingWorkingEquipment(text: string): boolean {
  return /\b(working old|still works|still working|just want (a |to )?(new|upgrade|install a new)|new version|upgrade (the |my |our )?(old |existing ))\b/i.test(
    text
  );
}

function renovationOrProject(text: string): boolean {
  return /\b(renovat|remodel|redoing|redo (the |my )|new (kitchen|bathroom|bath)|backyard project)\b/i.test(
    text
  );
}

function nextBeliefToCreate(
  emotion: SalesEmotionMode,
  situationKind: CustomerSituationKind,
  commitments: SalesCommitments,
  move: SalesMove
): string {
  if (move === "CLOSE" || (commitments.leadComplete && commitments.appointmentAccepted && emotion === "READY")) {
    return "The next step is already in motion; nothing more to sell.";
  }
  if (emotion === "PRICE_CONCERN" || situationKind === "PRICE_FOCUSED") {
    return "Honest cost process — no fake number — existing next step still stands.";
  }
  if (situationKind === "ALREADY_OWNS_EQUIPMENT") {
    return "Correct installation with their existing equipment is the job, and this team can do it.";
  }
  if (situationKind === "REPLACING_WORKING") {
    return "A smooth replacement/upgrade will be handled professionally.";
  }
  if (situationKind === "BROKEN_OR_FAILED" || emotion === "PAIN" || emotion === "URGENT") {
    return "Relief is coming; the problem can be restored without extra uncertainty.";
  }
  if (situationKind === "RENOVATING_OR_PROJECT" || emotion === "ASPIRATIONAL") {
    return "This project will be coordinated and done right.";
  }
  if (emotion === "SKEPTICAL" || situationKind === "SKEPTICAL") {
    return "There is one concrete reason this business is reliable.";
  }
  if (move === "SECURE_LEAD_FIELD") {
    return "Giving the next detail is easy and useful.";
  }
  return "Choosing this business is a low-friction way to solve the stated need.";
}

function smallestSalesContribution(
  situationKind: CustomerSituationKind,
  move: SalesMove,
  commitments: SalesCommitments,
  differentiator: string | null,
  oversellGuard: boolean
): string {
  if (oversellGuard || move === "CLOSE") {
    return "No more persuasion. Acknowledge and execute the existing next step / close.";
  }
  if (move === "HANDLE_OBJECTION" && commitments.estimateRequested) {
    return "Answer the price/concern honestly; do not re-ask for the estimate; keep the agreed visit/timing.";
  }
  if (move === "VALIDATE_PURCHASE" && situationKind === "ALREADY_OWNS_EQUIPMENT") {
    return "Validate they already have the item; one line on correct install/compatibility; then the operational question.";
  }
  if (move === "VALIDATE_PURCHASE" && situationKind === "REPLACING_WORKING") {
    return "Validate the upgrade/replacement; one line that professional swap/compatibility matters; then the operational question.";
  }
  if (move === "REASSURE") {
    return "Brief empathy + competence; then the operational question.";
  }
  if (move === "CONNECT") {
    return "Show you understand this specific project; then the operational question.";
  }
  if (move === "BUILD_TRUST") {
    return differentiator
      ? `Use this one grounded proof point: ${differentiator}`
      : "Answer the trust concern from BusinessProfile only, then continue.";
  }
  if (move === "SECURE_LEAD_FIELD") {
    return "Short thanks or situation nod, then only the next required field.";
  }
  if (differentiator && (move === "CREATE_MOMENTUM" || move === "ADVANCE_NEXT_STEP")) {
    return `Advance the next step. Optional unused proof: ${differentiator}`;
  }
  return "One useful sentence for this situation, then the operational step.";
}

function shouldGuardOversell(
  emotion: SalesEmotionMode,
  situationKind: CustomerSituationKind,
  commitments: SalesCommitments,
  latestUserText: string
): boolean {
  if (emotion === "PRICE_CONCERN" || situationKind === "PRICE_FOCUSED") return false;
  if (emotion === "SKEPTICAL" || isSkeptical(latestUserText)) return false;
  if (emotion === "READY" || situationKind === "READY_TO_PROCEED") return true;
  if (
    commitments.leadComplete &&
    commitments.appointmentAccepted &&
    commitments.preferredTiming &&
    !isGenuineQuestion(latestUserText)
  ) {
    return true;
  }
  return false;
}

type Differentiator = { id: string; fact: string };

function extractDifferentiatorCatalog(business: BusinessProfile): Differentiator[] {
  const profile = customerFacingBusinessProfile(business);
  const blob = [
    profile.businessName,
    profile.tagline,
    profile.systemPrompt,
    ...profile.services,
    ...profile.serviceAreas,
    ...profile.faqs.map((faq) => `${faq.question} ${faq.answer}`),
  ].join("\n");
  const items: Differentiator[] = [];
  const add = (id: string, fact: string) => {
    if (!items.some((item) => item.id === id)) items.push({ id, fact });
  };

  if (profile.businessName) add("businessName", `businessName=${profile.businessName}`);
  if (profile.tagline) add("tagline", `tagline=${profile.tagline}`);
  if (profile.services[0]) add("specialization", `specialization=${profile.services[0]}`);
  if (profile.serviceAreas[0]) add("serviceArea", `serviceArea=${profile.serviceAreas[0]}`);
  if (/licen[sc]ed/i.test(blob)) add("licensed", "licensed=supported");
  if (/\binsured\b/i.test(blob)) add("insured", "insured=supported");
  const years = blob.match(/\b(\d{2,}\s+years?|since\s+\d{4}|family[- ]owned|oldest)\b/i);
  if (years) add("history", `history=${years[0]}`);
  if (/\bwarrant(y|ies)\b/i.test(blob)) add("warranty", "warranty=supported");
  if (/\bfinanc/i.test(blob)) add("financing", "financing=supported");
  if (/\bcertif/i.test(blob)) add("certification", "certification=supported");
  if (/\bguarantee/i.test(blob)) add("guarantee", "guarantee=supported");
  if (/on[- ]site (estimate|assessment)/i.test(blob)) add("process", "onSiteEstimate=supported");
  if (/\b(same[- ]day|24\s*\/\s*7|response time)\b/i.test(blob)) {
    add("responseModel", "responseModel=mentioned in profile");
  }
  for (const faq of profile.faqs.slice(0, 3)) {
    add(`faq:${clip(faq.question, 32)}`, `faq:${clip(faq.question, 48)}`);
  }
  return items;
}

function pickRelevantDifferentiator(
  emotion: SalesEmotionMode,
  situationKind: CustomerSituationKind,
  move: SalesMove,
  alreadyCommunicated: string[],
  catalog: Differentiator[]
): string | null {
  const used = new Set(alreadyCommunicated);
  const unused = (id: string) => {
    const item = catalog.find((entry) => entry.id === id);
    if (!item) return null;
    if (id === "licensed" && used.has("license_trust_established")) return null;
    if (id === "insured" && used.has("insurance_established")) return null;
    if (id === "history" && used.has("experience_established")) return null;
    if (id === "serviceArea" && used.has("local_service_area_established")) return null;
    if (id === "warranty" && used.has("warranty_explained")) return null;
    if (id === "process" && used.has("assessment_value_explained")) return null;
    return item.fact;
  };

  if (move === "CLOSE" || move === "SECURE_LEAD_FIELD") return null;
  if (emotion === "SKEPTICAL" || situationKind === "SKEPTICAL" || move === "BUILD_TRUST") {
    return unused("licensed") || unused("insured") || unused("history") || unused("guarantee");
  }
  if (emotion === "PRICE_CONCERN" || situationKind === "PRICE_FOCUSED" || move === "HANDLE_OBJECTION") {
    return unused("process");
  }
  if (emotion === "COMPARISON") {
    return unused("history") || unused("specialization") || unused("warranty") || unused("licensed");
  }
  if (move === "VALIDATE_PURCHASE" || move === "CONNECT" || move === "REASSURE") {
    return null;
  }
  return null;
}

function looksLikeFieldProgressReply(text: string): boolean {
  const t = text.trim();
  if (!t || /\?/.test(t)) return false;
  const digits = t.replace(/[\s().-]/g, "");
  if (/^\d{7,15}$/.test(digits)) return true;
  if (/^[A-Za-z][A-Za-z.'-]{1,40}(?:\s+[A-Za-z][A-Za-z.'-]{1,40})?$/.test(t)) return true;
  if (
    /\b\d{1,6}\s+[A-Za-z0-9.'\- ]+?\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|circle|cir|place|pl)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (/\b\d{5}(?:-\d{4})?\b/.test(t) && /\b(st|street|ave|dallas|tx)\b/i.test(t)) {
    return true;
  }
  return false;
}

function isPainLanguage(text: string): boolean {
  return /\b(not working|isn'?t working|won'?t (turn|start|heat|cool)|broken|leaking|leak|clogged|flooding|cracked|damaged|stopped working|outage|no (hot )?water|too (hot|cold)|overheating|infestat|infested|faulty|failed|freezing|repair|fix this|water (is )?(everywhere|all over)|emergency repair)\b/i.test(
    text
  );
}

function isUrgentLanguage(text: string): boolean {
  return /\b(asap|emergency|urgent|right now|right away|immediately|flooding|freezing|water (is )?(everywhere|all over)|need someone today)\b/i.test(
    text
  );
}

function isAspirationalLanguage(text: string): boolean {
  if (isPainLanguage(text) || isUrgentLanguage(text)) return false;
  return /\b(want(ed)? (a|an|to)|we'?ve wanted|i'?ve wanted|always wanted|beautiful|modern|remodel|renovat|upgrade|install|getting|dream|excited|looking forward|backyard project|worthwhile)\b/i.test(
    text
  );
}

function isPriceConcern(text: string): boolean {
  return /\b(too expensive|that'?s expensive|more than i expected|cost too much|pricey|how much|what(?:'s| is) the (price|cost)|concerned about (the )?(price|cost)|need to know (the )?(price|cost)|i need (a |the )?(price|cost)|can you (do|go) (it )?cheaper)\b/i.test(
    text
  );
}

function isSkeptical(text: string): boolean {
  return /\b(how do i know|are you (licensed|insured|reliable|legit)|why should i (trust|choose|use)|reliable|reviews?|trustworthy|scam)\b/i.test(
    text
  );
}

function isComparison(text: string): boolean {
  return /\b(another (company|one|provider)|competitor|cheaper|quoted me less|vs\.?|compared to)\b/i.test(
    text
  );
}

function isUncertain(text: string): boolean {
  return /\b(not sure|need to think|think about it|maybe|don'?t know|unsure|what (should|would) i (get|buy|choose))\b/i.test(
    text
  );
}

function isReadySignal(text: string, state: SalesState): boolean {
  if (state.customerAgreed || state.currentObjective === "CLOSE") return true;
  return /\b(yes|sounds good|go ahead|that'?s fine|thank you|that'?s everything|perfect)\b/i.test(
    text
  ) && (state.leadStatus === "SECURED" || state.handoffReady);
}

function isGenuineQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^[A-Za-z][A-Za-z.'-]{1,40}(?:\s+[A-Za-z][A-Za-z.'-]{1,40})?$/.test(t)) return false;
  if (/\?/.test(t)) return true;
  return /\b(how much|are you|can you|do you|will you|why should|warranty|licensed|how do i know)\b/i.test(
    t
  );
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 3)}...`;
}

const MATCH_STOP = new Set([
  "that",
  "this",
  "with",
  "from",
  "have",
  "want",
  "need",
  "like",
  "just",
  "your",
  "their",
  "about",
  "home",
  "house",
  "work",
  "recently",
  "bought",
  "auction",
  "redo",
  "full",
  "plus",
  "also",
  "and",
  "the",
  "for",
  "you",
  "can",
  "how",
  "much",
  "cost",
  "what",
  "when",
  "will",
  "would",
  "could",
  "does",
  "offer",
  "help",
  "please",
  "someone",
  "today",
  "still",
  "really",
  "into",
  "over",
  "been",
  "they",
  "them",
  "our",
  "are",
  "was",
  "were",
  "has",
  "had",
  "but",
  "not",
  "too",
  "any",
  "get",
  "got",
  "make",
  "made",
  "come",
  "give",
  "take",
  "type",
  "kind",
  "something",
  "stuff",
  "thing",
  "place",
  "i",
  "we",
  "my",
  "me",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "or",
  "it",
  "do",
  "if",
  "so",
  "as",
  "by",
  "at",
  "is",
  "be",
  "been",
  "there",
  "here",
  "out",
  "up",
  "down",
  "back",
  "then",
  "than",
  "very",
  "also",
  "actually",
  "mean",
  "specifically",
  "instead",
  "rather",
  "whole",
  "entire",
]);

const PREFIX_FALSE_FRIENDS = new Set([
  "light",
  "high",
  "well",
  "just",
  "over",
  "under",
  "all",
  "one",
  "pre",
  "non",
  "auto",
  "mini",
  "multi",
]);

const GENERIC_SYMPTOM = new Set([
  "hot",
  "cold",
  "freezing",
  "leaking",
  "leak",
  "broken",
  "stopped",
  "working",
  "noisy",
  "loud",
  "water",
  "everywhere",
  "issue",
  "problem",
  "damage",
  "damaged",
  "cracked",
  "clogged",
  "flooding",
  "failed",
  "faulty",
]);

const PLACE_WORDS = new Set([
  "kitchen",
  "bathroom",
  "bedroom",
  "backyard",
  "garage",
  "basement",
  "attic",
  "upstairs",
  "downstairs",
  "indoor",
  "outdoor",
]);

const SHORT_DISTINCT_SERVICE = new Set(["ac", "hvac", "pool", "spa"]);

export function scopeBlocksLeadCapture(state: Pick<SalesState, "serviceScope" | "opportunityAccepted">): boolean {
  if (state.opportunityAccepted) return false;
  return (
    state.serviceScope === "UNKNOWN" ||
    state.serviceScope === "UNSUPPORTED" ||
    state.serviceScope === "PARTIALLY_SUPPORTED"
  );
}

function salesMoveForScope(state: SalesState): SalesMove | null {
  if (state.opportunityAccepted) return null;
  if (state.serviceScope === "PARTIALLY_SUPPORTED") {
    return "PRESERVE_PARTIAL_OPPORTUNITY";
  }
  if (state.serviceScope === "UNKNOWN") {
    return state.pendingSupportedOpportunity
      ? "PRESERVE_PARTIAL_OPPORTUNITY"
      : "ESTABLISH_LIMITATION";
  }
  if (state.serviceScope === "UNSUPPORTED") {
    return state.pendingSupportedOpportunity
      ? "PRESERVE_PARTIAL_OPPORTUNITY"
      : "ESTABLISH_LIMITATION";
  }
  return null;
}

export function isMaterialNeedClarification(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (/^[A-Za-z][A-Za-z.'-]{1,40}(?:\s+[A-Za-z][A-Za-z.'-]{1,40})?$/.test(t)) {
    return false;
  }
  if (/\d{7,}/.test(t) && t.replace(/\d/g, "").trim().length < 8) return false;
  if (
    /^(yes|yeah|yep|no|nope|ok|okay|thanks|thank you|sure)\b/i.test(t) &&
    t.split(/\s+/).length <= 4
  ) {
    return false;
  }
  if (
    /\b(i think )?(it was|they were|it were) (an? )?(electrician|plumber|hvac|technician|contractor)\b/i.test(
      t
    ) &&
    !/\b(need|want|rewir|install|replace|do the|can you)\b/i.test(t)
  ) {
    return false;
  }
  if (/\?/.test(t) && !/\b(actually|i mean|specifically|instead)\b/i.test(t)) {
    return false;
  }
  if (
    /\b(actually|i mean|to clarify|specifically|instead|just the|full[- ]house|rather than|not (the )?electrical|i meant)\b/i.test(
      t
    )
  ) {
    return true;
  }
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 16) {
    return /\b(rewir|electri|lighting|hvac|heater|furnace|air[\s-]?condition|a\/c|\bac\b|sink|jacuzzi|plumb|solar|panel|duct|thermostat|install|repair|replace|rewire|pool|fountain|landscap)\b/i.test(
      t
    );
  }
  return false;
}

export function classifyServiceScope(
  need: string | null | undefined,
  business: BusinessProfile
): ServiceScopeResult {
  const empty: ServiceScopeResult = {
    classification: "UNKNOWN",
    supportedParts: [],
    unknownParts: [],
    unsupportedParts: [],
    pendingSupportedOpportunity: null,
  };
  const text = (need || "").trim();
  if (!text) return { ...empty, classification: "UNKNOWN" };

  const profile = customerFacingBusinessProfile(business);
  const knowledge = [
    profile.businessName,
    profile.tagline,
    profile.systemPrompt,
    ...profile.services,
    ...profile.serviceAreas,
    ...profile.faqs.map((faq) => `${faq.question} ${faq.answer}`),
    ...profile.leadQuestions,
  ]
    .join("\n")
    .toLowerCase();
  const knowledgeWords = tokenizeKnowledge(knowledge);
  const phrases = splitNeedPhrases(text);
  const supportedParts: string[] = [];
  const unknownParts: string[] = [];
  const unsupportedParts: string[] = [];

  for (const phrase of phrases) {
    const tokens = distinctiveTokens(phrase);
    if (!tokens.length) continue;
    const contentTokens = tokens.filter(
      (token) => !GENERIC_SYMPTOM.has(token) && !PLACE_WORDS.has(token)
    );
    if (!contentTokens.length) continue;
    if (isExplicitlyDenied(phrase, contentTokens, knowledge)) {
      unsupportedParts.push(phrase);
      continue;
    }
    if (contentTokens.some((token) => knowledgeCoversToken(token, knowledge, knowledgeWords))) {
      supportedParts.push(phrase);
    } else if (
      contentTokens.some(
        (token) => token.length >= 6 || SHORT_DISTINCT_SERVICE.has(token)
      )
    ) {
      unknownParts.push(phrase);
    }
  }

  const pendingSupportedOpportunity = labelSupportedOpportunity(
    supportedParts,
    profile.services
  );

  if (unsupportedParts.length && !supportedParts.length && !unknownParts.length) {
    return {
      classification: "UNSUPPORTED",
      supportedParts,
      unknownParts,
      unsupportedParts,
      pendingSupportedOpportunity,
    };
  }
  if (unsupportedParts.length && supportedParts.length) {
    return {
      classification: "PARTIALLY_SUPPORTED",
      supportedParts,
      unknownParts,
      unsupportedParts,
      pendingSupportedOpportunity,
    };
  }
  if (supportedParts.length && (unknownParts.length || unsupportedParts.length)) {
    return {
      classification: "PARTIALLY_SUPPORTED",
      supportedParts,
      unknownParts,
      unsupportedParts,
      pendingSupportedOpportunity,
    };
  }
  if (supportedParts.length) {
    return {
      classification: "SUPPORTED",
      supportedParts,
      unknownParts,
      unsupportedParts,
      pendingSupportedOpportunity,
    };
  }
  if (unknownParts.length) {
    return {
      classification: "UNKNOWN",
      supportedParts,
      unknownParts,
      unsupportedParts,
      pendingSupportedOpportunity,
    };
  }
  // No distinct unmatched service and no positive match: do not invent a
  // limitation, and do not block normal lead-first for ordinary problems.
  return {
    classification: "SUPPORTED",
    supportedParts,
    unknownParts,
    unsupportedParts,
    pendingSupportedOpportunity: null,
  };
}

export function resolveOpportunityScope(
  currentNeed: string | null,
  originalNeed: string | null,
  business: BusinessProfile,
  opportunityAccepted: boolean
): ServiceScopeResult {
  const current = classifyServiceScope(currentNeed, business);
  if (opportunityAccepted) {
    const accepted = classifyServiceScope(
      currentNeed || current.pendingSupportedOpportunity,
      business
    );
    if (accepted.classification === "UNKNOWN" && current.pendingSupportedOpportunity) {
      return classifyServiceScope(current.pendingSupportedOpportunity, business);
    }
    return accepted.classification === "UNKNOWN" ? current : accepted;
  }
  if (
    current.classification === "SUPPORTED" ||
    current.classification === "PARTIALLY_SUPPORTED"
  ) {
    return current;
  }
  if (originalNeed && originalNeed !== currentNeed) {
    const original = classifyServiceScope(originalNeed, business);
    if (original.supportedParts.length) {
      return {
        classification: "PARTIALLY_SUPPORTED",
        supportedParts: original.supportedParts,
        unknownParts: current.unknownParts.length
          ? current.unknownParts
          : currentNeed
            ? [currentNeed]
            : original.unknownParts,
        unsupportedParts: [
          ...current.unsupportedParts,
          ...original.unsupportedParts,
        ],
        pendingSupportedOpportunity: original.pendingSupportedOpportunity,
      };
    }
  }
  return current;
}

function splitNeedPhrases(text: string): string[] {
  const cleaned = text
    .replace(/\b(can you do that|how much will it cost|how much does it cost|what(?:'s| is) the (price|cost))\b/gi, " ")
    .replace(/[?!.]+/g, " ");
  const parts = cleaned
    .split(/\b(?:and|,|;|\+|plus|like|as well as|also|along with|including)\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
  return parts.length ? parts : [text.trim()];
}

function distinctiveTokens(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .replace(/[^a-z0-9/+\s-]/g, " ")
    .split(/[\s/+\-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !MATCH_STOP.has(token));
}

function tokenizeKnowledge(knowledge: string): string[] {
  return knowledge
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s/-]+/)
    .filter((token) => token.length >= 2 && !MATCH_STOP.has(token));
}

function knowledgeCoversToken(
  token: string,
  knowledge: string,
  knowledgeWords: string[]
): boolean {
  const candidates = expandToken(token);
  return candidates.some((t) => {
    if (t.length <= 2) {
      return new RegExp(`\\b${escapeRegExp(t)}\\b`, "i").test(knowledge);
    }
    if (new RegExp(`\\b${escapeRegExp(t)}`, "i").test(knowledge)) {
      return true;
    }
    return knowledgeWords.some((word) => tokensRelated(t, word));
  });
}

function expandToken(token: string): string[] {
  const t = token.toLowerCase();
  if (/^termite/.test(t) || /^infest/.test(t)) return [t, "pest", "pests"];
  if (/^pest/.test(t)) return [t, "termite", "termites"];
  return [t];
}

function tokensRelated(a: string, b: string): boolean {
  if (a === b) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (i < 4) return false;
  const aRest = a.slice(i);
  const bRest = b.slice(i);
  const inflection = /^(s|es|er|ers|ing|ings|ion|tions|ation|al|ical|e)?$/;
  if (!aRest) {
    return inflection.test(bRest) && !PREFIX_FALSE_FRIENDS.has(a);
  }
  if (!bRest) {
    return inflection.test(aRest) && !PREFIX_FALSE_FRIENDS.has(b);
  }
  return inflection.test(aRest) && inflection.test(bRest);
}

function isExplicitlyDenied(
  _phrase: string,
  tokens: string[],
  knowledge: string
): boolean {
  const denial =
    knowledge.match(
      /((?:we|they|company)\s+)?(do not|don't|does not|doesn't)\s+(offer|handle|perform|provide|do|sell)[^.!\n]{0,80}/gi
    ) || [];
  if (!denial.length) return false;
  return denial.some((window) =>
    tokens.some((token) => token.length >= 4 && window.includes(token))
  );
}

function labelSupportedOpportunity(
  supportedParts: string[],
  services: string[]
): string | null {
  if (!supportedParts.length) return null;
  const matched = services.filter((service) => {
    const serviceTokens = distinctiveTokens(service);
    return supportedParts.some((part) => {
      const partTokens = distinctiveTokens(part);
      return partTokens.some((token) =>
        serviceTokens.some((serviceToken) => tokensRelated(token, serviceToken) || service.toLowerCase().includes(token))
      );
    });
  });
  if (matched.length) {
    const labels = Array.from(
      new Set(
        matched
          .map((service) =>
            service
              .replace(/\b(repair|installation|maintenance|diagnostics?)\b/gi, "")
              .trim()
          )
          .filter(Boolean)
      )
    ).slice(0, 3);
    return labels.join(" / ") || matched.slice(0, 2).join(" / ");
  }
  return supportedParts.slice(0, 3).join(" / ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
