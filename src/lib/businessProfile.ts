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