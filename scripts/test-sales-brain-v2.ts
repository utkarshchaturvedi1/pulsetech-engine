import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import { readFileSync } from "fs";
import path from "path";
import type { BusinessProfile } from "../src/types/business";
import {
  buildSalesBrainContext,
  classifyServiceScope,
  inferSalesEmotion,
  chooseSalesMove,
  isMaterialNeedClarification,
  resolveOpportunityScope,
} from "../src/lib/salesBrain";
import { generateSalesReply } from "../src/lib/salesChat";
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

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function loadKiser(): BusinessProfile {
  const rec = JSON.parse(
    readFileSync(path.join(process.cwd(), ".data", "demos", "mbkiser.json"), "utf8")
  ) as { profile?: BusinessProfile };
  if (!rec?.profile?.businessName) {
    throw new Error("Missing actual saved M.B. Kiser BusinessProfile at .data/demos/mbkiser.json");
  }
  return rec.profile;
}

const plumbing: BusinessProfile = {
  website: "https://sales-brain-v2.test",
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
    "Licensed residential service company. We repair heaters, install kitchen sinks, and handle jacuzzi plumbing. We do not publish prices. On-site estimates are the next step for installations. We do not offer electrical contracting or full-house rewiring.",
};

const kiser = loadKiser();

const KISER_T1 =
  "I recently bought a home in auction. I want to redo the electical work like AC, heater and lighting. Can you do that and how much will it cost?";
const KISER_T2 = "full house electircal rewiring";

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

function brainFor(
  business: BusinessProfile,
  user: string,
  assistant = "How can I help?",
  previous?: SalesState
) {
  const state = apply(business, previous || seed(business), user, assistant);
  const ctx = buildSalesBrainContext({
    state,
    business,
    latestUserText: user,
    priorAssistantReplies: [assistant],
  });
  return { state, ctx };
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function asksLeadField(text: string): boolean {
  return /\b(first )?name\b|\bphone\b|\bemail\b|\baddress\b/i.test(text);
}

function claimsUnconfirmedElectrical(text: string): boolean {
  return (
    /\b(electrical hookups?|electrical work needed to connect|we (can |will )?(handle|do|offer).{0,40}(rewir|electrical|lighting)|full[- ]house (electrical )?rewir.{0,40}(we |our ))\b/i.test(
      text
    ) &&
    !/\b(don'?t have enough information|can(?:not|'t) confirm|not confirmed)\b/i.test(text)
  );
}

async function live(
  business: BusinessProfile,
  user: string,
  previousMessages: { role: "user" | "assistant"; content: string }[] = [],
  previousState: SalesState | null = null
) {
  const messages = [
    { role: "assistant" as const, content: "Hi! How can I help you today?" },
    ...previousMessages,
    { role: "user" as const, content: user },
  ];
  return generateSalesReply(business, messages, previousState);
}

async function main() {
  const mixed = classifyServiceScope(KISER_T1, kiser);
  assert(
    mixed.classification === "PARTIALLY_SUPPORTED",
    `Kiser opener should be PARTIALLY_SUPPORTED, got ${mixed.classification}`
  );
  assert(
    mixed.supportedParts.some((part) => /\b(ac|heater)\b/i.test(part)),
    `Kiser opener should keep HVAC parts: ${mixed.supportedParts.join(" | ")}`
  );
  assert(
    mixed.unknownParts.some((part) => /light|elect/i.test(part)),
    `Kiser opener should mark lighting/electrical unknown: ${mixed.unknownParts.join(" | ")}`
  );

  const rewiring = classifyServiceScope(KISER_T2, kiser);
  assert(
    rewiring.classification === "UNKNOWN",
    `rewiring alone should be UNKNOWN, got ${rewiring.classification}`
  );
  const preserved = resolveOpportunityScope(KISER_T2, KISER_T1, kiser, false);
  assert(
    preserved.classification === "PARTIALLY_SUPPORTED",
    `clarified rewiring should preserve HVAC as PARTIAL, got ${preserved.classification}`
  );
  assert(Boolean(preserved.pendingSupportedOpportunity), "should expose a supported HVAC slice");

  const hvacOnly = classifyServiceScope(
    "My AC stopped working and the house is too hot.",
    kiser
  );
  assert(
    hvacOnly.classification === "SUPPORTED",
    `supported HVAC must stay SUPPORTED, got ${hvacOnly.classification} unknown=${hvacOnly.unknownParts.join("|")}`
  );

  const jacuzziScope = classifyServiceScope("I've wanted a Jacuzzi for years.", plumbing);
  assert(
    jacuzziScope.classification === "SUPPORTED",
    `Jacuzzi should be SUPPORTED, got ${jacuzziScope.classification}`
  );

  const denied = classifyServiceScope("full house electrical rewiring", plumbing);
  assert(
    denied.classification === "UNSUPPORTED" || denied.classification === "UNKNOWN",
    `plumbing rewiring should not be SUPPORTED, got ${denied.classification}`
  );
  assert(
    denied.classification === "UNSUPPORTED",
    `plumbing profile explicitly denies electrical; expected UNSUPPORTED, got ${denied.classification}`
  );
  assert(isMaterialNeedClarification(KISER_T2), "Kiser T2 must count as a material need clarification");
  console.log("0 PASS — scope classification / dynamic-need helpers");

  let { state, ctx } = brainFor(kiser, KISER_T1);
  assert(
    state.currentObjective === "HANDLE_PRICE_OBJECTION" ||
      state.currentObjective === "UNDERSTAND_NEED" ||
      state.currentObjective === "ANSWER",
    `Kiser T1 must not jump to lead capture, got ${state.currentObjective}`
  );
  ({ state, ctx } = brainFor(
    kiser,
    KISER_T2,
    "Costs depend on the property. Do you mean HVAC or full-house rewiring?",
    state
  ));
  assert(
    /rewir|elect/i.test(state.customerNeed || ""),
    `Kiser T2 current need should be the clarification, got ${state.customerNeed}`
  );
  assert(
    Boolean(state.originalCustomerNeed),
    "Kiser T2 should preserve original context"
  );
  assert(
    state.currentObjective === "UNDERSTAND_NEED" ||
      state.currentObjective === "ANSWER" ||
      state.currentObjective === "HANDLE_PRICE_OBJECTION",
    `Kiser T2 must not blindly collect, got ${state.currentObjective}`
  );
  assert(
    ctx.recommendedSalesMove === "PRESERVE_PARTIAL_OPPORTUNITY" ||
      ctx.recommendedSalesMove === "ESTABLISH_LIMITATION" ||
      ctx.recommendedSalesMove === "CLARIFY_SCOPE" ||
      ctx.recommendedSalesMove === "HANDLE_OBJECTION",
    `Kiser T2 move should be scope/limitation/partial, got ${ctx.recommendedSalesMove}`
  );
  console.log("0b PASS — Kiser deterministic state (need + no blind collect)");

  ({ state, ctx } = brainFor(kiser, "My AC stopped working and the house is too hot."));
  assert(state.currentObjective === "COLLECT_NAME", `2 det: HVAC lead-first, got ${state.currentObjective}`);
  assert(state.serviceScope === "SUPPORTED", `2 det: SUPPORTED, got ${state.serviceScope}`);
  console.log("0c PASS — supported HVAC stays lead-first");

  ({ state, ctx } = brainFor(plumbing, "I've wanted a Jacuzzi for years."));
  assert(state.currentObjective === "COLLECT_NAME", `3 det: Jacuzzi COLLECT_NAME, got ${state.currentObjective}`);
  assert(ctx.customerEmotion === "ASPIRATIONAL", `3 det: ASPIRATIONAL, got ${ctx.customerEmotion}`);
  const jacuzziSorry = validateSalesReply(
    "Sorry you're dealing with that. What's your first name?",
    state,
    plumbing
  );
  assert(!jacuzziSorry.ok, "3 det: pain apology on Jacuzzi is rejected");
  console.log("0d PASS — Jacuzzi aspirational deterministic");

  state = apply(plumbing, seed(plumbing), "My heater stopped working.");
  ({ state, ctx } = brainFor(
    plumbing,
    "Actually I mean I need a Jacuzzi installed.",
    "Sorry you're dealing with that. What's your first name?",
    state
  ));
  assert(
    /jacuzzi/i.test(state.customerNeed || ""),
    `4 det: current need should be Jacuzzi, got ${state.customerNeed}`
  );
  assert(
    /heater/i.test(state.originalCustomerNeed || ""),
    `4 det: original need should keep heater, got ${state.originalCustomerNeed}`
  );
  assert(state.currentObjective === "COLLECT_NAME", `4 det: still supported lead-first, got ${state.currentObjective}`);
  console.log("0e PASS — changed need becomes operative");

  state = apply(plumbing, seed(plumbing), "I want a Jacuzzi in my backyard.");
  ({ state, ctx } = brainFor(
    plumbing,
    "Before I give you details, are you licensed?",
    "Let's get this moving. What's your first name?",
    state
  ));
  assert(state.currentObjective === "ANSWER", `5 det: ANSWER first, got ${state.currentObjective}`);
  console.log("0f PASS — question during capture");

  state = apply(plumbing, seed(plumbing), "I want a modern kitchen sink.");
  ({ state, ctx } = brainFor(
    plumbing,
    "That's more than I expected.",
    "What's your first name?",
    state
  ));
  assert(
    state.currentObjective === "HANDLE_PRICE_OBJECTION",
    `6 det: price objective, got ${state.currentObjective}`
  );
  console.log("0g PASS — price objection during capture");

  ({ state, ctx } = brainFor(
    kiser,
    "I need a new HVAC system and also a swimming pool installed."
  ));
  assert(
    state.serviceScope === "PARTIALLY_SUPPORTED",
    `7 det: partial scope, got ${state.serviceScope}`
  );
  assert(state.currentObjective !== "COLLECT_NAME", `7 det: must not collect for mixed unknown, got ${state.currentObjective}`);
  console.log("0h PASS — partial supported + unknown");

  const afterName = apply(
    plumbing,
    apply(plumbing, seed(plumbing), "I've wanted a Jacuzzi for years."),
    "HH",
    "That sounds like a great backyard project. What's your first name?"
  );
  const phoneBrain = buildSalesBrainContext({
    state: afterName,
    business: plumbing,
    latestUserText: "HH",
    priorAssistantReplies: [
      "That sounds like a great backyard project. What's your first name?",
    ],
  });
  assert(
    phoneBrain.alreadyCommunicatedSalesMoves.includes("excitement_acknowledged"),
    `sales memory should note excitement already used (${phoneBrain.alreadyCommunicatedSalesMoves.join(",")})`
  );
  assert(
    chooseSalesMove(afterName, "HH", "ASPIRATIONAL") === "SECURE_LEAD_FIELD",
    "after name, primary move is the next field"
  );
  assert(
    inferSalesEmotion("We're remodeling our kitchen and I want a beautiful modern sink.", seed(plumbing)) !==
      inferSalesEmotion("My sink cracked and water is leaking everywhere. I need a new one.", seed(plumbing)),
    "same product must not share one hardcoded emotion"
  );
  console.log("0i PASS — sales memory + emotion from words");

  console.log("\n--- live bounded pack ---");

  const live1a = await live(kiser, KISER_T1);
  assert(wordCount(live1a.reply) < 110, `1 T1 too long (${wordCount(live1a.reply)})`);
  assert(
    /price|cost|estimate|without seeing|depend/i.test(live1a.reply),
    `1 T1 must address price/capability: ${live1a.reply}`
  );
  assert(!claimsUnconfirmedElectrical(live1a.reply), `1 T1 invented electrical: ${live1a.reply}`);
  assert(!asksLeadField(live1a.reply), `1 T1 must not start blind lead capture: ${live1a.reply}`);
  assert(!/\$\d/.test(live1a.reply), `1 T1 invented dollar amount: ${live1a.reply}`);
  console.log("1 T1 PASS —", live1a.reply);

  const live1b = await live(
    kiser,
    KISER_T2,
    [
      { role: "user", content: KISER_T1 },
      { role: "assistant", content: live1a.reply },
    ],
    live1a.salesState
  );
  assert(
    /rewir|elect/i.test(live1b.salesState.customerNeed || ""),
    `1 T2 current need not clarified: ${live1b.salesState.customerNeed}`
  );
  assert(
    live1b.salesState.currentObjective !== "COLLECT_NAME" &&
      live1b.salesState.currentObjective !== "COLLECT_PHONE" &&
      live1b.salesState.currentObjective !== "COLLECT_ADDRESS",
    `1 T2 still collecting lead for unknown work: ${live1b.salesState.currentObjective}`
  );
  assert(!asksLeadField(live1b.reply), `1 T2 asked a lead field: ${live1b.reply}`);
  assert(!claimsUnconfirmedElectrical(live1b.reply), `1 T2 claimed rewiring/electrical: ${live1b.reply}`);
  assert(
    /\b(don'?t have enough information|can(?:not|'t) confirm|not confirmed|available information)\b/i.test(
      live1b.reply
    ) || !/\bwe (don't|do not) (offer|do|handle) (that|electrical|rewir)/i.test(live1b.reply),
    `1 T2 should use UNKNOWN language, not invented non-capability: ${live1b.reply}`
  );
  assert(
    /\b(hvac|ac\b|heater|heating|air condition)\b/i.test(live1b.reply),
    `1 T2 should preserve HVAC opportunity: ${live1b.reply}`
  );
  assert(
    !/\b(appointment|you're all set|scheduled|booked).{0,40}rewir/i.test(live1b.reply),
    `1 T2 fake appointment for rewiring: ${live1b.reply}`
  );
  console.log("1 T2 PASS —", live1b.reply);
  console.log(
    `1 state need=${live1b.salesState.customerNeed} original=${live1b.salesState.originalCustomerNeed} scope=${live1b.salesState.serviceScope} move-obj=${live1b.salesState.currentObjective}`
  );

  const live2 = await live(kiser, "My AC stopped working and the house is too hot.");
  assert(wordCount(live2.reply) < 90, `2 too long (${wordCount(live2.reply)})`);
  assert(/\bname\b/i.test(live2.reply), `2 supported HVAC should ask name: ${live2.reply}`);
  assert(live2.salesState.currentObjective === "COLLECT_NAME", `2 objective ${live2.salesState.currentObjective}`);
  assert(!/sorry you'?re dealing with that.*great project/i.test(live2.reply), `2 mixed tone: ${live2.reply}`);
  console.log("2 PASS — supported HVAC", live2.reply);

  const live3 = await live(plumbing, "I've wanted a Jacuzzi for years.");
  assert(wordCount(live3.reply) < 90, `3 too long (${wordCount(live3.reply)})`);
  assert(!/sorry you'?re dealing/i.test(live3.reply), `3 pain apology: ${live3.reply}`);
  assert(/\bname\b/i.test(live3.reply), `3 should ask name: ${live3.reply}`);
  assert(live3.salesState.currentObjective === "COLLECT_NAME", `3 objective ${live3.salesState.currentObjective}`);
  console.log("3 PASS — Jacuzzi", live3.reply);

  const live4Need = apply(plumbing, seed(plumbing), "My heater stopped working.");
  const live4 = await live(
    plumbing,
    "Actually I mean I need a Jacuzzi installed.",
    [
      { role: "user", content: "My heater stopped working." },
      {
        role: "assistant",
        content: "Sorry you're dealing with that — heater repair is work our team handles regularly. What's your first name?",
      },
    ],
    live4Need
  );
  assert(
    /jacuzzi/i.test(live4.salesState.customerNeed || ""),
    `4 current need should be Jacuzzi: ${live4.salesState.customerNeed}`
  );
  assert(
    /heater/i.test(live4.salesState.originalCustomerNeed || live4Need.customerNeed || ""),
    `4 original context should remain heater`
  );
  assert(/\bjacuzzi|spa\b/i.test(live4.reply), `4 reply should follow the new need: ${live4.reply}`);
  assert(!/sorry you'?re dealing/i.test(live4.reply), `4 should not keep heater-pain tone: ${live4.reply}`);
  console.log("4 PASS — changed need", live4.reply);

  const live5Need = apply(plumbing, seed(plumbing), "I want a Jacuzzi in my backyard.");
  const live5 = await live(
    plumbing,
    "Before I give you my details, are you licensed?",
    [
      { role: "user", content: "I want a Jacuzzi in my backyard." },
      { role: "assistant", content: "Let's get this moving. What's your first name?" },
    ],
    live5Need
  );
  assert(/licen[sc]ed/i.test(live5.reply), `5 must answer license: ${live5.reply}`);
  assert(/\bname\b/i.test(live5.reply), `5 should return to name: ${live5.reply}`);
  assert((live5.reply.match(/\?/g) || []).length <= 1, `5 too many questions: ${live5.reply}`);
  console.log("5 PASS — question during capture", live5.reply);

  const live6Need = apply(plumbing, seed(plumbing), "I want a modern kitchen sink.");
  const live6 = await live(
    plumbing,
    "That's more than I expected.",
    [
      { role: "user", content: "I want a modern kitchen sink." },
      {
        role: "assistant",
        content: "A modern sink can really refresh the space. What's your first name?",
      },
    ],
    live6Need
  );
  assert(wordCount(live6.reply) < 110, `6 too long (${wordCount(live6.reply)})`);
  assert(!/\$\d|\b\d+\s*%|discount/i.test(live6.reply), `6 invented price: ${live6.reply}`);
  assert(
    live6.salesState.currentObjective === "HANDLE_PRICE_OBJECTION",
    `6 should stay on price, got ${live6.salesState.currentObjective}`
  );
  console.log("6 PASS — price objection", live6.reply);

  const live7 = await live(
    kiser,
    "I need a new HVAC system and also a swimming pool installed."
  );
  assert(
    live7.salesState.serviceScope === "PARTIALLY_SUPPORTED",
    `7 scope ${live7.salesState.serviceScope}`
  );
  assert(!asksLeadField(live7.reply), `7 must not collect lead yet: ${live7.reply}`);
  assert(
    /\b(hvac|ac\b|heating|air condition)\b/i.test(live7.reply),
    `7 should keep HVAC: ${live7.reply}`
  );
  assert(
    /\b(don'?t have enough information|can(?:not|'t) confirm|not confirmed|pool)\b/i.test(
      live7.reply
    ),
    `7 should be honest about the unknown pool: ${live7.reply}`
  );
  console.log("7 PASS — partial opportunity", live7.reply);

  let live8State = apply(plumbing, seed(plumbing), "My heater stopped working.");
  live8State = apply(
    plumbing,
    live8State,
    "Alex",
    "Sorry you're dealing with that. What's your first name?"
  );
  live8State = apply(
    plumbing,
    live8State,
    "2145550199",
    "Thanks, Alex. What's the best phone number to reach you?"
  );
  live8State = apply(
    plumbing,
    live8State,
    "1500 Marilla St, Dallas TX 75201",
    "What's the service address?"
  );
  const live8 = await live(
    plumbing,
    "Yes, that sounds good. That's everything.",
    [
      { role: "user", content: "My heater stopped working." },
      { role: "assistant", content: "Sorry you're dealing with that. What's your first name?" },
      { role: "user", content: "Alex" },
      { role: "assistant", content: "Thanks, Alex. What's the best phone number to reach you?" },
      { role: "user", content: "2145550199" },
      { role: "assistant", content: "What's the service address?" },
      { role: "user", content: "1500 Marilla St, Dallas TX 75201" },
      { role: "assistant", content: "The useful next step is an on-site estimate. Does that work?" },
    ],
    live8State
  );
  assert(wordCount(live8.reply) < 90, `8 too long (${wordCount(live8.reply)})`);
  assert(
    live8.salesState.currentObjective === "CLOSE" ||
      live8.salesState.handoffReady ||
      live8.salesState.customerAgreed,
    `8 not closing: ${live8.salesState.currentObjective}`
  );
  assert(
    !/\?/.test(live8.reply) || live8.salesState.currentObjective !== "CLOSE",
    `8 should not keep questioning if CLOSE: ${live8.reply}`
  );
  console.log("8 PASS — ready to close", live8.reply);

  console.log("\nSales Brain V2 authority/grounding pack PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
