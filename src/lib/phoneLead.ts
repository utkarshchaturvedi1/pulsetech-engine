import { BusinessProfile } from "../types/business";
import {
  detectSchedulingUrgency,
  extractPreferredVisitTimeFromText,
} from "./schedulingPolicy";
import type { UrgencyLevel } from "./salesState";

export type PhoneLead = {
  business: string;
  demoId: string;
  isTestData: boolean;
  name: string;
  phone: string;
  email: string;
  address: string;
  need: string;
  preferredVisitTime: string;
  urgency: UrgencyLevel;
  callbackRequested: boolean;
  callbackNotes: string;
};

export type PhoneLeadAlertState = {
  qualified: boolean;
  alertKind: "lead" | "callback" | "none";
  lead: PhoneLead;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function field(source: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = source[name];
    const found = clean(value) || clean((value as { value?: unknown })?.value);
    if (found) return found;
  }
  return "";
}

function truthyField(source: Record<string, unknown>, ...names: string[]): boolean {
  for (const name of names) {
    const value = source[name];
    const inner = (value as { value?: unknown })?.value;
    const raw = inner !== undefined ? inner : value;
    if (raw === true) return true;
    if (typeof raw === "string") {
      const t = raw.trim().toLowerCase();
      if (["true", "yes", "y", "1", "callback", "call me back"].includes(t)) {
        return true;
      }
    }
  }
  return false;
}

const CALLBACK_RE =
  /\b(call me back|give me a call back|please call (me|us) back|can you call me back|want(ed)? a callback|request(ed)? a callback|call back please)\b/i;

export function extractPreferredVisitTime(
  extracted: Record<string, unknown>,
  transcriptText = ""
): string {
  const fromFields = field(
    extracted,
    "preferred_visit_time",
    "preferred_time",
    "preferred_appointment",
    "preferred_timing",
    "visit_time"
  );
  if (fromFields) return fromFields;
  const fromText = extractPreferredVisitTimeFromText(transcriptText);
  if (
    fromText &&
    /\b(visit|appoint|come|schedule|available|availability|time slot|morning|afternoon|evening|asap|today|tomorrow)\b/i.test(
      transcriptText
    )
  ) {
    return fromText;
  }
  return "";
}

export function extractLeadUrgency(
  extracted: Record<string, unknown>,
  transcriptText = ""
): UrgencyLevel {
  const labeled = field(extracted, "urgency", "visit_urgency", "priority").toUpperCase();
  if (labeled === "IMMEDIATE" || labeled === "URGENT") return "IMMEDIATE";
  if (labeled === "SOON") return "SOON";
  return detectSchedulingUrgency(transcriptText) || "NONE";
}

export function detectCallbackRequest(
  extracted: Record<string, unknown>,
  transcriptText = ""
): boolean {
  if (
    truthyField(
      extracted,
      "callback_requested",
      "call_me_back",
      "callback_request",
      "wants_callback"
    )
  ) {
    return true;
  }
  return CALLBACK_RE.test(transcriptText);
}

export function transcriptToText(transcript: unknown): string {
  if (typeof transcript === "string") return transcript;
  if (!Array.isArray(transcript)) return "";
  return transcript
    .map((turn) => {
      if (!turn || typeof turn !== "object") return "";
      const row = turn as Record<string, unknown>;
      return clean(row.message) || clean(row.text) || "";
    })
    .filter(Boolean)
    .join("\n");
}

export function extractPhoneLead(
  extracted: Record<string, unknown>,
  options: {
    businessName: string;
    demoId?: string;
    isTestData?: boolean;
    transcriptText?: string;
  }
): PhoneLead {
  const callbackRequested = detectCallbackRequest(
    extracted,
    options.transcriptText || ""
  );
  return {
    business: options.businessName,
    demoId: options.demoId || "",
    isTestData: Boolean(options.isTestData),
    name: field(extracted, "full_name", "name"),
    phone: field(extracted, "phone_number", "phone"),
    email: field(extracted, "email"),
    address: field(extracted, "service_address", "address"),
    need: field(extracted, "service_needed", "customer_need"),
    preferredVisitTime: extractPreferredVisitTime(
      extracted,
      options.transcriptText || ""
    ),
    urgency: extractLeadUrgency(extracted, options.transcriptText || ""),
    callbackRequested,
    callbackNotes: field(
      extracted,
      "callback_notes",
      "callback_reason",
      "call_back_notes"
    ),
  };
}

export function evaluatePhoneLeadAlert(lead: PhoneLead): PhoneLeadAlertState {
  if (lead.callbackRequested && lead.phone) {
    return { qualified: true, alertKind: "callback", lead };
  }
  if (lead.name && lead.phone && lead.address && lead.need) {
    return { qualified: true, alertKind: "lead", lead };
  }
  return { qualified: false, alertKind: "none", lead };
}

export function buildPhoneLeadEmail(
  lead: PhoneLead,
  alertKind: "lead" | "callback"
): { subject: string; text: string } {
  const urgent = alertKind === "callback" || lead.urgency === "IMMEDIATE";
  const subject = alertKind === "callback"
    ? "URGENT PulseTech Callback Request - " + lead.business
    : urgent
      ? "URGENT PulseTech Phone Lead - " + lead.business
      : "New PulseTech Phone Lead - " + lead.business;
  const heading =
    alertKind === "callback"
      ? "URGENT CALLBACK REQUEST"
      : urgent
        ? "URGENT PHONE LEAD"
        : "NEW PHONE LEAD";
  const text = [
    heading,
    "",
    "Business: " + lead.business,
    lead.isTestData ? "Data: TEST / DEMO" : "",
    "Customer: " + (lead.name || "Not provided"),
    "Phone: " + (lead.phone || "Not provided"),
    lead.email ? "Email: " + lead.email : "",
    "Service address: " + (lead.address || "Not provided"),
    "Service needed: " + (lead.need || "Not provided"),
    lead.preferredVisitTime
      ? "Preferred visit time: " + lead.preferredVisitTime
      : "",
    "Urgency: " + lead.urgency,
    "Callback requested: " + (lead.callbackRequested ? "YES" : "No"),
    lead.callbackNotes ? "Callback notes: " + lead.callbackNotes : "",
    "",
    urgent
      ? "Next step: Contact this customer as soon as possible to confirm the earliest available time. Do not send automatic customer SMS."
      : "Next step: Contact this customer promptly. Do not treat any preferred time as booked.",
  ]
    .filter((line) => line !== "")
    .join("\n");
  return { subject, text };
}

export function buildPhoneLeadSms(
  lead: PhoneLead,
  alertKind: "lead" | "callback"
): string {
  const prefix =
    alertKind === "callback"
      ? "URGENT callback request for "
      : lead.urgency === "IMMEDIATE"
        ? "URGENT PulseTech phone lead for "
        : "New PulseTech phone lead for ";
  return [
    prefix + lead.business,
    (lead.name || "Unknown") + " | " + (lead.phone || "no phone"),
    "Urgency: " + lead.urgency,
    "Callback requested: " + (lead.callbackRequested ? "YES" : "No"),
    lead.preferredVisitTime
      ? "Preferred visit time: " + lead.preferredVisitTime
      : "",
    lead.need,
    lead.address,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1500);
}

export function businessLabelFromProfile(
  profile: BusinessProfile | null,
  fallback = ""
): string {
  return profile?.businessName || fallback;
}
