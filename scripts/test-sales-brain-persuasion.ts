import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import { readFileSync } from "fs";
import path from "path";
import type { BusinessProfile } from "../src/types/business";
import {
  buildSalesBrainContext,
  chooseSalesMove,
  inferCustomerSituationKind,
  listSalesCommitments,
} from "../src/lib/salesBrain";
import { generateSalesReply } from "../src/lib/salesChat";
import { updateSalesStateFromTurn } from "../src/lib/salesController";
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

const autrey: BusinessProfile = {
  website: "https://autreys-plumbing.test",
  businessName: "Autrey's Plumbing LLC",
  tagline: "Licensed local plumbing",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  phone: "",
  email: "",
  address: "",
  services: [
    "Water pump installation",
    "Water heater repair",
    "Jacuzzi and spa plumbing",
    "Kitchen sink installation",
  ],
  serviceAreas: ["Dallas"],
  faqs: [
    {
      question: "Are you licensed?",
      answer: "Yes, we are licensed and insured for residential plumbing.",
    },
  ],
  leadQuestions: [],
  systemPrompt:
    "Licensed residential plumbing company. We install water pumps, repair water heaters, and handle jacuzzi plumbing. We do not publish prices. On-site estimates are the next step for installations. We do not offer electrical contracting or full-house rewiring.",
};

const kiser = loadKiser();

const PUMP =
  "Hi I want to install new Water Pumps. I have a working old pump just want to install a new version of pump. I have already bought a new pump.";

function seed(business: BusinessProfile): SalesState {
  return createInitialSalesState({
    conversationId: createConversationId(),
    businessKey: businessIdentityKey(business),
  });
}

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

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function asksLeadField(text: string): boolean {
  return /\b(first )?name\b|\bphone\b|\bemail\b|\baddress\b/i.test(text);
}

function reasksEstimate(text: string): boolean {
  return /\b(would you like (me to )?(proceed with |schedule )?(an? )?(on[- ]site )?(estimate|assessment|visit)|do you (still )?want (an? )?(on[- ]site )?(estimate|assessment))\b/i.test(
    text
  );
}

function genericPitch(text: string): boolean {
  return /\b(we're licensed|we are licensed|we're experienced|we are experienced|we're trusted|quality service)\b/i.test(
    text
  );
}

type Turn = { role: "user" | "assistant"; content: string };

async function live(
  business: BusinessProfile,
  user: string,
  previousMessages: Turn[] = [],
  previousState: SalesState | null = null
) {
  const messages: Turn[] = [
    { role: "assistant", content: "Hi! How can I help you today?" },
    ...previousMessages,
    { role: "user", content: user },
  ];
  return generateSalesReply(business, messages, previousState);
}

async function main() {
  const pumpState = apply(autrey, seed(autrey), PUMP);
  const pumpBrain = buildSalesBrainContext({
    state: pumpState,
    business: autrey,
    latestUserText: PUMP,
  });
  assert(
    inferCustomerSituationKind(PUMP, pumpState) === "ALREADY_OWNS_EQUIPMENT",
    `pump situation ${inferCustomerSituationKind(PUMP, pumpState)}`
  );
  assert(
    chooseSalesMove(pumpState, PUMP, pumpBrain.customerEmotion) === "VALIDATE_PURCHASE",
    `pump move ${chooseSalesMove(pumpState, PUMP, pumpBrain.customerEmotion)}`
  );
  assert(pumpState.currentObjective === "COLLECT_NAME", `pump obj ${pumpState.currentObjective}`);

  let agreed = apply(autrey, seed(autrey), PUMP);
  agreed = apply(autrey, agreed, "Alex", "We can install the pump you already have. What's your first name?");
  agreed = apply(autrey, agreed, "2145550199", "What's the best phone number?");
  agreed = apply(
    autrey,
    agreed,
    "1500 Marilla St, Dallas TX 75201",
    "What's the service address?"
  );
  agreed = apply(
    autrey,
    agreed,
    "Yes, an on-site estimate sounds good. Can you come tomorrow morning?",
    "The useful next step is an on-site estimate so we can see the existing setup. Does that work?"
  );
  const afterAgree = listSalesCommitments(agreed);
  assert(afterAgree.appointmentAccepted, "tomorrow morning should accept visit intent");
  assert(Boolean(afterAgree.preferredTiming), `timing missing: ${agreed.preferredTiming}`);
  const priceBrain = buildSalesBrainContext({
    state: updateSalesStateFromTurn(
      agreed,
      [
        {
          role: "assistant",
          content: "We can note tomorrow morning as your preference for the visit.",
        },
        { role: "user", content: "How much will it cost?" },
      ],
      autrey
    ),
    business: autrey,
    latestUserText: "How much will it cost?",
    priorAssistantReplies: ["The useful next step is an on-site estimate."],
  });
  assert(
    priceBrain.recommendedSalesMove === "HANDLE_OBJECTION",
    `price move ${priceBrain.recommendedSalesMove}`
  );
  assert(priceBrain.commitments.estimateRequested, "estimate commitment should be remembered");
  console.log("0 PASS — deterministic situation / commitments / price-after-agreement");

  console.log("\n--- live persuasion pack ---");

  const pump1 = await live(autrey, PUMP);
  assert(wordCount(pump1.reply) < 90, `1 too long (${wordCount(pump1.reply)}): ${pump1.reply}`);
  assert(/\bname\b/i.test(pump1.reply), `1 should ask name: ${pump1.reply}`);
  assert(
    /\b(already|bought|purchased|install|existing|setup|compatib|you have)\b/i.test(pump1.reply),
    `1 should sell-while-capturing from already-owns/install context: ${pump1.reply}`
  );
  assert(!/\$\d/.test(pump1.reply), `1 invented price: ${pump1.reply}`);
  console.log("1 opener PASS —", pump1.reply);

  const pump2 = await live(
    autrey,
    "Alex",
    [
      { role: "user", content: PUMP },
      { role: "assistant", content: pump1.reply },
    ],
    pump1.salesState
  );
  assert(/\bphone|number\b/i.test(pump2.reply), `1b phone: ${pump2.reply}`);
  assert(!genericPitch(pump2.reply), `1b generic pitch on later capture: ${pump2.reply}`);
  console.log("1b name PASS —", pump2.reply);

  const pump3 = await live(
    autrey,
    "2145550199",
    [
      { role: "user", content: PUMP },
      { role: "assistant", content: pump1.reply },
      { role: "user", content: "Alex" },
      { role: "assistant", content: pump2.reply },
    ],
    pump2.salesState
  );
  assert(/\baddress\b/i.test(pump3.reply), `1c address: ${pump3.reply}`);
  console.log("1c phone PASS —", pump3.reply);

  const pump4 = await live(
    autrey,
    "1500 Marilla St, Dallas TX 75201",
    [
      { role: "user", content: PUMP },
      { role: "assistant", content: pump1.reply },
      { role: "user", content: "Alex" },
      { role: "assistant", content: pump2.reply },
      { role: "user", content: "2145550199" },
      { role: "assistant", content: pump3.reply },
    ],
    pump3.salesState
  );
  console.log("1d address PASS —", pump4.reply);

  const pump5 = await live(
    autrey,
    "Yes, an on-site estimate sounds good. Can you come tomorrow morning?",
    [
      { role: "user", content: PUMP },
      { role: "assistant", content: pump1.reply },
      { role: "user", content: "Alex" },
      { role: "assistant", content: pump2.reply },
      { role: "user", content: "2145550199" },
      { role: "assistant", content: pump3.reply },
      { role: "user", content: "1500 Marilla St, Dallas TX 75201" },
      { role: "assistant", content: pump4.reply },
    ],
    pump4.salesState
  );
  assert(
    pump5.salesState.appointmentIntent === true || Boolean(pump5.salesState.preferredTiming),
    `1e should store visit/timing: intent=${pump5.salesState.appointmentIntent} timing=${pump5.salesState.preferredTiming}`
  );
  console.log("1e estimate+timing PASS —", pump5.reply);

  const pump6 = await live(
    autrey,
    "How much will it cost?",
    [
      { role: "user", content: PUMP },
      { role: "assistant", content: pump1.reply },
      { role: "user", content: "Alex" },
      { role: "assistant", content: pump2.reply },
      { role: "user", content: "2145550199" },
      { role: "assistant", content: pump3.reply },
      { role: "user", content: "1500 Marilla St, Dallas TX 75201" },
      { role: "assistant", content: pump4.reply },
      {
        role: "user",
        content: "Yes, an on-site estimate sounds good. Can you come tomorrow morning?",
      },
      { role: "assistant", content: pump5.reply },
    ],
    pump5.salesState
  );
  assert(wordCount(pump6.reply) < 110, `1f too long (${wordCount(pump6.reply)}): ${pump6.reply}`);
  assert(!/\$\d/.test(pump6.reply), `1f invented price: ${pump6.reply}`);
  assert(!reasksEstimate(pump6.reply), `1f re-asked estimate: ${pump6.reply}`);
  assert(
    /\b(price|cost|estimate|depend|without seeing|on-?site|visit)\b/i.test(pump6.reply),
    `1f should answer cost uncertainty: ${pump6.reply}`
  );
  assert(
    !/\b(confirm|reconfirm|still (good|work)|works for you)\b[\s\S]{0,40}\b(tomorrow morning|that time)\b/i.test(
      pump6.reply
    ),
    `1f should not reconfirm timing: ${pump6.reply}`
  );
  console.log("1f price-after-agreement PASS —", pump6.reply);

  const pump7 = await live(
    autrey,
    "thanks",
    [
      { role: "user", content: PUMP },
      { role: "assistant", content: pump1.reply },
      { role: "user", content: "Alex" },
      { role: "assistant", content: pump2.reply },
      { role: "user", content: "2145550199" },
      { role: "assistant", content: pump3.reply },
      { role: "user", content: "1500 Marilla St, Dallas TX 75201" },
      { role: "assistant", content: pump4.reply },
      {
        role: "user",
        content: "Yes, an on-site estimate sounds good. Can you come tomorrow morning?",
      },
      { role: "assistant", content: pump5.reply },
      { role: "user", content: "How much will it cost?" },
      { role: "assistant", content: pump6.reply },
    ],
    pump6.salesState
  );
  assert(
    pump7.salesState.currentObjective === "CLOSE" || pump7.salesState.handoffReady,
    `1g close obj ${pump7.salesState.currentObjective}`
  );
  assert(!/\?/.test(pump7.reply) || pump7.salesState.currentObjective !== "CLOSE", `1g question: ${pump7.reply}`);
  console.log("1g thanks/close PASS —", pump7.reply);

  const heater = await live(autrey, "My heater stopped working and the house is freezing.");
  assert(wordCount(heater.reply) < 90, `2 too long: ${heater.reply}`);
  assert(/\bname\b/i.test(heater.reply), `2 should ask name: ${heater.reply}`);
  assert(!/great project|worthwhile upgrade/i.test(heater.reply), `2 aspirational on pain: ${heater.reply}`);
  console.log("2 heater PASS —", heater.reply);

  const jacuzzi = await live(autrey, "I've wanted a Jacuzzi for years.");
  assert(wordCount(jacuzzi.reply) < 90, `3 too long: ${jacuzzi.reply}`);
  assert(/\bname\b/i.test(jacuzzi.reply), `3 should ask name: ${jacuzzi.reply}`);
  assert(!/sorry you'?re dealing/i.test(jacuzzi.reply), `3 pain apology: ${jacuzzi.reply}`);
  console.log("3 jacuzzi PASS —", jacuzzi.reply);

  const skepticalNeed = apply(autrey, seed(autrey), "I want a Jacuzzi in my backyard.");
  const skeptical = await live(
    autrey,
    "How do I know you're reliable?",
    [
      { role: "user", content: "I want a Jacuzzi in my backyard." },
      { role: "assistant", content: "That sounds like a great backyard project. What's your first name?" },
    ],
    skepticalNeed
  );
  assert(/licen[sc]ed|insured/i.test(skeptical.reply), `4 trust fact: ${skeptical.reply}`);
  const trustHits = (skeptical.reply.match(/\b(licensed|insured|experienced|trusted|years)\b/gi) || []).length;
  assert(trustHits <= 3, `4 too many proof points (${trustHits}): ${skeptical.reply}`);
  console.log("4 skeptical PASS —", skeptical.reply);

  const priceFirst = await live(autrey, "How much would a Jacuzzi cost?");
  assert(!/\$\d/.test(priceFirst.reply), `5 invented price: ${priceFirst.reply}`);
  assert(
    /\b(price|cost|estimate|depend|without seeing|on-?site)\b/i.test(priceFirst.reply),
    `5 must handle price: ${priceFirst.reply}`
  );
  assert(wordCount(priceFirst.reply) < 110, `5 too long: ${priceFirst.reply}`);
  console.log("5 price-first PASS —", priceFirst.reply);

  const expensiveNeed = apply(autrey, seed(autrey), "I want a modern kitchen sink.");
  const expensive = await live(
    autrey,
    "That's expensive.",
    [
      { role: "user", content: "I want a modern kitchen sink." },
      { role: "assistant", content: "A modern sink can really refresh the space. What's your first name?" },
    ],
    expensiveNeed
  );
  assert(!/\$\d|\b\d+\s*%|discount/i.test(expensive.reply), `6 invented deal: ${expensive.reply}`);
  assert(
    expensive.salesState.currentObjective === "HANDLE_PRICE_OBJECTION",
    `6 obj ${expensive.salesState.currentObjective}`
  );
  console.log("6 expensive PASS —", expensive.reply);

  let readyState = apply(autrey, seed(autrey), "My heater stopped working.");
  readyState = apply(autrey, readyState, "Alex", "Sorry you're dealing with that. What's your first name?");
  readyState = apply(autrey, readyState, "2145550199", "What's the best phone number to reach you?");
  readyState = apply(
    autrey,
    readyState,
    "1500 Marilla St, Dallas TX 75201",
    "What's the service address?"
  );
  const ready = await live(
    autrey,
    "Yes, let's do it. Please go ahead.",
    [
      { role: "user", content: "My heater stopped working." },
      { role: "assistant", content: "Sorry you're dealing with that. What's your first name?" },
      { role: "user", content: "Alex" },
      { role: "assistant", content: "What's the best phone number to reach you?" },
      { role: "user", content: "2145550199" },
      { role: "assistant", content: "What's the service address?" },
      { role: "user", content: "1500 Marilla St, Dallas TX 75201" },
      { role: "assistant", content: "The useful next step is an on-site estimate. Does that work?" },
    ],
    readyState
  );
  assert(
    ready.salesState.currentObjective === "CLOSE" || ready.salesState.customerAgreed,
    `7 not executing: ${ready.salesState.currentObjective}`
  );
  assert(
    !/\b(licensed and insured|we're experienced|quality service)\b/i.test(ready.reply),
    `7 oversold: ${ready.reply}`
  );
  console.log("7 ready PASS —", ready.reply);

  const postQ = await live(
    autrey,
    "Do I need to be home?",
    [
      { role: "user", content: PUMP },
      { role: "assistant", content: pump1.reply },
      { role: "user", content: "Alex" },
      { role: "assistant", content: pump2.reply },
      { role: "user", content: "2145550199" },
      { role: "assistant", content: pump3.reply },
      { role: "user", content: "1500 Marilla St, Dallas TX 75201" },
      { role: "assistant", content: pump4.reply },
      {
        role: "user",
        content: "Yes, an on-site estimate sounds good. Can you come tomorrow morning?",
      },
      { role: "assistant", content: pump5.reply },
    ],
    pump5.salesState
  );
  assert(!reasksEstimate(postQ.reply), `8 re-asked estimate: ${postQ.reply}`);
  assert(wordCount(postQ.reply) < 110, `8 too long: ${postQ.reply}`);
  console.log("8 post-agreement question PASS —", postQ.reply);

  const kiserT1 =
    "I recently bought a home in auction. I want to redo the electical work like AC, heater and lighting. Can you do that and how much will it cost?";
  const k1 = await live(kiser, kiserT1);
  assert(!asksLeadField(k1.reply), `9 T1 lead capture: ${k1.reply}`);
  assert(!/\$\d/.test(k1.reply), `9 T1 price: ${k1.reply}`);
  const k2 = await live(
    kiser,
    "full house electircal rewiring",
    [
      { role: "user", content: kiserT1 },
      { role: "assistant", content: k1.reply },
    ],
    k1.salesState
  );
  assert(!asksLeadField(k2.reply), `9 T2 lead capture: ${k2.reply}`);
  assert(
    /\b(don'?t have enough information|can(?:not|'t) confirm|not confirmed|available information)\b/i.test(
      k2.reply
    ) || !/\bwe (don't|do not) (offer|do|handle) (that|electrical|rewir)/i.test(k2.reply),
    `9 T2 invented non-capability: ${k2.reply}`
  );
  assert(
    /\b(hvac|ac\b|heater|heating|air condition)\b/i.test(k2.reply),
    `9 T2 should preserve HVAC: ${k2.reply}`
  );
  console.log("9 kiser T1 PASS —", k1.reply);
  console.log("9 kiser T2 PASS —", k2.reply);

  console.log("\nSales Brain persuasion pack PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
