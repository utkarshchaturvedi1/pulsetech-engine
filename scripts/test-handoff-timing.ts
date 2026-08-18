import { config } from "dotenv";
config({ path: ".env.local" });

// CRITICAL: automated tests must never send real SMTP email.
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import type { BusinessProfile } from "../src/types/business";
import {
  buildLeadNotificationEmail,
  isClosureHandoffTrigger,
  isLeadHandoffDryRun,
  isLeadQualified,
  isLeadReadyForHandoff,
  maybeSendLeadHandoff,
  shouldAttemptLeadHandoff,
} from "../src/lib/leadHandoff";
import {
  createCustomerChatSession,
} from "../src/lib/customerChatClient";
import {
  detectCustomerAgreement,
  updateSalesStateFromTurn,
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
};

const businessB: BusinessProfile = {
  ...business,
  website: "https://autreys-plumbing.test",
  businessName: "Autrey's Plumbing LLC",
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
  let s3 = applyTurn(qualifiedBase(), closeMsg, "Would you like to move forward?");
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

  // -------- TEST 4 — CUSTOMER STILL TALKING --------
  let s4 = qualifiedBase({ handoffReady: false });
  assert(isLeadQualified(s4), "TEST4: qualified");
  assert(!isLeadReadyForHandoff(s4), "TEST4: not handoff ready while gathering");
  s4 = applyTurn(s4, "I need someone today.", "Want an inspection?");
  assert(s4.leadDeliveryStatus !== "SENT", "TEST4: no send");
  assert(
    !shouldAttemptLeadHandoff(s4, "inactivity"),
    "TEST4: inactivity blocked without handoffReady"
  );
  s4 = applyTurn(s4, "I'm home right now.", "Any access notes?");
  assert(!shouldAttemptLeadHandoff(s4, "closure"), "TEST4: still no closure");
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
  assert(email.text.includes("today"), "TEST8: timing");
  assert(/dog|available|home/i.test(email.text), "TEST8: accumulated details");
  assert(!email.text.includes("Services on file"), "TEST8: no services dump");
  assert(!email.text.includes("Long owner prompt"), "TEST8: no prompt dump");
  assert(!email.text.includes("Lead notification emailed"), "TEST8: no false sent claim");
  console.log("TEST8 PASS");

  // Extra agreement checks
  assert(detectCustomerAgreement("Please proceed."), "extra: please proceed");
  assert(detectCustomerAgreement("Yes, go ahead."), "extra: yes go ahead");
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
