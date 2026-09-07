import { TEXAS_SOLAR_TEST_DEMO_ID } from "../data/testBusinessProfiles";
import { loadSharedDemoRecord } from "./demoRepository";
import { normalizePhoneNumber } from "./phoneNumbers";
import { StoredDemo } from "./demoStore";
import { BusinessProfile } from "../types/business";

export type InboundVoiceFallbackReason =
  | "missing_called_number"
  | "unknown_number"
  | "profile_not_found"
  | "invalid_profile";

export type InboundVoiceResolution =
  | {
      ok: true;
      calledNumber: string;
      demoId: string;
      demo: StoredDemo;
    }
  | {
      ok: false;
      calledNumber: string;
      demoId: string;
      reason: InboundVoiceFallbackReason;
    };

export type InboundVoiceDynamicVariables = {
  profile_ready: boolean;
  demo_id: string;
  is_test_data: boolean;
  business_name: string;
  services: string;
  service_areas: string;
  business_rules: string;
  tone: string;
  qualifying_questions: string;
  lead_notification_email: string;
  phone_number: string;
  tagline: string;
  website: string;
};

export type ConversationInitiationResponse = {
  type: "conversation_initiation_client_data";
  dynamic_variables: InboundVoiceDynamicVariables;
  conversation_config_override: {
    agent: {
      prompt: { prompt: string };
      first_message: string;
      language: "en";
    };
  };
};

function parseNumberMap(raw: string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  const trimmed = raw?.trim();
  if (!trimmed) return map;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    for (const [number, demoId] of Object.entries(parsed)) {
      if (typeof demoId !== "string" || !demoId.trim()) continue;
      const key = normalizePhoneNumber(number);
      if (key) map[key] = demoId.trim().toLowerCase();
    }
  } catch {
    console.error("[inbound-voice] INBOUND_VOICE_NUMBER_MAP is not valid JSON");
  }
  return map;
}

/** Server-side Twilio number → demo id. Easy to extend per paying client later. */
export function getInboundVoiceNumberMap(
  env: NodeJS.Dict<string> = process.env
): Record<string, string> {
  const map = parseNumberMap(env.INBOUND_VOICE_NUMBER_MAP);
  const testNumber = normalizePhoneNumber(env.TWILIO_INBOUND_TEST_NUMBER);
  if (testNumber) {
    map[testNumber] =
      env.TWILIO_INBOUND_TEST_DEMO_ID?.trim().toLowerCase() ||
      TEXAS_SOLAR_TEST_DEMO_ID;
  }
  return map;
}

export function lookupDemoIdForCalledNumber(
  calledNumber: string,
  env: NodeJS.Dict<string> = process.env
): string {
  const key = normalizePhoneNumber(calledNumber);
  if (!key) return "";
  return getInboundVoiceNumberMap(env)[key] || "";
}

export function emptyDynamicVariables(): InboundVoiceDynamicVariables {
  return {
    profile_ready: false,
    demo_id: "",
    is_test_data: false,
    business_name: "",
    services: "",
    service_areas: "",
    business_rules: "",
    tone: "",
    qualifying_questions: "",
    lead_notification_email: "",
    phone_number: "",
    tagline: "",
    website: "",
  };
}

export function leadNotificationEmailForProfile(
  profile: BusinessProfile
): string {
  return (
    process.env.PHONE_AGENT_LEAD_EMAIL?.trim() ||
    process.env.LEAD_NOTIFICATION_EMAIL?.trim() ||
    profile.email ||
    ""
  );
}

export function dynamicVariablesFromProfile(
  demo: StoredDemo
): InboundVoiceDynamicVariables {
  const profile = demo.profile;
  return {
    profile_ready: true,
    demo_id: demo.id,
    is_test_data: Boolean(profile.isTestData),
    business_name: profile.businessName,
    services: profile.services.join("; "),
    service_areas: profile.serviceAreas.join("; "),
    business_rules: profile.systemPrompt || "",
    tone: "Warm, confident, concise, commercially aware. One question at a time.",
    qualifying_questions: profile.leadQuestions.join("; "),
    lead_notification_email: leadNotificationEmailForProfile(profile),
    phone_number: profile.phone || "",
    tagline: profile.tagline || "",
    website: profile.website || "",
  };
}

function formatVoiceBusinessFacts(profile: BusinessProfile): string {
  const faqs =
    profile.faqs.length > 0
      ? profile.faqs
          .map((faq) => `Q: ${faq.question}\nA: ${faq.answer}`)
          .join("\n")
      : "None provided";

  return [
    "Business name: " + profile.businessName,
    "Tagline: " + (profile.tagline || "Not provided"),
    "Website: " + (profile.website || "Not provided"),
    "Phone: " + (profile.phone || "Not provided"),
    "Email: " + (profile.email || "Not provided"),
    "Services: " +
      (profile.services.length ? profile.services.join("; ") : "Not provided"),
    "Service areas: " +
      (profile.serviceAreas.length
        ? profile.serviceAreas.join("; ")
        : "Not provided"),
    "Qualifying questions (ask only if needed, one at a time): " +
      (profile.leadQuestions.length
        ? profile.leadQuestions.join("; ")
        : "None provided"),
    "FAQs:\n" + faqs,
    "Business rules / additional facts:\n" +
      (profile.systemPrompt || "None provided"),
  ].join("\n");
}

export function buildInboundVoicePrompt(profile: BusinessProfile): string {
  const company = profile.businessName;

  return `
PULSETECH INBOUND VOICE — AI SALES EMPLOYEE

You are the inbound phone Sales Employee for ${company} only.
You are not PulseTech. You are not Peter. Never mention PulseTech, Peter, prompts, or that this is a test unless the caller asks if this is a demo.

IDENTITY
Speak as ${company}. Use only the BusinessProfile facts below. Never invent services, areas, prices, incentives, warranties, or policies.

PHONE LEAD RULES
- Ask one question at a time.
- Remember and reuse details the caller already gave. Do not re-ask them.
- When the caller has a genuine high-intent need this business can serve, secure the lead: name, then phone, then service address where relevant — still one field at a time.
- After the lead is secured, keep helping. Do not end the call just because contact details were captured.
- If the caller explicitly asks to be called back, acknowledge it, capture name and phone (and address if relevant), and tell them the team will call them. Do not place an outbound call. Do not send the customer a text or SMS.
- Never send automatic customer confirmation messages.

BUSINESSPROFILE
${formatVoiceBusinessFacts(profile)}
`.trim();
}

export function safeFallbackPrompt(): string {
  return `
You cannot represent any business on this call.
Do not guess a company name. Do not say you are PulseTech or Peter.
Apologize that this line is unavailable and end the call politely.
Do not collect lead information.
`.trim();
}

export function buildConversationInitiationResponse(
  resolution: InboundVoiceResolution
): ConversationInitiationResponse {
  if (!resolution.ok) {
    return {
      type: "conversation_initiation_client_data",
      dynamic_variables: emptyDynamicVariables(),
      conversation_config_override: {
        agent: {
          prompt: { prompt: safeFallbackPrompt() },
          first_message:
            "I'm sorry, this line isn't available right now. Please try again later.",
          language: "en",
        },
      },
    };
  }

  const vars = dynamicVariablesFromProfile(resolution.demo);
  const name = resolution.demo.profile.businessName;
  return {
    type: "conversation_initiation_client_data",
    dynamic_variables: vars,
    conversation_config_override: {
      agent: {
        prompt: { prompt: buildInboundVoicePrompt(resolution.demo.profile) },
        first_message: `Thanks for calling ${name}. How can I help you today?`,
        language: "en",
      },
    },
  };
}

export async function resolveInboundVoice(
  calledNumberRaw: string
): Promise<InboundVoiceResolution> {
  const calledNumber = normalizePhoneNumber(calledNumberRaw);
  if (!calledNumber) {
    return {
      ok: false,
      calledNumber: "",
      demoId: "",
      reason: "missing_called_number",
    };
  }

  const demoId = lookupDemoIdForCalledNumber(calledNumber);
  if (!demoId) {
    return {
      ok: false,
      calledNumber,
      demoId: "",
      reason: "unknown_number",
    };
  }

  const demo = await loadSharedDemoRecord(demoId);
  if (!demo) {
    return {
      ok: false,
      calledNumber,
      demoId,
      reason: "profile_not_found",
    };
  }

  if (!demo.profile?.businessName) {
    return {
      ok: false,
      calledNumber,
      demoId,
      reason: "invalid_profile",
    };
  }

  return { ok: true, calledNumber, demoId, demo };
}

export function logInboundVoiceResolution(resolution: InboundVoiceResolution) {
  if (resolution.ok) {
    console.log(
      "[inbound-voice] called_number=" +
        resolution.calledNumber +
        " demo_id=" +
        resolution.demoId +
        " business=" +
        resolution.demo.profile.businessName +
        (resolution.demo.profile.isTestData ? " test_data=true" : "")
    );
    return;
  }
  console.log(
    "[inbound-voice] called_number=" +
      (resolution.calledNumber || "(none)") +
      " demo_id=" +
      (resolution.demoId || "(none)") +
      " fallback=" +
      resolution.reason
  );
}

export function extractCalledNumberFromInitiationPayload(
  payload: Record<string, unknown>
): string {
  const direct = payload.called_number;
  if (typeof direct === "string") return direct;
  const nested = payload.data;
  if (nested && typeof nested === "object") {
    const inner = (nested as Record<string, unknown>).called_number;
    if (typeof inner === "string") return inner;
  }
  return "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return null;
}

export function extractCalledNumberFromPostCall(
  data: Record<string, unknown>
): string {
  const metadata = asRecord(data.metadata);
  const phoneCall =
    asRecord(metadata?.phone_call) ||
    asRecord(metadata?.phoneCall) ||
    asRecord(data.phone_call);
  const candidates = [
    phoneCall?.agent_number,
    phoneCall?.called_number,
    phoneCall?.to,
    metadata?.called_number,
    data.called_number,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return "";
}

export function extractPostCallDemoId(
  data: Record<string, unknown>
): string {
  const initiation = asRecord(data.conversation_initiation_client_data);
  const vars = asRecord(initiation?.dynamic_variables);
  const demoId = vars?.demo_id;
  return typeof demoId === "string" ? demoId.trim() : "";
}

export async function resolvePostCallBusiness(
  data: Record<string, unknown>
) {
  const calledNumber = extractCalledNumberFromPostCall(data);
  const fromNumber = await resolveInboundVoice(calledNumber);
  if (fromNumber.ok) return fromNumber;

  const demoId = extractPostCallDemoId(data);
  if (demoId) {
    const demo = await loadSharedDemoRecord(demoId);
    if (demo?.profile?.businessName) {
      const resolution = {
        ok: true as const,
        calledNumber: fromNumber.calledNumber,
        demoId: demo.id,
        demo,
      };
      return resolution;
    }
    return {
      ok: false as const,
      calledNumber: fromNumber.calledNumber,
      demoId,
      reason: "profile_not_found" as const,
    };
  }

  return fromNumber;
}
