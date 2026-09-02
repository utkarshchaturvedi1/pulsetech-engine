import { BusinessProfile } from "../types/business";

export async function analyzeBusiness(
  website: string,
  _html: string,
  additionalInfo = ""
): Promise<BusinessProfile> {
  return {
    website,
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
    systemPrompt: additionalInfo || "Use only verified business information.",
  };
}
