import { SalesState } from "./salesState";

export const LEAD_INACTIVITY_MS = 5 * 60 * 1000;

export type LeadHandoffReason = "closure" | "inactivity" | "urgent";

const CONCRETE_NEED_RE =
  /\b(clogged|broken|leaking|leak|damaged|flooding|not working|isn'?t working|won'?t|stopped|out of|making (a )?noise|no (hot )?water|too (hot|cold)|overheating|repair|fix|install|replace|replacement|cracked|missing|failed|faulty|pipe|infestat|infested|pests?|termite|new)\b/i;

function looksLikeGenericProviderRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/\bneed help with (my )?(house|home|place|property)\b/i.test(t)) return true;
  if (
    /\b(need|want|looking for)\s+(a|an|some)?\s*(someone|company|contractor|technician|tech|professional|specialist)(\s+(company|service|person))?\b/i.test(
      t
    )
  ) {
    return true;
  }
  return /^(hi[,!.]?\s*)?(i\s+)?(need|want|looking for)\s+(help|someone)\.?$/i.test(t);
}

export function hasConcreteNeed(need: string | null): boolean {
  if (!need || need.trim().length < 8) return false;
  const t = need.trim().toLowerCase();
  if (CONCRETE_NEED_RE.test(t)) return true;
  if (looksLikeGenericProviderRequest(t)) return false;
  return t.split(/\s+/).filter(Boolean).length >= 8;
}

/**
 * Qualified recoverable lead (SECURED + fields + need).
 * Does NOT mean handoff should fire — that also requires handoffReady.
 */
export function isLeadQualified(state: SalesState): boolean {
  if (state.leadDeliveryStatus === "SENT") return false;
  if (state.leadStatus !== "SECURED") return false;
  if (state.intent !== "HIGH" && state.intent !== "READY_TO_ACT") return false;
  if (!state.lead.name || !state.lead.phone || !state.lead.address) return false;
  if (!hasConcreteNeed(state.customerNeed)) return false;
  return true;
}

export function hasRequiredBusinessFields(state: SalesState): boolean {
  return state.requiredBusinessFields.every((field) =>
    state.capturedBusinessFields.some(
      (captured) => captured.toLowerCase() === field.toLowerCase()
    )
  );
}

/**
 * Allowed to attempt owner notification: qualified + handoffReady.
 */
export function isLeadReadyForHandoff(state: SalesState): boolean {
  if (!isLeadQualified(state)) return false;
  if (state.urgency === "IMMEDIATE") {
    return !state.awaitingCustomerResponse && !state.unresolvedCustomerIssue;
  }
  return (
    state.handoffReady === true &&
    hasRequiredBusinessFields(state) &&
    !state.awaitingCustomerResponse &&
    !state.unresolvedCustomerIssue
  );
}

/**
 * Immediate closure handoff when the controller has actually closed,
 * or on genuine agreement / natural "I'm done" language.
 */
export function isClosureHandoffTrigger(
  state: SalesState,
  latestUserMessage?: string
): boolean {
  if (state.urgency === "IMMEDIATE") return true;
  if (state.handoffReady === true && state.currentObjective === "CLOSE") {
    return true;
  }
  if (state.customerAgreed === true) return true;
  if (
    state.handoffReady === true &&
    state.currentObjective === "CLOSE" &&
    latestUserMessage &&
    looksLikeNaturalCompletion(latestUserMessage)
  ) {
    return true;
  }
  return false;
}

function looksLikeNaturalCompletion(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /\b(that'?s (all|everything|it)|nothing (else|more)|no more|i (think i )?have (it |everything )?(all )?covered|i(?:'m| am) (all )?good|all set|everything (is )?covered)\b/i.test(
      t
    ) ||
    /^(no[,.]?\s*)?(that'?s (all|everything|it)|nothing (else|more)|i'?m good|all set)\.?$/i.test(
      t
    ) ||
    /^(no[,.]?\s*)?that'?s it\.?$/i.test(t)
  );
}

export function shouldAttemptLeadHandoff(
  state: SalesState,
  reason: LeadHandoffReason,
  latestUserMessage?: string
): boolean {
  if (!isLeadReadyForHandoff(state)) return false;
  if (reason === "urgent") return state.urgency === "IMMEDIATE";
  if (state.urgency === "IMMEDIATE") return true;
  if (reason === "inactivity") return true;
  return isClosureHandoffTrigger(state, latestUserMessage);
}
