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