import type { BusinessProfile } from "../types/business";
import type { SalesState } from "./salesState";

const CORE_QUESTION = /^(?:what(?:'s| is)|may i (?:have|get)|can i (?:have|get))\s+(?:(?:your|the|best)\s+)*(?:first name|full name|name|phone(?: number)?|number to reach you|service address|address)\b/i;

/** Narrow, explicit answers that do not require a remote classifier. */
export function explicitOwnerAnswer(question: string, reply: string): boolean {
  if (!reply.trim() || /\?|\b(how much|what.*cost|what.*price)\b/i.test(reply)) return false;
  if (/\b(prefer not to answer|do not want to answer|don'?t want to answer|rather not say)\b/i.test(reply)) return true;
  if (/^(?:do|does|did|is|are|was|were|have|has|will|would)\b/i.test(question.trim()) && /^(?:yes|no|yep|nope|yeah|sure|yes please)[.!]?$/i.test(reply.trim())) return true;
  const descriptionQuestion = /\b(?:describe|what)\b.*\b(?:problem|project|work|service|help)\b/i.test(question);
  return descriptionQuestion && /\b(?:i|we)\s+(?:need|want|would like)\s+(?:to\s+)?(?:install|repair|replace|fix|build|renovate|upgrade|remove|clean|service)\b/i.test(reply);
}

export function ownerRequiredQuestions(business: BusinessProfile): string[] {
  return [...new Set((business.leadQuestions || []).map((q) => q.trim()).filter((q) => q && !CORE_QUESTION.test(q)))];
}

export function synchronizeOwnerQuestions(state: SalesState, business: BusinessProfile): SalesState {
  const required = ownerRequiredQuestions(business);
  return {
    ...state,
    ownerQuestionAnswers: { ...(state.ownerQuestionAnswers || {}) },
    requiredOwnerQuestions: required,
    pendingOwnerQuestion: required.includes(state.pendingOwnerQuestion || "") ? state.pendingOwnerQuestion : null,
  };
}

export function missingOwnerQuestions(state: SalesState): string[] {
  return (state.requiredOwnerQuestions || []).filter((q) => !state.ownerQuestionAnswers?.[q]);
}

/** Only consume an answer to the question the server actually asked. */
export function captureOwnerQuestionAnswer(state: SalesState, latest: string, previousAssistant?: string, verified?: boolean): void {
  const pending = state.pendingOwnerQuestion;
  if (!pending || !previousAssistant?.includes(pending)) return;
  if (explicitOwnerAnswer(pending, latest)) verified = true;
  if (verified === false) return;
  // Semantic verification is question-specific; generic interruption patterns must
  // not veto a valid description, requested day, or other natural answer.
  if (verified === true && latest.trim()) {
    state.ownerQuestionAnswers[pending] = latest.trim();
    state.pendingOwnerQuestion = null;
    return;
  }
  if (!latest.trim() || /\?|\b(how much|overall cost|total cost|what.*cost|what.*price|instead|why do you|why are you)\b/i.test(latest)) return;
  // An unrelated explicit service/timing request must not count as a qualification answer.
  if (/\b(can you come|please (?:schedule|book)|i (?:need|want) to (?:install|repair|replace))\b/i.test(latest)) return;
  if (/^(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening))?[.!]?$/i.test(latest.trim()) && !/\b(when|day|time)\b/i.test(pending)) return;
  state.ownerQuestionAnswers[pending] = latest.trim();
  state.pendingOwnerQuestion = null;
}

export function ownerQuestionReply(state: SalesState): string | null {
  if (!state.lead.name || !state.lead.phone || !state.lead.address) return null;
  if (state.leadDeliveryStatus === "QUEUED" || state.leadDeliveryStatus === "SENT") return null;
  const question = missingOwnerQuestions(state)[0];
  if (!question) return null;
  state.pendingOwnerQuestion = question;
  return question;
}
