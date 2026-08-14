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

export type SalesState = {
  intent: SalesIntent;
  salesStage: SalesStage;
  currentObjective: SalesObjective;
  customerNeed: string | null;
  lead: LeadFields;
  establishedFacts: string[];
  urgency: UrgencyLevel;
  customerAvailable: boolean | null;
  appointmentIntent: boolean | null;
  objections: string[];
  leadStatus: LeadStatus;
  requiredLeadFields: Array<keyof LeadFields>;
  summary: string;
};

export function createInitialSalesState(): SalesState {
  return {
    intent: "LOW",
    salesStage: "DISCOVERY",
    currentObjective: "UNDERSTAND_NEED",
    customerNeed: null,
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
    objections: [],
    leadStatus: "NOT_SECURED",
    requiredLeadFields: ["name", "phone"],
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
