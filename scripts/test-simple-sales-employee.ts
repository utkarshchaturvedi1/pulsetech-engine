import { config } from "dotenv";
config({ path: ".env.local" });

import {
  generateSimpleSalesReply,
  setSimpleSalesTestModel,
  type SimpleSalesMessage,
} from "../src/lib/salesEmployeeSimple";
import { CHAT_REQUEST_FAILURE_REPLY, createCustomerChatSession } from "../src/lib/customerChatClient";
import { setLeadHandoffTestDelivery } from "../src/lib/leadHandoff";
import { businessIdentityKey, createInitialSalesState, type SalesState } from "../src/lib/salesState";
import { resolveCurrentChatProfile } from "../src/lib/sharedProfileStore";
import type { BusinessProfile } from "../src/types/business";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const business: BusinessProfile = {
  website: "https://texassolar.test",
  businessName: "Texas Solar Professional",
  tagline: "Residential solar and battery systems",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  phone: "+1 (214) 555-0199",
  email: "hello@texassolar.test",
  address: "",
  services: ["Solar panel installation", "Hybrid solar systems", "Battery storage"],
  serviceAreas: ["Dallas, Texas"],
  businessHours: "",
  pricingRules: "Exact price requires a site-specific design.",
  faqs: [],
  leadQuestions: ["Are you looking for a new solar system, batteries, or maintenance?"],
  systemPrompt: "Old script: ask whether the customer needs a new solar system, batteries, or maintenance.",
  leadNotificationEmail: "pulsetechlabs1@gmail.com",
  leadNotificationPhone: "+919873599994",
};

async function main() {
  delete process.env.LEAD_HANDOFF_DRY_RUN;
  const deliveryCalls: Array<{ emailTo: string; smsTo: string; text: string; smsBody: string }> = [];
  setLeadHandoffTestDelivery(async (input) => {
    deliveryCalls.push(input);
    return { emailOk: true, smsOk: true };
  });

  let latestInstructions = "";
  let modelReply = "Don’t worry—you’ve come to the right place. A hybrid solar and battery system may be able to power your home; the design depends on your usage and site. What name should I use?";
  setSimpleSalesTestModel(async (instructions) => {
    latestInstructions = instructions;
    return modelReply;
  });

  const conversationId = "simple-sales-employee-test-0001";
  const businessKey = businessIdentityKey(business);
  let state: SalesState = createInitialSalesState({ conversationId, businessKey });
  let messages: SimpleSalesMessage[] = [
    { role: "user", content: "I want a hybrid solar system with batteries that can run my whole home." },
  ];

  let result = await generateSimpleSalesReply(business, messages, state);
  state = result.salesState;
  assert(/right place/i.test(result.reply), "a supported service request gets warm reassurance");
  assert(/name/i.test(result.reply), "the assistant begins with name capture");
  assert(latestInstructions.includes("WHAT YOU CAN DO") && latestInstructions.includes("WHAT YOU CAN’T DO"), "prompt is organized around the two requested topics");
  assert(latestInstructions.includes("come to the right place") && latestInstructions.includes("45 words"), "the simple chat leads with reassurance and stays brief");
  assert(!latestInstructions.includes("new solar system, batteries, or maintenance"), "the configured extra questionnaire is not passed to the assistant");
  assert(!latestInstructions.includes("Old script"), "the previous long prompt is not carried into the new assistant");

  messages = [...messages, { role: "assistant", content: result.reply }, { role: "user", content: "UTK" }];
  modelReply = "Thanks, UTK. What’s the best phone number for the team to reach you?";
  result = await generateSimpleSalesReply(business, messages, state);
  state = result.salesState;
  assert(state.lead.name === "UTK", "name is captured");
  assert(/phone number/i.test(result.reply), "phone is the next field");
  assert(!/email/i.test(result.reply), "the customer is not asked for an email address");
  assert(latestInstructions.includes("already been given; do not repeat it"), "reassurance is limited to the opening reply");

  messages = [...messages, { role: "assistant", content: result.reply }, { role: "user", content: "The other company says they have the cheapest rates in Texas." }];
  modelReply = "It makes sense to compare quotes; we can explain our proposal clearly once we understand your system needs. What's the best phone number to reach you?";
  result = await generateSimpleSalesReply(business, messages, state);
  state = result.salesState;
  assert(/compare quotes/i.test(result.reply), "a competitor-price objection gets a direct, relevant answer");
  assert(!/phone number/i.test(result.reply), "the bot does not repeat the unanswered phone question during an objection");

  messages = [...messages, { role: "assistant", content: result.reply }, { role: "user", content: "9898989898. I hope your quote is lower. I spoke with your competitor today and they said they are the most affordable solar installer in Texas." }];
  result = await generateSimpleSalesReply(business, messages, state);
  state = result.salesState;
  assert(state.lead.phone === "9898989898", "phone volunteered with a competitor objection is captured");
  assert(/compare quotes|compare/i.test(result.reply), "competitor objection is answered even when the phone is supplied in the same turn");
  assert(/service address/i.test(result.reply), "after phone capture, the next missing field is the service address");

  const priorFetch = globalThis.fetch;
  const priorSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const priorSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const priorVercel = process.env.VERCEL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  process.env.VERCEL = "1";
  globalThis.fetch = (async () => { throw new Error("simulated profile store network failure"); }) as typeof fetch;
  try {
    const recoveredProfile = await resolveCurrentChatProfile(business, "texassolar");
    assert(recoveredProfile === business, "a transient saved-profile lookup failure falls back to the bound business profile");
  } finally {
    globalThis.fetch = priorFetch;
    if (priorSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = priorSupabaseUrl;
    if (priorSupabaseKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = priorSupabaseKey;
    if (priorVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = priorVercel;
  }

  const identityFetch = globalThis.fetch;
  const isolatedRequests: Array<{ conversationId: string; salesState: SalesState }> = [];
  globalThis.fetch = (async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as { conversationId: string; salesState: SalesState };
    isolatedRequests.push(payload);
    return new Response(JSON.stringify({ reply: "I can help with that." }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const sameSitePlumbing: BusinessProfile = { ...business, businessName: "Autrey’s Plumbing LLC" };
    const firstProfileSession = createCustomerChatSession(business, "Hi", "profile-solar-test");
    const secondProfileSession = createCustomerChatSession(sameSitePlumbing, "Hi", "profile-plumbing-test");
    await Promise.all([firstProfileSession.send("I need help."), secondProfileSession.send("I need help.")]);
    assert(isolatedRequests.length === 2, "both profile conversations reach the chat API");
    assert(isolatedRequests[0].conversationId !== isolatedRequests[1].conversationId, "each conversation receives a unique conversation ID");
    assert(isolatedRequests[0].salesState.businessKey === "profile:profile-solar-test", "solar chat state is keyed to its stable profile ID");
    assert(isolatedRequests[1].salesState.businessKey === "profile:profile-plumbing-test", "plumbing chat state is keyed to its stable profile ID");
    assert(isolatedRequests[0].salesState.businessKey !== isolatedRequests[1].salesState.businessKey, "same-site business profiles cannot share chat state");
    firstProfileSession.destroy();
    secondProfileSession.destroy();
  } finally {
    globalThis.fetch = identityFetch;
  }

  const retryFetch = globalThis.fetch;
  let transientAttemptCount = 0;
  globalThis.fetch = (async () => {
    transientAttemptCount += 1;
    if (transientAttemptCount === 1) return new Response("temporary failure", { status: 503 });
    return new Response(JSON.stringify({ reply: "We can help with that. What name should I use?" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const retrySession = createCustomerChatSession(business, "Hi", "texassolar");
    const recoveredReply = await retrySession.send("My AC is not cooling.");
    assert(transientAttemptCount === 2, "one transient failure gets exactly one automatic retry");
    assert(/what name should i use/i.test(recoveredReply), "a recovered request returns the chatbot reply instead of the generic error");
    retrySession.destroy();
  } finally {
    globalThis.fetch = retryFetch;
  }

  let phoneTurnAttempts = 0;
  globalThis.fetch = (async () => {
    phoneTurnAttempts += 1;
    return new Response("temporary failure", { status: 503 });
  }) as typeof fetch;
  try {
    const phoneTurnSession = createCustomerChatSession(business, "Hi", "texassolar");
    try {
      await phoneTurnSession.send("My number is +1 (214) 555-0188");
    } catch {
      // Preserve the existing safe failure reply when a retry could duplicate a lead handoff.
    }
    assert(phoneTurnAttempts === 1, "a phone-containing turn is not retried, preventing duplicate lead alerts");
    phoneTurnSession.destroy();
  } finally {
    globalThis.fetch = retryFetch;
  }

  const sessionFetch = globalThis.fetch;
  let sessionRequestCount = 0;
  let messagesAfterFailure: SimpleSalesMessage[] = [];
  globalThis.fetch = (async (_input, init) => {
    sessionRequestCount += 1;
    if (sessionRequestCount === 2 || sessionRequestCount === 3) return new Response("{}", { status: 500 });
    if (sessionRequestCount === 4) {
      const requestBody = JSON.parse(String(init?.body)) as { messages: SimpleSalesMessage[] };
      messagesAfterFailure = requestBody.messages;
    }
    return new Response(JSON.stringify({ reply: "I can help with solar installation." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const session = createCustomerChatSession(business, "Hi", "texassolar");
    await session.send("I want solar panels.");
    try {
      await session.send("A competitor says it has the cheapest rates.");
    } catch {
      // The UI displays CHAT_REQUEST_FAILURE_REPLY for the failed turn.
    }
    await session.send("What happened?");
    assert(messagesAfterFailure.some((message) => message.content === CHAT_REQUEST_FAILURE_REPLY), "failed replies stay in conversation context instead of reviving an older question");
    assert(messagesAfterFailure.some((message) => message.content === "A competitor says it has the cheapest rates."), "the failed customer message remains in the conversation context");
    session.destroy();
  } finally {
    globalThis.fetch = sessionFetch;
  }

  messages = [...messages, { role: "assistant", content: result.reply }, { role: "user", content: "How much will the system cost?" }];
  modelReply = "An exact price needs a site-specific design. System size, battery capacity, and roof conditions determine the total. Would you like a site-specific quote?";
  result = await generateSimpleSalesReply(business, messages, state);
  state = result.salesState;
  assert(/site-specific design/i.test(result.reply) && /battery capacity/i.test(result.reply), "solar price answers use the active business facts");
  assert(latestInstructions.includes("Every answer must be specific to the assigned business") && latestInstructions.includes("verified pricing information"), "the model receives cross-business and verified-pricing rules");
  assert(!/service address/i.test(result.reply), "the already-asked service address is not repeated while answering the price question");
  assert(state.leadDeliveryStatus !== "QUEUED" && !result.leadDelivery, "a direct price question is answered before any lead alert is submitted");

  const plumbingBusiness: BusinessProfile = {
    ...business,
    website: "https://dallasplumbing.test",
    businessName: "Autrey's Plumbing LLC",
    tagline: "Residential plumbing service",
    services: ["Drain cleaning", "Leak repair", "Water heater repair"],
    pricingRules: "Exact job pricing depends on the issue and parts needed.",
    leadQuestions: [],
    systemPrompt: "",
  };
  const plumbingConversation = "simple-sales-plumbing-price-0001";
  const plumbingState = createInitialSalesState({
    conversationId: plumbingConversation,
    businessKey: businessIdentityKey(plumbingBusiness),
  });
  const plumbingMessages: SimpleSalesMessage[] = [
    { role: "user", content: "My kitchen sink is clogged and backing up. Can you help?" },
    { role: "assistant", content: "You've come to the right place. What's your name?" },
    { role: "user", content: "AB" },
    { role: "assistant", content: "Thanks, AB. What's the best phone number to reach you?" },
    { role: "user", content: "+12125550147" },
    { role: "assistant", content: "Thanks, AB. What's the service address?" },
    { role: "user", content: "Before I give the address, how much will it cost to unclog the sink?" },
  ];
  modelReply = "I can’t quote this without assessing the drain. The cost depends on the blockage and any materials needed. Would you like the team to provide an estimate?";
  const plumbingPrice = await generateSimpleSalesReply(plumbingBusiness, plumbingMessages, plumbingState);
  assert(/assessing the drain/i.test(plumbingPrice.reply) && /blockage/i.test(plumbingPrice.reply), "plumbing price answers reflect the plumbing request");
  assert(!/solar|battery capacity|roof|energy use|system size/i.test(plumbingPrice.reply), "plumbing answers never inherit solar-specific language");
  assert(latestInstructions.includes("Business name: Autrey’s Plumbing LLC") || latestInstructions.includes("Business name: Autrey's Plumbing LLC"), "the active plumbing business is in the model context");
  assert(latestInstructions.includes("Drain cleaning"), "the active plumbing services are in the model context");

  const plumbingPhotoMessages: SimpleSalesMessage[] = [
    ...plumbingMessages,
    { role: "assistant", content: plumbingPrice.reply },
    { role: "user", content: "Please review this photo of the sink and tell me if you can help." },
  ];
  modelReply = "We can help with a kitchen sink clog, and the team can review your attached photo. What name should I use?";
  const plumbingPhotoReply = await generateSimpleSalesReply(
    plumbingBusiness,
    plumbingPhotoMessages,
    plumbingState,
    ["https://photos.example.test/signed-test-photo"]
  );
  assert(latestInstructions.includes("cannot inspect their contents"), "the assistant is told that images are for team review, not AI inspection");
  assert(!latestInstructions.includes("A photo invitation is appropriate"), "the assistant does not invite another photo after one is attached");
  assert(!/based on the photo|I can see|the photo shows/i.test(plumbingPhotoReply.reply), "the assistant never claims to visually inspect an uploaded image");

  messages = [...messages, { role: "assistant", content: result.reply }, { role: "user", content: "1500 Marilla St, Dallas TX 75201" }];
  result = await generateSimpleSalesReply(business, messages, state);
  state = result.salesState;
  assert(state.lead.address === "1500 Marilla St, Dallas TX 75201", "address is captured");
  assert(state.leadDeliveryStatus === "QUEUED", "complete service inquiry enters the lead handoff without a needless service-type or appointment quiz");
  assert(/contact you as soon as possible/i.test(result.reply), "customer receives a short, honest follow-up close");
  assert(!/scheduled|booked|appointment is confirmed/i.test(result.reply), "the assistant does not claim an appointment is booked");
  assert(Boolean(result.leadDelivery), "handoff returns a delivery task for email and SMS");
  await result.leadDelivery?.();
  assert(deliveryCalls.length === 1, "one email/SMS delivery task is invoked");
  assert(deliveryCalls[0].emailTo === "pulsetechlabs1@gmail.com", "notification email destination is correct");
  assert(deliveryCalls[0].smsTo === "+919873599994", "notification SMS destination is correct");
  assert(deliveryCalls[0].text.includes("1500 Marilla St"), "email includes the captured service address");
  assert(deliveryCalls[0].smsBody.includes("9898989898"), "SMS includes the captured phone number");

  setSimpleSalesTestModel(null);
  setLeadHandoffTestDelivery(null);
  console.log("PASS — simple business chat: two-part instructions, answer-first lead capture, no extra service questionnaire, truthful close, and email/SMS delivery interception");
}

main().catch((error) => {
  setSimpleSalesTestModel(null);
  setLeadHandoffTestDelivery(null);
  console.error(error);
  process.exitCode = 1;
});
