import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import type { BusinessProfile } from "../src/types/business";
import {
  updateSalesStateFromTurn,
  validateSalesReply,
} from "../src/lib/salesController";
import {
  buildLeadNotificationEmail,
  isLeadReadyForHandoff,
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
  website: "https://example-home-services.test",
  businessName: "Example Home Services",
  tagline: "Licensed local service",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  phone: "",
  email: "",
  address: "",
  services: [
    "Heater repair",
    "Kitchen sink installation",
    "Jacuzzi and spa plumbing",
    "Pest inspection and treatment",
  ],
  serviceAreas: ["Dallas"],
  faqs: [
    {
      question: "Are you licensed?",
      answer: "Yes, we are licensed and insured for residential service work.",
    },
  ],
  leadQuestions: [],
  systemPrompt:
    "Licensed residential service company. We repair heaters, install kitchen sinks, handle jacuzzi plumbing, and inspect for pests. We do not publish prices. On-site estimates are the next step for installations.",
};

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

function seed(): SalesState {
  return createInitialSalesState({
    conversationId: createConversationId(),
    businessKey: businessIdentityKey(business),
  });
}

function completeLead(state: SalesState): SalesState {
  state = apply(state, state.customerNeed || "I need service at my home.");
  state = apply(state, "Alex", "What's your name?");
  state = apply(state, "2145550199", "What's the best phone number?");
  state = apply(
    state,
    "1500 Marilla St, Dallas TX 75201",
    "What's the service address?"
  );
  return state;
}

async function main() {
  // A — simple heater repair: capture lead, no brochure, relevant confidence allowed
  let state = apply(seed(), "Heater at my home is not working");
  assert(
    state.currentObjective === "COLLECT_NAME",
    `A: collect name after heater need, got ${state.currentObjective}`
  );
  assert(/heater/i.test(state.customerNeed || ""), "A: heater need captured");

  const brochure = validateSalesReply(
    "Sorry about the heater. We offer 24/7 emergency service, financing, free diagnostics, promotions, and replacement systems. Call (214) 733-2420. What's your name?",
    state,
    business
  );
  assert(!brochure.ok, "A: brochure dump during collection is rejected");

  const salesCollect = validateSalesReply(
    "Sorry you're dealing with that — heater repair is work our licensed team handles. What's your first name?",
    state,
    business
  );
  assert(
    salesCollect.ok,
    `A: acknowledge + grounded confidence + name question should pass (${salesCollect.reasons.join("; ")})`
  );
  const cheerOnPain = validateSalesReply(
    "That sounds like a great project! What's your first name?",
    state,
    business
  );
  assert(!cheerOnPain.ok, "A: aspirational cheer on heater pain is rejected");
  console.log("Scenario A PASS — heater repair collects lead without brochure dump");

  // B — new sink + uncertainty: help choose, do not ignore the buying question
  state = apply(seed(), "I need a new kitchen sink.");
  assert(
    state.currentObjective === "COLLECT_NAME" ||
      state.currentObjective === "UNDERSTAND_NEED",
    `B: start toward lead after sink request, got ${state.currentObjective}`
  );
  state = apply(
    state,
    "I want something modern but I'm not sure what to buy.",
    "What's your name?"
  );
  assert(
    state.currentObjective === "HANDLE_HESITATION" ||
      state.currentObjective === "PRESENT_SOLUTION" ||
      state.currentObjective === "ANSWER",
    `B: help with sink choice before more form fields, got ${state.currentObjective}`
  );
  assert(
    state.customerContext.some((note) => /modern/i.test(note)),
    "B: modern preference preserved"
  );
  console.log("Scenario B PASS — sink uncertainty is helped, not ignored");

  // C — jacuzzi: answer electrical/scope before treating it as another form field
  state = apply(seed(), "I want a jacuzzi installed in my backyard.");
  state = apply(
    state,
    "Do you handle the electrical too, or only the plumbing?",
    "What's your name?"
  );
  assert(
    state.currentObjective === "ANSWER" ||
      state.currentObjective === "PRESENT_SOLUTION" ||
      state.currentObjective === "EXPLAIN_VALUE",
    `C: electrical/scope question answered, got ${state.currentObjective}`
  );
  console.log("Scenario C PASS — jacuzzi electrical question is answered");

  // D — pest + price: honest no invented price, inspection next step
  state = apply(seed(), "I think I have termites.");
  state = apply(state, "How much will it cost?", "What's your name?");
  assert(
    state.currentObjective === "HANDLE_PRICE_OBJECTION",
    `D: price question handled, got ${state.currentObjective}`
  );
  const inventedPrice = validateSalesReply(
    "Termite treatment is $299. What's your name?",
    state,
    business
  );
  assert(!inventedPrice.ok, "D: invented price rejected");
  const honestPrice = validateSalesReply(
    "I don't have a set price from here because it depends on what an inspection finds. The useful next step is an on-site inspection so the team can see the activity and then give you a real number. What's your name?",
    state,
    business
  );
  assert(
    honestPrice.ok,
    `D: honest inspection-next-step reply should pass (${honestPrice.reasons.join("; ")})`
  );
  console.log("Scenario D PASS — pest price answered honestly");

  // E — objection after a complete lead: do not close immediately
  state = completeLead(apply(seed(), "I need a new kitchen sink."));
  state = apply(
    state,
    "Tomorrow morning works.",
    "What day or time works best?"
  );
  state = apply(state, "That's too expensive.", "Would you like to move forward?");
  assert(
    state.currentObjective === "HANDLE_PRICE_OBJECTION",
    `E: too expensive is handled, got ${state.currentObjective}`
  );
  assert(
    !shouldAttemptLeadHandoff(state, "closure", "That's too expensive."),
    "E: do not hand off in the middle of a price objection"
  );
  console.log("Scenario E PASS — objection is not an immediate close");

  // F — urgent: minimum info, close, handoff, no optional operational questions
  state = completeLead(apply(seed(), "Heater at my home is not working"));
  state = apply(
    state,
    "This is an emergency. I need someone ASAP.",
    "Thanks, Alex."
  );
  assert(state.urgency === "IMMEDIATE", "F: urgency immediate");
  assert(
    state.currentObjective === "CLOSE",
    `F: urgent complete lead closes, got ${state.currentObjective}`
  );
  assert(
    shouldAttemptLeadHandoff(state, "urgent", "This is an emergency. I need someone ASAP."),
    "F: urgent handoff allowed"
  );
  const petsAsk = validateSalesReply(
    "Any pets or gate codes we should know about before the technician comes?",
    state,
    business
  );
  assert(!petsAsk.ok, "F: optional operational questions rejected");
  console.log("Scenario F PASS — urgent min-info close and handoff");

  // G — incomplete lead: no handoff, no inactivity send
  state = apply(seed(), "Heater at my home is not working");
  state = apply(state, "Sam", "What's your name?");
  state = apply(state, "2145550100", "What's the best number?");
  assert(!!state.lead.name && !!state.lead.phone, "G: name and phone captured");
  assert(!state.lead.address, "G: address still missing");
  assert(!isLeadReadyForHandoff(state), "G: incomplete lead is not handoff-ready");
  assert(
    !shouldAttemptLeadHandoff(state, "inactivity"),
    "G: inactivity must not send an incomplete lead"
  );
  assert(
    !shouldAttemptLeadHandoff(state, "closure", "thanks"),
    "G: closure must not send an incomplete lead"
  );
  console.log("Scenario G PASS — incomplete lead does not hand off or start send");

  // H — new question after complete lead: answer, do not premature close
  state = completeLead(apply(seed(), "I need a new kitchen sink."));
  state = apply(
    state,
    "Tomorrow between 5-7 PM works.",
    "What time works best?"
  );
  state = apply(
    state,
    "Do you guarantee the installation?",
    "I have your timing."
  );
  assert(
    state.currentObjective === "ANSWER" ||
      state.currentObjective === "PRESENT_SOLUTION" ||
      state.currentObjective === "EXPLAIN_VALUE",
    `H: post-lead question is answered, got ${state.currentObjective}`
  );
  console.log("Scenario H PASS — later question is answered");

  // Email preserves customer language and avoids internal state names
  state = apply(seed(), "I need a new kitchen sink.");
  state = apply(
    state,
    "I want something modern but I'm not sure what to buy.",
    "What's your name?"
  );
  state = apply(state, "Alex", "What modern options do you usually recommend?");
  state = apply(state, "2145550199", "Best number?");
  state = apply(
    state,
    "1500 Marilla St, Dallas TX 75201",
    "Service address?"
  );
  state = apply(state, "Saturday morning if possible", "What time works?");
  const email = buildLeadNotificationEmail(business, {
    ...state,
    currentObjective: "CLOSE",
    handoffReady: true,
    customerAgreed: true,
  });
  assert(/kitchen sink/i.test(email.text), "email keeps the actual sink need");
  assert(/modern/i.test(email.text), "email keeps modern preference");
  assert(/Saturday morning/i.test(email.text), "email keeps stated Saturday morning");
  assert(/CUSTOMER WANTS/i.test(email.text), "email has wants/concerns");
  assert(!/\bSECURED\b/.test(email.text), "email hides internal SECURED");
  assert(!/\bPRESENT_SOLUTION\b/.test(email.text), "email hides internal objective names");
  assert(!/\bhandoffReady\b/.test(email.text), "email hides handoffReady");
  console.log("Email language PASS");

  // CLOSE may say sending-now when ready but not yet SENT; still cannot promise a call
  // or invent response-time language when BusinessProfile has none.
  const sendingNow = validateSalesReply(
    "Perfect, Alex. I have everything I need for the kitchen sink request, including Saturday morning. I'm sending this request to the team now so they can coordinate the next step with you.",
    {
      ...state,
      currentObjective: "CLOSE",
      handoffReady: true,
      customerAgreed: true,
      leadDeliveryStatus: "NOT_SENT",
    },
    business
  );
  assert(
    sendingNow.ok,
    `sending-now close should pass (${sendingNow.reasons.join("; ")})`
  );
  const asapClose = validateSalesReply(
    "Perfect, Alex. I'm sending this request to the team now so they can follow up with you as soon as possible.",
    {
      ...state,
      currentObjective: "CLOSE",
      handoffReady: true,
      leadDeliveryStatus: "NOT_SENT",
    },
    business
  );
  assert(!asapClose.ok, "must not invent as-soon-as-possible response-time promise");
  const falseCall = validateSalesReply(
    "Perfect, Alex. Our office will contact you shortly to confirm the appointment.",
    {
      ...state,
      currentObjective: "CLOSE",
      handoffReady: true,
      leadDeliveryStatus: "NOT_SENT",
    },
    business
  );
  assert(!falseCall.ok, "must not promise office contact before SENT");
  console.log("Truthful close language PASS");

  // I — Texas Solar archetype: interested-in-getting + generic help → lead-first
  state = apply(
    seed(),
    "I'm interested in getting solar panels for my home. Can you help me?"
  );
  assert(
    state.intent === "HIGH" || state.intent === "READY_TO_ACT",
    `I: actionable intent, got ${state.intent}`
  );
  assert(state.leadStatus === "SECURING", `I: securing after buying ask, got ${state.leadStatus}`);
  assert(
    state.currentObjective === "COLLECT_NAME",
    `I: collect name first, got ${state.currentObjective}`
  );
  assert(
    !["ANSWER", "UNDERSTAND_NEED", "EXPLAIN_VALUE"].includes(
      state.currentObjective
    ),
    "I: must not enter discovery/answer before lead capture"
  );
  const zipBeforeName = validateSalesReply(
    "Absolutely — we can help. What's your ZIP code or city so I can confirm service?",
    state,
    business
  );
  assert(!zipBeforeName.ok, "I: ZIP/city before name is rejected while collecting name");
  const goalBeforeName = validateSalesReply(
    "Great, we can help. What's your main goal: lowering bills, outage backup, or home value?",
    state,
    business
  );
  assert(!goalBeforeName.ok, "I: main-goal discovery before name is rejected");
  const nameWithTone = validateSalesReply(
    "Absolutely — we'd be happy to help with that. To get this moving, may I get your name?",
    state,
    business
  );
  assert(
    nameWithTone.ok,
    `I: sales-tone name ask should pass (${nameWithTone.reasons.join("; ")})`
  );

  state = apply(
    state,
    "I'm at 1500 Marilla St, Dallas TX 75201.",
    "Absolutely — we'd be happy to help with that. To get this moving, may I get your name?"
  );
  assert(
    state.lead.address === "1500 Marilla St, Dallas TX 75201",
    `I: volunteered address captured, got ${state.lead.address}`
  );
  assert(
    state.intent === "HIGH" || state.intent === "READY_TO_ACT",
    `I: intent not downgraded after address-only reply, got ${state.intent}`
  );
  assert(state.leadStatus === "SECURING", `I: still not secured after address only, got ${state.leadStatus}`);
  assert(!state.lead.name && !state.lead.phone, "I: name and phone still missing");
  assert(
    state.currentObjective === "COLLECT_NAME",
    `I: next missing field is name, got ${state.currentObjective}`
  );

  state = apply(state, "John Smith", "Thanks — and what's your name?");
  assert(state.lead.name === "John Smith", `I: name captured, got ${state.lead.name}`);
  assert(
    state.currentObjective === "COLLECT_PHONE",
    `I: collect phone after name, got ${state.currentObjective}`
  );
  assert(
    state.lead.address === "1500 Marilla St, Dallas TX 75201",
    "I: address preserved after name"
  );

  state = apply(state, "214-555-0187", "What's the best phone number?");
  assert(state.lead.phone === "214-555-0187", `I: phone captured, got ${state.lead.phone}`);
  assert(state.lead.name === "John Smith", "I: name preserved after phone");
  assert(
    state.lead.address === "1500 Marilla St, Dallas TX 75201",
    "I: address preserved after phone"
  );
  assert(state.leadStatus === "SECURED", `I: lead secured after name+phone+address, got ${state.leadStatus}`);
  assert(
    state.currentObjective !== "COLLECT_NAME" &&
      state.currentObjective !== "COLLECT_PHONE" &&
      state.currentObjective !== "COLLECT_ADDRESS",
    `I: nonessential discovery/selling allowed only after secure, got ${state.currentObjective}`
  );
  const goalAfterSecure = validateSalesReply(
    "Thanks John. Based on a home solar install, what's your main goal: lowering bills or backup power?",
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    business
  );
  assert(
    !goalAfterSecure.ok,
    "I: invented main-goal discovery after secure must be rejected"
  );
  assert(
    goalAfterSecure.reasons.some((reason) =>
      /optional discovery|unnecessary follow-up|proactive technical/i.test(reason)
    ),
    `I: optional discovery rejection reason missing (${goalAfterSecure.reasons.join("; ")})`
  );
  console.log("Scenario I PASS — interested-in-getting solar captures lead before discovery");

  // J — genuine scope question still interrupts; sink/heater path unchanged
  state = apply(seed(), "I need solar panels. Do you handle the electrical work too?");
  assert(
    ["ANSWER", "PRESENT_SOLUTION", "EXPLAIN_VALUE"].includes(
      state.currentObjective
    ),
    `J: electrical question is answered, got ${state.currentObjective}`
  );
  assert(
    !["COLLECT_NAME", "COLLECT_PHONE", "COLLECT_ADDRESS"].includes(
      state.currentObjective
    ),
    "J: must not blindly force a form field over a genuine scope question"
  );
  console.log("Scenario J PASS — electrical question interrupts lead capture");

  state = apply(seed(), "I'm just looking, maybe interested in solar someday");
  assert(
    state.intent === "LOW" || state.intent === "MEDIUM",
    `J: vague browsing is not HIGH, got ${state.intent}`
  );
  assert(
    state.currentObjective !== "COLLECT_NAME",
    `J: vague interest must not force lead capture, got ${state.currentObjective}`
  );
  console.log("Scenario J2 PASS — vague interested-in stays browse");

  // K — Texas Solar aspirational tone (lead-first preserved + sales energy)
  state = apply(
    seed(),
    "I'm interested in getting solar panels for my home. Can you help me?"
  );
  assert(state.currentObjective === "COLLECT_NAME", "K: COLLECT_NAME first");
  const solarNameReply =
    "Absolutely — solar can be a really worthwhile upgrade for long-term energy costs. Let's get this moving. What's your first name?";
  const solarName = validateSalesReply(solarNameReply, state, business);
  assert(
    solarName.ok,
    `K: aspirational name ask should pass (${solarName.reasons.join("; ")})`
  );
  assert(
    solarNameReply.trim().split(/\s+/).length < 90,
    "K: first reply stays concise"
  );
  state = apply(state, "Ramesh", "What's your first name?");
  assert(state.currentObjective === "COLLECT_PHONE", "K: phone after name");
  const mechanicalPhone = validateSalesReply(
    "Great, Ramesh — we can help with residential solar across the DFW area. What's the best phone number to reach you?",
    state,
    business
  );
  assert(!mechanicalPhone.ok, "K: mechanical we-can-help + service-area restatement rejected");
  const goodPhone = validateSalesReply(
    "Thanks, Ramesh. Let's make sure the team can reach you easily. What's the best phone number?",
    state,
    business
  );
  assert(goodPhone.ok, `K: varied phone ask should pass (${goodPhone.reasons.join("; ")})`);
  state = apply(state, "9898989898", "What's the best phone number?");
  assert(state.currentObjective === "COLLECT_ADDRESS", "K: address after phone");
  const goodAddressAsk = validateSalesReply(
    "Great. The property location helps us understand what kind of system could make sense for your home. What's the service address?",
    state,
    business
  );
  assert(
    goodAddressAsk.ok,
    `K: address ask with purpose should pass (${goodAddressAsk.reasons.join("; ")})`
  );
  state = apply(
    state,
    "I'm at 1500 Marilla St, Dallas TX 75201.",
    "What's the service address?"
  );
  assert(state.leadStatus === "SECURED", "K: lead secured");
  const postSecureReply =
    "Perfect, Ramesh. Now we can look at what solar could realistically do for your home — the useful next step is sizing a system around the property. Would you like a personalized savings estimate and a no-obligation on-site assessment?";
  const postSecure = validateSalesReply(
    postSecureReply,
    { ...state, currentObjective: "PRESENT_SOLUTION" },
    business
  );
  assert(
    postSecure.ok,
    `K: post-secure value momentum should pass (${postSecure.reasons.join("; ")})`
  );
  assert(
    /\b(savings|size|system|home|assessment|estimate)\b/i.test(postSecureReply),
    "K: post-secure contains positive/value language"
  );
  const nextStepYes = validateSalesReply(
    "Absolutely. That's the best way to get a clear recommendation based on your actual property rather than guessing. What day or time works best for the assessment?",
    {
      ...state,
      appointmentIntent: true,
      currentObjective: "ADVANCE_TO_NEXT_STEP",
    },
    business
  );
  assert(
    nextStepYes.ok,
    `K: next-step acceptance reinforcement should pass (${nextStepYes.reasons.join("; ")})`
  );
  const asapAfterSecure = validateSalesReply(
    "Perfect, Ramesh. I'm sending this request to the team now so they can follow up with you as soon as possible.",
    {
      ...state,
      currentObjective: "CLOSE",
      handoffReady: true,
      preferredTiming: "tomorrow morning",
      leadDeliveryStatus: "NOT_SENT",
    },
    business
  );
  assert(!asapAfterSecure.ok, "K: unsupported ASAP close rejected");
  console.log("Scenario K PASS — Texas Solar aspirational tone with lead-first intact");

  // L — Jacuzzi aspirational
  state = apply(seed(), "I want to install a Jacuzzi in my backyard.");
  assert(
    state.currentObjective === "COLLECT_NAME" ||
      state.leadStatus === "SECURING",
    `L: early lead capture, got ${state.currentObjective}`
  );
  assert(state.currentObjective === "COLLECT_NAME", `L: COLLECT_NAME, got ${state.currentObjective}`);
  const jacuzziTone = validateSalesReply(
    "That sounds like a great backyard project — we'd be glad to help you get it moving. What's your first name?",
    state,
    business
  );
  assert(
    jacuzziTone.ok,
    `L: positive Jacuzzi tone should pass (${jacuzziTone.reasons.join("; ")})`
  );
  const jacuzziBrochure = validateSalesReply(
    "We offer Jacuzzi and spa plumbing, financing, free estimates, licensed and insured service across Dallas, and emergency options. What's your name?",
    state,
    business
  );
  assert(!jacuzziBrochure.ok, "L: brochure dump rejected");
  console.log("Scenario L PASS — Jacuzzi aspirational energy with lead capture");

  // M — modern kitchen sink replacement / improvement
  state = apply(seed(), "I want a modern kitchen sink.");
  assert(state.currentObjective === "COLLECT_NAME", `M: COLLECT_NAME, got ${state.currentObjective}`);
  const sinkToneReply =
    "A modern kitchen sink can really refresh the space — happy to help you get that moving. What's your first name?";
  const sinkTone = validateSalesReply(sinkToneReply, state, business);
  assert(
    sinkTone.ok,
    `M: positive sink tone should pass (${sinkTone.reasons.join("; ")})`
  );
  assert(sinkToneReply.trim().split(/\s+/).length < 80, "M: stays concise");
  console.log("Scenario M PASS — modern sink positive energy with lead capture");

  // N — name still captured after hesitation interrupt while securing
  state = apply(seed(), "I want a modern kitchen sink but I'm not sure what to buy.");
  assert(
    state.leadStatus === "SECURING" ||
      state.intent === "HIGH" ||
      state.currentObjective === "HANDLE_HESITATION" ||
      state.currentObjective === "COLLECT_NAME",
    `N: actionable modern sink path, got ${state.currentObjective}/${state.leadStatus}`
  );
  state = apply(
    state,
    "Jordan",
    "A modern sink can really refresh the space — happy to help you choose. What's your first name?"
  );
  assert(state.lead.name === "Jordan", `N: bare name captured after hesitation, got ${state.lead.name}`);
  assert(
    state.currentObjective === "COLLECT_PHONE" ||
      state.currentObjective === "COLLECT_NAME" ||
      state.currentObjective === "HANDLE_HESITATION",
    `N: continues securing after name, got ${state.currentObjective}`
  );
  console.log("Scenario N PASS — name captured while securing after hesitation");

  console.log("\nAll sales-employee scenario tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
