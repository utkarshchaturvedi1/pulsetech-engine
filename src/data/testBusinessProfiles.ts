import { BusinessProfile } from "../types/business";
import { StoredDemo } from "../lib/demoStore";

/**
 * Bundled TEST DATA only.
 * Used when a Twilio number maps to a demo id and no live saved demo exists
 * (e.g. Vercel has no .data/demos filesystem).
 * Website demo GET /api/demo/{id} uses the same record so chat and phone share it.
 */
export const TEXAS_SOLAR_TEST_DEMO_ID = "texassolar";

export const texasSolarProfessionalTestProfile: BusinessProfile = {
  website: "https://texassolar.pro",
  businessName: "Texas Solar Professional",
  tagline: "TEST DATA — PulseTech demo / inbound voice profile",
  logo: "",
  primaryColor: "#2563eb",
  secondaryColor: "#0f172a",
  phone: "",
  email: "",
  address: "Texas",
  services: [
    "Residential solar panel installation",
    "Solar consultations and system design",
    "Battery storage",
    "Solar system maintenance",
  ],
  serviceAreas: [
    "Austin",
    "San Antonio",
    "Houston",
    "Dallas",
    "Central Texas",
  ],
  faqs: [
    {
      question: "Do you serve homeowners in Texas?",
      answer: "Yes. Texas Solar Professional serves residential customers in the listed Texas service areas.",
    },
    {
      question: "Can you give an exact price on the phone?",
      answer: "A site-specific consultation is needed for an accurate quote. Do not invent prices, incentives, or savings figures.",
    },
  ],
  leadQuestions: [
    "What is your name?",
    "What is the best phone number to reach you?",
    "What is the service address for the home?",
    "Are you looking for a new solar system, batteries, or maintenance?",
  ],
  systemPrompt: [
    "TEST DATA PROFILE. This is PulseTech's Texas Solar Professional test business.",
    "Tone: warm, confident, concise, commercially aware. Never robotic or scripted.",
    "Business rules: represent Texas Solar Professional only.",
    "Do not invent prices, tax credits, utility rates, warranties, or savings.",
    "Do not claim to be PulseTech or Peter.",
    "If the caller asks for a callback, acknowledge it and collect contact details. Do not send the customer a text or place an outbound call.",
  ].join(" "),
  isTestData: true,
};

const BUNDLED_TEST_DEMOS: Record<string, StoredDemo> = {
  [TEXAS_SOLAR_TEST_DEMO_ID]: {
    id: TEXAS_SOLAR_TEST_DEMO_ID,
    profile: texasSolarProfessionalTestProfile,
    updatedAt: "2026-09-07T00:00:00.000Z",
  },
};

export function getBundledTestDemo(id: string): StoredDemo | null {
  const safe = id.toLowerCase().replace(/[^a-z0-9-_]/g, "");
  return BUNDLED_TEST_DEMOS[safe] || null;
}

export function isBundledTestDemoId(id: string): boolean {
  return getBundledTestDemo(id) !== null;
}
