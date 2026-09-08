import { readFileSync } from "fs";
import path from "path";
import { DEMO_CHAT_LAYOUT } from "../src/lib/demoChatLayout";
import { buildLeadNotificationEmail } from "../src/lib/leadHandoff";
import {
  updateSalesStateFromTurn,
  validateSalesReply,
} from "../src/lib/salesController";
import {
  createInitialSalesState,
  type SalesState,
} from "../src/lib/salesState";
import type { BusinessProfile } from "../src/types/business";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const business: BusinessProfile = {
  website: "https://example-services.test",
  businessName: "Summit Home Services",
  tagline: "",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  phone: "",
  email: "",
  address: "",
  services: ["Drain clearing"],
  serviceAreas: ["Dallas"],
  faqs: [],
  leadQuestions: [],
  systemPrompt: "",
};

function testLayoutConstraints() {
  assert(DEMO_CHAT_LAYOUT.panelHeightPx === 560, "owner/customer panel height");
  assert(
    DEMO_CHAT_LAYOUT.customerPanelWidthPx >= 400 &&
      DEMO_CHAT_LAYOUT.customerPanelWidthPx <= 440,
    "customer panel width must be 400–440px"
  );
  assert(DEMO_CHAT_LAYOUT.customerPanelMinWidthPx === 400, "min width");
  assert(DEMO_CHAT_LAYOUT.customerPanelMaxWidthPx === 440, "max width");

  const css = readFileSync(
    path.join(process.cwd(), "src/components/landing/landing.css"),
    "utf8"
  );
  const workspace = readFileSync(
    path.join(process.cwd(), "src/components/DemoWorkspace.tsx"),
    "utf8"
  );
  const chatWindow = readFileSync(
    path.join(process.cwd(), "src/components/Chat/ChatWindow.tsx"),
    "utf8"
  );
  const chatMessage = readFileSync(
    path.join(process.cwd(), "src/components/Chat/ChatMessage.tsx"),
    "utf8"
  );

  assert(css.includes("--pt-demo-chat-height"), "demo CSS uses fixed chat height");
  assert(
    /\.pt-demo-chat\s*\{[^}]*height:\s*100%/.test(css),
    "demo chat must use a fixed 100% panel height, not grow"
  );
  assert(css.includes("overflow: hidden"), "demo panels clip overflow");
  assert(css.includes("min-width: 400px"), "desktop customer min width");
  assert(css.includes("max-width: 440px"), "desktop customer max width");
  assert(
    workspace.includes("lg:h-screen") === false,
    "demo page must not lock to nested full-screen scroll"
  );
  assert(
    workspace.includes("lg:overflow-hidden") === false,
    "demo page must not use an outer nested scrollbar"
  );
  assert(chatWindow.includes("overflow-y-auto"), "messages area scrolls vertically");
  assert(chatWindow.includes("overflow-x-hidden"), "messages must not expand horizontally");
  assert(chatMessage.includes("break-words"), "message bubbles wrap");
  assert(workspace.includes("pt-demo-panel-owner"), "owner panel class");
  assert(workspace.includes("pt-demo-panel-customer"), "customer panel class");

  console.log("PASS — demo chat layout constraints");
}

function securedLead(overrides: Partial<SalesState> = {}): SalesState {
  return {
    ...createInitialSalesState({
      conversationId: "conv_demo_visit_pref",
      businessKey: "https://example-services.test",
    }),
    intent: "HIGH",
    leadStatus: "SECURED",
    currentObjective: "PRESENT_SOLUTION",
    salesStage: "SALES_MODE",
    lead: {
      name: "Maya",
      phone: "5125550198",
      email: null,
      address: "100 Congress Ave, Austin TX",
    },
    customerNeed: "Kitchen sink is clogged and needs repair.",
    ...overrides,
  };
}

function testVisitPreferenceNoDuplicateAddress() {
  const after = updateSalesStateFromTurn(
    securedLead(),
    [
      { role: "assistant", content: "Thanks Maya — I have your address on file." },
      { role: "user", content: "Can you arrange tomorrow morning?" },
    ],
    business
  );

  assert(
    /tomorrow morning/i.test(after.preferredTiming || ""),
    `preferred_visit_time not saved: ${after.preferredTiming}`
  );
  assert(
    after.lead.address === "100 Congress Ave, Austin TX",
    "address must remain captured"
  );
  assert(
    after.currentObjective !== "COLLECT_ADDRESS" &&
      after.currentObjective !== "COLLECT_NAME" &&
      after.currentObjective !== "COLLECT_PHONE",
    `must not re-open lead capture, got ${after.currentObjective}`
  );
  assert(
    after.currentObjective === "ADVANCE_TO_NEXT_STEP",
    `visit preference should advance, got ${after.currentObjective}`
  );

  const duplicateAddress = validateSalesReply(
    "What is the service address we should visit tomorrow morning?",
    after,
    business
  );
  assert(!duplicateAddress.ok, "re-asking address after it is captured must fail");
  assert(
    duplicateAddress.reasons.some((r) => /already-collected field: address/i.test(r)),
    duplicateAddress.reasons.join("; ")
  );

  const booking = validateSalesReply(
    "You're all set — I have confirmed your appointment for tomorrow morning.",
    after,
    business
  );
  assert(!booking.ok, "must not confirm an appointment");

  const good = validateSalesReply(
    "I can't confirm a time here, but I'll let the team know tomorrow morning is your preferred time. They'll contact you to confirm.",
    after,
    business
  );
  assert(good.ok, `preferred-time ack should pass: ${good.reasons.join("; ")}`);

  const missingAddress = updateSalesStateFromTurn(
    securedLead({
      leadStatus: "SECURING",
      lead: { name: "Maya", phone: "5125550198", email: null, address: null },
    }),
    [{ role: "user", content: "Can you arrange tomorrow morning?" }],
    business
  );
  assert(
    /tomorrow morning/i.test(missingAddress.preferredTiming || ""),
    "still save preferred time when address is missing"
  );
  assert(
    missingAddress.currentObjective === "COLLECT_ADDRESS",
    `missing address must ask address once, got ${missingAddress.currentObjective}`
  );

  const email = buildLeadNotificationEmail(business, after);
  assert(
    /Preferred visit time/i.test(email.text),
    "website lead handoff must include preferred visit time"
  );
  assert(/tomorrow morning/i.test(email.text), "handoff includes the captured slot");

  console.log("PASS — no duplicate address question; preferred visit time saved");
}

function main() {
  testLayoutConstraints();
  testVisitPreferenceNoDuplicateAddress();
}

main();
