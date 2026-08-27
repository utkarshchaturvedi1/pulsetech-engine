/**
 * Targeted regressions: suggestion≠fact, unsupported portfolio, owner $20 fee,
 * repetition, timing memory, post-close question/preference.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import type { BusinessProfile } from "../src/types/business";
import {
  updateSalesStateFromTurn,
  validateSalesReply,
} from "../src/lib/salesController";
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

const fountainBase: BusinessProfile = createBusinessProfile({
  website: "https://fountain-polish.test",
  businessName: "Example Outdoor Services",
  phone: "214-555-0199",
  email: "hello@outdoor.test",
  leadNotificationEmail: "owner@outdoor.test",
  services: ["Backyard fountain installation", "On-site assessment"],
  serviceAreas: ["Dallas", "DFW"],
  faqs: [
    {
      question: "Are you licensed?",
      answer: "Yes — Texas license #PL-44821. Licensed and experienced technicians.",
    },
  ],
  systemPrompt:
    "We install backyard fountains. On-site assessment then written estimate. We can source fountain units when the customer asks. We do not publish a photo portfolio or design catalogs in chat.",
});

const withOwnerFee: BusinessProfile = createBusinessProfile({
  ...fountainBase,
  website: "https://fountain-fee.test",
  systemPrompt:
    "We install backyard fountains. On-site assessment then written estimate. We charge a $20 visit fee and credit it toward the bill if the customer proceeds.",
  faqs: [
    ...fountainBase.faqs,
    {
      question: "Is there a visit fee?",
      answer:
        "Yes — $20 visit fee, credited toward the bill if you proceed with the work.",
    },
  ],
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
  needUser: string
): SalesState {
  state = apply(business, state, needUser);
  state = apply(business, state, "Alex", "What's your first name?");
  state = apply(business, state, "2145550199", "What's the best phone number?");
  state = apply(
    business,
    state,
    "1500 Marilla St, Dallas TX 75201",
    "What's the service address?"
  );
  return state;
}

const NEED =
  "Can you install a backyard fountain at my Dallas home?";

async function main() {
  // A — "I don't own one" must NOT store sourcing preference
  let state = captureLead(fountainBase, seed(fountainBase), NEED);
  state = apply(
    fountainBase,
    state,
    "no. i don't own anything. can you come tomorrow morning?",
    "Do you already own the fountain, or would you like help sourcing one?"
  );
  const ctxA = (state.customerContext || []).join("\n");
  assert(
    /does not currently own/i.test(ctxA),
    `A: should store ownership denial, got: ${ctxA}`
  );
  assert(
    !/wants help sourcing/i.test(ctxA),
    `A: must NOT store sourcing want, got: ${ctxA}`
  );
  assert(
    !!state.preferredTiming && /tomorrow/i.test(state.preferredTiming),
    `A: timing stored, got ${state.preferredTiming}`
  );
  console.log("A PASS — ownership denial ≠ sourcing preference");

  // B — explicit sourcing acceptance CAN be stored
  state = captureLead(fountainBase, seed(fountainBase), NEED);
  state = apply(
    fountainBase,
    state,
    "I don't own one. Yes, please source it.",
    "Do you already own the fountain, or would you like help sourcing one?"
  );
  const ctxB = (state.customerContext || []).join("\n");
  assert(/wants help sourcing/i.test(ctxB), `B: sourcing should store, got: ${ctxB}`);
  assert(/does not currently own/i.test(ctxB), `B: ownership denial also stored`);
  console.log("B PASS — explicit sourcing acceptance stored");

  // Invented "you'd like us to source" without acceptance → reject
  const inventSource = validateSalesReply(
    "Perfect — you'd like us to source and install a backyard fountain. I'm sending this to the team.",
    {
      ...state,
      customerContext: ["Customer does not currently own the item."],
      currentObjective: "CLOSE",
      handoffReady: true,
    },
    fountainBase
  );
  assert(!inventSource.ok, "B2: invented sourcing preference rejected");
  console.log("B2 PASS — invented sourcing summary rejected");

  // C — unsupported photos/catalog claim rejected
  state = captureLead(fountainBase, seed(fountainBase), NEED);
  const catalogBad = validateSalesReply(
    "The technician can show photos of past installs and catalogs with suggested fountain styles and sourcing options during the visit. What style do you prefer?",
    { ...state, currentObjective: "ANSWER", handoffReady: true },
    fountainBase
  );
  assert(!catalogBad.ok, `C: inventing portfolio/catalog rejected (${catalogBad.reasons.join("; ")})`);
  const catalogBoundary = validateSalesReply(
    "I can't share project photos directly here. I've noted you're interested in fountain options so the team has that context.",
    { ...state, currentObjective: "ANSWER", handoffReady: true },
    fountainBase
  );
  assert(
    catalogBoundary.ok,
    `C2: honest boundary should pass (${catalogBoundary.reasons.join("; ")})`
  );
  console.log("C PASS — unsupported portfolio/catalog rejected; boundary allowed");

  // D — owner-provided $20 visit fee may be used
  state = captureLead(withOwnerFee, seed(withOwnerFee), NEED);
  const feeOk = validateSalesReply(
    "We charge a $20 visit fee, and it's credited toward the bill if you proceed. Would you like an on-site assessment?",
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    withOwnerFee
  );
  assert(
    feeOk.ok,
    `D: owner $20 fee should be allowed (${feeOk.reasons.join("; ")})`
  );
  const feeInvented = validateSalesReply(
    "We charge a $20 visit fee, and it's credited toward the bill if you proceed.",
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    fountainBase
  );
  assert(!feeInvented.ok, "D2: $20 fee without profile knowledge rejected");
  console.log("D PASS — owner-provided $20 fee grounded; absent fee rejected");

  // E — license / pitch repetition rejected
  state = captureLead(fountainBase, seed(fountainBase), NEED);
  const licenseRepeat = validateSalesReply(
    "Our licensed and experienced technicians (license #PL-44821) will do an on-site assessment and written estimate. Pricing depends on several factors.",
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    fountainBase,
    [
      "We're licensed and experienced technicians under license #PL-44821. An on-site assessment leads to a written estimate — pricing depends on site factors. What's your first name?",
    ]
  );
  assert(!licenseRepeat.ok, "E: immediate license/pitch repetition rejected");
  console.log("E PASS — unnecessary license/pitch repetition rejected");

  // F — timing remembered; reconfirm rejected
  state = captureLead(fountainBase, seed(fountainBase), NEED);
  state = apply(
    fountainBase,
    state,
    "yes, tomorrow morning works",
    "Would you like an on-site assessment? What day or time works best?"
  );
  assert(
    !!state.preferredTiming && /tomorrow/i.test(state.preferredTiming || ""),
    `F: timing stored, got ${state.preferredTiming}`
  );
  const reconfirm = validateSalesReply(
    "Would you like to confirm the on-site assessment for tomorrow morning?",
    { ...state, currentObjective: "ADVANCE_TO_NEXT_STEP" },
    fountainBase
  );
  assert(!reconfirm.ok, "F: unnecessary timing reconfirm rejected");
  console.log("F PASS — timing stored; reconfirm rejected");

  // G — post-close question → ANSWER, then CLOSE (no rediscovery)
  state = captureLead(fountainBase, seed(fountainBase), NEED);
  state = apply(
    fountainBase,
    state,
    "yes, tomorrow morning works",
    "Would you like an on-site assessment? What day or time works best?"
  );
  // Ensure closed path for post-close behavior
  state = {
    ...state,
    handoffReady: true,
    customerAgreed: true,
    currentObjective: "CLOSE",
    preferredTiming: state.preferredTiming || "tomorrow morning",
    appointmentIntent: true,
  };
  state = apply(
    fountainBase,
    state,
    "Can you share some images of your previous works or suggested fountain designs?",
    "Perfect Alex. I'm sending this request to the team now so they can coordinate the next step."
  );
  assert(
    state.currentObjective === "ANSWER",
    `G: post-close question → ANSWER, got ${state.currentObjective}`
  );
  state = apply(
    fountainBase,
    state,
    "Thanks, that helps.",
    "I can't share project photos here, but the team will discuss design options with you."
  );
  assert(
    state.currentObjective === "CLOSE",
    `G: return to CLOSE after answer, got ${state.currentObjective}`
  );
  const rediscovery = validateSalesReply(
    "What material do you prefer? What size? Would you like lighting?",
    { ...state, currentObjective: "ANSWER", handoffReady: true },
    fountainBase
  );
  assert(!rediscovery.ok, "G2: post-close rediscovery rejected");
  console.log("G PASS — post-close question answered; returns to CLOSE");

  // H — post-close modern/minimal preference stored without questionnaire
  state = {
    ...state,
    handoffReady: true,
    customerAgreed: true,
    currentObjective: "CLOSE",
  };
  state = apply(
    fountainBase,
    state,
    "I prefer modern/minimal.",
    "Got it — anything else about the fountain?"
  );
  const ctxH = (state.customerContext || []).join("\n");
  assert(
    /modern\/minimal|modern/i.test(ctxH),
    `H: preference stored, got: ${ctxH}`
  );
  assert(
    state.currentObjective === "CLOSE",
    `H: stay CLOSE, got ${state.currentObjective}`
  );
  const questionnaire = validateSalesReply(
    "Got it — modern/minimal noted. What material do you prefer, and what size fountain are you thinking?",
    { ...state, currentObjective: "CLOSE", handoffReady: true },
    fountainBase
  );
  assert(!questionnaire.ok, "H2: post-close questionnaire rejected");
  console.log("H PASS — post-close preference stored without questionnaire");

  console.log("\nFinal grounding + memory polish pack PASS (A–H).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
