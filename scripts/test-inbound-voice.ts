import { config } from "dotenv";
config({ path: ".env.local" });

import { TEXAS_SOLAR_TEST_DEMO_ID } from "../src/data/testBusinessProfiles";
import {
  buildConversationInitiationResponse,
  buildInboundVoicePrompt,
  getInboundVoiceNumberMap,
  lookupDemoIdForCalledNumber,
  resolveInboundVoice,
} from "../src/lib/inboundVoice";
import {
  buildPhoneLeadEmail,
  buildPhoneLeadSms,
  evaluatePhoneLeadAlert,
  extractPhoneLead,
} from "../src/lib/phoneLead";
import { PREFERRED_TIME_TEAM_ALERT_ACK } from "../src/lib/schedulingPolicy";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function testNumberMapping() {
  const env = {
    INBOUND_VOICE_NUMBER_MAP: JSON.stringify({
      "+15557654321": TEXAS_SOLAR_TEST_DEMO_ID,
      "214-555-0199": "other-client",
    }),
    TWILIO_INBOUND_TEST_NUMBER: "(512) 555-0100",
    TWILIO_INBOUND_TEST_DEMO_ID: TEXAS_SOLAR_TEST_DEMO_ID,
  };

  const map = getInboundVoiceNumberMap(env);
  assert(
    map["+15557654321"] === TEXAS_SOLAR_TEST_DEMO_ID,
    "JSON map should resolve E.164 test number"
  );
  assert(
    map["+12145550199"] === "other-client",
    "JSON map should normalize US local numbers"
  );
  assert(
    lookupDemoIdForCalledNumber("5125550100", env) === TEXAS_SOLAR_TEST_DEMO_ID,
    "TWILIO_INBOUND_TEST_NUMBER should map to Texas Solar test demo"
  );
  assert(
    lookupDemoIdForCalledNumber("+19998887777", env) === "",
    "unknown number must not map to a demo"
  );

  const previousMap = process.env.INBOUND_VOICE_NUMBER_MAP;
  const previousTest = process.env.TWILIO_INBOUND_TEST_NUMBER;
  const previousDemo = process.env.TWILIO_INBOUND_TEST_DEMO_ID;
  process.env.INBOUND_VOICE_NUMBER_MAP = env.INBOUND_VOICE_NUMBER_MAP;
  process.env.TWILIO_INBOUND_TEST_NUMBER = env.TWILIO_INBOUND_TEST_NUMBER;
  process.env.TWILIO_INBOUND_TEST_DEMO_ID = TEXAS_SOLAR_TEST_DEMO_ID;

  const resolved = await resolveInboundVoice("+1 (555) 765-4321");
  assert(resolved.ok === true, "mapped number must resolve");
  if (resolved.ok) {
    assert(resolved.demoId === TEXAS_SOLAR_TEST_DEMO_ID, "demo id mismatch");
    assert(
      resolved.demo.profile.businessName === "Texas Solar Professional",
      "must load Texas Solar Professional test profile"
    );
    assert(
      resolved.demo.profile.isTestData === true,
      "test profile must be marked test data"
    );
    const payload = buildConversationInitiationResponse(resolved);
    assert(payload.dynamic_variables.profile_ready === true, "profile_ready");
    assert(
      payload.dynamic_variables.business_name === "Texas Solar Professional",
      "dynamic business name"
    );
    assert(
      payload.conversation_config_override.agent.first_message.includes(
        "Texas Solar Professional"
      ),
      "first message must use the resolved business"
    );
    assert(
      payload.conversation_config_override.agent.prompt.prompt.includes(
        "You are not PulseTech. You are not Peter."
      ),
      "voice prompt must forbid Peter identity"
    );
    assert(
      payload.conversation_config_override.agent.prompt.prompt.includes(
        "preferred_visit_time"
      ),
      "voice prompt must capture preferred visit time"
    );
    assert(
      payload.conversation_config_override.agent.prompt.prompt.includes(
        "Never claim an appointment is booked"
      ),
      "voice prompt must forbid booking claims"
    );
    assert(
      payload.conversation_config_override.agent.prompt.prompt.includes(
        PREFERRED_TIME_TEAM_ALERT_ACK
      ),
      "voice and website must share no-confirmation immediate-response wording"
    );
  }

  const unknown = await resolveInboundVoice("+19998887777");
  assert(unknown.ok === false, "unknown number must fail");
  if (!unknown.ok) {
    assert(unknown.reason === "unknown_number", "fallback reason");
    const payload = buildConversationInitiationResponse(unknown);
    assert(payload.dynamic_variables.profile_ready === false, "must not be ready");
    assert(
      payload.dynamic_variables.business_name === "",
      "must not fill another business name"
    );
    assert(
      !payload.conversation_config_override.agent.first_message.includes(
        "Texas Solar"
      ),
      "fallback must not speak as Texas Solar"
    );
    assert(
      !payload.conversation_config_override.agent.prompt.prompt.includes(
        "Texas Solar Professional"
      ),
      "fallback prompt must not include a client profile"
    );
  }

  process.env.INBOUND_VOICE_NUMBER_MAP = previousMap;
  process.env.TWILIO_INBOUND_TEST_NUMBER = previousTest;
  process.env.TWILIO_INBOUND_TEST_DEMO_ID = previousDemo;

  console.log("PASS — number → business profile mapping");
  console.log("PASS — unknown number fails safely");
}

function testLeadAlerts() {
  const secured = extractPhoneLead(
    {
      full_name: "Maya Chen",
      phone_number: "5125550198",
      service_address: "100 Congress Ave, Austin TX",
      service_needed: "Residential solar panel installation",
      callback_requested: "no",
    },
    { businessName: "Texas Solar Professional", demoId: "texassolar", isTestData: true }
  );
  const securedAlert = evaluatePhoneLeadAlert(secured);
  assert(securedAlert.qualified === true, "secured lead should qualify");
  assert(securedAlert.alertKind === "lead", "normal lead alert state");
  assert(securedAlert.lead.callbackRequested === false, "not a callback");
  assert(securedAlert.lead.preferredVisitTime === "", "no preference supplied");
  const securedEmail = buildPhoneLeadEmail(secured, "lead");
  const securedSms = buildPhoneLeadSms(secured, "lead");
  assert(
    !securedEmail.text.includes("Preferred visit time"),
    "email without preference must keep existing body"
  );
  assert(
    !securedSms.includes("Preferred visit time"),
    "sms without preference must keep existing body"
  );

  const withPreference = extractPhoneLead(
    {
      full_name: "Maya Chen",
      phone_number: "5125550198",
      service_address: "100 Congress Ave, Austin TX",
      service_needed: "Residential solar panel installation",
      preferred_visit_time: "tomorrow morning",
    },
    { businessName: "Texas Solar Professional" }
  );
  assert(
    withPreference.preferredVisitTime === "tomorrow morning",
    "preferred_visit_time data collection field"
  );
  const preferenceEmail = buildPhoneLeadEmail(withPreference, "lead");
  const preferenceSms = buildPhoneLeadSms(withPreference, "lead");
  assert(
    preferenceEmail.text.includes("Preferred visit time: tomorrow morning"),
    "email must include preferred visit time"
  );
  assert(
    preferenceSms.includes("Preferred visit time: tomorrow morning"),
    "sms must include preferred visit time"
  );

  const fromTranscript = extractPhoneLead(
    {
      full_name: "Maya Chen",
      phone_number: "5125550198",
      service_address: "100 Congress Ave, Austin TX",
      service_needed: "Residential solar panel installation",
    },
    {
      businessName: "Texas Solar Professional",
      transcriptText: "Can they come tomorrow morning?",
    }
  );
  assert(
    fromTranscript.preferredVisitTime.toLowerCase().includes("tomorrow morning"),
    "visit-time question with a stated slot must capture preferred_visit_time"
  );
  assert(
    fromTranscript.urgency === "SOON",
    `tomorrow should be SOON urgency, got ${fromTranscript.urgency}`
  );

  const urgentVoice = extractPhoneLead(
    {
      full_name: "Maya Chen",
      phone_number: "5125550198",
      service_address: "100 Congress Ave, Austin TX",
      service_needed: "Residential solar panel installation",
    },
    {
      businessName: "Texas Solar Professional",
      transcriptText: "Can you come today? I need this as soon as possible.",
    }
  );
  assert(urgentVoice.urgency === "IMMEDIATE", "urgent wording must set IMMEDIATE");
  const urgentEmail = buildPhoneLeadEmail(urgentVoice, "lead");
  const urgentSms = buildPhoneLeadSms(urgentVoice, "lead");
  assert(/URGENT PulseTech Phone Lead/.test(urgentEmail.subject), "urgent phone email");
  assert(/Urgency: IMMEDIATE/.test(urgentEmail.text), "phone email urgency field");
  assert(/URGENT PulseTech phone lead/.test(urgentSms), "urgent phone sms");
  assert(
    !/arrange payment|pay now/i.test(urgentEmail.text),
    "phone alert must not collect payment"
  );

  const askOnly = extractPhoneLead(
    {
      full_name: "Maya Chen",
      phone_number: "5125550198",
      service_address: "100 Congress Ave, Austin TX",
      service_needed: "Residential solar panel installation",
    },
    {
      businessName: "Texas Solar Professional",
      transcriptText: "When will they visit?",
    }
  );
  assert(
    askOnly.preferredVisitTime === "",
    "availability question without a slot must not invent a preference"
  );

  const callback = extractPhoneLead(
    {
      full_name: "Maya Chen",
      phone_number: "5125550198",
      callback_requested: true,
      callback_notes: "After 5pm",
    },
    {
      businessName: "Texas Solar Professional",
      transcriptText: "Please call me back this evening.",
    }
  );
  const callbackAlert = evaluatePhoneLeadAlert(callback);
  assert(callbackAlert.qualified === true, "callback should qualify");
  assert(callbackAlert.alertKind === "callback", "callback alert state");
  assert(callbackAlert.lead.callbackRequested === true, "callback flag");

  const transcriptOnly = extractPhoneLead(
    {
      name: "Sam",
      phone: "2145550101",
    },
    {
      businessName: "Texas Solar Professional",
      transcriptText: "Can you call me back tomorrow morning?",
    }
  );
  const transcriptAlert = evaluatePhoneLeadAlert(transcriptOnly);
  assert(
    transcriptAlert.alertKind === "callback",
    "explicit callback language in transcript should create callback alert"
  );

  console.log("PASS — normal secured lead creates normal lead alert state");
  console.log("PASS — explicit callback request creates callback alert state");
}

function testLeadFlowUnchanged() {
  const prompt = buildInboundVoicePrompt({
    website: "https://texassolar.pro",
    businessName: "Texas Solar Professional",
    tagline: "TEST DATA",
    logo: "",
    primaryColor: "",
    secondaryColor: "",
    phone: "",
    email: "",
    address: "",
    services: ["Residential solar panel installation"],
    serviceAreas: ["Austin"],
    faqs: [],
    leadQuestions: [],
    systemPrompt: "",
    isTestData: true,
  });

  assert(prompt.includes("Ask one question at a time."), "one question at a time");
  assert(
    /need already known,\s*then name,\s*then phone,\s*then service address/i.test(
      prompt
    ),
    "lead-capture order must stay need → name → phone → address"
  );
  assert(
    prompt.includes(
      "Do not ask about appointment times, dates, or preferred visit slots until name, phone, and service address"
    ),
    "extra details must wait until after lead capture"
  );
  assert(prompt.includes("Never invent availability"), "no invented availability");
  assert(
    prompt.includes("next week, 2–4 weeks, or later"),
    "explicitly forbid invented future ranges"
  );
  assert(
    prompt.includes(PREFERRED_TIME_TEAM_ALERT_ACK),
    "same immediate-response wording as website chat"
  );
  assert(
    prompt.includes("at most once"),
    "voice fee mention at most once"
  );

  const incomplete = evaluatePhoneLeadAlert(
    extractPhoneLead(
      {
        full_name: "Maya Chen",
        phone_number: "5125550198",
        service_needed: "Residential solar panel installation",
      },
      { businessName: "Texas Solar Professional" }
    )
  );
  assert(
    incomplete.qualified === false && incomplete.alertKind === "none",
    "missing address must not create a lead alert"
  );

  const withoutExtras = evaluatePhoneLeadAlert(
    extractPhoneLead(
      {
        full_name: "Maya Chen",
        phone_number: "5125550198",
        service_address: "100 Congress Ave, Austin TX",
        service_needed: "Residential solar panel installation",
      },
      { businessName: "Texas Solar Professional" }
    )
  );
  assert(
    withoutExtras.qualified === true && withoutExtras.alertKind === "lead",
    "need + name + phone + address must still create the internal alert"
  );
  assert(
    withoutExtras.lead.preferredVisitTime === "",
    "extra details remain optional"
  );

  const withExtras = evaluatePhoneLeadAlert(
    extractPhoneLead(
      {
        full_name: "Maya Chen",
        phone_number: "5125550198",
        service_address: "100 Congress Ave, Austin TX",
        service_needed: "Residential solar panel installation",
        preferred_visit_time: "Friday afternoon",
        extra_details: "steep roof",
      },
      { businessName: "Texas Solar Professional" }
    )
  );
  assert(
    withExtras.qualified === true && withExtras.alertKind === "lead",
    "extra details after address must not change the internal alert kind"
  );
  assert(
    withExtras.lead.preferredVisitTime === "Friday afternoon",
    "extra details may be attached without replacing lead fields"
  );

  console.log(
    "PASS — lead flow unchanged: need → name → phone → address → extra details → internal alert"
  );
}

async function main() {
  await testNumberMapping();
  testLeadAlerts();
  testLeadFlowUnchanged();
  console.log("All inbound voice tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
