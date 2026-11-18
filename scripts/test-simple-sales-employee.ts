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

  const sessionFetch = globalThis.fetch;
  let sessionRequestCount = 0;
  let messagesAfterFailure: SimpleSalesMessage[] = [];
  globalThis.fetch = (async (_input, init) => {
    sessionRequestCount += 1;
    if (sessionRequestCount === 2) return new Response("{}", { status: 500 });
    if (sessionRequestCount === 3) {
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
  modelReply = "Please provide the service address for your rooftop solar and battery installation.";
  result = await generateSimpleSalesReply(business, messages, state);
  state = result.salesState;
  assert(/don’t have a fixed price list/i.test(result.reply), "a direct price question receives a direct answer even if the model would dodge it");
  assert(/energy use|system size|battery capacity/i.test(result.reply), "the price answer explains the real cost drivers without inventing a figure");
  assert(/service address/i.test(result.reply), "the next missing contact detail is asked only after the price answer");
  assert(state.leadDeliveryStatus !== "QUEUED" && !result.leadDelivery, "a direct price question is answered before any lead alert is submitted");

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
