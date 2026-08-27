import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import type { BusinessProfile } from "../src/types/business";
import {
  isLeadReadyForHandoff,
  maybeSendLeadHandoff,
  shouldAttemptLeadHandoff,
} from "../src/lib/leadHandoff";
import { createCustomerChatSession } from "../src/lib/customerChatClient";
import { updateSalesStateFromTurn } from "../src/lib/salesController";
import { businessIdentityKey, createInitialSalesState, type SalesState } from "../src/lib/salesState";

const business: BusinessProfile = {
  website: "https://policy-test.example",
  businessName: "Policy Test Services",
  tagline: "",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  phone: "",
  email: "",
  address: "",
  services: ["Home service"],
  serviceAreas: [],
  faqs: [],
  leadQuestions: [],
  systemPrompt: "",
};

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function ready(overrides: Partial<SalesState> = {}): SalesState {
  const state = createInitialSalesState({
    conversationId: "policy-conversation-123",
    businessKey: businessIdentityKey(business),
  });
  return {
    ...state,
    intent: "READY_TO_ACT",
    leadStatus: "SECURED",
    salesStage: "COMPLETED",
    currentObjective: "CLOSE",
    customerNeed: "Kitchen sink replacement is needed.",
    lead: { name: "David", phone: "3333333333", email: null, address: "1500 Marilla St, Dallas TX 75201" },
    appointmentIntent: true,
    preferredTiming: "Tomorrow 5-7 PM",
    handoffReady: true,
    customerAgreed: true,
    ...overrides,
  };
}

async function main() {
  // 1. Complete normal lead can close; bare agreement is only one condition.
  const normal = ready();
  assert(isLeadReadyForHandoff(normal), "1: complete normal lead should be ready");
  assert(shouldAttemptLeadHandoff(normal, "closure", "Yes, let's proceed."), "1: explicit closure should send");

  // 2–4. Outstanding AI questions, customer questions, and objections block both paths.
  assert(!isLeadReadyForHandoff(ready({ awaitingCustomerResponse: true })), "2: unanswered AI question must block");
  assert(!isLeadReadyForHandoff(ready({ unresolvedCustomerIssue: true })), "3: pending customer question must block");
  assert(!isLeadReadyForHandoff(ready({ unresolvedCustomerIssue: true, objections: ["Price concern"] })), "4: pending objection must block");

  // 5 and 10. The same state can only result in one dry-run delivery.
  const first = await maybeSendLeadHandoff(business, normal, "inactivity");
  assert(first.attempted && first.status === "SENT", "5: ready inactivity lead should send once");
  const sent = { ...normal, leadDeliveryStatus: "SENT" as const };
  const duplicate = await maybeSendLeadHandoff(business, sent, "inactivity");
  assert(!duplicate.attempted && duplicate.status === "SENT", "10: duplicate must not send");

  // 6 and 11. Every new message clears/replaces the timer; the session remains usable.
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers: Array<() => void> = [];
  const handoffs: unknown[] = [];
  globalThis.setTimeout = ((callback: () => void) => {
    timers.push(callback);
    return timers.length as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = (() => {}) as typeof clearTimeout;
  globalThis.fetch = (async (input, init) => {
    if (String(input) === "/api/lead-handoff") {
      handoffs.push(JSON.parse(String(init?.body || "{}")));
      return new Response(JSON.stringify({ salesState: { ...ready(), leadDeliveryStatus: "SENT" } }), { status: 200 });
    }
    return new Response(JSON.stringify({ reply: "Request captured.", salesState: ready({ customerAgreed: false, currentObjective: "PRESENT_SOLUTION", salesStage: "SALES_MODE" }) }), { status: 200 });
  }) as typeof fetch;
  try {
    const session = createCustomerChatSession(business);
    await session.send("first message");
    await session.send("new customer message resets the timer");
    assert(timers.length === 2, "6: every new message should replace the inactivity timer");
    timers[0]();
    await Promise.resolve();
    assert(handoffs.length === 0, "6: obsolete timer must not send");
    timers[1]();
    await Promise.resolve();
    assert(Number(handoffs.length) === 1, "5: active five-minute timer should send once");
    assert(session.isActive() && session.getSalesState(), "11: session must remain intact while timer runs");
    session.destroy();
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }

  // 7. Urgent path needs only the core actionable lead and sends immediately.
  const urgent = ready({ urgency: "IMMEDIATE", preferredTiming: null, requiredBusinessFields: ["unit number"], capturedBusinessFields: [] });
  assert(isLeadReadyForHandoff(urgent), "7: urgent core lead must not wait for normal/custom discovery");
  assert(shouldAttemptLeadHandoff(urgent, "urgent", "Emergency, please help now."), "7: urgent lead must send immediately");

  // 8. Optional operational notes never affect readiness.
  assert(isLeadReadyForHandoff(ready({ customerContext: ["Customer has pets and a gated driveway."] })), "8: optional context must not block");

  // 9. A profile requirement is derived and blocks until the customer provides it.
  const requiredBusiness = { ...business, leadQuestions: ["Unit number is required before the visit can be requested."] };
  const before = updateSalesStateFromTurn(ready({ customerAgreed: false, handoffReady: true }), [{ role: "user", content: "Tomorrow afternoon works." }], requiredBusiness);
  assert(before.requiredBusinessFields.includes("unit number"), "9: explicit profile requirement should be derived");
  assert(!isLeadReadyForHandoff(before), "9: missing required profile field must block");
  const after = updateSalesStateFromTurn(before, [{ role: "user", content: "My unit number is 12B." }], requiredBusiness);
  assert(after.capturedBusinessFields.includes("unit number"), "9: provided required field should be captured");

  console.log("Deterministic V1 handoff policy PASS — normal, pending, timer, urgent, optional, required, and duplicate cases.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
