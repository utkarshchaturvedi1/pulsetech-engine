import { config } from "dotenv";
config({ path: ".env.local" });

import {
  generateSimpleSalesReply,
  setSimpleSalesTestModel,
  type SimpleSalesMessage,
} from "../src/lib/salesEmployeeSimple";
import { setLeadHandoffTestDelivery } from "../src/lib/leadHandoff";
import { businessIdentityKey, createInitialSalesState, type SalesState } from "../src/lib/salesState";
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
  systemPrompt: "",
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
  assert(!latestInstructions.includes("new solar system, batteries, or maintenance"), "the configured extra questionnaire is not passed to the assistant");

  messages = [...messages, { role: "assistant", content: result.reply }, { role: "user", content: "UTK" }];
  modelReply = "Thanks, UTK. What’s the best phone number for the team to reach you?";
  result = await generateSimpleSalesReply(business, messages, state);
  state = result.salesState;
  assert(state.lead.name === "UTK", "name is captured");
  assert(/phone number/i.test(result.reply), "phone is the next field");
  assert(!/email/i.test(result.reply), "the customer is not asked for an email address");

  messages = [...messages, { role: "assistant", content: result.reply }, { role: "user", content: "+1 202 555 0123" }];
  modelReply = "Thanks. What’s the service address?";
  result = await generateSimpleSalesReply(business, messages, state);
  state = result.salesState;
  assert(state.lead.phone === "+1 202 555 0123", "phone is captured");
  assert(/service address/i.test(result.reply), "address is the next field");

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
  assert(deliveryCalls[0].smsBody.includes("+1 202 555 0123"), "SMS includes the captured phone number");

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
