/**
 * Focused regressions for the final 3 customer-facing defects:
 * closure, post-secure repetition, unsupported electrician coordination.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import type { BusinessProfile } from "../src/types/business";
import {
  updateSalesStateFromTurn,
  validateSalesReply,
} from "../src/lib/salesController";
import { shouldAttemptLeadHandoff } from "../src/lib/leadHandoff";
import {
  businessIdentityKey,
  createConversationId,
  createInitialSalesState,
  type SalesState,
} from "../src/lib/salesState";
import { createBusinessProfile } from "../src/lib/businessProfile";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const plumbing: BusinessProfile = createBusinessProfile({
  website: "https://focused-plumbing.test",
  businessName: "Example Home Services",
  phone: "214-555-0199",
  email: "hello@homeservices.test",
  leadNotificationEmail: "owner@homeservices.test",
  services: [
    "Heater repair",
    "Kitchen sink installation",
    "Jacuzzi and spa plumbing",
  ],
  serviceAreas: ["Dallas", "DFW"],
  faqs: [
    {
      question: "Are you licensed?",
      answer: "Yes, we are licensed and insured for residential service work.",
    },
  ],
  systemPrompt:
    "Licensed residential service company. We repair heaters, install kitchen sinks, and handle jacuzzi plumbing. We do not publish prices. On-site estimates are the next step for installations. We do not invent availability windows.",
});

const solar: BusinessProfile = createBusinessProfile({
  website: "https://focused-solar.test",
  businessName: "Texas Solar Professional",
  phone: "214-555-0101",
  email: "hello@texassolar.test",
  leadNotificationEmail: "owner@texassolar.test",
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
  systemPrompt:
    "Texas residential solar installer. We design and install roof and ground-mounted systems and can discuss battery backup. We provide personalized savings estimates after an on-site assessment. We do not publish fixed prices. We do not claim same-day installation or live availability.",
});

function apply(
  business: BusinessProfile,
  state: SalesState,
  user: string,
  assistant = "How can I help?"
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

function seed(business: BusinessProfile): SalesState {
  return createInitialSalesState({
    conversationId: createConversationId(),
    businessKey: businessIdentityKey(business),
  });
}

function captureLead(
  business: BusinessProfile,
  state: SalesState,
  needUser: string,
  name = "Alex",
  phone = "2145550199",
  address = "1500 Marilla St, Dallas TX 75201"
): SalesState {
  state = apply(business, state, needUser);
  state = apply(business, state, name, "What's your first name?");
  state = apply(business, state, phone, "What's the best phone number?");
  state = apply(business, state, address, "What's the service address?");
  return state;
}

async function main() {
  // 1 — Lead complete + "yes, that works" → CLOSE (or ADVANCE once if on-site timing needed)
  let state = captureLead(plumbing, seed(plumbing), "Heater at my home is not working");
  state = apply(
    plumbing,
    state,
    "yes, that works",
    "Would you like our office to arrange an on-site diagnostic?"
  );
  assert(
    state.currentObjective === "ADVANCE_TO_NEXT_STEP" ||
      state.currentObjective === "CLOSE",
    `1: yes that works after next-step → ADVANCE/CLOSE, got ${state.currentObjective}`
  );
  assert(state.appointmentIntent === true, "1: appointmentIntent set");
  console.log("1 PASS — Lead complete + yes, that works");

  // 2 — Lead complete + timing supplied → CLOSE
  state = apply(plumbing, state, "Tomorrow morning works.", "What day or time works best?");
  assert(state.currentObjective === "CLOSE", `2: CLOSE after timing, got ${state.currentObjective}`);
  assert(state.handoffReady === true, "2: handoffReady");
  assert(
    shouldAttemptLeadHandoff(state, "closure", "Tomorrow morning works."),
    "2: closure handoff allowed"
  );
  console.log("2 PASS — Lead complete + timing → CLOSE");

  // 3 — Lead complete + thank you → CLOSE
  state = captureLead(plumbing, seed(plumbing), "Heater at my home is not working");
  state = apply(
    plumbing,
    state,
    "thank you",
    "Would you like an on-site diagnostic so we can quote the repair?"
  );
  assert(
    state.currentObjective === "CLOSE" ||
      state.currentObjective === "ADVANCE_TO_NEXT_STEP",
    `3: thank you after proposal → CLOSE/ADVANCE, got ${state.currentObjective}`
  );
  console.log("3 PASS — Lead complete + thank you");

  // 4 — Lead complete + unanswered price question → do NOT CLOSE
  state = captureLead(plumbing, seed(plumbing), "Heater at my home is not working");
  state = apply(
    plumbing,
    state,
    "How much does a repair usually cost?",
    "Would you like an on-site diagnostic?"
  );
  assert(
    state.currentObjective === "HANDLE_PRICE_OBJECTION" ||
      state.currentObjective === "ANSWER",
    `4: price question must not CLOSE, got ${state.currentObjective}`
  );
  console.log("4 PASS — Unanswered price question does not CLOSE");

  // 5 — Solar repeated assessment/savings language → reject
  state = captureLead(
    solar,
    seed(solar),
    "I'm interested in getting solar panels for my home. Can you help me?",
    "Ramesh",
    "9898989898"
  );
  const solarRepeat = validateSalesReply(
    "An on-site assessment lets us design the right system and produce a personalized savings estimate. Would you like to schedule an on-site assessment?",
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    solar,
    [
      "Great — the address lets us prepare for an on-site assessment and produce a personalized savings estimate. What's the service address?",
    ]
  );
  assert(!solarRepeat.ok, "5: repeated solar assessment/savings rejected");
  console.log("5 PASS — Solar repetition rejected");

  // 6 — Heater repeated licensed/diagnostic language → reject
  state = captureLead(plumbing, seed(plumbing), "My heater stopped working.");
  const heaterRepeat = validateSalesReply(
    "We're licensed and insured. An on-site diagnosis identifies the fault so we can give a firm repair quote. Would you like an on-site diagnosis?",
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    plumbing,
    [
      "Sorry you're dealing with that — heater repair is something our team handles regularly, and we're licensed and insured for residential work. What's your first name?",
      "The usual next step is an on-site diagnosis so we can give a firm quote. What's your first name?",
    ]
  );
  assert(!heaterRepeat.ok, "6: repeated heater licensed/diagnostic rejected");
  console.log("6 PASS — Heater repetition rejected");

  // 7 — Sink repeated estimate explanation → reject
  state = captureLead(
    plumbing,
    seed(plumbing),
    "I want a modern kitchen sink but I'm not sure what to buy.",
    "Jordan",
    "2145550177",
    "900 Elm St, Dallas TX 75202"
  );
  const sinkRepeat = validateSalesReply(
    "An on-site estimate is the best way to get an accurate quote for your modern sink. Would you like to proceed with an on-site estimate?",
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    plumbing,
    [
      "The next step is an on-site estimate so we can give an accurate quote. Would you like to proceed with an on-site estimate at 900 Elm St?",
    ]
  );
  assert(!sinkRepeat.ok, "7: repeated sink estimate explanation rejected");
  console.log("7 PASS — Sink repetition rejected");

  // 8 — Jacuzzi unsupported electrician coordination → reject
  state = captureLead(
    plumbing,
    seed(plumbing),
    "I want to install a Jacuzzi in my backyard.",
    "Sam",
    "2145550188",
    "2200 Main St, Dallas TX 75201"
  );
  const electricianBad = validateSalesReply(
    "Electrical hookup is typically required and is done by a licensed electrician — during the on-site estimate our technician will identify the exact electrical needs and include that in the quote. Would you like an on-site estimate?",
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    plumbing
  );
  assert(!electricianBad.ok, "8: invented electrician coordination rejected");
  console.log("8 PASS — Unsupported electrician coordination rejected");

  // 9 — Grounded limitation about electrical work → allow
  const electricianOk = validateSalesReply(
    "We handle the Jacuzzi and spa plumbing side. Electrical work would need to be handled separately by a licensed electrician. Would you like an on-site estimate for the plumbing?",
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    plumbing
  );
  assert(
    electricianOk.ok,
    `9: grounded electrical limitation should pass (${electricianOk.reasons.join("; ")})`
  );
  console.log("9 PASS — Grounded electrical limitation allowed");

  // 10 — Urgent behavior unchanged
  state = captureLead(plumbing, seed(plumbing), "Heater at my home is not working");
  state = apply(
    plumbing,
    state,
    "This is very urgent. I need someone ASAP.",
    "Would you like an on-site diagnostic?"
  );
  assert(state.urgency === "IMMEDIATE", "10: urgency IMMEDIATE");
  assert(state.currentObjective === "CLOSE", `10: urgent closes, got ${state.currentObjective}`);
  assert(state.handoffReady === true, "10: urgent handoffReady");
  console.log("10 PASS — Urgent behavior unchanged");

  console.log("\nFocused 3-defect regression pack PASS (10/10).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
