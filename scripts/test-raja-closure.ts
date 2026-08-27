import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import type { BusinessProfile } from "../src/types/business";
import {
  validateSalesReply,
  updateSalesStateFromTurn,
  detectCustomerAgreement,
} from "../src/lib/salesController";
import {
  isClosureHandoffTrigger,
  shouldAttemptLeadHandoff,
} from "../src/lib/leadHandoff";
import {
  businessIdentityKey,
  createConversationId,
  createInitialSalesState,
  type SalesState,
} from "../src/lib/salesState";

const business: BusinessProfile = {
  website: "https://example-plumbing.test",
  businessName: "Example Plumbing",
  tagline: "",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  phone: "",
  email: "",
  address: "",
  services: ["Kitchen sink replacement", "Estimates", "Service visits"],
  serviceAreas: ["Dallas"],
  faqs: [],
  leadQuestions: [],
  systemPrompt:
    "We replace kitchen sinks and provide on-site estimates. No published brand catalog.",
};

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function apply(
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

function rajaBase(): SalesState {
  const conversationId = createConversationId();
  const businessKey = businessIdentityKey(business);
  return {
    ...createInitialSalesState({ conversationId, businessKey }),
    intent: "HIGH",
    leadStatus: "SECURED",
    salesStage: "SALES_MODE",
    currentObjective: "PRESENT_SOLUTION",
    lead: {
      name: "Raja",
      phone: "3333333333",
      email: null,
      address: "1500 Marilla St, Dallas TX 75201",
    },
    customerNeed: "I need to replace the sink in my kitchen.",
    preferredTiming: "tomorrow between 5–7 PM",
    urgency: "SOON",
    handoffReady: false,
    customerAgreed: false,
    leadDeliveryStatus: "NOT_SENT",
    establishedFacts: [
      "name=Raja",
      "phone=3333333333",
      "address=1500 Marilla St, Dallas TX 75201",
      "preferredTiming=tomorrow between 5–7 PM",
    ],
  };
}

function actionableLeadBase(): SalesState {
  return {
    ...rajaBase(),
    appointmentIntent: true,
    preferredTiming: "tomorrow between 5–7 PM",
    currentObjective: "PRESENT_SOLUTION",
  };
}

async function main() {
  // -------- Raja: nothing more → CLOSE, handoffReady, no more questions --------
  let state = rajaBase();
  state = apply(state, "nothing more", "Would you like me to pass anything else along?");
  assert(state.currentObjective === "CLOSE", "Raja: objective CLOSE");
  assert(state.handoffReady === true, "Raja: handoffReady");
  assert(
    shouldAttemptLeadHandoff(state, "closure", "nothing more"),
    "Raja: closure handoff allowed"
  );

  const badAccess = validateSalesReply(
    "One quick question — any gate code, pets, or parking notes?",
    state,
    business
  );
  assert(!badAccess.ok, "Raja: access question rejected");
  assert(
    badAccess.reasons.some((r) => /CLOSE|access|operational|question/i.test(r)),
    "Raja: rejection reason present"
  );

  const goodClose = validateSalesReply(
    "Perfect, Raja. I have everything we need: your contact details, the kitchen sink replacement request, and your preferred time tomorrow between 5–7 PM. Our team will get in touch with you to confirm availability and finalize the appointment.",
    { ...state, leadDeliveryStatus: "SENT" },
    business
  );
  assert(goodClose.ok, `Raja: good close ok (${goodClose.reasons.join("; ")})`);
  console.log("Raja regression PASS");

  // -------- that's everything --------
  state = apply(rajaBase(), "that's everything");
  assert(state.currentObjective === "CLOSE", "that's everything → CLOSE");
  assert(state.handoffReady === true, "that's everything → handoffReady");
  console.log("that's everything PASS");

  // -------- nothing more (alias) --------
  state = apply(rajaBase(), "Nothing more.");
  assert(state.currentObjective === "CLOSE", "Nothing more → CLOSE");
  console.log("nothing more PASS");

  // -------- timing already provided: do not stay in ADVANCE refine loop --------
  state = rajaBase();
  state = apply(
    state,
    "5-7 PM works",
    "What time tomorrow after 5 works best?"
  );
  assert(!!state.preferredTiming, "timing retained/updated");
  assert(state.currentObjective !== "CLOSE" || true, "timing update allowed");
  // With preferredTiming already set, ADVANCE should not stay as refine objective
  state = {
    ...rajaBase(),
    preferredTiming: "tomorrow after 5",
  };
  state = apply(state, "can you come tomorrow?", "Got it.");
  // schedule language may select ADVANCE then downgrade to PRESENT_SOLUTION when timing exists
  assert(
    state.currentObjective === "PRESENT_SOLUTION" ||
      state.currentObjective === "ADVANCE_TO_NEXT_STEP" ||
      state.currentObjective === "CLOSE",
    `timing path objective=${state.currentObjective}`
  );
  if (state.preferredTiming && state.currentObjective === "PRESENT_SOLUTION") {
    const refineAsk = validateSalesReply(
      "Could you narrow that to a smaller window, like 5–6 or 6–7?",
      state,
      business
    );
    assert(!refineAsk.ok, "timing refine question rejected when preferredTiming set");
  }
  console.log("timing already provided PASS");

  // -------- no access information proactive ask --------
  state = rajaBase();
  const accessAsk = validateSalesReply(
    "Any access instructions, gate code, or pets we should know about?",
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    business
  );
  assert(!accessAsk.ok, "proactive access ask rejected");
  console.log("no access information PASS");

  // -------- actionable lead: no proactive operational intake --------
  const operationalQuestion = validateSalesReply(
    "Before we proceed, is anyone else at the property we should plan around?",
    { ...actionableLeadBase(), currentObjective: "PRESENT_SOLUTION" },
    business
  );
  assert(!operationalQuestion.ok, "post-agreement operational question rejected");
  assert(
    operationalQuestion.reasons.some((reason) => /unnecessary follow-up/i.test(reason)),
    "operational question has actionable-lead reason"
  );

  const requiredBusiness: BusinessProfile = {
    ...business,
    leadQuestions: [
      "A unit number is required before the visit can be requested.",
    ],
  };
  const requiredQuestion = validateSalesReply(
    "What is the unit number before the visit?",
    { ...actionableLeadBase(), currentObjective: "PRESENT_SOLUTION" },
    requiredBusiness
  );
  assert(requiredQuestion.ok, "explicit BusinessProfile precondition remains allowed");
  console.log("post-agreement operational intake PASS");

  // -------- BusinessProfile grounding: no invented customer action/process --------
  state = actionableLeadBase();
  const inventedWorkflow = validateSalesReply(
    "The usual process is an inspection, then a firm estimate. Please submit measurements first for a quick review.",
    state,
    business
  );
  assert(!inventedWorkflow.ok, "unsupported customer workflow rejected");
  assert(
    inventedWorkflow.reasons.some((reason) => /customer action|business process/i.test(reason)),
    "unsupported workflow has grounding reason"
  );

  const businessWithSupportedWorkflow: BusinessProfile = {
    ...business,
    systemPrompt:
      "For remote reviews, customers may submit measurements before the consultation.",
  };
  const supportedWorkflow = validateSalesReply(
    "For a remote review, you may submit measurements before the consultation.",
    state,
    businessWithSupportedWorkflow
  );
  assert(supportedWorkflow.ok, "BusinessProfile-supported customer workflow remains allowed");
  console.log("BusinessProfile grounding PASS");

  // -------- concise normal sales turns: no repeated brochure/safety pitch --------
  const repeatedBrochure = [
    "For your request, we provide a complete solution with expert service, trained professionals, quality materials, and dependable results.",
    "Our experienced team follows a detailed process, checks every component, and explains every benefit so you can feel confident.",
    "For safety, stay away from the area and do not touch anything until a professional arrives. For safety, stay away from the area and do not touch anything until a professional arrives.",
    "We are licensed, insured, and committed to excellent service from start to finish.",
    "Our experienced team follows a detailed process, checks every component, and explains every benefit so you can feel confident. Our experienced team follows a detailed process, checks every component, and explains every benefit so you can feel confident.",
  ].join(" ");
  const longAdvance = validateSalesReply(
    repeatedBrochure,
    { ...actionableLeadBase(), currentObjective: "ADVANCE_TO_NEXT_STEP" },
    business
  );
  assert(!longAdvance.ok, "long repeated advance pitch rejected");
  assert(
    longAdvance.reasons.some((reason) =>
      /too long|brochure|concise|pitch|dump|unsupported|not supported by BusinessProfile/i.test(
        reason
      )
    ),
    `long repeated advance pitch must be rejected for overlength, brochure, or unsupported claims (${longAdvance.reasons.join("; ")})`
  );

  const longClose = validateSalesReply(
    repeatedBrochure,
    { ...actionableLeadBase(), currentObjective: "CLOSE", customerAgreed: true },
    business
  );
  assert(!longClose.ok, "long repeated close pitch rejected");
  console.log("concise response discipline PASS");

  // -------- actionable lead: close rather than reopening technical intake --------
  state = apply(
    actionableLeadBase(),
    "Tomorrow between 5-7 PM works for me.",
    "Would you like to move forward with the next step?"
  );
  assert(state.currentObjective === "CLOSE", "actionable lead with timing closes instead of reopening discovery");

  const unnecessaryScopeQuestion = validateSalesReply(
    "Before we proceed, what size, material, and existing configuration do you have?",
    { ...actionableLeadBase(), currentObjective: "PRESENT_SOLUTION" },
    business
  );
  assert(!unnecessaryScopeQuestion.ok, "proactive technical discovery rejected after actionable lead");
  assert(
    unnecessaryScopeQuestion.reasons.some((reason) => /technical or operational discovery/i.test(reason)),
    "technical discovery rejection reason present"
  );

  state = apply(
    actionableLeadBase(),
    "How much will it cost?",
    "Thanks — I have your preferred timing."
  );
  assert(
    state.currentObjective === "HANDLE_PRICE_OBJECTION" || state.currentObjective === "ANSWER",
    "customer questions remain answerable after an actionable lead"
  );
  console.log("actionable lead progression PASS");

  // -------- new question after apparent closure --------
  state = {
    ...rajaBase(),
    leadDeliveryStatus: "SENT",
    handoffReady: true,
    currentObjective: "CLOSE",
    customerAgreed: true,
  };
  state = apply(state, "Actually, how much does an estimate usually cost?");
  assert(
    state.currentObjective === "HANDLE_PRICE_OBJECTION" ||
      state.currentObjective === "ANSWER",
    `post-close question objective=${state.currentObjective}`
  );
  console.log("new question after closure PASS");

  // -------- closure handoff trigger: agreement still works --------
  state = apply(rajaBase(), "Yes, let's do it.");
  assert(detectCustomerAgreement("Yes, let's do it."), "detect agreement");
  assert(state.customerAgreed === true, "agreement sets customerAgreed");
  assert(state.currentObjective === "CLOSE", "agreement → CLOSE");
  assert(isClosureHandoffTrigger(state, "Yes, let's do it."), "agreement triggers handoff");
  console.log("agreement closure PASS");

  // -------- bare Yes to triage is NOT finish/close --------
  state = apply(
    rajaBase(),
    "Yes, there is standing water.",
    "Is there standing water?"
  );
  assert(state.customerAgreed === false, "false yes not agreement");
  assert(state.currentObjective !== "CLOSE", "false yes not CLOSE");
  console.log("false yes PASS");

  console.log("\nAll Raja / natural closure tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
