import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import {
  buildSalesEmployeeFallback,
  generateSalesEmployeeReply,
  setSalesEmployeeTestModel,
  type SalesEmployeeMessage,
} from "../src/lib/salesEmployeeV2";
import {
  businessIdentityKey,
  createInitialSalesState,
  type SalesState,
} from "../src/lib/salesState";
import type { BusinessProfile } from "../src/types/business";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const business: BusinessProfile = {
  website: "https://summit-roofing.test",
  businessName: "Summit Roofing",
  tagline: "Roofing help for Dallas homeowners",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  phone: "+1 (512) 555-0142",
  email: "hello@summit.test",
  address: "",
  services: ["Roof repair", "Roof replacement"],
  serviceAreas: ["Dallas"],
  faqs: [],
  leadQuestions: [],
  systemPrompt: "",
  leadNotificationEmail: "alerts@summit.test",
  leadNotificationPhone: "+15125551298",
};

async function main() {
  let modelReply = "";
  let latestInstructions = "";
  setSalesEmployeeTestModel(async (instructions) => {
    latestInstructions = instructions;
    return modelReply;
  });

  const conversationId = "sales-employee-v2-test-0001";
  const businessKey = businessIdentityKey(business);
  let state: SalesState = createInitialSalesState({ conversationId, businessKey });
  let messages: SalesEmployeeMessage[] = [
    { role: "user", content: "My roof is leaking. Can your team help?" },
  ];

  modelReply = "Don’t worry—you’ve come to the right place. We handle roof repairs and will help get this sorted as soon as possible. What name should I use?";
  const first = await generateSalesEmployeeReply(business, messages, state);
  state = first.salesState;
  assert(/right place/i.test(first.reply), "service request receives reassurance");
  assert(/name/i.test(first.reply), "first missing contact field is requested");

  messages = [...messages, { role: "assistant", content: first.reply }, { role: "user", content: "What does roof repair usually include?" }];
  modelReply = "It can include repairing damaged shingles, flashing, or leak points; the exact work depends on what the roofer finds.";
  const answeredQuestion = await generateSalesEmployeeReply(business, messages, state);
  state = answeredQuestion.salesState;
  assert(/shingles|flashing|leak/i.test(answeredQuestion.reply), "customer question is answered before contact capture");
  assert(!/what name should i use/i.test(answeredQuestion.reply), "the same contact question is not repeated immediately");
  assert(latestInstructions.includes("already received reassurance"), "later turns do not repeat the opening reassurance");

  messages = [...messages, { role: "assistant", content: answeredQuestion.reply }, { role: "user", content: "Maya" }];
  modelReply = "Thanks, Maya.";
  const afterName = await generateSalesEmployeeReply(business, messages, state);
  state = afterName.salesState;
  assert(state.lead.name === "Maya", "name is captured");
  assert(/phone number/i.test(afterName.reply), "phone is the next field requested");

  messages = [...messages, { role: "assistant", content: afterName.reply }, { role: "user", content: "+1 555 010 0123" }];
  modelReply = "Thank you.";
  const afterPhone = await generateSalesEmployeeReply(business, messages, state);
  state = afterPhone.salesState;
  assert(state.lead.phone === "+1 555 010 0123", "phone is captured");
  assert(/service address/i.test(afterPhone.reply), "address is the next field requested");

  messages = [...messages, { role: "assistant", content: afterPhone.reply }, { role: "user", content: "How long does a typical roof repair take?" }];
  modelReply = "Timing depends on the roof and the damage, but many straightforward repairs can be completed in a day. What’s the service address?";
  const answerInstead = await generateSalesEmployeeReply(business, messages, state);
  state = answerInstead.salesState;
  assert(/depends on the roof/i.test(answerInstead.reply), "a new customer question is answered while collecting contact details");
  assert(!/service address/i.test(answerInstead.reply), "the same address request is not repeated after the customer asks a different question");

  messages = [...messages, { role: "assistant", content: answerInstead.reply }, { role: "user", content: "123 Main St, Dallas TX 75201" }];
  modelReply = "Thank you.";
  const completed = await generateSalesEmployeeReply(business, messages, state);
  assert(!!completed.salesState.lead.address?.includes("123 Main St"), "service address is captured");
  assert(completed.salesState.leadDeliveryStatus === "NOT_SENT", "contact capture alone never submits a lead");
  assert(/would you like to arrange/i.test(completed.reply), "after contact capture the bot asks permission to arrange the next step");
  assert(!/team will contact|noted your request/i.test(completed.reply), "no delivery claim is made before agreement and timing");
  assert(!completed.reply.includes(business.phone), "business phone number is never disclosed");

  messages = [...messages, { role: "assistant", content: completed.reply }, { role: "user", content: "Yes, please arrange the site visit." }];
  const agreed = await generateSalesEmployeeReply(business, messages, completed.salesState);
  assert(agreed.salesState.customerAgreed, "explicit agreement is captured");
  assert(agreed.salesState.leadDeliveryStatus === "NOT_SENT", "agreement without preferred time does not submit a lead");
  assert(/what day or time/i.test(agreed.reply), "preferred time is requested after agreement");

  messages = [...messages, { role: "assistant", content: agreed.reply }, { role: "user", content: "Saturday morning works." }];
  const readyForHandoff = await generateSalesEmployeeReply(business, messages, agreed.salesState);
  assert(!!readyForHandoff.salesState.preferredTiming, "preferred time is captured after agreement");
  assert(readyForHandoff.salesState.leadDeliveryStatus === "SENT", "only explicit agreement plus preferred time enters dry-run handoff");
  assert(/contact you as soon as possible/i.test(readyForHandoff.reply), "successful handoff gets a truthful follow-up close");

  const comparingState: SalesState = {
    ...createInitialSalesState({ conversationId: "sales-employee-v2-comparing", businessKey }),
    intent: "READY_TO_ACT",
    salesStage: "OBJECTION",
    currentObjective: "HANDLE_HESITATION",
    primaryNeed: "New solar system with batteries",
    customerNeed: "New solar system with batteries",
    lead: { name: "UR", phone: "9898989898", email: null, address: "1500 Marilla St, Dallas TX 75201" },
    leadStatus: "SECURED",
    appointmentIntent: true,
    customerAgreed: false,
  };
  const comparingMessages: SalesEmployeeMessage[] = [
    { role: "assistant", content: "What day or time would you prefer for the consultation?" },
    { role: "user", content: "Ok, in the meantime I will ask a few more service providers who install solar panels." },
  ];
  const comparing = await generateSalesEmployeeReply(business, comparingMessages, comparingState);
  assert(comparing.salesState.leadDeliveryStatus === "NOT_SENT", "comparing providers cancels the pending handoff");
  assert(comparing.salesState.appointmentIntent === false && !comparing.salesState.customerAgreed, "comparing providers clears stale appointment intent");
  assert(/smart to compare providers/i.test(comparing.reply), "comparison is acknowledged naturally without pressure");
  assert(!/couldn’t send|could not send|team received your request|please try again/i.test(comparing.reply), "comparison is not replaced by a failed-delivery error");

  const photoState = createInitialSalesState({ conversationId: "sales-employee-v2-photo", businessKey });
  const photoResult = await generateSalesEmployeeReply(
    business,
    [{ role: "user", content: "Can I speak to a person about the roof leak?" }],
    photoState
  );
  assert(/up to three photos/i.test(photoResult.reply), "human follow-up offers up to three optional photos");
  assert(/5 MB/i.test(photoResult.reply), "photo invitation states the 5 MB limit");

  const fallback = buildSalesEmployeeFallback(
    createInitialSalesState({ conversationId: "sales-employee-v2-fallback", businessKey }),
    business
  );
  assert(/name/i.test(fallback), "model outage still gives a useful, concise next step");
  assert(!fallback.includes(business.phone), "model outage fallback never exposes the business phone");

  assert(latestInstructions.includes("Never provide any business phone number"), "model instructions prohibit phone disclosure");
  setSalesEmployeeTestModel(null);
  console.log("PASS — new sales employee flow: reassure, answer-first, collect contact fields, explicit agreement + timing gate, comparison hesitation, photo invitation, and one dry-run handoff");
}

main().catch((error) => {
  setSalesEmployeeTestModel(null);
  console.error(error);
  process.exitCode = 1;
});
