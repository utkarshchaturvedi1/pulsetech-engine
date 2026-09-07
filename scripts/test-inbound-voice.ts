import { config } from "dotenv";
config({ path: ".env.local" });

import { TEXAS_SOLAR_TEST_DEMO_ID } from "../src/data/testBusinessProfiles";
import {
  buildConversationInitiationResponse,
  getInboundVoiceNumberMap,
  lookupDemoIdForCalledNumber,
  resolveInboundVoice,
} from "../src/lib/inboundVoice";
import {
  evaluatePhoneLeadAlert,
  extractPhoneLead,
} from "../src/lib/phoneLead";

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

async function main() {
  await testNumberMapping();
  testLeadAlerts();
  console.log("All inbound voice tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
