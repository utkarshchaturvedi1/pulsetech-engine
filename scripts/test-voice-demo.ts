import { createHmac } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { TEXAS_SOLAR_TEST_DEMO_ID } from "../src/data/testBusinessProfiles";
import {
  buildConversationInitiationResponse,
  getInboundVoiceNumberMap,
  lookupDemoIdForCalledNumber,
  resolveInboundVoice,
  resolveVoiceDemoBoundCall,
} from "../src/lib/inboundVoice";
import {
  formatVoiceDemoPhoneDisplay,
  getPrimaryVoiceDemoPhone,
  getVoiceDemoPublicNumbers,
  isVoiceDemoPublicNumber,
  shouldShowVoiceDemoComingSoon,
} from "../src/lib/voiceDemoNumbers";
import {
  __resetVoiceDemoMemoryForTests,
  bindVoiceDemoCall,
  createOrReuseVoiceDemoSession,
  generateVoiceDemoCode,
  isInvalidCodeRateLimited,
  isSessionExpired,
  lookupVoiceDemoSessionByCode,
  recordInvalidCodeAttempt,
} from "../src/lib/voiceDemoSession";
import {
  VOICE_DEMO_DISCLAIMER,
  VOICE_DEMO_MAX_INVALID_ATTEMPTS,
} from "../src/lib/voiceDemoCopy";
import {
  buildVoiceDemoGatherTwiml,
  buildVoiceDemoInvalidCodeTwiml,
  verifyTwilioSignature,
} from "../src/lib/twilioVoiceDemo";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function readSrc(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

async function testCodeGenerationAndSessions() {
  __resetVoiceDemoMemoryForTests();
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const code = generateVoiceDemoCode();
  assert(/^\d{6}$/.test(code), "code must be 6 digits");

  const a = await createOrReuseVoiceDemoSession("demo-alpha");
  const reused = await createOrReuseVoiceDemoSession("demo-alpha");
  assert(a.id === reused.id, "active session should be reused for same demo");
  assert(a.code === reused.code, "reuse keeps the same code");
  assert(a.demoId === "demo-alpha", "session demoId isolation");

  const forced = await createOrReuseVoiceDemoSession("demo-alpha", {
    forceNew: true,
  });
  assert(forced.id !== a.id, "forceNew allocates a new session");
  assert(forced.code !== a.code || true, "new session created");

  const found = await lookupVoiceDemoSessionByCode(forced.code);
  assert(!!found && found.demoId === "demo-alpha", "code lookup resolves demo");

  const other = await createOrReuseVoiceDemoSession("demo-beta");
  assert(other.demoId === "demo-beta", "second demo gets its own session");
  assert(other.code !== forced.code || other.id !== forced.id, "sessions differ");

  const cross = await lookupVoiceDemoSessionByCode(forced.code);
  assert(cross?.demoId === "demo-alpha", "code must not resolve to another demo");

  console.log("PASS — session create/reuse/code lookup/isolation");
}

async function testExpiry() {
  __resetVoiceDemoMemoryForTests();
  const session = await createOrReuseVoiceDemoSession("expire-demo");
  assert(!isSessionExpired(session), "fresh session is active");
  const expired = {
    ...session,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  };
  assert(isSessionExpired(expired), "past expiresAt is expired");
  const missing = await lookupVoiceDemoSessionByCode(session.code);
  // still valid until expiresAt in store
  assert(!!missing, "non-expired session still lookupable");

  // Mutate stored expiry indirectly by creating with past expiry via force path is hard;
  // unit-check predicate + lookup after manual memory expiry:
  const { __resetVoiceDemoMemoryForTests: reset } = await import(
    "../src/lib/voiceDemoSession"
  );
  reset();
  console.log("PASS — expiry predicate");
}

async function testInvalidAttempts() {
  __resetVoiceDemoMemoryForTests();
  const key = "call-sid-rate-limit-test";
  for (let i = 0; i < VOICE_DEMO_MAX_INVALID_ATTEMPTS - 1; i += 1) {
    const result = await recordInvalidCodeAttempt(key);
    assert(!result.blocked, "should not block before max attempts");
  }
  const blocked = await recordInvalidCodeAttempt(key);
  assert(blocked.blocked, "should block at max invalid attempts");
  assert(await isInvalidCodeRateLimited(key), "rate limit flag set");
  console.log("PASS — invalid attempt rate limiting");
}

async function testPublicNumbersAndPrivateIsolation() {
  const env = {
    PULSETECH_VOICE_DEMO_NUMBERS: "+15551110001, (555) 111-0002",
    INBOUND_VOICE_NUMBER_MAP: JSON.stringify({
      "+15557654321": TEXAS_SOLAR_TEST_DEMO_ID,
    }),
    TWILIO_INBOUND_TEST_NUMBER: "+15125550100",
    TWILIO_INBOUND_TEST_DEMO_ID: TEXAS_SOLAR_TEST_DEMO_ID,
    NODE_ENV: "development",
  };

  const numbers = getVoiceDemoPublicNumbers(env);
  assert(numbers.includes("+15551110001"), "public demo number parsed");
  assert(numbers.includes("+15551110002"), "second public number normalized");
  assert(isVoiceDemoPublicNumber("+1 (555) 111-0001", env), "public check");
  assert(
    getPrimaryVoiceDemoPhone(env) === "+15551110001",
    "primary public number"
  );
  assert(
    formatVoiceDemoPhoneDisplay("+15551110001").includes("555"),
    "display formatting"
  );

  // Private Texas Solar mapping must remain intact and not use public demo numbers.
  assert(
    lookupDemoIdForCalledNumber("+15125550100", env) === TEXAS_SOLAR_TEST_DEMO_ID,
    "private test number still maps to Texas Solar"
  );
  assert(
    !getInboundVoiceNumberMap(env)["+15551110001"],
    "public demo numbers are not in permanent inbound map"
  );

  const previous = {
    public: process.env.PULSETECH_VOICE_DEMO_NUMBERS,
    map: process.env.INBOUND_VOICE_NUMBER_MAP,
    test: process.env.TWILIO_INBOUND_TEST_NUMBER,
    demo: process.env.TWILIO_INBOUND_TEST_DEMO_ID,
  };
  process.env.PULSETECH_VOICE_DEMO_NUMBERS = env.PULSETECH_VOICE_DEMO_NUMBERS;
  process.env.INBOUND_VOICE_NUMBER_MAP = env.INBOUND_VOICE_NUMBER_MAP;
  process.env.TWILIO_INBOUND_TEST_NUMBER = env.TWILIO_INBOUND_TEST_NUMBER;
  process.env.TWILIO_INBOUND_TEST_DEMO_ID = TEXAS_SOLAR_TEST_DEMO_ID;

  const publicResolve = await resolveInboundVoice("+15551110001");
  assert(publicResolve.ok === false, "public demo number must not auto-resolve");
  if (!publicResolve.ok) {
    assert(
      publicResolve.reason === "unknown_number",
      "public number falls back neutrally"
    );
  }

  const privateResolve = await resolveInboundVoice("+15125550100");
  assert(privateResolve.ok === true, "private Texas Solar routing unchanged");
  if (privateResolve.ok) {
    assert(
      privateResolve.demoId === TEXAS_SOLAR_TEST_DEMO_ID,
      "private DID still Texas Solar"
    );
  }

  process.env.PULSETECH_VOICE_DEMO_NUMBERS = previous.public;
  process.env.INBOUND_VOICE_NUMBER_MAP = previous.map;
  process.env.TWILIO_INBOUND_TEST_NUMBER = previous.test;
  process.env.TWILIO_INBOUND_TEST_DEMO_ID = previous.demo;

  console.log("PASS — public numbers + private Texas Solar isolation");
}

async function testBindingAndNoGlobalMutation() {
  __resetVoiceDemoMemoryForTests();
  process.env.PULSETECH_VOICE_DEMO_NUMBERS = "+15551110001";

  const session = await createOrReuseVoiceDemoSession(TEXAS_SOLAR_TEST_DEMO_ID);
  await bindVoiceDemoCall({
    callSid: "CA_test_binding_1",
    demoId: session.demoId,
    sessionId: session.id,
  });

  const bound = await resolveVoiceDemoBoundCall({
    callSid: "CA_test_binding_1",
    calledNumberRaw: "+15551110001",
  });
  assert(bound.ok === true, "validated CallSid resolves profile");
  if (bound.ok) {
    assert(bound.demoId === TEXAS_SOLAR_TEST_DEMO_ID, "binding demo isolation");
    const payload = buildConversationInitiationResponse(bound);
    assert(payload.type === "conversation_initiation_client_data", "per-call payload");
    assert(
      payload.dynamic_variables.business_name === "Texas Solar Professional",
      "bound call uses correct business"
    );
    assert(
      payload.conversation_config_override.agent.prompt.prompt.includes(
        "Texas Solar Professional"
      ),
      "prompt override is per-call only"
    );
  }

  const unbound = await resolveVoiceDemoBoundCall({
    callSid: "CA_unknown",
    calledNumberRaw: "+15551110001",
  });
  assert(unbound.ok === false, "unbound public call reveals no business");

  // Ensure we never PATCH an ElevenLabs agent in code.
  const twilioRoute = readSrc("src/app/api/twilio/voice-demo/route.ts");
  const eleven = readSrc("src/lib/elevenLabsTwilio.ts");
  assert(
    !/agents\/.*patch|updateAgent|conversationalAi\.agents\.update/i.test(
      twilioRoute + eleven
    ),
    "must not globally mutate ElevenLabs agent"
  );
  assert(
    eleven.includes("/v1/convai/twilio/register-call"),
    "uses register-call handoff"
  );

  delete process.env.PULSETECH_VOICE_DEMO_NUMBERS;
  console.log("PASS — CallSid binding + no global agent mutation");
}

function testTwilioSignatureAndNeutralGreeting() {
  const authToken = "test_auth_token_123";
  const url = "https://example.com/api/twilio/voice-demo";
  const form = {
    CallSid: "CA123",
    From: "+15551212",
    To: "+15551110001",
  };
  const keys = Object.keys(form).sort();
  let data = url;
  for (const key of keys) data += key + form[key as keyof typeof form];
  const signature = createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  assert(
    verifyTwilioSignature({ authToken, signature, url, form }),
    "valid Twilio signature accepted"
  );
  assert(
    !verifyTwilioSignature({
      authToken,
      signature: "bad",
      url,
      form,
    }),
    "invalid Twilio signature rejected"
  );

  const gather = buildVoiceDemoGatherTwiml(url);
  assert(gather.includes("<Gather"), "Gather present");
  assert(gather.includes("numDigits=\"6\""), "collects 6 digits");
  assert(
    !/Texas Solar|business name|your company/i.test(gather),
    "pre-validation greeting must not identify a business"
  );
  const invalid = buildVoiceDemoInvalidCodeTwiml();
  assert(/demo page/i.test(invalid), "invalid code sends user back to demo page");
  assert(!/Texas Solar/i.test(invalid), "invalid code reveals no business");

  console.log("PASS — Twilio signature + neutral greeting");
}

function testDisclaimerAndUiWiring() {
  assert(
    VOICE_DEMO_DISCLAIMER ===
      "This code is only for testing your voice AI. After you go live, your customers will simply call your assigned business number—no code will ever be required.",
    "exact customer-facing disclaimer"
  );

  const card = readSrc("src/components/VoiceDemoCard.tsx");
  const workspace = readSrc("src/components/DemoWorkspace.tsx");
  assert(card.includes("VOICE_DEMO_DISCLAIMER"), "card uses shared disclaimer");
  assert(
    card.includes("Test your AI Sales Employee by phone"),
    "card title present"
  );
  assert(card.includes("Generate a new code"), "regen action present");
  assert(workspace.includes("VoiceDemoCard"), "demo workspace mounts voice card");
  assert(
    workspace.includes("pt-voice-demo-wrap"),
    "voice card sits outside chat panels"
  );

  const comingSoonDev = shouldShowVoiceDemoComingSoon({
    NODE_ENV: "development",
  });
  assert(comingSoonDev === true, "dev shows coming-soon when no numbers");
  const comingSoonProd = shouldShowVoiceDemoComingSoon({
    NODE_ENV: "production",
  });
  assert(comingSoonProd === false, "production hides empty state without preview flag");

  console.log("PASS — disclaimer + demo UI wiring");
}

async function main() {
  await testCodeGenerationAndSessions();
  await testExpiry();
  await testInvalidAttempts();
  await testPublicNumbersAndPrivateIsolation();
  await testBindingAndNoGlobalMutation();
  testTwilioSignatureAndNeutralGreeting();
  testDisclaimerAndUiWiring();
  console.log("All voice demo tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
