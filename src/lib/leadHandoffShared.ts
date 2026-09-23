import { SalesState } from "./salesState";
import {
  detectVisitPreferenceRequest,
  extractPreferredVisitTimeFromText,
  isImmediateVisitFollowupLanguage,
} from "./schedulingPolicy";

export const LEAD_INACTIVITY_MS = 5 * 60 * 1000;

export type LeadHandoffReason = "closure" | "inactivity";

export const HANDOFF_REQUIRED_FIELD_NAMES = [
  "name",
  "phone",
  "address",
  "preferredTiming",
] as const;

export type HandoffRequiredFieldName =
  (typeof HANDOFF_REQUIRED_FIELD_NAMES)[number];

export type HandoffDeliveryLogStatus =
  | "queued"
  | "sent"
  | "failed"
  | "not_sent";

export type HandoffReadinessDecision = {
  handoffReady: boolean;
  missingRequiredFields: HandoffRequiredFieldName[];
  visitorRequestedProceedOrCompleted: boolean;
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}

export function effectivePreferredTiming(
  state: SalesState,
  latestUserMessage?: string
): string | null {
  if (hasText(state.preferredTiming)) return state.preferredTiming!.trim();
  if (!latestUserMessage) return null;
  return extractPreferredVisitTimeFromText(latestUserMessage);
}

export function missingHandoffRequiredFields(
  state: SalesState,
  latestUserMessage?: string
): HandoffRequiredFieldName[] {
  const missing: HandoffRequiredFieldName[] = [];
  if (!hasText(state.lead.name)) missing.push("name");
  if (!hasText(state.lead.phone)) missing.push("phone");
  if (!hasText(state.lead.address)) missing.push("address");
  if (!effectivePreferredTiming(state, latestUserMessage)) {
    missing.push("preferredTiming");
  }
  return missing;
}

function looksLikeConversationCompleted(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
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

function looksLikeRequestToProceed(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (detectVisitPreferenceRequest(t)) return true;
  return /\b(let'?s do it|let'?s (move forward|proceed|schedule)|go ahead|please go ahead|please proceed|sign me up|i(?:'d| would) like to (move forward|proceed|get this done)|okay[,.]? let'?s|yes[,.]? let'?s|yes[,.]?\s*please|book it|schedule it|please have someone (contact|call|come)|send (this|it) to the team|next step|get started)\b/i.test(
    t
  );
}

export function visitorRequestedProceedOrCompleted(
  state: SalesState,
  latestUserMessage?: string
): boolean {
  if (state.customerAgreed) return true;
  if (state.appointmentIntent === true) return true;
  if (state.salesStage === "COMPLETED") return true;
  if (looksLikeConversationCompleted(latestUserMessage || "")) return true;
  if (latestUserMessage && looksLikeRequestToProceed(latestUserMessage)) {
    return true;
  }
  return false;
}

/**
 * Central, deterministic handoff-readiness decision for every chat path.
 * Independent of service keywords, intent labels, and model wording.
 */
export function evaluateHandoffReadiness(
  state: SalesState,
  latestUserMessage?: string
): HandoffReadinessDecision {
  const missingRequiredFields = missingHandoffRequiredFields(
    state,
    latestUserMessage
  );
  const proceedOrCompleted = visitorRequestedProceedOrCompleted(
    state,
    latestUserMessage
  );
  return {
    handoffReady:
      missingRequiredFields.length === 0 && proceedOrCompleted,
    missingRequiredFields,
    visitorRequestedProceedOrCompleted: proceedOrCompleted,
  };
}

export function toHandoffDeliveryLogStatus(
  status: SalesState["leadDeliveryStatus"] | "QUEUED" | "SENT" | "FAILED" | "NOT_SENT"
): HandoffDeliveryLogStatus {
  if (status === "QUEUED") return "queued";
  if (status === "SENT") return "sent";
  if (status === "FAILED") return "failed";
  return "not_sent";
}

export function isHandoffAlreadyScheduled(state: SalesState): boolean {
  return (
    state.leadDeliveryStatus === "SENT" || state.leadDeliveryStatus === "QUEUED"
  );
}

const GENERIC_NEED_RE =
  /\b(clogged|broken|leaking|leak|damaged|flooding|not working|isn'?t working|won'?t|stopped|out of|making (a )?noise|no (hot )?water|no (heat|cooling|air(?:flow)?)|not (heat(?:ing)?|cool(?:ing)?)|too (hot|cold)|overheating|repair|fix|install|replace|cracked|missing|failed|faulty)\b/i;

export function hasConcreteNeed(need: string | null): boolean {
  if (!need || need.trim().length < 8) return false;
  const t = need.trim().toLowerCase();
  if (GENERIC_NEED_RE.test(t)) return true;
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

/** @deprecated Use evaluateHandoffReadiness — kept for callers that only need field presence. */
export function isWebsiteLeadCaptureComplete(state: SalesState): boolean {
  return missingHandoffRequiredFields(state).length === 0;
}

/**
 * Qualified recoverable lead (SECURED + fields + need).
 * Does NOT mean handoff should fire — that also requires handoffReady.
 */
export function isLeadQualified(state: SalesState): boolean {
  if (isHandoffAlreadyScheduled(state)) return false;
  if (state.leadStatus !== "SECURED") return false;
  if (state.intent !== "HIGH" && state.intent !== "READY_TO_ACT") return false;
  if (!state.lead.name || !state.lead.phone || !state.lead.address) return false;
  if (!hasConcreteNeed(state.customerNeed)) return false;
  return true;
}

/**
 * Allowed to attempt owner notification once the central readiness decision is true.
 */
export function isLeadReadyForHandoff(
  state: SalesState,
  latestUserMessage?: string
): boolean {
  if (isHandoffAlreadyScheduled(state)) return false;
  return evaluateHandoffReadiness(state, latestUserMessage).handoffReady;
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
    looksLikeConversationCompleted(latestUserMessage)
  ) {
    return true;
  }
  return false;
}

export function shouldAttemptLeadHandoff(
  state: SalesState,
  reason: LeadHandoffReason,
  latestUserMessage?: string
): boolean {
  if (isHandoffAlreadyScheduled(state)) return false;
  if (reason === "inactivity") {
    return state.handoffReady === true;
  }
  const decision = evaluateHandoffReadiness(state, latestUserMessage);
  return decision.handoffReady;
}

export function publicHandoffDecisionLog(params: {
  decision: HandoffReadinessDecision;
  deliveryStatus: HandoffDeliveryLogStatus;
}): {
  handoffReady: boolean;
  missingRequiredFields: HandoffRequiredFieldName[];
  visitorRequestedProceedOrCompleted: boolean;
  deliveryStatus: HandoffDeliveryLogStatus;
} {
  return {
    handoffReady: params.decision.handoffReady,
    missingRequiredFields: params.decision.missingRequiredFields,
    visitorRequestedProceedOrCompleted:
      params.decision.visitorRequestedProceedOrCompleted,
    deliveryStatus: params.deliveryStatus,
  };
}
