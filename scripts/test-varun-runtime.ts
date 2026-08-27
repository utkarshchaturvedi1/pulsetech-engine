import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import type { BusinessProfile } from "../src/types/business";
import {
  updateSalesStateFromTurn,
  validateSalesReply,
} from "../src/lib/salesController";
import {
  shouldAttemptLeadHandoff,
} from "../src/lib/leadHandoff";
import {
  businessIdentityKey,
  createConversationId,
  createInitialSalesState,
  type SalesState,
} from "../src/lib/salesState";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const business: BusinessProfile = {
  website: "https://hvac-test.example",
  businessName: "Example HVAC",
  tagline: "",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  phone: "(214) 733-2420",
  email: "",
  address: "",
  services: ["Heater repair", "24/7 emergency service", "Equipment replacement"],
  serviceAreas: ["Dallas"],
  faqs: [
    {
      question: "Do you offer financing?",
      answer: "Financing is available for installations.",
    },
    {
      question: "Any promotions?",
      answer: "Free diagnostic with paid repair and free estimates on new equipment.",
    },
  ],
  leadQuestions: [],
  systemPrompt:
    "We offer 24/7 emergency service. Promotions include a free diagnostic with paid repair. Financing is available for installations.",
};

function apply(state: SalesState, user: string, assistant: string): SalesState {
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
  let state = seed();
  state = apply(state, "Heater at my home is not working", "Hi! How can I help?");
  state = apply(state, "Varun", "What's your first name?");
  state = apply(state, "7777777777", "What's the best phone number?");
  state = apply(
    state,
    "1500 Marilla St, Dallas TX 75201",
    "What is the service address?"
  );
  assert(state.leadStatus === "SECURED", "lead secured");
  assert(state.lead.name === "Varun", "name");
  assert(!state.handoffReady, "not ready before next-step agreement");

  const brochure =
    "Based on what you said, the best next step is an on-site diagnostic so a technician can identify why the heater isn't working and recommend repair or replacement. We offer 24/7 emergency service if it becomes urgent (call (214) 733-2420), plus promotions like a free diagnostic with paid repair and free estimates on new equipment — financing is available for installations.";
  const brochureCheck = validateSalesReply(
    brochure,
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    business
  );
  assert(!brochureCheck.ok, "true-but-unrelated profile facts must not dump into a normal service reply");
  assert(
    brochureCheck.reasons.some((reason) => /financ|promotion|emergency|phone|free diagnostic|replacement/i.test(reason)),
    `relevance filter reason missing: ${brochureCheck.reasons.join("; ")}`
  );

  const relevant = validateSalesReply(
    "Based on what you described, the best next step is an on-site diagnostic so a technician can identify why the heater isn't working. Would you like our office to arrange that visit?",
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    business
  );
  assert(relevant.ok, `relevant next-step reply should pass (${relevant.reasons.join("; ")})`);

  state = apply(
    state,
    "yes",
    "Would you like our office to contact you to arrange an on-site diagnostic?"
  );
  assert(state.customerAgreed === false, "bare yes is not final closure");
  assert(state.appointmentIntent === true, "yes accepts the proposed visit");
  assert(state.currentObjective === "ADVANCE_TO_NEXT_STEP", `yes to on-site should ask availability, got ${state.currentObjective}`);
  assert(state.handoffReady === false, "do not hand off before availability on an on-site next step");
  assert(
    !shouldAttemptLeadHandoff(state, "closure", "yes"),
    "closure handoff must not fire on bare yes before timing"
  );
  assert(
    !shouldAttemptLeadHandoff(state, "inactivity"),
    "inactivity must not fire while on-site availability is still needed"
  );

  const skippedTiming = validateSalesReply(
    "Perfect — I've captured your request and details. Our office will contact you to arrange an on-site diagnostic.",
    state,
    business
  );
  assert(!skippedTiming.ok, "cannot close/claim contact instead of asking availability");

  const timingAsk = validateSalesReply(
    "Great. What day or time works best for you?",
    state,
    business
  );
  assert(timingAsk.ok, `availability question should pass (${timingAsk.reasons.join("; ")})`);

  state = apply(state, "tomorrow morning", "What day or time works best for you?");
  assert(!!state.preferredTiming, "timing captured");
  assert(state.currentObjective === "CLOSE", `after timing should close, got ${state.currentObjective}`);
  assert(state.handoffReady === true, "handoffReady after complete on-site agreement + timing");
  assert(
    shouldAttemptLeadHandoff(state, "closure", "tomorrow morning"),
    "closure handoff must run once CLOSE + handoffReady"
  );

  const falseContact = validateSalesReply(
    "Perfect, Varun. I have everything we need. Our office will contact you to arrange the diagnostic.",
    { ...state, leadDeliveryStatus: "NOT_SENT" },
    business
  );
  assert(!falseContact.ok, "must not promise office contact before SENT");

  const capturedOnly = validateSalesReply(
    "Perfect, Varun. I have everything we need: your contact details, the heater not working, and tomorrow morning. Your request is captured.",
    { ...state, leadDeliveryStatus: "NOT_SENT", currentObjective: "CLOSE" },
    business
  );
  assert(capturedOnly.ok, `honest captured close should pass (${capturedOnly.reasons.join("; ")})`);

  const sentClose = validateSalesReply(
    "Perfect, Varun. I have everything we need. Our team will get in touch with you to confirm the next step.",
    { ...state, leadDeliveryStatus: "SENT", currentObjective: "CLOSE" },
    business
  );
  assert(sentClose.ok, `SENT close may promise contact (${sentClose.reasons.join("; ")})`);

  console.log("Varun HVAC runtime regression PASS — relevance filter, on-site timing, truthful close, and handoff trigger.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
