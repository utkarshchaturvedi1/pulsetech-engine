import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import type { BusinessProfile } from "../src/types/business";
import { buildLeadNotificationEmail } from "../src/lib/leadHandoff";
import { updateSalesStateFromTurn } from "../src/lib/salesController";
import {
  businessIdentityKey,
  createConversationId,
  createInitialSalesState,
  type SalesState,
} from "../src/lib/salesState";

const business: BusinessProfile = {
  website: "https://autreys.test",
  businessName: "Autrey's Plumbing LLC",
  tagline: "",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  phone: "",
  email: "",
  address: "",
  services: ["Kitchen plumbing", "Estimates"],
  serviceAreas: ["Dallas"],
  faqs: [],
  leadQuestions: [],
  systemPrompt: "Residential plumbing visits and estimates.",
};

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function apply(state: SalesState, user: string, assistant = "Got it."): SalesState {
  return updateSalesStateFromTurn(
    state,
    [
      { role: "assistant", content: assistant },
      { role: "user", content: user },
    ],
    business
  );
}

function seed(): SalesState {
  return createInitialSalesState({
    conversationId: createConversationId(),
    businessKey: businessIdentityKey(business),
  });
}

async function main() {
  // -------- Primary need preservation --------
  let state = seed();
  state = apply(state, "I need to replace the sink in my kitchen.");
  const primary = state.customerNeed;
  assert(!!primary && /replace/i.test(primary) && /sink/i.test(primary), "primary need set");

  state = apply(
    state,
    "Yes. But before that is there only one type of sink that you replace, or do you have multiple options. Will you bring the new sink or should I buy a sink first?"
  );
  assert(
    state.customerNeed === primary,
    `need must not be overwritten; got: ${state.customerNeed}`
  );
  assert(state.customerContext.length >= 1, "context notes captured");
  assert(
    state.customerContext.some((c) => /options/i.test(c)),
    "options context"
  );
  assert(
    state.customerContext.some((c) => /buy|purchased|sourc|supply/i.test(c)),
    "sourcing/buy context"
  );
  console.log("primary need preservation PASS");

  // -------- Timing specificity --------
  state = seed();
  state = apply(state, "tomorrow sounds fine");
  assert(/tomorrow/i.test(state.preferredTiming || ""), "day captured");
  state = apply(state, "tomorrow after 5 PM");
  assert(/after\s*5/i.test(state.preferredTiming || ""), `after 5: ${state.preferredTiming}`);
  state = apply(state, "5-7 PM");
  assert(
    /tomorrow/i.test(state.preferredTiming || "") &&
      /5\s*[-–]\s*7/i.test(state.preferredTiming || ""),
    `final timing should be tomorrow + window: ${state.preferredTiming}`
  );
  console.log("timing specificity PASS", state.preferredTiming);

  // -------- Contact preference --------
  state = seed();
  state = apply(state, "Phone call is fine.");
  assert(state.contactPreference === "Phone call", "contact preference");
  console.log("contact preference PASS");

  // -------- Raja full regression + email --------
  state = seed();
  for (const turn of [
    "I need to replace the sink in my kitchen.",
    "Raja",
    "3333333333",
    "1500 Marilla St, Dallas TX 75201",
    "Yes. But before that is there only one type of sink that you replace, or do you have multiple options. Will you bring the new sink or should I buy a sink first?",
    "Would sourcing the sink cost extra?",
    "tomorrow sounds fine",
    "tomorrow after 5 PM",
    "5-7 PM",
    "Phone call is fine.",
    "nothing more",
  ]) {
    state = apply(state, turn);
  }

  assert(/replace/i.test(state.customerNeed || "") && /sink/i.test(state.customerNeed || ""), "Raja need");
  assert(
    !/before that is there only one type/i.test(state.customerNeed || ""),
    "Raja need not overwritten by question"
  );
  assert(
    /tomorrow/i.test(state.preferredTiming || "") &&
      /5\s*[-–]\s*7/i.test(state.preferredTiming || ""),
    `Raja timing: ${state.preferredTiming}`
  );
  assert(state.contactPreference === "Phone call", "Raja contact");
  assert(state.customerContext.some((c) => /options/i.test(c)), "Raja options context");
  assert(state.customerContext.some((c) => /extra|sourc|supply|buy/i.test(c)), "Raja sourcing context");
  assert(state.currentObjective === "CLOSE", "Raja closed");
  assert(state.handoffReady === true, "Raja handoffReady");

  const email = buildLeadNotificationEmail(
    business,
    { ...state, leadDeliveryStatus: "SENT" }
  );
  assert(email.text.includes("SERVICE NEEDED"), "email service need header");
  assert(/replace/i.test(email.text) && /sink/i.test(email.text), "email has sink replacement");
  assert(!/before that is there only one type/i.test(email.text), "email not polluted by question as need");
  assert(/5\s*[-–]\s*7/i.test(email.text), "email has timing window");
  assert(/Phone call/i.test(email.text), "email has contact preference");
  assert(/CUSTOMER WANTS/i.test(email.text), "email has context section");
  assert(!/\bNORMAL\b/.test(email.text), "email must not include NORMAL");
  assert(!/No explicit final closure/i.test(email.text), "email must not claim missing closure when handoffReady");
  assert(
    /Ready for follow-up/i.test(email.text),
    "email status truthful"
  );
  assert(!email.text.includes("Services on file"), "no services dump");
  assert(!email.text.includes("Residential plumbing visits"), "no systemPrompt dump");
  console.log("Raja handoff data regression PASS");
  console.log("\nAll lead handoff data quality tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
