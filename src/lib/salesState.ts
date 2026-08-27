export type SalesIntent = "LOW" | "MEDIUM" | "HIGH" | "READY_TO_ACT";

export type SalesStage =
  | "DISCOVERY"
  | "SECURING_LEAD"
  | "SALES_MODE"
  | "OBJECTION"
  | "CLOSING"
  | "COMPLETED";

export type LeadStatus = "NOT_SECURED" | "SECURING" | "SECURED";

export type SalesObjective =
  | "ANSWER"
  | "UNDERSTAND_NEED"
  | "COLLECT_NAME"
  | "COLLECT_PHONE"
  | "COLLECT_EMAIL"
  | "COLLECT_ADDRESS"
  | "PRESENT_SOLUTION"
  | "EXPLAIN_VALUE"
  | "HANDLE_PRICE_OBJECTION"
  | "HANDLE_COMPETITOR_OBJECTION"
  | "HANDLE_HESITATION"
  | "CROSS_SELL"
  | "ADVANCE_TO_NEXT_STEP"
  | "CLOSE";

export type LeadFields = {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type UrgencyLevel = "NONE" | "SOON" | "IMMEDIATE";

export type LeadDeliveryStatus = "NOT_SENT" | "SENT" | "FAILED";

export type SalesState = {
  /** Immutable conversation identity for this Customer AI session. */
  conversationId: string;
  /** Immutable business identity key bound at session create (usually website). */
  businessKey: string;
  intent: SalesIntent;
  salesStage: SalesStage;
  currentObjective: SalesObjective;
  customerNeed: string | null;
  /** Concise useful buying/sales context notes (not a transcript). */
  customerContext: string[];
  lead: LeadFields;
  establishedFacts: string[];
  urgency: UrgencyLevel;
  customerAvailable: boolean | null;
  appointmentIntent: boolean | null;
  preferredTiming: string | null;
  /** Volunteered contact channel preference, e.g. "Phone call". */
  contactPreference: string | null;
  objections: string[];
  refusedLeadFields: Array<keyof LeadFields>;
  leadCapturePaused: boolean;
  customerAgreed: boolean;
  /** The most recent assistant reply needs a meaningful customer answer. */
  awaitingCustomerResponse: boolean;
  /** A customer question or objection has not yet received its AI response. */
  unresolvedCustomerIssue: boolean;
  /** Explicit BusinessProfile requirements, normalized to labels. */
  requiredBusinessFields: string[];
  /** Required BusinessProfile labels that have been captured from the customer. */
  capturedBusinessFields: string[];
  /** True when conversation reached a natural handoff endpoint (not merely SECURED). */
  handoffReady: boolean;
  leadStatus: LeadStatus;
  requiredLeadFields: Array<keyof LeadFields>;
  leadDeliveryStatus: LeadDeliveryStatus;
  summary: string;
};

/** Browser-safe unique conversation id. */
export function createConversationId(): string {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Stable business identity for handoff isolation (prefer website). */
export function businessIdentityKey(business: {
  website?: string;
  businessName?: string;
}): string {
  const website = business.website?.trim().toLowerCase();
  if (website) return website;
  const name = business.businessName?.trim().toLowerCase();
  if (name) return name;
  return "unknown-business";
}

export function isValidConversationId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 8;
}

export function createInitialSalesState(
  seed?: Partial<Pick<SalesState, "conversationId" | "businessKey">>
): SalesState {
  return {
    conversationId: seed?.conversationId || "",
    businessKey: seed?.businessKey || "",
    intent: "LOW",
    salesStage: "DISCOVERY",
    currentObjective: "UNDERSTAND_NEED",
    customerNeed: null,
    customerContext: [],
    lead: {
      name: null,
      phone: null,
      email: null,
      address: null,
    },
    establishedFacts: [],
    urgency: "NONE",
    customerAvailable: null,
    appointmentIntent: null,
    preferredTiming: null,
    contactPreference: null,
    objections: [],
    refusedLeadFields: [],
    leadCapturePaused: false,
    customerAgreed: false,
    awaitingCustomerResponse: false,
    unresolvedCustomerIssue: false,
    requiredBusinessFields: [],
    capturedBusinessFields: [],
    handoffReady: false,
    leadStatus: "NOT_SECURED",
    requiredLeadFields: ["name", "phone", "address"],
    leadDeliveryStatus: "NOT_SENT",
    summary: "New conversation. No lead secured yet.",
  };
}

export function isSalesState(value: unknown): value is SalesState {
  if (!value || typeof value !== "object") return false;

  const state = value as Record<string, unknown>;
  const lead = state.lead as Record<string, unknown> | undefined;

  return (
    typeof state.intent === "string" &&
    typeof state.salesStage === "string" &&
    typeof state.currentObjective === "string" &&
    typeof state.leadStatus === "string" &&
    !!lead &&
    typeof lead === "object" &&
    Array.isArray(state.establishedFacts) &&
    Array.isArray(state.objections) &&
    Array.isArray(state.requiredLeadFields)
  );
}

/** Normalize older persisted states that may lack newer fields. */
export function normalizeSalesState(value: SalesState): SalesState {
  const base = createInitialSalesState();
  return {
    ...base,
    ...value,
    lead: { ...base.lead, ...value.lead },
    establishedFacts: value.establishedFacts || [],
    customerContext: value.customerContext || [],
    objections: value.objections || [],
    refusedLeadFields: value.refusedLeadFields || [],
    requiredLeadFields: value.requiredLeadFields?.length
      ? value.requiredLeadFields
      : base.requiredLeadFields,
    leadCapturePaused: value.leadCapturePaused ?? false,
    customerAgreed: value.customerAgreed ?? false,
    awaitingCustomerResponse: value.awaitingCustomerResponse ?? false,
    unresolvedCustomerIssue: value.unresolvedCustomerIssue ?? false,
    requiredBusinessFields: value.requiredBusinessFields || [],
    capturedBusinessFields: value.capturedBusinessFields || [],
    handoffReady: value.handoffReady ?? false,
    preferredTiming: value.preferredTiming ?? null,
    contactPreference: value.contactPreference ?? null,
    leadDeliveryStatus: value.leadDeliveryStatus ?? "NOT_SENT",
    conversationId: value.conversationId ?? "",
    businessKey: value.businessKey ?? "",
  };
}
