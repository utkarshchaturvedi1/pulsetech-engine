import { BusinessProfile } from "../types/business";

export type PhoneLead = {
  business: string;
  demoId: string;
  isTestData: boolean;
  name: string;
  phone: string;
  email: string;
  address: string;
  need: string;
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
  const urgent = alertKind === "callback";
  const subject = urgent
    ? "URGENT PulseTech Callback Request - " + lead.business
    : "New PulseTech Phone Lead - " + lead.business;
  const heading = urgent ? "URGENT CALLBACK REQUEST" : "NEW PHONE LEAD";
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
    "Callback requested: " + (lead.callbackRequested ? "YES" : "No"),
    lead.callbackNotes ? "Callback notes: " + lead.callbackNotes : "",
    "",
    urgent
      ? "Next step: Call this customer back promptly. Do not rely on automatic customer SMS."
      : "Next step: Contact this customer promptly.",
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
      : "New PulseTech phone lead for ";
  return [
    prefix + lead.business,
    (lead.name || "Unknown") + " | " + (lead.phone || "no phone"),
    "Callback requested: " + (lead.callbackRequested ? "YES" : "No"),
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
