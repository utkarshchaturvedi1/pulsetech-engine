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

  messages = [...messages, { role: "assistant", content: answeredQuestion.reply }, { role: "user", content: "QA Test Lead" }];
  modelReply = "Thanks, QA Test Lead.";
  const afterName = await generateSalesEmployeeReply(business, messages, state);
  state = afterName.salesState;
  assert(state.lead.name === "QA Test Lead", "multi-word customer names are captured");
  assert(/phone number/i.test(afterName.reply), "phone is the next field requested");

  messages = [...messages, { role: "assistant", content: afterName.reply }, { role: "user", content: "+1 555 010 0123" }];
  modelReply = "Thanks, QA Test Lead — I have your number. What’s the service address? What name should I use?";
  const afterPhone = await generateSalesEmployeeReply(business, messages, state);
  state = afterPhone.salesState;
  assert(state.lead.phone === "+1 555 010 0123", "phone is captured");
  assert(/service address/i.test(afterPhone.reply), "address is the next field requested");
  assert(!/what name should i use/i.test(afterPhone.reply), "a captured name is never requested again");

  const recoveredState: SalesState = {
    ...createInitialSalesState({ conversationId: "sales-employee-v2-recovered-name", businessKey }),
    intent: "READY_TO_ACT",
    primaryNeed: "Roof repair for an active leak",
    customerNeed: "Roof repair for an active leak",
    lead: { name: null, phone: "+1 555 010 0123", email: null, address: "123 Main St, Dallas TX 75201" },
    leadStatus: "SECURING",
  };
  const recoveredMessages: SalesEmployeeMessage[] = [
    { role: "assistant", content: "What name should I use?" },
    { role: "user", content: "QA Solar Test" },
    { role: "assistant", content: "Thanks, QA Solar Test — got your name. What's the best phone number to reach you?" },
    { role: "user", content: "+1 555 010 0123" },
    { role: "assistant", content: "Thanks, I have your phone. What is the service address?" },
    { role: "user", content: "123 Main St, Dallas TX 75201" },
    { role: "assistant", content: "Would you like me to arrange a roof inspection?" },
    { role: "user", content: "Yes, please arrange it." },
  ];
  modelReply = "What name should I use? What day or time would you prefer?";
  const recovered = await generateSalesEmployeeReply(business, recoveredMessages, recoveredState);
  assert(recovered.salesState.lead.name === "QA Solar Test", "a name previously acknowledged by the assistant is restored if state was lost");
  assert(!/what name should i use/i.test(recovered.reply), "recovered names are not requested again");

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

  const longReplyState = createInitialSalesState({ conversationId: "sales-employee-v2-concise", businessKey });
  modelReply = "Thanks, Maya — good question. A roof replacement price depends on roof size, pitch, materials, tear-off, repairs, permits, and location. Key factors to consider:\n- Roof size and pitch.\n- Material selection.\n- Structural repairs and permits.\nWe can provide an exact quote after an inspection. What’s the best phone number for the team to reach you?";
  const longReply = await generateSalesEmployeeReply(
    business,
    [{ role: "user", content: "I need a roof replacement. My name is Maya. How much does it cost?" }],
    longReplyState
  );
  assert(!/^[-*•]/m.test(longReply.reply), "long generated answers do not show bullet lists");
  assert(longReply.reply.split(/\s+/).length <= 65, "long generated answers are shortened for chat");
  assert(/phone number/i.test(longReply.reply), "shortening preserves the next contact question");

  const verboseOpeningState = createInitialSalesState({ conversationId: "sales-employee-v2-short-opening", businessKey });
  modelReply = "Great—you’re in the right place for an off-grid solar and battery system. Yes, a properly sized solar array and battery bank can run air conditioning and electric heating, but exact performance depends on your home’s energy use, the type of heating, roof size and orientation, battery capacity, inverter output, hours of use, seasonal sunlight, and whether you need power during outages. Can I get your name to start?";
  const verboseOpening = await generateSalesEmployeeReply(
    business,
    [{ role: "user", content: "I want off-grid solar with batteries for AC and electric heating." }],
    verboseOpeningState
  );
  assert(/right place/i.test(verboseOpening.reply), "shortened opening retains reassurance");
  assert(/air conditioning and electric heating/i.test(verboseOpening.reply), "shortened opening retains the answer");
  assert(/name/i.test(verboseOpening.reply), "shortened opening retains the next lead question");
  assert(verboseOpening.reply.split(/\s+/).length <= 65, "verbose openings are shortened without dropping the answer");

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

  const blockedCloseState: SalesState = {
    ...createInitialSalesState({ conversationId: "sales-employee-v2-blocked-close", businessKey }),
    customerAgreed: true,
    preferredTiming: "Saturday morning",
    lead: { name: "QA Solar Test", phone: "+1 555 010 0123", email: null, address: "123 Main St, Dallas TX 75201" },
  };
  modelReply = "All set — your consultation is scheduled for Saturday at 9:00 AM.";
  const blockedClose = await generateSalesEmployeeReply(
    business,
    [{ role: "user", content: "Saturday morning" }],
    blockedCloseState
  );
  assert(!/scheduled|9:00 AM/i.test(blockedClose.reply), "the bot never invents appointment slots or claims a booking when handoff is not ready");

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
