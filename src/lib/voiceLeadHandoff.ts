import type { BusinessProfile } from "../types/business";
import {
  extractCalledNumberFromPostCall,
  extractPostCallDemoId,
} from "./inboundVoice";
import {
  maybeSendLeadHandoff,
  scheduleLeadAlertDelivery,
  type LeadAlertAfter,
  type LeadHandoffResult,
} from "./leadHandoff";
import { evaluateHandoffReadiness } from "./leadHandoffShared";
import {
  extractLeadUrgency,
  extractPhoneLead,
  extractPreferredVisitTime,
  transcriptToText,
  type PhoneLead,
} from "./phoneLead";
import { updateSalesStateFromTurn, type ChatTurnMessage } from "./salesController";
import {
  businessIdentityKey,
  createInitialSalesState,
  isValidConversationId,
  type SalesState,
} from "./salesState";

export type VoiceHandoffSkipReason =
  | "not_transcription"
  | "missing_conversation_id"
  | "demo_unresolved"
  | "incomplete"
  | "duplicate"
  | "not_ready"
  | null;

export type VoiceHandoffQueueStatus =
  | "queued"
  | "sent"
  | "failed"
  | "skipped"
  | "not_sent";

export type VoiceLeadHandoffDecision = {
  eventType: string;
  conversationId: string;
  demoResolved: boolean;
  extractedFields: {
    name: boolean;
    phone: boolean;
    address: boolean;
    preferredTiming: boolean;
    need: boolean;
  };
  voiceHandoffReady: boolean;
  queueStatus: VoiceHandoffQueueStatus;
  skipReason: VoiceHandoffSkipReason;
};

export type VoiceLeadHandoffResult = VoiceLeadHandoffDecision & {
  attempted: boolean;
  emailTo?: string;
  smsTo?: string;
  delivery?: () => Promise<void>;
  salesState?: SalesState;
};

const queuedConversationIds = new Set<string>();

export function resetVoiceLeadHandoffIdempotencyForTests(): void {
  queuedConversationIds.clear();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function isPostCallTranscriptionEvent(payload: {
  type?: string;
  data?: unknown;
}): boolean {
  if (payload.type && payload.type !== "post_call_transcription") return false;
  const data = asRecord(payload.data);
  if (!data) return false;
  if (payload.type === "post_call_transcription") return true;
  return Array.isArray(data.transcript) || typeof data.transcript === "string";
}

export function extractConversationIdFromPostCall(
  data: Record<string, unknown>
): string {
  if (typeof data.conversation_id === "string" && data.conversation_id.trim()) {
    return data.conversation_id.trim();
  }
  const initiation = asRecord(data.conversation_initiation_client_data);
  const vars = asRecord(initiation?.dynamic_variables);
  const fromVars =
    (typeof vars?.system__conversation_id === "string" &&
      vars.system__conversation_id.trim()) ||
    (typeof vars?.conversation_id === "string" && vars.conversation_id.trim()) ||
    "";
  return fromVars;
}

export function extractDataCollectionResults(
  data: Record<string, unknown>
): Record<string, unknown> {
  const analysis = asRecord(data.analysis);
  const fromAnalysis = asRecord(analysis?.data_collection_results);
  const fromData = asRecord(data.data_collection_results);
  const merged: Record<string, unknown> = { ...(fromData || {}), ...(fromAnalysis || {}) };

  const list =
    (Array.isArray(analysis?.data_collection_results_list) &&
      analysis.data_collection_results_list) ||
    (Array.isArray(data.data_collection_results_list) &&
      data.data_collection_results_list) ||
    [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const key =
      (typeof row.identifier === "string" && row.identifier) ||
      (typeof row.id === "string" && row.id) ||
      (typeof row.name === "string" && row.name) ||
      "";
    if (!key) continue;
    merged[key] = row.value !== undefined ? row.value : row;
  }
  return merged;
}

export function extractCallerPhoneFromMetadata(
  data: Record<string, unknown>
): string {
  const metadata = asRecord(data.metadata);
  const phoneCall =
    asRecord(metadata?.phone_call) ||
    asRecord(metadata?.phoneCall) ||
    asRecord(data.phone_call);
  const candidates = [
    phoneCall?.external_number,
    phoneCall?.from,
    phoneCall?.caller_number,
    phoneCall?.customer_number,
    metadata?.from,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.replace(/\D/g, "").length >= 7) {
      return candidate.trim();
    }
  }
  return "";
}

function transcriptToChatMessages(transcript: unknown): ChatTurnMessage[] {
  if (!Array.isArray(transcript)) {
    if (typeof transcript === "string" && transcript.trim()) {
      return [{ role: "user", content: transcript.trim() }];
    }
    return [];
  }
  const messages: ChatTurnMessage[] = [];
  for (const turn of transcript) {
    const row = asRecord(turn);
    if (!row) continue;
    const content =
      (typeof row.message === "string" && row.message.trim()) ||
      (typeof row.text === "string" && row.text.trim()) ||
      "";
    if (!content) continue;
    const role = String(row.role || "").toLowerCase();
    messages.push({
      role: role === "agent" || role === "assistant" ? "assistant" : "user",
      content,
    });
  }
  return messages;
}

function present(value: string | null | undefined): boolean {
  return Boolean(value && value.trim());
}

export function extractedFieldPresence(state: SalesState): VoiceLeadHandoffDecision["extractedFields"] {
  return {
    name: present(state.lead.name),
    phone: present(state.lead.phone),
    address: present(state.lead.address),
    preferredTiming: present(state.preferredTiming),
    need: present(state.customerNeed),
  };
}

export function evaluateVoiceLeadReadiness(state: SalesState): {
  ready: boolean;
  missingRequiredFields: string[];
} {
  const decision = evaluateHandoffReadiness(state);
  const fields = extractedFieldPresence(state);
  const missingRequiredFields: string[] = [];
  if (!fields.name) missingRequiredFields.push("name");
  if (!fields.phone) missingRequiredFields.push("phone");
  if (!fields.address) missingRequiredFields.push("address");
  if (!fields.preferredTiming) missingRequiredFields.push("preferredTiming");
  if (!fields.need && !decision.visitorRequestedProceedOrCompleted) {
    missingRequiredFields.push("need");
  }
  return {
    ready: decision.handoffReady && missingRequiredFields.length === 0,
    missingRequiredFields,
  };
}

export function buildVoiceLeadSalesState(params: {
  data: Record<string, unknown>;
  business: BusinessProfile;
  conversationId: string;
  demoId?: string;
}): { state: SalesState; lead: PhoneLead } {
  const collected = extractDataCollectionResults(params.data);
  const transcriptText = transcriptToText(params.data.transcript);
  const lead = extractPhoneLead(collected, {
    businessName: params.business.businessName,
    demoId: params.demoId,
    isTestData: Boolean(params.business.isTestData),
    transcriptText,
  });
  if (!lead.phone) {
    lead.phone = extractCallerPhoneFromMetadata(params.data);
  }
  if (!lead.preferredVisitTime) {
    lead.preferredVisitTime = extractPreferredVisitTime(collected, transcriptText);
  }
  if (lead.urgency === "NONE") {
    lead.urgency = extractLeadUrgency(collected, transcriptText);
  }

  let state = createInitialSalesState({
    conversationId: params.conversationId,
    businessKey: businessIdentityKey(params.business) || params.demoId || "",
  });
  if (lead.name) state.lead.name = lead.name;
  if (lead.phone) state.lead.phone = lead.phone;
  if (lead.email) state.lead.email = lead.email;
  if (lead.address) state.lead.address = lead.address;
  if (lead.need) state.customerNeed = lead.need;
  if (lead.preferredVisitTime) state.preferredTiming = lead.preferredVisitTime;
  state.urgency = lead.urgency;
  if (lead.name && lead.phone && lead.address) {
    state.intent = "HIGH";
    state.leadStatus = "SECURED";
  }

  const messages = transcriptToChatMessages(params.data.transcript);
  const history: ChatTurnMessage[] = [];
  for (const message of messages) {
    history.push(message);
    if (message.role !== "user") continue;
    state = updateSalesStateFromTurn(state, history, params.business);
  }

  if (lead.name && !state.lead.name) state.lead.name = lead.name;
  if (lead.phone && !state.lead.phone) state.lead.phone = lead.phone;
  if (lead.address && !state.lead.address) state.lead.address = lead.address;
  if (lead.need && !state.customerNeed) state.customerNeed = lead.need;
  if (lead.preferredVisitTime && !state.preferredTiming) {
    state.preferredTiming = lead.preferredVisitTime;
  }
  if (lead.urgency !== "NONE") state.urgency = lead.urgency;

  state.handoffReady = evaluateVoiceLeadReadiness(state).ready;
  if (state.handoffReady) {
    state.appointmentIntent = true;
    state.currentObjective = "CLOSE";
  }
  return { state, lead };
}

export function publicVoiceHandoffLog(
  decision: VoiceLeadHandoffDecision
): VoiceLeadHandoffDecision {
  return {
    eventType: decision.eventType,
    conversationId: decision.conversationId || "(none)",
    demoResolved: decision.demoResolved,
    extractedFields: decision.extractedFields,
    voiceHandoffReady: decision.voiceHandoffReady,
    queueStatus: decision.queueStatus,
    skipReason: decision.skipReason,
  };
}

function queueStatusFromHandoff(
  result: LeadHandoffResult
): VoiceHandoffQueueStatus {
  if (result.status === "QUEUED") return "queued";
  if (result.status === "SENT") return "sent";
  if (result.status === "FAILED") return "failed";
  return "not_sent";
}

export async function processVoiceLeadHandoff(params: {
  eventType: string;
  data: Record<string, unknown>;
  business: BusinessProfile | null;
  demoId?: string;
  demoResolved: boolean;
}): Promise<VoiceLeadHandoffResult> {
  const conversationId = extractConversationIdFromPostCall(params.data);
  const emptyFields = {
    name: false,
    phone: false,
    address: false,
    preferredTiming: false,
    need: false,
  };

  function finish(
    partial: Omit<VoiceLeadHandoffResult, "eventType" | "conversationId" | "demoResolved">
  ): VoiceLeadHandoffResult {
    const decision: VoiceLeadHandoffResult = {
      eventType: params.eventType || "(none)",
      conversationId: conversationId || "(none)",
      demoResolved: params.demoResolved,
      ...partial,
    };
    console.log("[voice-lead]", publicVoiceHandoffLog(decision));
    return decision;
  }

  if (!params.demoResolved || !params.business) {
    return finish({
      extractedFields: emptyFields,
      voiceHandoffReady: false,
      queueStatus: "skipped",
      skipReason: "demo_unresolved",
      attempted: false,
    });
  }

  if (!isValidConversationId(conversationId)) {
    return finish({
      extractedFields: emptyFields,
      voiceHandoffReady: false,
      queueStatus: "skipped",
      skipReason: "missing_conversation_id",
      attempted: false,
    });
  }

  if (queuedConversationIds.has(conversationId)) {
    const { state } = buildVoiceLeadSalesState({
      data: params.data,
      business: params.business,
      conversationId,
      demoId: params.demoId,
    });
    return finish({
      extractedFields: extractedFieldPresence(state),
      voiceHandoffReady: evaluateVoiceLeadReadiness(state).ready,
      queueStatus: "skipped",
      skipReason: "duplicate",
      attempted: false,
      salesState: state,
    });
  }

  const { state } = buildVoiceLeadSalesState({
    data: params.data,
    business: params.business,
    conversationId,
    demoId: params.demoId,
  });
  const fields = extractedFieldPresence(state);
  const readiness = evaluateVoiceLeadReadiness(state);
  state.handoffReady = readiness.ready;

  if (!readiness.ready) {
    return finish({
      extractedFields: fields,
      voiceHandoffReady: false,
      queueStatus: "skipped",
      skipReason: "incomplete",
      attempted: false,
      salesState: state,
    });
  }

  const latestUser = transcriptToChatMessages(params.data.transcript)
    .reverse()
    .find((m) => m.role === "user");
  const handoff = await maybeSendLeadHandoff(
    params.business,
    state,
    "closure",
    latestUser?.content
  );

  if (handoff.status === "QUEUED" || handoff.status === "SENT") {
    queuedConversationIds.add(conversationId);
  }

  if (!handoff.attempted) {
    return finish({
      extractedFields: fields,
      voiceHandoffReady: true,
      queueStatus: queueStatusFromHandoff(handoff),
      skipReason: "not_ready",
      attempted: false,
      salesState: state,
    });
  }

  return finish({
    extractedFields: fields,
    voiceHandoffReady: true,
    queueStatus: queueStatusFromHandoff(handoff),
    skipReason: null,
    attempted: true,
    emailTo: handoff.emailTo,
    smsTo: handoff.smsTo,
    delivery: handoff.delivery,
    salesState: state,
  });
}

export function scheduleVoiceLeadAlertDelivery(
  afterFn: LeadAlertAfter,
  delivery?: () => Promise<void>
): void {
  scheduleLeadAlertDelivery(afterFn, delivery);
}

export function postCallContextLogFields(data: Record<string, unknown>): {
  calledNumber: string;
  demoIdHint: string;
  conversationId: string;
} {
  return {
    calledNumber: extractCalledNumberFromPostCall(data),
    demoIdHint: extractPostCallDemoId(data),
    conversationId: extractConversationIdFromPostCall(data),
  };
}
