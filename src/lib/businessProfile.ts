import { BusinessProfile } from "../types/business";

export const emptyBusinessProfile: BusinessProfile = {
  website: "",

  businessName: "",
  tagline: "",

  logo: "",
  siteIcon: "",

  primaryColor: "#2563eb",
  secondaryColor: "#0f172a",

  phone: "",
  email: "",
  leadNotificationEmail: undefined,
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

/** Removes internal routing settings before a profile is used as customer-facing knowledge. */
export function customerFacingBusinessProfile(business: BusinessProfile): Omit<BusinessProfile, "leadNotificationEmail"> {
  const customerFacing = { ...business };
  delete customerFacing.leadNotificationEmail;
  return customerFacing;
}
