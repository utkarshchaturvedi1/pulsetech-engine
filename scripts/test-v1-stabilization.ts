import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import type { BusinessProfile } from "../src/types/business";
import { cloneBusinessProfile } from "../src/lib/businessProfile";
import { createCustomerChatSession } from "../src/lib/customerChatClient";
import {
  buildLeadNotificationEmail,
  shouldAttemptLeadHandoff,
} from "../src/lib/leadHandoff";
import {
  detectCustomerAgreement,
  isBareAffirmative,
  updateSalesStateFromTurn,
} from "../src/lib/salesController";
import {
  businessIdentityKey,
  createConversationId,
  createInitialSalesState,
  type SalesState,
} from "../src/lib/salesState";

/** Mirrors the BusinessProfile fields sent into OpenAI knowledge (no OpenAI import). */
function businessKnowledgeText(business: BusinessProfile): string {
  return [
    business.businessName,
    business.systemPrompt,
    ...business.services,
    ...business.faqs.map((f) => `${f.question} ${f.answer}`),
    ...business.leadQuestions,
  ].join("\n");
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function baseProfile(overrides: Partial<BusinessProfile> = {}): BusinessProfile {
  return {
    website: "https://autreys-plumbing.test",
    businessName: "Autrey's Plumbing LLC",
    tagline: "",
    logo: "",
    primaryColor: "",
    secondaryColor: "",
    phone: "",
    email: "",
    address: "",
    services: ["Drain clearing", "Estimates"],
    serviceAreas: ["Dallas"],
    faqs: [],
    leadQuestions: [],
    systemPrompt: "Residential plumbing service visits.",
    ...overrides,
  };
}

function apply(
  state: SalesState,
  user: string,
  assistant: string,
  business: BusinessProfile
): SalesState {
  return updateSalesStateFromTurn(
    state,
    [
      { role: "assistant", content: assistant },
      { role: "user", content: user },
    ],
    business
  );
}

function qualified(business: BusinessProfile): SalesState {
  return {
    ...createInitialSalesState({
      conversationId: createConversationId(),
      businessKey: businessIdentityKey(business),
    }),
    intent: "HIGH",
    leadStatus: "SECURED",
    currentObjective: "PRESENT_SOLUTION",
    salesStage: "SALES_MODE",
    lead: {
      name: "Sam",
      phone: "3333333333",
      email: null,
      address: "1500 Marilla St, Dallas TX 75201",
    },
    customerNeed: "My bathroom drain is clogged.",
    handoffReady: false,
    customerAgreed: false,
    leadDeliveryStatus: "NOT_SENT",
  };
}

async function main() {
  // -------- Test A — profile update synchronization --------
  const initial = baseProfile();
  const session = createCustomerChatSession(initial);
  const idBefore = session.conversationId;
  assert(
    !/\$\s?20|20\s*(dollar|diagnostic|visit)/i.test(
      JSON.stringify(session.getBoundBusiness())
    ),
    "A: starts without $20 fee"
  );

  const updated = cloneBusinessProfile(initial);
  updated.systemPrompt =
    "Residential plumbing. $20 diagnostic/visiting fee, waived if customer approves services.";
  updated.faqs = [
    {
      question: "How much is a diagnostic visit?",
      answer:
        "$20 visiting/diagnostic fee. It gets waived if you choose to take our services.",
    },
  ];

  const ok = session.updateBusiness(updated);
  assert(ok, "A: updateBusiness accepted same identity");
  assert(session.conversationId === idBefore, "A: conversationId preserved");
  const bound = session.getBoundBusiness();
  assert(/\$\s?20/.test(bound.systemPrompt), "A: systemPrompt has $20");
  assert(
    bound.faqs.some((f) => /\$\s?20/.test(f.answer)),
    "A: faqs have $20"
  );
  const knowledge = businessKnowledgeText(bound);
  assert(/\$\s?20/.test(knowledge), "A: knowledge text includes $20 for OpenAI");
  console.log("Test A PASS — profile update reaches bound BusinessProfile", {
    conversationId: idBefore,
    feeInKnowledge: true,
  });

  // The actual API payload must also use the refreshed profile, not merely the
  // client's in-memory copy. This protects an already-open customer session.
  const originalFetch = globalThis.fetch;
  const chatPayloads: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    chatPayloads.push(payload);
    return new Response(
      JSON.stringify({
        reply: "Test reply",
        salesState: payload.salesState,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    await session.send("I need help with a repair.");
    await session.send("What does the visit cost?");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert(chatPayloads.length === 2, "A: sent both customer turns");
  assert(
    (chatPayloads[1].conversationId as string) === idBefore,
    "A: transport preserves conversationId after profile update"
  );
  const secondBusiness = chatPayloads[1].business as BusinessProfile;
  assert(
    /\$\s?20/.test(secondBusiness.systemPrompt) &&
      secondBusiness.faqs.some((faq) => /\$\s?20/.test(faq.answer)),
    "A: transport sends refreshed BusinessProfile to Customer AI"
  );
  console.log("Test A2 PASS — refreshed profile reaches the chat API");

  // -------- Test B — agreement context --------
  const biz = baseProfile({
    systemPrompt:
      "$20 diagnostic fee waived if customer approves services. Residential plumbing.",
    faqs: [
      {
        question: "Visit fee?",
        answer: "$20 diagnostic fee, waived if you approve services.",
      },
    ],
  });
  let state = qualified(biz);
  state = apply(
    state,
    "yes",
    "Would you like me to arrange an on-site visit for a diagnosis?",
    biz
  );
  assert(isBareAffirmative("yes"), "B: bare yes is affirmative");
  assert(!detectCustomerAgreement("yes"), "B: bare yes is NOT final agreement");
  assert(state.customerAgreed === false, "B: customerAgreed stays false");
  assert(state.currentObjective !== "CLOSE", `B: not CLOSE, got ${state.currentObjective}`);
  assert(state.leadDeliveryStatus !== "SENT", "B: not SENT after bare yes");
  assert(
    !shouldAttemptLeadHandoff(state, "closure", "yes"),
    "B: no closure handoff on bare yes"
  );
  assert(state.appointmentIntent === true, "B: next-step agreement recorded");

  state = apply(state, "How much will it cost?", "Great — I'll note that.", biz);
  assert(
    state.currentObjective === "HANDLE_PRICE_OBJECTION" ||
      state.currentObjective === "ANSWER" ||
      state.currentObjective === "PRESENT_SOLUTION",
    `B: price question answered path, got ${state.currentObjective}`
  );
  assert(state.leadDeliveryStatus !== "SENT", "B: still not handed off");
  assert(/\$\s?20/.test(businessKnowledgeText(biz)), "B: fee available in profile knowledge");

  state = apply(
    state,
    "Okay, that's fine. That's everything.",
    "The diagnostic visit is $20 and waived if you approve services.",
    biz
  );
  assert(state.currentObjective === "CLOSE", "B: natural finish → CLOSE");
  assert(state.handoffReady === true, "B: handoffReady");
  assert(
    shouldAttemptLeadHandoff(state, "closure", "Okay, that's fine. That's everything."),
    "B: handoff allowed after genuine finish"
  );
  console.log("Test B PASS — bare yes does not hand off; finish does", {
    afterYes: { agreed: false, delivery: "NOT_SENT" },
    afterFinish: { objective: "CLOSE", handoffReady: true },
  });

  // -------- Test C — natural closure --------
  state = apply(qualified(biz), "nothing more", "Anything else to pass along?", biz);
  assert(state.currentObjective === "CLOSE", "C: CLOSE");
  assert(state.handoffReady === true, "C: handoffReady");
  assert(shouldAttemptLeadHandoff(state, "closure", "nothing more"), "C: handoff");
  console.log("Test C PASS — nothing more closes once");

  // -------- Test D — business isolation --------
  const a = baseProfile({
    website: "https://business-a.test",
    businessName: "Business A",
    systemPrompt: "SECRET_FEE_A_99",
  });
  const b = baseProfile({
    website: "https://business-b.test",
    businessName: "Business B",
    systemPrompt: "SECRET_FEE_B_55",
  });
  const sessionA = createCustomerChatSession(a);
  const sessionB = createCustomerChatSession(b);
  assert(sessionA.conversationId !== sessionB.conversationId, "D: distinct conversationIds");
  assert(sessionA.businessKey !== sessionB.businessKey, "D: distinct businessKeys");
  assert(
    !sessionA.updateBusiness(b),
    "D: cannot rebind session A to business B identity"
  );
  assert(
    /SECRET_FEE_A_99/.test(sessionA.getBoundBusiness().systemPrompt),
    "D: A keeps A knowledge"
  );
  assert(
    /SECRET_FEE_B_55/.test(sessionB.getBoundBusiness().systemPrompt),
    "D: B keeps B knowledge"
  );
  assert(
    !/SECRET_FEE_B_55/.test(businessKnowledgeText(sessionA.getBoundBusiness())),
    "D: A knowledge text has no B secret"
  );
  console.log("Test D PASS — business isolation", {
    idA: sessionA.conversationId,
    idB: sessionB.conversationId,
  });

  // -------- Test E — Autrey's fee in knowledge --------
  const autreys = baseProfile({
    systemPrompt:
      "$20 diagnostic/visiting fee, waived if customer approves services.",
    faqs: [
      {
        question: "How much is the diagnostic visit?",
        answer:
          "$20 visiting/diagnostic fee. Waived if you choose to take our services.",
      },
    ],
  });
  const knowledgeE = businessKnowledgeText(autreys);
  assert(/\$\s?20/.test(knowledgeE), "E: $20 present in OpenAI business knowledge");
  assert(/waived/i.test(knowledgeE), "E: waiver present");
  assert(
    !knowledgeE.includes("hardcoded"),
    "E: knowledge comes from profile fields"
  );
  console.log("Test E PASS — $20 fee present in BusinessProfile knowledge for chat");

  // -------- Email structure smoke --------
  const rich = {
    ...qualified(autreys),
    customerAgreed: true,
    handoffReady: true,
    preferredTiming: "Tomorrow, 5-7 PM",
    contactPreference: "Phone call",
    customerContext: ["Customer wants to understand available options."],
    currentObjective: "CLOSE" as const,
  };
  const email = buildLeadNotificationEmail(autreys, rich);
  assert(email.text.includes("SERVICE NEEDED"), "email service need");
  assert(email.text.includes("CUSTOMER WANTS"), "email context");
  assert(email.text.includes("PRICING / SALES NOTES") === false, "email omits empty pricing section");
  assert(!/NORMAL \/ soon|No explicit closure/i.test(email.text), "email omits internal status language");
  assert(/clogged/i.test(email.text), "email need");
  console.log("Email smoke PASS");

  console.log("\nAll V1 stabilization tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
