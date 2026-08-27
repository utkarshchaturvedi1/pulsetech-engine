import type { BusinessProfile } from "../../src/types/business";
import {
  plumbingBusiness,
  richPromoBusiness,
  solarBusiness,
  sparseBusiness,
} from "./fixtures";

export type ScenarioArchetype =
  | "aspirational"
  | "pain"
  | "urgent"
  | "objection"
  | "interrupt"
  | "volunteer"
  | "closure"
  | "sparse"
  | "promo-filter";

export type LiveScenario = {
  id: string;
  title: string;
  archetype: ScenarioArchetype;
  core: boolean;
  business: () => BusinessProfile;
  /** Customer turns in order. Assistant replies are generated live. */
  customerTurns: string[];
  /** Optional: after which customer turn index (0-based) expect lead SECURING/COLLECT_* */
  expectEarlyLeadCapture?: boolean;
  expectSecureByEnd?: boolean;
  expectNoBrochure?: boolean;
  expectPainTone?: boolean;
  expectAspirationalTone?: boolean;
  expectHandoffAttempt?: boolean;
};

export const LIVE_SCENARIOS: LiveScenario[] = [
  {
    id: "solar-aspirational",
    title: "Solar aspirational",
    archetype: "aspirational",
    core: true,
    business: solarBusiness,
    customerTurns: [
      "I'm interested in getting solar panels for my home. Can you help me?",
      "Ramesh",
      "9898989898",
      "I'm at 1500 Marilla St, Dallas TX 75201.",
      "yes",
      "tomorrow morning is fine.",
    ],
    expectEarlyLeadCapture: true,
    expectSecureByEnd: true,
    expectNoBrochure: true,
    expectAspirationalTone: true,
    expectHandoffAttempt: true,
  },
  {
    id: "heater-broken",
    title: "Heater broken",
    archetype: "pain",
    core: true,
    business: plumbingBusiness,
    customerTurns: [
      "My heater stopped working.",
      "Alex",
      "2145550199",
      "1500 Marilla St, Dallas TX 75201",
    ],
    expectEarlyLeadCapture: true,
    expectSecureByEnd: true,
    expectPainTone: true,
    expectNoBrochure: true,
  },
  {
    id: "jacuzzi-install",
    title: "Jacuzzi installation",
    archetype: "aspirational",
    core: true,
    business: plumbingBusiness,
    customerTurns: [
      "I want to install a Jacuzzi in my backyard.",
      "Sam",
      "2145550188",
      "2200 Main St, Dallas TX 75201",
    ],
    expectEarlyLeadCapture: true,
    expectSecureByEnd: true,
    expectAspirationalTone: true,
    expectNoBrochure: true,
  },
  {
    id: "modern-sink",
    title: "Modern kitchen sink",
    archetype: "aspirational",
    core: true,
    business: plumbingBusiness,
    customerTurns: [
      "I want a modern kitchen sink but I'm not sure what to buy.",
      "Jordan",
      "2145550177",
      "900 Elm St, Dallas TX 75202",
    ],
    expectEarlyLeadCapture: true,
    expectSecureByEnd: true,
    expectAspirationalTone: true,
  },
  {
    id: "termite-pest",
    title: "Termite / pest problem",
    archetype: "pain",
    core: false,
    business: plumbingBusiness,
    customerTurns: [
      "I think I have termites.",
      "How much will it cost?",
      "Chris",
      "2145550166",
      "100 Oak Ave, Dallas TX 75204",
    ],
    expectEarlyLeadCapture: true,
    expectPainTone: true,
  },
  {
    id: "electrical-safety",
    title: "Electrical safety / scope question",
    archetype: "interrupt",
    core: false,
    business: solarBusiness,
    customerTurns: [
      "I need solar panels. Do you handle the electrical work too? I want this done safely.",
      "Priya",
      "2145550155",
      "401 Commerce St, Dallas TX 75201",
    ],
    expectEarlyLeadCapture: false,
    expectSecureByEnd: true,
    expectNoBrochure: true,
  },
  {
    id: "price-objection",
    title: "Price objection",
    archetype: "objection",
    core: true,
    business: plumbingBusiness,
    customerTurns: [
      "I need a new kitchen sink.",
      "Alex",
      "2145550199",
      "1500 Marilla St, Dallas TX 75201",
      "That's too expensive.",
    ],
    expectEarlyLeadCapture: true,
    expectSecureByEnd: true,
  },
  {
    id: "too-expensive",
    title: "That's too expensive early",
    archetype: "objection",
    core: false,
    business: plumbingBusiness,
    customerTurns: [
      "Heater at my home is not working",
      "How much does a repair usually cost?",
    ],
  },
  {
    id: "competitor-compare",
    title: "Competitor comparison",
    archetype: "objection",
    core: false,
    business: plumbingBusiness,
    customerTurns: [
      "I need heater repair.",
      "Another company quoted me less.",
    ],
  },
  {
    id: "buying-question-before-lead",
    title: "Buying question before lead complete",
    archetype: "interrupt",
    core: true,
    business: plumbingBusiness,
    customerTurns: [
      "I want a jacuzzi installed in my backyard.",
      "Do you handle the electrical too, or only the plumbing?",
      "Taylor",
      "2145550144",
      "55 Lake Rd, Dallas TX 75214",
    ],
    expectEarlyLeadCapture: true,
  },
  {
    id: "volunteer-address-first",
    title: "Volunteers address first",
    archetype: "volunteer",
    core: true,
    business: solarBusiness,
    customerTurns: [
      "I'm interested in getting solar panels for my home. Can you help me?",
      "I'm at 1500 Marilla St, Dallas TX 75201.",
      "John Smith",
      "214-555-0187",
    ],
    expectEarlyLeadCapture: true,
    expectSecureByEnd: true,
  },
  {
    id: "volunteer-phone-first",
    title: "Volunteers phone first",
    archetype: "volunteer",
    core: false,
    business: plumbingBusiness,
    customerTurns: [
      "Heater at my home is not working",
      "My number is 2145550133",
      "Morgan",
      "700 Ross Ave, Dallas TX 75202",
    ],
    expectEarlyLeadCapture: true,
    expectSecureByEnd: true,
  },
  {
    id: "customer-ok",
    title: "Customer says ok",
    archetype: "closure",
    core: false,
    business: plumbingBusiness,
    customerTurns: [
      "I need a new kitchen sink.",
      "Alex",
      "2145550199",
      "1500 Marilla St, Dallas TX 75201",
      "ok",
    ],
    expectSecureByEnd: true,
  },
  {
    id: "customer-yes",
    title: "Customer says yes",
    archetype: "closure",
    core: false,
    business: solarBusiness,
    customerTurns: [
      "I'm interested in getting solar panels for my home. Can you help me?",
      "Ramesh",
      "9898989898",
      "1500 Marilla St, Dallas TX 75201",
      "yes",
      "Saturday morning",
    ],
    expectSecureByEnd: true,
  },
  {
    id: "question-after-lead",
    title: "Question after lead complete",
    archetype: "interrupt",
    core: false,
    business: plumbingBusiness,
    customerTurns: [
      "I need a new kitchen sink.",
      "Alex",
      "2145550199",
      "1500 Marilla St, Dallas TX 75201",
      "Do you guarantee the installation?",
    ],
    expectSecureByEnd: true,
  },
  {
    id: "natural-finish",
    title: "Customer naturally finishes",
    archetype: "closure",
    core: false,
    business: plumbingBusiness,
    customerTurns: [
      "Heater at my home is not working",
      "Alex",
      "2145550199",
      "1500 Marilla St, Dallas TX 75201",
      "Tomorrow morning works.",
      "That's all I needed.",
    ],
    expectSecureByEnd: true,
    expectHandoffAttempt: true,
  },
  {
    id: "urgent-asap",
    title: "Urgent customer",
    archetype: "urgent",
    core: true,
    business: plumbingBusiness,
    customerTurns: [
      "Heater at my home is not working",
      "Alex",
      "2145550199",
      "1500 Marilla St, Dallas TX 75201",
      "This is urgent. I need someone ASAP.",
    ],
    expectEarlyLeadCapture: true,
    expectSecureByEnd: true,
    expectHandoffAttempt: true,
  },
  {
    id: "sparse-business",
    title: "Business with little sales information",
    archetype: "sparse",
    core: false,
    business: sparseBusiness,
    customerTurns: [
      "I need help with a service visit at my home.",
      "Lee",
      "2145550122",
      "12 Pearl St, Dallas TX 75201",
    ],
    expectEarlyLeadCapture: true,
    expectSecureByEnd: true,
    expectNoBrochure: true,
  },
  {
    id: "rich-promo-filter",
    title: "Rich promotions brochure filter",
    archetype: "promo-filter",
    core: false,
    business: richPromoBusiness,
    customerTurns: [
      "My heater stopped working.",
      "Casey",
      "2145550111",
      "88 Victory Ave, Dallas TX 75219",
    ],
    expectEarlyLeadCapture: true,
    expectPainTone: true,
    expectNoBrochure: true,
  },
];

export function coreScenarios(): LiveScenario[] {
  return LIVE_SCENARIOS.filter((s) => s.core);
}
