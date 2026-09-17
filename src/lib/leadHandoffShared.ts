import { SalesState } from "./salesState";
import { isImmediateVisitFollowupLanguage } from "./schedulingPolicy";

export const LEAD_INACTIVITY_MS = 5 * 60 * 1000;

export type LeadHandoffReason = "closure" | "inactivity";

const CONCRETE_NEED_RE =
  /\b(clogged|broken|leaking|leak|damaged|flooding|not working|isn'?t working|won'?t|stopped|out of|making (a )?noise|no (hot )?water|too (hot|cold)|overheating|repair|fix|install|replace|cracked|missing|failed|faulty|pipe|hornet|wasp|yellowjacket|bee|pest|rodent|termite|ant|spider|infestation|nest|removed?|removal)\b/i;

export function hasConcreteNeed(need: string | null): boolean {
  if (!need || need.trim().length < 8) return false;
  const t = need.trim().toLowerCase();
  if (CONCRETE_NEED_RE.test(t)) return true;
  const genericProvider =
    /^(hi[,!.]?\s*)?(i\s+)?(need|want|looking for)\s+(a|an|some|someone|help)?\s*[\w\s-]{1,40}\.?$/i.test(
      t
    ) ||
    /\bi need (a|an)\s+[\w-]+(\s+(company|service|person|tech|technician|contractor))?\b/i.test(
      t
    );
  if (genericProvider) return false;
  return t.split(/\s+/).filter(Boolean).length >= 8;
}

/**
 * Website chat capture complete: name, phone, address, preferred visit time.
 * This is the primary handoff trigger — independent of concrete-need regex quirks.
 */
export function isWebsiteLeadCaptureComplete(state: SalesState): boolean {
  return Boolean(
    state.lead.name &&
      state.lead.phone &&
      state.lead.address &&
      state.preferredTiming
  );
}

/**
 * Qualified recoverable lead (SECURED + fields + need).
 * Does NOT mean handoff should fire — that also requires handoffReady
 * or preferred timing / website capture completion.
 */
export function isLeadQualified(state: SalesState): boolean {
  if (state.leadDeliveryStatus === "SENT") return false;
  if (state.leadStatus !== "SECURED") return false;
  if (state.intent !== "HIGH" && state.intent !== "READY_TO_ACT") return false;
  if (!state.lead.name || !state.lead.phone || !state.lead.address) return false;
  if (!hasConcreteNeed(state.customerNeed)) return false;
  return true;
}

/**
 * Allowed to attempt owner notification once capture is complete, or at a
 * natural close endpoint for a qualified lead.
 */
export function isLeadReadyForHandoff(state: SalesState): boolean {
  if (state.leadDeliveryStatus === "SENT") return false;
  if (isWebsiteLeadCaptureComplete(state)) return true;
  if (!isLeadQualified(state)) return false;
  return state.handoffReady === true;
}

/**
 * After the lead is captured, a visit-timing / urgency request should notify the
 * business immediately (website chat and the same policy as inbound voice).
 */
export function isVisitFollowupAlertTrigger(
  state: SalesState,
  latestUserMessage?: string
): boolean {
  if (!latestUserMessage) return false;
  if (!state.lead.name || !state.lead.phone || !state.lead.address) return false;
  if (
    state.leadStatus !== "SECURED" &&
    state.intent !== "HIGH" &&
    state.intent !== "READY_TO_ACT"
  ) {
    return false;
  }
  return isImmediateVisitFollowupLanguage(latestUserMessage);
}

export function isClosureHandoffTrigger(
  state: SalesState,
  latestUserMessage?: string
): boolean {
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
  if (state.leadDeliveryStatus === "SENT") return false;

  // Primary website-chat path: name + phone + address + preferred time.
  if (isWebsiteLeadCaptureComplete(state)) return true;

  if (reason === "inactivity") return isLeadReadyForHandoff(state);
  if (isVisitFollowupAlertTrigger(state, latestUserMessage)) return true;
  if (!isLeadQualified(state)) return false;
  if (isLeadReadyForHandoff(state)) return true;
  return isClosureHandoffTrigger(state, latestUserMessage);
}
