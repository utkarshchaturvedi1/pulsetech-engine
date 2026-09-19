import { config } from "dotenv";
config({ path: ".env.local" });

// CRITICAL: automated tests must never send real SMTP email.
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import { readFileSync } from "fs";
import path from "path";
import type { BusinessProfile } from "../src/types/business";
import {
  applyLeadDeliveryResult,
  buildLeadNotificationEmail,
  evaluateHandoffReadiness,
  formatPrimaryNeedForAlert,
  publicHandoffDecisionLog,
  isClosureHandoffTrigger,
  isLeadHandoffDryRun,
  isLeadQualified,
  isLeadReadyForHandoff,
  maybeSendLeadHandoff,
  scheduleLeadAlertDelivery,
  setLeadHandoffTestDelivery,
  shouldAttemptLeadHandoff,
  buildWebsiteLeadSms,
} from "../src/lib/leadHandoff";
import {
  SITE_ASSESSMENT_TEAM_ALERT_ASK,
  buildQueuedLeadHandoffCustomerMessage,
  buildSuccessfulLeadHandoffCustomerMessage,
  extractPreferredVisitTimeFromText,
  resolveWebsiteChatCustomerHandoffReply,
} from "../src/lib/schedulingPolicy";
import {
  createCustomerChatSession,
} from "../src/lib/customerChatClient";
import {
  detectCustomerAgreement,
  isFieldConfirmationReply,
  updateSalesStateFromTurn,
  validateSalesReply,
} from "../src/lib/salesController";
import {
  businessIdentityKey,
  createConversationId,
  createInitialSalesState,
  type SalesState,
} from "../src/lib/salesState";

const business: BusinessProfile = {
  website: "https://example-services.test",
  businessName: "Summit Home Services",
  tagline: "",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  phone: "(512) 555-0142",
  email: "hello@summit.test",
  address: "",
  services: ["Drain clearing", "Emergency service", "Estimates"],
  serviceAreas: ["Dallas"],
  faqs: [],
  leadQuestions: [],
  systemPrompt: "Long owner prompt that must NOT appear in the email dump.",
  leadNotificationEmail: "owner@summit.test",
  leadNotificationPhone: "+15125550142",
};

const businessB: BusinessProfile = {
  ...business,
  website: "https://autreys-plumbing.test",
  businessName: "Autrey's Plumbing LLC",
  leadNotificationEmail: "owner@autrey.test",
  leadNotificationPhone: "+12145550189",
};

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function qualifiedBase(overrides: Partial<SalesState> = {}): SalesState {
  const conversationId = overrides.conversationId || createConversationId();
  const businessKey =
    overrides.businessKey || businessIdentityKey(business);
  return {
    ...createInitialSalesState({ conversationId, businessKey }),
    intent: "HIGH",
    leadStatus: "SECURED",
    currentObjective: "PRESENT_SOLUTION",
    salesStage: "SALES_MODE",
    lead: {
      name: "Jack",
      phone: "3333333333",
      email: null,
      address: "1500 Marilla St, Dallas TX 75201",
    },
    customerNeed: "My kitchen sink is clogged.",
    urgency: "NONE",
    leadDeliveryStatus: "NOT_SENT",
    handoffReady: false,
    customerAgreed: false,
    ...overrides,
    conversationId,
    businessKey,
  };
}

function applyTurn(state: SalesState, user: string, assistantHint?: string): SalesState {
  const messages = [
    { role: "assistant" as const, content: assistantHint || "How can I help?" },
    { role: "user" as const, content: user },
  ];
  const next = updateSalesStateFromTurn(state, messages, business);
  return {
    ...next,
    conversationId: state.conversationId,
    businessKey: state.businessKey,
  };
}

async function main() {
  assert(isLeadHandoffDryRun(), "G: dry-run must be enabled for this script");

  // -------- Isolation A: conversation ID --------
  const session1 = createCustomerChatSession(business);
  const session2 = createCustomerChatSession(business);
  assert(!!session1.conversationId, "A: session has conversationId");
  assert(session1.conversationId !== session2.conversationId, "A: unique ids");
  assert(session1.conversationId === session1.conversationId, "A: stable id");
  console.log("A PASS — conversation IDs unique and stable");

  // -------- Isolation B/C: business switch resets session --------
  const sessionA = createCustomerChatSession(business);
  const idA = sessionA.conversationId;
  const keyA = sessionA.businessKey;
  sessionA.destroy();
  const sessionB = createCustomerChatSession(businessB);
  assert(sessionB.conversationId !== idA, "B/C: new conversation after switch");
  assert(sessionB.businessKey !== keyA, "B: different business key");
  assert(sessionB.businessKey === businessIdentityKey(businessB), "B: bound to B");
  assert(!sessionA.isActive(), "C: old session inactive");
  console.log("B/C PASS — business isolation + session reset");

  // -------- Isolation D: timer cannot use destroyed session --------
  const timed = createCustomerChatSession(business);
  const timedId = timed.conversationId;
  timed.destroy();
  assert(!timed.isActive(), "D: destroyed");
  // Destroyed session must not schedule/send; clear is already done.
  timed.clearInactivityTimer();
  assert(timed.conversationId === timedId, "D: id immutable even after destroy");
  console.log("D PASS — timer isolation via destroy");

  // -------- TEST 1 — FALSE YES --------
  const standingWater = "Yes, there is standing water and it is urgent.";
  assert(!detectCustomerAgreement(standingWater), "TEST1: agreement false");
  let s1 = applyTurn(
    qualifiedBase({ urgency: "NONE" }),
    standingWater,
    "Is there standing water, an active leak, or sewage backup?"
  );
  assert(s1.customerAgreed === false, "TEST1: customerAgreed false");
  assert(
    !shouldAttemptLeadHandoff(s1, "closure", standingWater),
    "TEST1: no closure handoff"
  );
  assert(
    !shouldAttemptLeadHandoff(s1, "inactivity"),
    "TEST1: no inactivity without handoffReady"
  );
  console.log("TEST1 PASS", {
    agreed: s1.customerAgreed,
    handoffReady: s1.handoffReady,
    urgency: s1.urgency,
  });

  // -------- TEST 2 — ACCESS INFORMATION --------
  const pet = "Yes, I have a dog.";
  assert(!detectCustomerAgreement(pet), "TEST2: not agreement");
  let s2 = applyTurn(qualifiedBase(), pet, "Any access notes?");
  assert(s2.customerAgreed === false, "TEST2: not agreed");
  assert(!isClosureHandoffTrigger(s2), "TEST2: not closure trigger");
  assert(!shouldAttemptLeadHandoff(s2, "closure", pet), "TEST2: no email");
  console.log("TEST2 PASS", { agreed: s2.customerAgreed, ready: s2.handoffReady });

  // -------- TEST 3 — GENUINE CLOSURE (dry-run SMTP) --------
  const closeMsg = "Yes, let's do it.";
  assert(detectCustomerAgreement(closeMsg), "TEST3: agreement true");
  let s3 = applyTurn(
    qualifiedBase({ preferredTiming: "tomorrow morning" }),
    closeMsg,
    "Would you like to move forward?"
  );
  assert(s3.customerAgreed === true, "TEST3: customerAgreed");
  assert(s3.handoffReady === true, "TEST3: handoffReady");
  assert(isLeadReadyForHandoff(s3), "TEST3: ready for handoff");
  assert(shouldAttemptLeadHandoff(s3, "closure", closeMsg), "TEST3: closure attempt");
  const closeSend = await maybeSendLeadHandoff(business, s3, "closure", closeMsg);
  assert(closeSend.attempted === true, "TEST3: attempted");
  assert(closeSend.status === "SENT", "TEST3: dry-run SENT");
  console.log("TEST3 PASS", {
    agreed: s3.customerAgreed,
    ready: s3.handoffReady,
    status: closeSend.status,
    dryRun: true,
  });

  // -------- TEST 4 — PREFERRED TIME COMPLETES HANDOFF READINESS --------
  let s4 = qualifiedBase({ handoffReady: false });
  assert(isLeadQualified(s4), "TEST4: qualified");
  assert(!isLeadReadyForHandoff(s4), "TEST4: not handoff ready while gathering");
  assert(
    !shouldAttemptLeadHandoff(s4, "closure"),
    "TEST4: no auto-handoff before preferred time"
  );
  s4 = applyTurn(s4, "I need someone today.", "Want an inspection?");
  assert(!!s4.preferredTiming, "TEST4: preferred time captured");
  assert(isLeadReadyForHandoff(s4), "TEST4: ready after preferred time");
  assert(
    shouldAttemptLeadHandoff(s4, "closure", "I need someone today."),
    "TEST4: auto-handoff after name/phone/address/preferred time"
  );
  console.log("TEST4 PASS", { ready: s4.handoffReady, urgency: s4.urgency });

  // -------- TEST 5 — HANDOFF READY + INACTIVITY --------
  const s5 = qualifiedBase({
    handoffReady: true,
    customerAgreed: false,
    currentObjective: "CLOSE",
    salesStage: "COMPLETED",
    preferredTiming: "today",
    urgency: "IMMEDIATE",
  });
  const s5b = applyTurn(
    qualifiedBase({
      urgency: "IMMEDIATE",
      preferredTiming: "today",
      customerAvailable: true,
      establishedFacts: [
        "name=Jack",
        "phone=3333333333",
        "address=1500 Marilla St, Dallas TX 75201",
        "Customer stated urgency: IMMEDIATE",
        "preferredTiming=today",
        "Customer indicated someone will be available",
        "Customer mentioned a dog",
      ],
    }),
    "No, I think I have it all covered."
  );
  assert(s5b.handoffReady === true, "TEST5: handoffReady after finished");
  assert(shouldAttemptLeadHandoff(s5b, "inactivity"), "TEST5: inactivity allowed");
  assert(shouldAttemptLeadHandoff(s5, "inactivity"), "TEST5: explicit ready inactivity");
  console.log("TEST5 PASS", { ready: s5b.handoffReady });

  // -------- TEST 6 — ACTIVE QUESTION + INACTIVITY --------
  const s6 = qualifiedBase({
    handoffReady: false,
    currentObjective: "PRESENT_SOLUTION",
  });
  assert(isLeadQualified(s6), "TEST6: still qualified");
  assert(!s6.handoffReady, "TEST6: not ready");
  assert(!shouldAttemptLeadHandoff(s6, "inactivity"), "TEST6: no inactivity send");
  console.log("TEST6 PASS");

  // -------- TEST 7 — DUPLICATE PREVENTION --------
  const s7 = qualifiedBase({
    customerAgreed: true,
    handoffReady: true,
    currentObjective: "CLOSE",
    leadDeliveryStatus: "SENT",
  });
  const dup1 = await maybeSendLeadHandoff(business, s7, "closure", "Yes, let's do it.");
  const dup2 = await maybeSendLeadHandoff(business, s7, "inactivity");
  assert(dup1.attempted === false && dup1.status === "SENT", "TEST7: no dup closure");
  assert(dup2.attempted === false && dup2.status === "SENT", "TEST7: no dup idle");
  console.log("TEST7 PASS");

  // -------- TEST 8 — LATEST INFORMATION IN EMAIL --------
  const rich = qualifiedBase({
    urgency: "IMMEDIATE",
    preferredTiming: "today",
    customerAvailable: true,
    customerAgreed: true,
    handoffReady: true,
    currentObjective: "CLOSE",
    establishedFacts: [
      "name=Jack",
      "phone=3333333333",
      "address=1500 Marilla St, Dallas TX 75201",
      "Customer stated urgency: IMMEDIATE",
      "preferredTiming=today",
      "Customer indicated someone will be available",
      "Customer mentioned a dog",
    ],
  });
  const email = buildLeadNotificationEmail(business, rich);
  assert(email.text.includes("clogged"), "TEST8: need");
  assert(email.text.includes("IMMEDIATE"), "TEST8: urgency");
  assert(/URGENT PulseTech Website Lead/.test(email.subject), "TEST8: urgent subject");
  assert(email.text.includes("today"), "TEST8: timing");
  assert(/dog|available|home/i.test(email.text), "TEST8: accumulated details");
  assert(!email.text.includes("Services on file"), "TEST8: no services dump");
  assert(!email.text.includes("Long owner prompt"), "TEST8: no prompt dump");
  assert(!email.text.includes("Lead notification emailed"), "TEST8: no false sent claim");
  const preferredNext = buildLeadNotificationEmail(
    business,
    qualifiedBase({
      preferredTiming: "tomorrow morning",
      handoffReady: true,
      urgency: "SOON",
    })
  );
  assert(
    preferredNext.text.includes(
      "Contact the customer to confirm availability for their preferred time. The requested time has not been confirmed or booked with the customer."
    ),
    "TEST8: internal NEXT STEP preferred-time wording"
  );
  console.log("TEST8 PASS");

  // Immediate visit-preference alert after lead capture (not inactivity).
  const visitPref = qualifiedBase({
    handoffReady: false,
    currentObjective: "PRESENT_SOLUTION",
  });
  assert(
    shouldAttemptLeadHandoff(visitPref, "closure", "Can you come tomorrow?"),
    "TEST9: tomorrow visit request alerts immediately"
  );
  assert(
    shouldAttemptLeadHandoff(
      visitPref,
      "closure",
      "Can you come today? I need this as soon as possible."
    ),
    "TEST9: urgent wording alerts immediately"
  );
  assert(
    !shouldAttemptLeadHandoff(visitPref, "inactivity"),
    "TEST9: inactivity still requires handoffReady"
  );
  console.log("TEST9 PASS");

  // TEST10 — visitor chat must not wait for SMTP/SMS; missing Twilio must not block email.
  const previousDryRun = process.env.LEAD_HANDOFF_DRY_RUN;
  const previousTwilio = {
    sid: process.env.TWILIO_ACCOUNT_SID,
    token: process.env.TWILIO_AUTH_TOKEN,
    from: process.env.TWILIO_FROM_NUMBER,
  };
  const previousSmtp = {
    host: process.env.SMTP_HOST,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  };
  delete process.env.LEAD_HANDOFF_DRY_RUN;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
  process.env.SMTP_HOST = previousSmtp.host || "smtp.test.local";
  process.env.SMTP_USER = previousSmtp.user || "leads@test.local";
  process.env.SMTP_PASS = previousSmtp.pass || "test-pass";
  process.env.SMTP_FROM = previousSmtp.from || "leads@test.local";

  let deliveryFinished = false;
  setLeadHandoffTestDelivery(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    deliveryFinished = true;
    return { emailOk: true, smsOk: false };
  });
  const readyLead = qualifiedBase({
    preferredTiming: "tomorrow morning",
    handoffReady: true,
    currentObjective: "ADVANCE_TO_NEXT_STEP",
  });
  const detectStarted = Date.now();
  const detected = applyTurn(
    qualifiedBase({
      preferredTiming: null,
      handoffReady: false,
    }),
    "Can you come tomorrow morning?"
  );
  const leadDetectionMs = Date.now() - detectStarted;
  assert(!!detected.preferredTiming, "TEST10: preferred time captured");
  assert(isLeadReadyForHandoff(detected), "TEST10: lead ready after preferred time");

  const queued: Array<() => void | Promise<void>> = [];
  const vercelAfter = (task: () => void | Promise<void>) => {
    queued.push(task);
  };

  const sendStarted = Date.now();
  const smtpOnly = await maybeSendLeadHandoff(
    business,
    readyLead,
    "closure",
    "Can you come tomorrow morning?"
  );
  scheduleLeadAlertDelivery(vercelAfter, smtpOnly.delivery);
  const handoffMs = Date.now() - sendStarted;
  assert(smtpOnly.attempted === true, "TEST10: attempted");
  assert(smtpOnly.status === "QUEUED", "TEST10: live path queues delivery without waiting");
  assert(typeof smtpOnly.delivery === "function", "TEST10: delivery task is returned");
  assert(queued.length === 1, "TEST10: after() received the delivery task");
  assert(handoffMs < 400, `TEST10: response must not wait for delivery, took ${handoffMs}ms`);
  assert(!deliveryFinished, "TEST10: email/SMS not finished before the response");
  await queued[0]();
  assert(deliveryFinished, "TEST10: after() lifecycle awaited delivery to completion");
  setLeadHandoffTestDelivery(null);

  const chatRoute = readFileSync(
    path.join(process.cwd(), "src/app/api/chat/route.ts"),
    "utf8"
  );
  const inactivityRoute = readFileSync(
    path.join(process.cwd(), "src/app/api/lead-handoff/route.ts"),
    "utf8"
  );
  assert(
    /import \{ after, NextRequest, NextResponse \} from "next\/server"/.test(chatRoute),
    "TEST10: website chat must import after() from next/server"
  );
  assert(
    chatRoute.includes("scheduleLeadAlertDelivery(after, leadDelivery)"),
    "TEST10: website chat must schedule delivery with after()"
  );
  assert(
    /import \{ after, NextRequest, NextResponse \} from "next\/server"/.test(inactivityRoute),
    "TEST10: inactivity handoff must import after() from next/server"
  );
  assert(
    inactivityRoute.includes("scheduleLeadAlertDelivery(after, handoff.delivery)"),
    "TEST10: inactivity handoff must schedule delivery with after()"
  );

  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.SMTP_FROM;
  const none = await maybeSendLeadHandoff(
    business,
    readyLead,
    "closure",
    "Can you come tomorrow morning?"
  );
  assert(none.status === "FAILED", "TEST10: no SMTP and no Twilio → FAILED");

  if (previousDryRun === undefined) delete process.env.LEAD_HANDOFF_DRY_RUN;
  else process.env.LEAD_HANDOFF_DRY_RUN = previousDryRun;
  if (previousTwilio.sid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
  else process.env.TWILIO_ACCOUNT_SID = previousTwilio.sid;
  if (previousTwilio.token === undefined) delete process.env.TWILIO_AUTH_TOKEN;
  else process.env.TWILIO_AUTH_TOKEN = previousTwilio.token;
  if (previousTwilio.from === undefined) delete process.env.TWILIO_FROM_NUMBER;
  else process.env.TWILIO_FROM_NUMBER = previousTwilio.from;
  if (previousSmtp.host === undefined) delete process.env.SMTP_HOST;
  else process.env.SMTP_HOST = previousSmtp.host;
  if (previousSmtp.user === undefined) delete process.env.SMTP_USER;
  else process.env.SMTP_USER = previousSmtp.user;
  if (previousSmtp.pass === undefined) delete process.env.SMTP_PASS;
  else process.env.SMTP_PASS = previousSmtp.pass;
  if (previousSmtp.from === undefined) delete process.env.SMTP_FROM;
  else process.env.SMTP_FROM = previousSmtp.from;

  console.log("TEST10 PASS", { leadDetectionMs, handoffMs });

  // TEST11 — exact hornet-nest production regression:
  // request → address → yes please → name → phone → preferred time
  // must schedule exactly one email+SMS delivery task.
  {
    const previousDryRun11 = process.env.LEAD_HANDOFF_DRY_RUN;
    delete process.env.LEAD_HANDOFF_DRY_RUN;
    process.env.SMTP_HOST = process.env.SMTP_HOST || "smtp.test.local";
    process.env.SMTP_USER = process.env.SMTP_USER || "leads@test.local";
    process.env.SMTP_PASS = process.env.SMTP_PASS || "test-pass";
    process.env.SMTP_FROM = process.env.SMTP_FROM || "leads@test.local";
    process.env.TWILIO_ACCOUNT_SID =
      process.env.TWILIO_ACCOUNT_SID || "ACtest";
    process.env.TWILIO_AUTH_TOKEN =
      process.env.TWILIO_AUTH_TOKEN || "token";
    process.env.TWILIO_FROM_NUMBER =
      process.env.TWILIO_FROM_NUMBER || "+15551234567";

    const pestBusiness: BusinessProfile = {
      ...business,
      website: "https://pest-hornet.test",
      businessName: "Summit Pest Control",
      services: ["Pest control", "Hornet nest removal"],
      leadNotificationEmail: "owner@pest-hornet.test",
      leadNotificationPhone: "+12145550189",
    };

    let deliveries = 0;
    let lastDelivery: {
      emailTo: string;
      smsTo: string;
      subject: string;
      text: string;
      smsBody: string;
    } | null = null;
    setLeadHandoffTestDelivery(async (input) => {
      deliveries += 1;
      lastDelivery = input;
      return { emailOk: true, smsOk: true };
    });

    let hornet = createInitialSalesState({
      conversationId: createConversationId(),
      businessKey: businessIdentityKey(pestBusiness),
    });
    const steps: Array<{ user: string; assistant: string }> = [
      {
        assistant: "Hi! How can I help you today?",
        user: "I have a hornet nest on my house that needs to be removed",
      },
      {
        assistant: "What's the service address for the nest?",
        user: "510 N Ravinia Dr, Dallas TX 75211",
      },
      {
        assistant:
          "I'll alert the team to arrange a site assessment. Would you like to move forward?",
        user: "yes please",
      },
      {
        assistant: "Great — what's your name?",
        user: "Jordan Lee",
      },
      {
        assistant: "Thanks Jordan — what's the best phone number to reach you?",
        user: "2145550199",
      },
      {
        assistant:
          "What day or time would you prefer? The team will confirm availability.",
        user: "Tomorrow morning",
      },
    ];

    for (const step of steps) {
      hornet = updateSalesStateFromTurn(
        hornet,
        [
          { role: "assistant", content: step.assistant },
          { role: "user", content: step.user },
        ],
        pestBusiness
      );
    }

    assert(hornet.lead.name === "Jordan Lee", "TEST11: name captured");
    assert(!!hornet.lead.phone, "TEST11: phone captured");
    assert(!!hornet.lead.address, "TEST11: address captured");
    assert(/tomorrow morning/i.test(hornet.preferredTiming || ""), "TEST11: preferred time");
    assert(hornet.customerAgreed === true, "TEST11: yes please counted as agreement");
    assert(
      shouldAttemptLeadHandoff(hornet, "closure", "Tomorrow morning"),
      "TEST11: should attempt handoff"
    );

    const queued11: Array<() => void | Promise<void>> = [];
    const after11 = (task: () => void | Promise<void>) => {
      queued11.push(task);
    };

    const send1 = await maybeSendLeadHandoff(
      pestBusiness,
      hornet,
      "closure",
      "Tomorrow morning"
    );
    scheduleLeadAlertDelivery(after11, send1.delivery);
    assert(send1.attempted === true, "TEST11: handoffAttempted true");
    assert(send1.status === "QUEUED", "TEST11: handoff scheduled as QUEUED");
    assert(typeof send1.delivery === "function", "TEST11: delivery task returned");
    assert(queued11.length === 1, "TEST11: one after() task queued");
    assert(deliveries === 0, "TEST11: delivery not run before after()");

    await queued11[0]();
    assert(deliveries === 1, "TEST11: exactly one email+SMS delivery");
    assert(!!lastDelivery, "TEST11: delivery payload present");
    assert(
      lastDelivery!.emailTo === "owner@pest-hornet.test",
      "TEST11: per-business email recipient"
    );
    assert(
      lastDelivery!.smsTo === "+12145550189",
      "TEST11: per-business SMS recipient"
    );
    assert(/hornet/i.test(lastDelivery!.text), "TEST11: email includes need");
    assert(/hornet/i.test(lastDelivery!.smsBody), "TEST11: SMS includes need");

    const afterQueued = {
      ...hornet,
      leadDeliveryStatus: "QUEUED" as const,
    };
    const sendQueuedDup = await maybeSendLeadHandoff(
      pestBusiness,
      afterQueued,
      "closure",
      "Tomorrow morning"
    );
    assert(sendQueuedDup.attempted === false, "TEST11: queued duplicate prevented");

    const afterSend = {
      ...hornet,
      leadDeliveryStatus: "SENT" as const,
    };
    const send2 = await maybeSendLeadHandoff(
      pestBusiness,
      afterSend,
      "closure",
      "Tomorrow morning"
    );
    assert(send2.attempted === false, "TEST11: duplicate prevented");
    assert(deliveries === 1, "TEST11: still exactly one delivery");

    setLeadHandoffTestDelivery(null);
    if (previousDryRun11 === undefined) delete process.env.LEAD_HANDOFF_DRY_RUN;
    else process.env.LEAD_HANDOFF_DRY_RUN = previousDryRun11;
    console.log("TEST11 PASS — hornet-nest handoffAttempted with one email+SMS");
  }

  // TEST12 — same generic readiness across structurally different services (no service-specific rules).
  {
    const services: Array<{
      profile: BusinessProfile;
      need: string;
      name: string;
      phone: string;
      address: string;
      timing: string;
    }> = [
      {
        profile: {
          ...business,
          website: "https://northstar-hvac.test",
          businessName: "Northstar Climate",
          services: ["Heating repair", "Cooling maintenance"],
          leadNotificationEmail: "owner@northstar-hvac.test",
          leadNotificationPhone: "+15125550101",
        },
        need: "The indoor unit will not start and the house is getting too warm.",
        name: "Avery Chen",
        phone: "5125550101",
        address: "2200 Guadalupe St, Austin TX 78705",
        timing: "morning this weekend",
      },
      {
        profile: {
          ...business,
          website: "https://greenline-yards.test",
          businessName: "Greenline Yards",
          services: ["Lawn care", "Seasonal cleanup"],
          leadNotificationEmail: "owner@greenline-yards.test",
          leadNotificationPhone: "+15125550102",
        },
        need: "The front yard needs a seasonal cleanup and the hedge line is overgrown.",
        name: "Morgan Patel",
        phone: "5125550102",
        address: "88 Barton Springs Rd, Austin TX 78704",
        timing: "this weekend",
      },
      {
        profile: {
          ...business,
          website: "https://brightline-electric.test",
          businessName: "Brightline Electric",
          services: ["Outlet repair", "Panel inspection"],
          leadNotificationEmail: "owner@brightline-electric.test",
          leadNotificationPhone: "+15125550103",
        },
        need: "Two kitchen outlets have no power after a breaker reset.",
        name: "Riley Brooks",
        phone: "5125550103",
        address: "410 Congress Ave, Austin TX 78701",
        timing: "tomorrow afternoon",
      },
    ];

    const source = readFileSync(
      path.join(process.cwd(), "src/lib/leadHandoffShared.ts"),
      "utf8"
    );
    assert(
      !/\b(pools?|pest control|hornets?|plumbing|plumbers?)\b/i.test(source),
      "TEST12: readiness module must not contain service-specific keywords"
    );

    process.env.LEAD_HANDOFF_DRY_RUN = "true";
    let completedLeadTotalMs = 0;
    let completedLeadDetectionMs = 0;
    let completedLeadHandoffMs = 0;

    for (const sample of services) {
      const prior = qualifiedBase({
        lead: {
          name: sample.name,
          phone: sample.phone,
          email: null,
          address: sample.address,
        },
        customerNeed: sample.need,
        preferredTiming: null,
        handoffReady: false,
        customerAgreed: false,
        currentObjective: "ADVANCE_TO_NEXT_STEP",
      });
      const before = evaluateHandoffReadiness(prior);
      assert(before.handoffReady === false, `TEST12: not ready before timing (${sample.profile.businessName})`);
      assert(
        before.missingRequiredFields.includes("preferredTiming"),
        `TEST12: missing preferredTiming (${sample.profile.businessName})`
      );

      const detectStarted = Date.now();
      const after = updateSalesStateFromTurn(
        prior,
        [
          {
            role: "assistant",
            content: "What day or time would you prefer? The team will confirm availability.",
          },
          { role: "user", content: sample.timing },
        ],
        sample.profile
      );
      const leadDetectionMs = Date.now() - detectStarted;
      const decision = evaluateHandoffReadiness(after, sample.timing);
      assert(after.handoffReady === true, `TEST12: handoffReady (${sample.profile.businessName})`);
      assert(decision.handoffReady === true, `TEST12: central decision ready (${sample.profile.businessName})`);
      assert(decision.missingRequiredFields.length === 0, `TEST12: no missing fields (${sample.profile.businessName})`);
      assert(
        decision.visitorRequestedProceedOrCompleted === true,
        `TEST12: proceed/complete true (${sample.profile.businessName})`
      );
      assert(
        shouldAttemptLeadHandoff(after, "closure", sample.timing),
        `TEST12: should attempt (${sample.profile.businessName})`
      );

      const sendStarted = Date.now();
      const send = await maybeSendLeadHandoff(
        sample.profile,
        after,
        "closure",
        sample.timing
      );
      const handoffMs = Date.now() - sendStarted;
      assert(send.attempted === true, `TEST12: attempted (${sample.profile.businessName})`);
      assert(send.status === "SENT", `TEST12: dry-run SENT (${sample.profile.businessName})`);

      const queuedReply = resolveWebsiteChatCustomerHandoffReply({
        attempted: true,
        status: "QUEUED",
        currentObjective: after.currentObjective,
        customerName: after.lead.name,
        preferredTiming: after.preferredTiming,
        business: sample.profile,
        latestUserMessage: sample.timing,
      });
      const expectedQueued = buildQueuedLeadHandoffCustomerMessage(
        after.lead.name,
        after.preferredTiming
      );
      assert(queuedReply === expectedQueued, `TEST12: queued wording (${sample.profile.businessName})`);
      assert(
        !/shared your request with the team/i.test(queuedReply || ""),
        `TEST12: queued copy must not claim shared (${sample.profile.businessName})`
      );

      const sentReply = resolveWebsiteChatCustomerHandoffReply({
        attempted: true,
        status: "SENT",
        currentObjective: after.currentObjective,
        customerName: after.lead.name,
        preferredTiming: after.preferredTiming,
        business: sample.profile,
        latestUserMessage: sample.timing,
      });
      assert(
        /shared your request with the team/i.test(sentReply || ""),
        `TEST12: SENT copy may claim shared (${sample.profile.businessName})`
      );

      completedLeadDetectionMs = leadDetectionMs;
      completedLeadHandoffMs = handoffMs;
      completedLeadTotalMs = leadDetectionMs + handoffMs;
    }

    const salesChatSrc = readFileSync(
      path.join(process.cwd(), "src/lib/salesChat.ts"),
      "utf8"
    );
    const openaiMsZero = salesChatSrc.indexOf("openaiMs: 0");
    const openaiCall = salesChatSrc.indexOf("openai.responses.create");
    assert(
      openaiMsZero >= 0 && openaiCall > openaiMsZero,
      "TEST12: completed-lead deterministic path must return before OpenAI"
    );
    assert(
      salesChatSrc.includes("if (deterministicHandoffReply)"),
      "TEST12: every completed-lead path uses the deterministic handoff reply"
    );

    console.log("TEST12 PASS — generic readiness across three services", {
      completedLeadTurn: {
        leadDetectionMs: completedLeadDetectionMs,
        handoffMs: completedLeadHandoffMs,
        openaiMs: 0,
        totalMs: completedLeadTotalMs,
      },
    });
  }

  // TEST13 — confirmed short name, estimate-before-time, time phrases never become name.
  {
    const previousDryRun13 = process.env.LEAD_HANDOFF_DRY_RUN;
    delete process.env.LEAD_HANDOFF_DRY_RUN;
    let deliveries13 = 0;
    let lastDelivery13: {
      emailTo: string;
      smsTo: string;
    } | null = null;
    setLeadHandoffTestDelivery(async (input) => {
      deliveries13 += 1;
      lastDelivery13 = { emailTo: input.emailTo, smsTo: input.smsTo };
      return { emailOk: true, smsOk: true };
    });

    let flow = createInitialSalesState({
      conversationId: createConversationId(),
      businessKey: businessIdentityKey(business),
    });

    flow = applyTurn(
      flow,
      "My automatic garage door is not working. Can you help?",
      "👋 Hi! How can I help you today?"
    );
    assert(flow.currentObjective === "COLLECT_NAME", `TEST13: start with name, got ${flow.currentObjective}`);

    flow = applyTurn(flow, "V", "What's your first name?");
    assert(flow.lead.name === "V", `TEST13: short name captured, got ${flow.lead.name}`);
    assert(flow.currentObjective === "COLLECT_PHONE", `TEST13: after V ask phone, got ${flow.currentObjective}`);

    assert(isFieldConfirmationReply("yes"), "TEST13: yes is confirmation");
    assert(isFieldConfirmationReply("yes."), "TEST13: yes. is confirmation");
    assert(isFieldConfirmationReply("correct"), "TEST13: correct is confirmation");
    assert(isFieldConfirmationReply("that is right"), "TEST13: that is right is confirmation");

    flow = applyTurn(
      flow,
      "yes",
      "Thanks — is V the first name I should use?"
    );
    assert(flow.lead.name === "V", "TEST13: confirmation keeps the captured name");
    assert(flow.currentObjective !== "COLLECT_NAME", "TEST13: confirmation must not re-open name capture");
    assert(flow.currentObjective === "COLLECT_PHONE", `TEST13: still collecting phone, got ${flow.currentObjective}`);
    assert(flow.leadStatus !== "NOT_SECURED" || flow.intent !== "LOW", "TEST13: confirmation does not reset the journey");

    flow = applyTurn(flow, "9898989898", "Thanks V — what's the best phone number?");
    assert(!!flow.lead.phone && flow.lead.phone.includes("9898989898"), "TEST13: phone captured");
    assert(flow.lead.name === "V", "TEST13: phone turn does not clear name");
    assert(flow.currentObjective !== "COLLECT_NAME", "TEST13: must not ask for first name again after it was confirmed");
    assert(flow.currentObjective === "COLLECT_ADDRESS", `TEST13: next field is address, got ${flow.currentObjective}`);

    const reaskName = validateSalesReply(
      "What's your first name?",
      flow,
      business
    );
    assert(!reaskName.ok, "TEST13: asking first name again after capture must fail validation");

    flow = applyTurn(
      flow,
      "my first name is Victor",
      "What's the service address?"
    );
    assert(flow.lead.name === "Victor", `TEST13: explicit correction to full name, got ${flow.lead.name}`);
    assert(!!flow.lead.phone && flow.lead.phone.includes("9898989898"), "TEST13: correction keeps phone");
    assert(flow.currentObjective === "COLLECT_ADDRESS", `TEST13: still need address, got ${flow.currentObjective}`);

    flow = applyTurn(
      flow,
      "1500 Marilla St, Dallas TX 75201",
      "What's the service address?"
    );
    assert(!!flow.lead.address, "TEST13: address captured");
    assert(flow.lead.name === "Victor", "TEST13: address turn keeps Victor");
    assert(!flow.preferredTiming, "TEST13: address is not a preferred time");
    assert(
      !shouldAttemptLeadHandoff(flow, "closure", "1500 Marilla St, Dallas TX 75201"),
      "TEST13: no handoff before preferred time"
    );

    flow = applyTurn(
      flow,
      "yes",
      "Would you like me to arrange an on-site estimate?"
    );
    assert(flow.appointmentIntent === true, "TEST13: estimate yes is agreement to proceed");
    assert(!flow.preferredTiming, "TEST13: estimate yes does not invent preferred time");
    assert(flow.handoffReady === false, "TEST13: not handoff-ready without preferred time");
    assert(
      !shouldAttemptLeadHandoff(flow, "closure", "yes"),
      "TEST13: estimate agreement is not lead completion"
    );
    const prematureRecorded = validateSalesReply(
      "Thanks, Victor — I've recorded your request and noted tomorrow morning as your preferred time. The team will contact you at the number you provided to confirm availability.",
      flow,
      business
    );
    assert(!prematureRecorded.ok, "TEST13: recorded copy is invalid before preferred time");
    const estimateSend = await maybeSendLeadHandoff(business, flow, "closure", "yes");
    assert(estimateSend.attempted === false, "TEST13: no alert queued on estimate yes");
    assert(deliveries13 === 0, "TEST13: no email/SMS before preferred time");
    assert(flow.currentObjective === "ADVANCE_TO_NEXT_STEP", `TEST13: ask preferred time next, got ${flow.currentObjective}`);

    flow = applyTurn(
      flow,
      "ok",
      "I'll alert the team to arrange a site assessment. What day or time would you prefer? The team will confirm availability."
    );
    assert(flow.lead.name === "Victor", "TEST13: ok does not become a name");
    assert(!flow.preferredTiming, "TEST13: ok is not preferred time");
    assert(flow.handoffReady === false, "TEST13: still waiting for preferred time");

    const timePhrases = [
      "tomorrow morning",
      "this weekend",
      "Monday afternoon",
      "any time tomorrow",
    ];
    for (const phrase of timePhrases) {
      const named = {
        ...flow,
        lead: { ...flow.lead, name: "Victor" },
        currentObjective: "COLLECT_NAME" as const,
      };
      const afterPhrase = applyTurn(
        named,
        phrase,
        "What's your first name?"
      );
      assert(
        afterPhrase.lead.name === "Victor",
        `TEST13: time phrase must not overwrite name (${phrase} -> ${afterPhrase.lead.name})`
      );
    }

    const detectStarted13 = Date.now();
    flow = applyTurn(
      flow,
      "tomorrow morning",
      "What day or time would you prefer? The team will confirm availability."
    );
    const leadDetectionMs13 = Date.now() - detectStarted13;
    assert(flow.lead.name === "Victor", `TEST13: preferred time must not become name, got ${flow.lead.name}`);
    assert(/tomorrow morning/i.test(flow.preferredTiming || ""), `TEST13: preferred time stored, got ${flow.preferredTiming}`);
    assert(flow.handoffReady === true, "TEST13: ready after final required detail");
    const decision13 = evaluateHandoffReadiness(flow, "tomorrow morning");
    assert(decision13.handoffReady === true, "TEST13: central decision ready");
    assert(decision13.missingRequiredFields.length === 0, "TEST13: no missing fields");

    const queued13: Array<() => void | Promise<void>> = [];
    const sendStarted13 = Date.now();
    const send13 = await maybeSendLeadHandoff(
      business,
      flow,
      "closure",
      "tomorrow morning"
    );
    scheduleLeadAlertDelivery((task) => queued13.push(task), send13.delivery);
    const handoffMs13 = Date.now() - sendStarted13;
    assert(send13.attempted === true, "TEST13: handoff attempted on final detail");
    assert(send13.status === "QUEUED", `TEST13: queued not claimed sent, got ${send13.status}`);
    assert(queued13.length === 1, "TEST13: exactly one after() delivery task");
    assert(deliveries13 === 0, "TEST13: visitor is not blocked on provider delivery");

    const expectedFinal =
      "Thanks, Victor — I've recorded your request and noted tomorrow morning as your preferred time. The team will contact you at the number you provided to confirm availability.";
    const finalReply = resolveWebsiteChatCustomerHandoffReply({
      attempted: send13.attempted,
      status: send13.status,
      currentObjective: flow.currentObjective,
      customerName: flow.lead.name,
      preferredTiming: flow.preferredTiming,
      business,
      latestUserMessage: "tomorrow morning",
    });
    assert(finalReply === expectedFinal, `TEST13: final wording, got ${finalReply}`);

    await queued13[0]();
    assert(deliveries13 === 1, "TEST13: exactly one email+SMS delivery");
    assert(!!lastDelivery13, "TEST13: delivery payload present");

    const dup13 = await maybeSendLeadHandoff(
      business,
      { ...flow, leadDeliveryStatus: "QUEUED" },
      "closure",
      "tomorrow morning"
    );
    assert(dup13.attempted === false, "TEST13: duplicate prevented");
    assert(deliveries13 === 1, "TEST13: still one delivery");

    setLeadHandoffTestDelivery(null);
    if (previousDryRun13 === undefined) delete process.env.LEAD_HANDOFF_DRY_RUN;
    else process.env.LEAD_HANDOFF_DRY_RUN = previousDryRun13;

    console.log("TEST13 PASS — confirmed name / estimate-before-time / preferred-time isolation", {
      finalPreferredTimeTurn: {
        leadDetectionMs: leadDetectionMs13,
        handoffMs: handoffMs13,
        openaiMs: 0,
        totalMs: leadDetectionMs13 + handoffMs13,
      },
    });
  }

  // TEST14 — authoritative first name stays sticky; preferred-time sentence cannot overwrite it.
  {
    let flow = createInitialSalesState({
      conversationId: createConversationId(),
      businessKey: businessIdentityKey(business),
    });
    flow = applyTurn(
      flow,
      "I want my central heating system fixed. Can you do it? And how much will it cost?",
      "👋 Hi! How can I help you today?"
    );
    flow = applyTurn(flow, "Raja", "What's your first name?");
    assert(flow.lead.name === "Raja", `TEST14: Raja captured, got ${flow.lead.name}`);
    const confirmName = validateSalesReply(
      "Thanks — is your first name Raja?",
      flow,
      business
    );
    assert(!confirmName.ok, "TEST14: must not confirm a normal first name");

    flow = applyTurn(flow, "9898989898", "Thanks Raja — what's the best phone number?");
    flow = applyTurn(
      flow,
      "1500 Marilla St, Dallas, TX 75201",
      "What's the service address?"
    );
    const beforeTime = flow.lead.name;
    flow = applyTurn(
      flow,
      "Tomorrow afternoon is good with me",
      "What day or time would you prefer? The team will confirm availability."
    );
    assert(flow.lead.name === "Raja", `TEST14: time must not overwrite name (${beforeTime} -> ${flow.lead.name})`);
    assert(
      flow.preferredTiming === "tomorrow afternoon",
      `TEST14: normalized preferred time, got ${flow.preferredTiming}`
    );
    const expected14 =
      "Thanks, Raja — I've recorded your request and noted tomorrow afternoon as your preferred time. The team will contact you at the number you provided to confirm availability.";
    const final14 = resolveWebsiteChatCustomerHandoffReply({
      attempted: true,
      status: "QUEUED",
      currentObjective: flow.currentObjective,
      customerName: flow.lead.name,
      preferredTiming: flow.preferredTiming,
      business,
      latestUserMessage: "Tomorrow afternoon is good with me",
    });
    assert(final14 === expected14, `TEST14: exact final reply, got ${final14}`);
    console.log("TEST14 PASS — Raja name sticky / preferred-time isolation");
  }

  // TEST15 — sticky generic primary need survives lead capture and is in email + SMS.
  {
    function completeLead(opening: string) {
      let flow = createInitialSalesState({
        conversationId: createConversationId(),
        businessKey: businessIdentityKey(business),
      });
      flow = applyTurn(flow, opening, "Hi — how can I help?");
      flow = applyTurn(flow, "Alex", "What's your first name?");
      flow = applyTurn(flow, "2145550199", "What's the best phone number?");
      flow = applyTurn(
        flow,
        "400 Main St, Dallas TX 75201",
        "What's the service address?"
      );
      flow = applyTurn(
        flow,
        "tomorrow morning",
        "What day or time would you prefer? The team will confirm availability."
      );
      return flow;
    }

    const mosquito = completeLead(
      "I need mosquito treatment/inspection. Can you do it?"
    );
    assert(
      /mosquito treatment/i.test(mosquito.primaryNeed || mosquito.customerNeed || ""),
      `TEST15: mosquito request persisted, got ${mosquito.primaryNeed || mosquito.customerNeed}`
    );
    assert(
      mosquito.primaryNeed === mosquito.customerNeed,
      "TEST15: primaryNeed and customerNeed stay aligned"
    );
    const mosquitoNeed = formatPrimaryNeedForAlert(mosquito);
    assert(
      mosquitoNeed === "Mosquito treatment / inspection",
      `TEST15: concise mosquito need, got ${mosquitoNeed}`
    );
    const mosquitoEmail = buildLeadNotificationEmail(business, mosquito);
    const mosquitoSms = buildWebsiteLeadSms(business, mosquito);
    assert(
      mosquitoEmail.text.includes("PRIMARY CUSTOMER NEED") &&
        mosquitoEmail.text.includes(mosquitoNeed),
      "TEST15: email includes mosquito primary need"
    );
    assert(
      !/PRIMARY CUSTOMER NEED\nNot established/i.test(mosquitoEmail.text),
      "TEST15: email must not say Not established when a need exists"
    );
    assert(
      mosquitoSms.includes(`Need: ${mosquitoNeed}`),
      `TEST15: SMS includes Need line, got ${mosquitoSms}`
    );

    const driveway = completeLead("I want my driveway sealed.");
    assert(
      /driveway sealed/i.test(driveway.primaryNeed || ""),
      `TEST15: driveway request persisted, got ${driveway.primaryNeed}`
    );
    const drivewayNeed = formatPrimaryNeedForAlert(driveway);
    assert(
      drivewayNeed === "Driveway sealed",
      `TEST15: concise driveway need, got ${drivewayNeed}`
    );
    const drivewayEmail = buildLeadNotificationEmail(business, driveway);
    const drivewaySms = buildWebsiteLeadSms(business, driveway);
    assert(drivewayEmail.text.includes(drivewayNeed), "TEST15: email includes driveway need");
    assert(drivewaySms.includes(`Need: ${drivewayNeed}`), "TEST15: SMS includes driveway need");
    assert(
      drivewayNeed !== mosquitoNeed,
      "TEST15: structurally different services stay distinct"
    );

    let unnamed = createInitialSalesState({
      conversationId: createConversationId(),
      businessKey: businessIdentityKey(business),
    });
    unnamed = applyTurn(unnamed, "Alex", "What's your first name?");
    unnamed = applyTurn(unnamed, "2145550199", "What's the best phone number?");
    unnamed = applyTurn(
      unnamed,
      "400 Main St, Dallas TX 75201",
      "What's the service address?"
    );
    unnamed = applyTurn(unnamed, "tomorrow morning", "What day or time would you prefer?");
    assert(!unnamed.primaryNeed && !unnamed.customerNeed, "TEST15: no invented need");
    assert(
      formatPrimaryNeedForAlert(unnamed) === "Not established",
      "TEST15: Not established only when no service request was given"
    );
    const emptyEmail = buildLeadNotificationEmail(business, unnamed);
    assert(
      /PRIMARY CUSTOMER NEED\nNot established/.test(emptyEmail.text),
      "TEST15: email Not established when no need exists"
    );

    console.log("TEST15 PASS — sticky primary need in email and SMS", {
      mosquitoEmailNeed: mosquitoNeed,
      mosquitoSms,
      drivewayEmailNeed: drivewayNeed,
      drivewaySms,
    });
  }

  // TEST16 — mixed preferred-time + pricing, typo, missing-time ask, success close.
  {
    assert(
      extractPreferredVisitTimeFromText("Tommorow afternoon") === "tomorrow afternoon",
      "TEST16: Tommorow typo is recognized"
    );
    assert(
      extractPreferredVisitTimeFromText(
        "Tomorrow morning works, but what do you charge?"
      ) === "tomorrow morning",
      "TEST16: combined morning + charge question stores preferred time"
    );

    const safeLog = publicHandoffDecisionLog({
      decision: evaluateHandoffReadiness(
        qualifiedBase({ preferredTiming: "tomorrow afternoon" }),
        "Yes"
      ),
      deliveryStatus: "queued",
    });
    assert(
      JSON.stringify(Object.keys(safeLog).sort()) ===
        JSON.stringify(
          [
            "deliveryStatus",
            "handoffReady",
            "missingRequiredFields",
            "visitorRequestedProceedOrCompleted",
          ].sort()
        ),
      "TEST16: safe decision logs must not add customer PII fields"
    );
    assert(
      !/(512|555|Marilla|Jack)/i.test(JSON.stringify(safeLog)),
      "TEST16: decision log must not include customer PII"
    );

    const proceedAsk =
      "I can share typical pricing. Would you like me to arrange a site assessment?";
    const mixed = "Tomorrow afternoon. How much will it cost?";
    let flow = qualifiedBase({
      preferredTiming: null,
      leadDeliveryStatus: "NOT_SENT",
      customerAgreed: false,
    });
    flow = applyTurn(flow, mixed, proceedAsk);
    assert(
      flow.preferredTiming === "tomorrow afternoon",
      `TEST16: combined message stores preferred time, got ${flow.preferredTiming}`
    );

    let attempts = 0;
    const first = await maybeSendLeadHandoff(business, flow, "closure", mixed);
    if (first.attempted) {
      attempts += 1;
      flow = applyLeadDeliveryResult(flow, first);
    }

    flow = applyTurn(
      flow,
      "Yes",
      "Pricing depends on the scope of work. Would you like me to arrange a site assessment?"
    );
    assert(
      flow.preferredTiming === "tomorrow afternoon",
      `TEST16: preferred time stays sticky after Yes, got ${flow.preferredTiming}`
    );
    const second = await maybeSendLeadHandoff(business, flow, "closure", "Yes");
    if (second.attempted) attempts += 1;
    assert(attempts === 1, `TEST16: exactly one handoff, got ${attempts}`);
    assert(
      evaluateHandoffReadiness(flow, "Yes").handoffReady === true ||
        flow.leadDeliveryStatus === "QUEUED" ||
        flow.leadDeliveryStatus === "SENT",
      "TEST16: central evaluator used for the Yes turn"
    );
    const email = buildLeadNotificationEmail(business, {
      ...flow,
      preferredTiming: "tomorrow afternoon",
    });
    const sms = buildWebsiteLeadSms(business, {
      ...flow,
      preferredTiming: "tomorrow afternoon",
    });
    assert(
      /kitchen sink is clogged/i.test(email.text) &&
        /PREFERRED VISIT TIME/i.test(email.text) &&
        /tomorrow afternoon/i.test(email.text),
      "TEST16: email includes primary need and preferred time"
    );
    assert(
      /Need:/i.test(sms) && /tomorrow afternoon/i.test(sms),
      "TEST16: SMS includes primary need and preferred time"
    );

    const missing = applyTurn(
      qualifiedBase({ preferredTiming: null, leadDeliveryStatus: "NOT_SENT" }),
      "Yes",
      proceedAsk
    );
    assert(!missing.preferredTiming, "TEST16: Yes does not invent preferred time");
    const missingDecision = evaluateHandoffReadiness(missing, "Yes");
    assert(
      missingDecision.handoffReady === false &&
        missingDecision.missingRequiredFields.includes("preferredTiming"),
      "TEST16: missing preferred time is not ready"
    );
    const missingSend = await maybeSendLeadHandoff(business, missing, "closure", "Yes");
    assert(missingSend.attempted === false, "TEST16: missing preferred time sends no handoff");
    const askOnce = validateSalesReply(SITE_ASSESSMENT_TEAM_ALERT_ASK, missing, business);
    assert(askOnce.ok, `TEST16: ask preferred time once, ${askOnce.reasons.join("; ")}`);

    const successClose = buildSuccessfulLeadHandoffCustomerMessage(
      flow.lead.name,
      "tomorrow afternoon"
    );
    assert(
      !successClose.includes(business.phone) &&
        !/\bif you prefer to call\b/i.test(successClose),
      "TEST16: success close contains no business phone number"
    );
    console.log("TEST16 PASS — mixed timing capture / one handoff / missing-time ask");
  }

  // Extra agreement checks
  assert(detectCustomerAgreement("Please proceed."), "extra: please proceed");
  assert(detectCustomerAgreement("Yes, go ahead."), "extra: yes go ahead");
  assert(detectCustomerAgreement("yes please"), "extra: yes please is agreement");
  assert(!detectCustomerAgreement("Yes, I'm home."), "extra: yes home not agreement");
  assert(!detectCustomerAgreement("Yes, I need someone today."), "extra: yes today not auto");

  // E: conversationId travels with state
  assert(!!s3.conversationId && s3.conversationId.length >= 8, "E: conversationId on state");
  assert(!!s3.businessKey, "E: businessKey on state");

  console.log("\nAll handoff control + isolation tests passed (DRY RUN — no real SMTP).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
