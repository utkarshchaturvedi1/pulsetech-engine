import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import { NextRequest } from "next/server";
import { POST as handoffPost } from "../src/app/api/lead-handoff/route";
import { buildLeadNotificationEmail } from "../src/lib/leadHandoff";
import { updateSalesStateFromTurn } from "../src/lib/salesController";
import {
  businessIdentityKey,
  createConversationId,
  createInitialSalesState,
  type SalesState,
} from "../src/lib/salesState";
import type { BusinessProfile } from "../src/types/business";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const business: BusinessProfile = {
  website: "https://autreys-plumbing.test",
  businessName: "Autrey's Plumbing LLC",
  tagline: "",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  phone: "",
  email: "",
  address: "",
  services: ["Kitchen sink replacement"],
  serviceAreas: ["Dallas, TX"],
  faqs: [],
  leadQuestions: [],
  systemPrompt: "Residential plumbing service visits.",
};

function applyTurn(state: SalesState, user: string, assistant: string) {
  return updateSalesStateFromTurn(
    state,
    [
      { role: "assistant", content: assistant },
      { role: "user", content: user },
    ],
    business
  );
}

async function main() {
  const conversationId = createConversationId();
  let state = createInitialSalesState({
    conversationId,
    businessKey: businessIdentityKey(business),
  });

  state = applyTurn(
    state,
    "I need to replace my kitchen sink.",
    "Absolutely. What is your name?"
  );
  state = applyTurn(state, "David", "What is the best phone number?");
  state = applyTurn(
    state,
    "3333333333",
    "What is the service address?"
  );
  state = applyTurn(
    state,
    "1500 Marilla St, Dallas TX 75201",
    "How can we help with the replacement?"
  );
  state = applyTurn(
    state,
    "I want something modern but I'm not sure what type to get.",
    "We can help you choose an appropriate modern sink."
  );

  const needBeforeQuestion = state.customerNeed;
  state = applyTurn(
    state,
    "How much will it cost?",
    "The exact price depends on the sink and installation, so the team will confirm it."
  );
  assert(
    state.currentObjective === "HANDLE_PRICE_OBJECTION" ||
      state.currentObjective === "ANSWER",
    "A later price question remains answerable after an earlier affirmative."
  );
  assert(
    state.customerNeed === needBeforeQuestion,
    "A later customer question does not replace the primary need."
  );

  state = applyTurn(
    state,
    "Tomorrow between 5-7 PM is fine.",
    "I will note that preferred window."
  );
  state = applyTurn(state, "Yes.", "Would you like to move forward?");

  state = {
    ...state,
    intent: "HIGH",
    salesStage: "CLOSING",
    currentObjective: "CLOSE",
    leadStatus: "SECURED",
    customerNeed: "Kitchen sink replacement",
    lead: {
      name: "David",
      phone: "3333333333",
      email: null,
      address: "1500 Marilla St, Dallas TX 75201",
    },
    preferredTiming: "Tomorrow 5–7 PM",
    customerAgreed: true,
    handoffReady: true,
    leadDeliveryStatus: "NOT_SENT",
    customerContext: ["Customer wants a modern sink and would like guidance on type."],
  };

  const email = buildLeadNotificationEmail(business, state);
  for (const required of [
    "Autrey's Plumbing LLC",
    "CUSTOMER\nDavid",
    "Phone: 3333333333",
    "Address: 1500 Marilla St, Dallas TX 75201",
    "SERVICE NEEDED",
    "Kitchen sink replacement",
    "Tomorrow 5–7 PM",
    "Ready for follow-up",
    "Customer wants a modern sink",
  ]) {
    assert(email.text.includes(required), `Lead email includes ${required}`);
  }
  assert(!/How much will it cost\?/i.test(email.text), "Email does not promote a later question to the need.");
  assert(!/gate code|parking|access instructions/i.test(email.text), "Email has no fabricated access instructions.");
  assert(!/no explicit final closure/i.test(email.text), "Email truthfully reflects the natural closure.");
  assert(!/NORMAL \/ soon|PRIMARY CUSTOMER NEED|CUSTOMER CONTEXT|SALES CONTEXT/i.test(email.text), "Email contains no internal or legacy status labels.");

  const request = new NextRequest("http://localhost/api/lead-handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId,
      business,
      salesState: state,
      reason: "closure",
      latestUserMessage: "Yes.",
    }),
  });
  const first = await handoffPost(request);
  assert(first.status === 200, "Production handoff route accepts the qualified lead.");
  const firstBody = (await first.json()) as { salesState: SalesState; handoff: { attempted: boolean; status: string } };
  assert(firstBody.handoff.attempted && firstBody.handoff.status === "SENT", "Dry-run SMTP completes the production handoff.");

  const duplicate = await handoffPost(
    new NextRequest("http://localhost/api/lead-handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        business,
        salesState: firstBody.salesState,
        reason: "closure",
        latestUserMessage: "Yes.",
      }),
    })
  );
  const duplicateBody = (await duplicate.json()) as { handoff: { attempted: boolean; status: string } };
  assert(duplicateBody.handoff.status === "SENT" && !duplicateBody.handoff.attempted, "Duplicate handoff is prevented.");
  console.log("V1 lead handoff E2E PASS — conversation state, email content, dry-run route, and duplicate prevention.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
