import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import path from "path";
import DemoWorkspace from "../src/components/DemoWorkspace";
import { DEMO_CHAT_LAYOUT } from "../src/lib/demoChatLayout";
import { buildLeadNotificationEmail } from "../src/lib/leadHandoff";
import {
  recordSiteVisitFeeMention,
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

function readSrc(rel: string) {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
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

const solarBusiness: BusinessProfile = {
  ...business,
  website: "https://texassolar.test",
  businessName: "Texas Solar",
  services: ["Residential solar"],
  pricingRules: "Site-visit fee: $79. Applied only when a technician visit is confirmed by the team.",
};

function cssHasRule(css: string, selector: string, needle: RegExp) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    if (needle.test(match[1])) return true;
  }
  return false;
}

function testLayoutConstraints() {
  assert(DEMO_CHAT_LAYOUT.panelHeightPx === 560, "panel height constant");
  assert(DEMO_CHAT_LAYOUT.customerPanelWidthPx === 420, "customer width constant");

  const layout = readSrc("src/app/demo/layout.tsx");
  assert(
    layout.includes('import "./demo-workspace.css"'),
    "demo layout must import demo-workspace.css so panel CSS is in the route bundle"
  );
  assert(
    layout.includes('import "../../components/landing/landing.css"'),
    "demo layout must import landing.css for theme"
  );

  const landingCss = readSrc("src/components/landing/landing.css");
  assert(
    !landingCss.includes(".pt-demo-panel"),
    "demo panel sizing must not live only in landing.css (route CSS split dropped it)"
  );
  assert(
    !/max-width:\s*none\s*!important/.test(landingCss) ||
      !landingCss.includes(".pt-demo-chat"),
    "landing.css must not unlock demo chat max-width"
  );

  const css = readSrc("src/app/demo/demo-workspace.css");
  assert(!/max-width:\s*none\s*!important/.test(css), "must not unlock customer max-width");
  assert(!/min-width:\s*400px/.test(css), "must not force 400px min-width overflow");
  assert(
    !cssHasRule(css, ".pt-demo-chat [data-customer-widget-shell]", /height:\s*auto/),
    "widget shell must not use height:auto"
  );
  assert(
    !cssHasRule(css, ".pt-demo-chat [data-chat-messages]", /height:\s*auto/),
    "message list must not use height:auto"
  );
  assert(
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--pt-demo-customer-width,\s*420px\)/.test(
      css
    ),
    "desktop grid must reserve a 420px customer column with minmax(0,1fr) owner"
  );
  assert(
    cssHasRule(css, ".pt-demo-panel", /height:\s*var\(--pt-demo-chat-height,\s*560px\)/),
    "panel height 560px"
  );
  assert(
    cssHasRule(css, ".pt-demo-panel", /overflow:\s*hidden/),
    "panel overflow-hidden"
  );
  assert(
    cssHasRule(css, ".pt-demo-panel", /min-width:\s*0/),
    "panel min-width 0"
  );
  assert(
    cssHasRule(
      css,
      ".pt-demo-panel-customer",
      /width:\s*var\(--pt-demo-customer-width,\s*420px\)/
    ),
    "desktop customer panel width 420px"
  );
  assert(
    cssHasRule(css, ".pt-demo-caption", /flex:\s*none/),
    "caption flex-none"
  );
  assert(
    cssHasRule(css, ".pt-demo-chat [data-chat-header]", /flex:\s*none/),
    "chat header flex-none"
  );
  assert(
    cssHasRule(
      css,
      ".pt-demo-chat [data-chat-messages]",
      /overflow-y:\s*auto/
    ),
    "messages overflow-y-auto"
  );
  assert(
    cssHasRule(
      css,
      ".pt-demo-chat [data-chat-messages]",
      /overflow-x:\s*hidden/
    ),
    "messages overflow-x-hidden"
  );
  assert(
    cssHasRule(css, ".pt-demo-chat [data-chat-messages]", /min-height:\s*0/),
    "messages min-height 0"
  );
  assert(
    cssHasRule(css, ".pt-demo-chat [data-chat-input]", /flex:\s*none/),
    "input flex-none"
  );
  assert(css.includes("overflow-wrap: anywhere"), "long messages wrap anywhere");
  assert(css.includes("min-width: 0"), "parents shrink instead of overflowing");

  const workspace = readSrc("src/components/DemoWorkspace.tsx");
  assert(!workspace.includes("lg:h-screen"), "must not lock nested full-screen scroll");
  assert(!workspace.includes("-inset-4"), "glow inset must not overflow the page");
  assert(workspace.includes("data-demo-owner-panel"), "owner panel marker");
  assert(workspace.includes("data-demo-customer-panel"), "customer panel marker");
  assert(workspace.includes("min-w-0"), "workspace children can shrink");

  const chatWindow = readSrc("src/components/Chat/ChatWindow.tsx");
  assert(chatWindow.includes("data-chat-window"), "chat window marker");
  assert(chatWindow.includes("data-chat-messages"), "messages marker");
  assert(chatWindow.includes("overflow-y-auto"), "messages scroll vertically");
  assert(chatWindow.includes("overflow-x-hidden"), "messages do not expand horizontally");
  assert(chatWindow.includes("flex-none"), "input flex-none");

  const chatMessage = readSrc("src/components/Chat/ChatMessage.tsx");
  assert(chatMessage.includes("[overflow-wrap:anywhere]"), "bubble wrap anywhere");
  assert(chatMessage.includes("data-chat-message-bubble"), "bubble marker");

  const html = renderToStaticMarkup(
    createElement(DemoWorkspace, {
      initialProfile: solarBusiness,
      demoId: "texassolar",
    })
  );
  assert(html.includes("pt-demo-workspace"), "rendered workspace grid");
  assert(html.includes("data-demo-owner-panel"), "rendered owner column");
  assert(html.includes("data-demo-customer-panel"), "rendered customer column");
  assert(html.includes("data-chat-messages"), "rendered scrollable message list");
  assert(html.includes("data-chat-input"), "rendered input row");
  assert(html.includes("--pt-demo-chat-height"), "rendered 560px height var");
  assert(html.includes("--pt-demo-customer-width"), "rendered 420px width var");
  assert(/560px/.test(html) && /420px/.test(html), "inline layout sizes 560/420");
  assert(!html.includes("max-w-none"), "customer chat must not drop max-width");

  console.log("PASS — demo chat layout CSS + rendered markup");
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

const TIMING_ACK =
  "I can't confirm a time here, but I'll note tomorrow morning as your preferred time. The team will contact you to confirm.";

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

  const good = validateSalesReply(TIMING_ACK, after, business);
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

function testSiteVisitFeeOnce() {
  const labeled = updateSalesStateFromTurn(
    createInitialSalesState({
      conversationId: "conv_fee",
      businessKey: solarBusiness.website,
    }),
    [{ role: "user", content: "Hi" }],
    solarBusiness
  );
  assert(labeled.siteVisitFeeLabel === "$79", `fee label: ${labeled.siteVisitFeeLabel}`);

  const withFee = {
    ...securedLead({
      currentObjective: "PRESENT_SOLUTION",
      siteVisitFeeLabel: "$79",
    }),
  };

  const first = validateSalesReply(
    "A $79 site-visit fee applies. The team can explain the details before any visit is confirmed.",
    withFee,
    solarBusiness
  );
  assert(first.ok, `first fee mention should pass: ${first.reasons.join("; ")}`);

  const afterMention = recordSiteVisitFeeMention(
    withFee,
    "A $79 site-visit fee applies. The team can explain the details before any visit is confirmed."
  );
  assert(afterMention.siteVisitFeeMentioned, "controller must record the fee mention");

  const repeat = validateSalesReply(
    "Just a reminder, a $79 site-visit fee applies before we come out.",
    afterMention,
    solarBusiness
  );
  assert(!repeat.ok, "must not repeat the site-visit fee");
  assert(
    repeat.reasons.some((r) => /already mentioned/i.test(r)),
    repeat.reasons.join("; ")
  );

  const payNow = validateSalesReply(
    "I can arrange the $79 payment now so we can lock in the visit.",
    withFee,
    solarBusiness
  );
  assert(!payNow.ok, "must never arrange payment");
  assert(
    payNow.reasons.some((r) => /payment/i.test(r)),
    payNow.reasons.join("; ")
  );

  const afterTiming = updateSalesStateFromTurn(
    afterMention,
    [
      {
        role: "assistant",
        content:
          "A $79 site-visit fee applies. The team can explain the details before any visit is confirmed.",
      },
      { role: "user", content: "Can you arrange tomorrow morning?" },
    ],
    solarBusiness
  );
  assert(afterTiming.siteVisitFeeMentioned, "prior fee mention stays recorded");
  assert(/tomorrow morning/i.test(afterTiming.preferredTiming || ""), "timing saved");
  assert(afterTiming.currentObjective === "ADVANCE_TO_NEXT_STEP", "advance after timing");

  const feeAfterTiming = validateSalesReply(
    "A $79 site-visit fee applies. I can't confirm a time here, but I'll note tomorrow morning as your preferred time.",
    afterTiming,
    solarBusiness
  );
  assert(!feeAfterTiming.ok, "must not repeat the fee after a visit-timing question");

  const timingOnly = validateSalesReply(TIMING_ACK, afterTiming, solarBusiness);
  assert(
    timingOnly.ok,
    `timing ack without fee should pass: ${timingOnly.reasons.join("; ")}`
  );

  const askedAgain = updateSalesStateFromTurn(
    afterMention,
    [
      {
        role: "assistant",
        content:
          "A $79 site-visit fee applies. The team can explain the details before any visit is confirmed.",
      },
      { role: "user", content: "What's the site-visit fee again?" },
    ],
    solarBusiness
  );
  assert(askedAgain.customerAskedAboutFee, "customer asked about the fee");
  const allowedRepeat = validateSalesReply(
    "A $79 site-visit fee applies. The team can explain the details before any visit is confirmed.",
    askedAgain,
    solarBusiness
  );
  assert(
    allowedRepeat.ok,
    `customer re-ask may mention fee once more: ${allowedRepeat.reasons.join("; ")}`
  );

  console.log("PASS — site-visit fee mentioned at most once; never collect payment");
}

function main() {
  testLayoutConstraints();
  testVisitPreferenceNoDuplicateAddress();
  testSiteVisitFeeOnce();
}

main();
