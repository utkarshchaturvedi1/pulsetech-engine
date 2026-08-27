import type { BusinessProfile } from "../../src/types/business";
import { createBusinessProfile } from "../../src/lib/businessProfile";

export function solarBusiness(): BusinessProfile {
  return createBusinessProfile({
    website: "https://live-qa-texassolar.test",
    businessName: "Texas Solar Professional",
    tagline: "Residential solar for Texas homes",
    phone: "214-555-0101",
    email: "hello@texassolar.test",
    leadNotificationEmail: "owner-solar@live-qa.test",
    address: "Dallas, TX",
    services: [
      "Residential solar panel design and installation",
      "Battery backup",
      "On-site solar assessment",
    ],
    serviceAreas: ["DFW", "Dallas", "Texas"],
    faqs: [
      {
        question: "Do you handle electrical work?",
        answer:
          "Yes. Our installation process includes the electrical connections required for a residential solar system.",
      },
    ],
    leadQuestions: [],
    systemPrompt:
      "Texas residential solar installer. We design and install roof and ground-mounted systems and can discuss battery backup. We provide personalized savings estimates after an on-site assessment. We do not publish fixed prices. We do not claim same-day installation or live availability.",
  });
}

export function plumbingBusiness(): BusinessProfile {
  return createBusinessProfile({
    website: "https://live-qa-plumbing.test",
    businessName: "Example Home Services",
    tagline: "Licensed local service",
    phone: "214-555-0199",
    email: "hello@homeservices.test",
    leadNotificationEmail: "owner-plumbing@live-qa.test",
    address: "Dallas, TX",
    services: [
      "Heater repair",
      "Kitchen sink installation",
      "Jacuzzi and spa plumbing",
      "Pest inspection and treatment",
    ],
    serviceAreas: ["Dallas", "DFW"],
    faqs: [
      {
        question: "Are you licensed?",
        answer: "Yes, we are licensed and insured for residential service work.",
      },
    ],
    leadQuestions: [],
    systemPrompt:
      "Licensed residential service company. We repair heaters, install kitchen sinks, handle jacuzzi plumbing, and inspect for pests. We do not publish prices. On-site estimates are the next step for installations. We do not invent availability windows.",
  });
}

export function richPromoBusiness(): BusinessProfile {
  return createBusinessProfile({
    website: "https://live-qa-promo.test",
    businessName: "Summit Comfort Systems",
    tagline: "Heating, cooling, and indoor comfort",
    phone: "214-555-0200",
    email: "hello@summit.test",
    leadNotificationEmail: "owner-promo@live-qa.test",
    services: ["HVAC repair", "New HVAC installation", "Maintenance plans"],
    serviceAreas: ["Dallas"],
    faqs: [
      {
        question: "Do you offer financing?",
        answer: "Yes, financing options may be available for qualifying installations.",
      },
      {
        question: "Do you have promotions?",
        answer: "Seasonal promotions and free estimates on new equipment may apply.",
      },
    ],
    leadQuestions: [],
    systemPrompt:
      "HVAC company with financing options, seasonal promotions, free estimates on new equipment, licensed and insured, 24/7 emergency service available for urgent heating failures. Do not dump all of this unless relevant. Prefer the single most useful fact.",
  });
}

export function sparseBusiness(): BusinessProfile {
  return createBusinessProfile({
    website: "https://live-qa-sparse.test",
    businessName: "Northside Service Co",
    services: ["Home service visits"],
    serviceAreas: ["Dallas"],
    faqs: [],
    leadQuestions: [],
    leadNotificationEmail: "owner-sparse@live-qa.test",
    systemPrompt: "Local home service company. Limited public details. Do not invent credentials, financing, or promotions.",
  });
}
