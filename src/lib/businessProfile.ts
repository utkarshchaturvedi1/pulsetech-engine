import { BusinessProfile } from "../types/business";

export const emptyBusinessProfile: BusinessProfile = {
  website: "",

  businessName: "",
  tagline: "",

  logo: "",

  primaryColor: "#2563eb",
  secondaryColor: "#0f172a",

  phone: "",
  email: "",
  address: "",

  services: [],

  serviceAreas: [],

  faqs: [],

  leadQuestions: [],

  systemPrompt: "",
};

export function createBusinessProfile(
  data: Partial<BusinessProfile>
): BusinessProfile {
  return {
    ...emptyBusinessProfile,
    ...data,
  };
}

/** Deep-ish clone so session rebinds don't share mutable FAQ/service arrays. */
export function cloneBusinessProfile(business: BusinessProfile): BusinessProfile {
  return {
    ...business,
    services: [...(business.services || [])],
    serviceAreas: [...(business.serviceAreas || [])],
    leadQuestions: [...(business.leadQuestions || [])],
    faqs: (business.faqs || []).map((faq) => ({ ...faq })),
  };
}

/**
 * Customer-facing verified pricing copy.
 * Typed as string, but owner-update / stored profiles may persist structured
 * non-string shapes. Only a non-empty string is safe to show customers —
 * never JSON.stringify an object into the reply.
 */
export function verifiedPricingRulesText(
  pricingRules: unknown
): string | null {
  if (typeof pricingRules !== "string") return null;
  const trimmed = pricingRules.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Flatten pricingRules into searchable text for keyword detection only
 * (hourly/fixed/fee cues). Not for customer-facing replies.
 */
export function pricingRulesKnowledgeText(pricingRules: unknown): string {
  if (pricingRules == null) return "";
  if (typeof pricingRules === "string") return pricingRules;
  if (typeof pricingRules === "number" || typeof pricingRules === "boolean") {
    return String(pricingRules);
  }
  if (Array.isArray(pricingRules)) {
    return pricingRules
      .map((item) => pricingRulesKnowledgeText(item))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof pricingRules === "object") {
    return Object.values(pricingRules as Record<string, unknown>)
      .map((value) => pricingRulesKnowledgeText(value))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
