import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import path from "path";
import DemoWorkspace from "../src/components/DemoWorkspace";
import { DEMO_CHAT_LAYOUT, HOME_CHAT_LAYOUT, PULSETECH_CANVAS_GRADIENT } from "../src/lib/demoChatLayout";
import { buildLeadNotificationEmail, buildWebsiteLeadSms, evaluateHandoffReadiness, formatPrimaryNeedForAlert, shouldAttemptLeadHandoff } from "../src/lib/leadHandoff";
import {
  ASK_EXPLICIT_AGREEMENT,
  ASK_PREFERRED_DAY_TIME,
  PRE_QUEUE_ALERT_PROMISE_RE,
  PREFERRED_TIME_TEAM_ALERT_ACK,
  SITE_ASSESSMENT_TEAM_ALERT_ASK,
  buildFailedLeadHandoffCustomerMessage,
  buildPricingApproachAnswer,
  buildQueuedLeadHandoffCustomerMessage,
  buildSuccessfulLeadHandoffCustomerMessage,
  isFailedLeadHandoffCustomerMessage,
  isQueuedLeadHandoffCustomerMessage,
  isSuccessfulLeadHandoffCustomerMessage,
  messageAsksPricingOrBilling,
  resolveWebsiteChatCustomerHandoffReply,
  extractPreferredVisitTimeFromText,
} from "../src/lib/schedulingPolicy";
import {
  TEXAS_SOLAR_LOGO_URL,
  TEXAS_SOLAR_TEST_DEMO_ID,
  getBundledTestDemo,
  texasSolarProfessionalTestProfile,
} from "../src/data/testBusinessProfiles";
import {
  createPersonalizedDemoId,
  invitationPathForDemoId,
  isInvitationSaveReady,
  saveNewPersonalizedDemo,
} from "../src/lib/personalizedDemo";
import {
  formatLeadAlertsConfigured,
  isValidLeadAlertEmail,
  LEAD_ALERT_EMAIL_PROMPT,
  LEAD_ALERT_SMS_PROMPT,
  LEAD_ALERT_SETUP_NEEDED_ERROR,
  normalizeLeadAlertSms,
  resolveWebsiteChatLeadAlert,
  shouldCollectLeadAlertSetup,
} from "../src/lib/leadAlertRecipients";
import { maybeSendLeadHandoff } from "../src/lib/leadHandoff";
import { generateSalesReply } from "../src/lib/salesChat";
import {
  commitSharedProfile,
  loadSharedProfile,
} from "../src/lib/sharedProfileStore";
import {
  PRE_CONTACT_ASK_ADDRESS,
  PRE_CONTACT_ASK_FIRST_NAME,
  PRE_CONTACT_ASK_PHONE,
  recordSiteVisitFeeMention,
  resolvePostContactConversationReply,
  updateSalesStateFromTurn,
  validateSalesReply,
} from "../src/lib/salesController";
import {
  buildCostOptionsHesitationReply,
  buildEmpatheticNameAsk,
  buildIntentAwarePriceAnswer,
  buildPersuasiveArrangeInvitation,
  buildPostContactNextStepReply,
  classifyConversationNeedTone,
  isCostOptionsHesitation,
  isFieldServiceProfile,
  replyUsesFieldServiceJargon,
} from "../src/lib/salesConversation";
import {
  CHAT_AVATAR_SURFACE,
  PULSETECH_CHAT_ICON,
  chatAvatarMonogram,
} from "../src/lib/chatAvatar";
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
  phone: "(512) 555-0142",
  email: "hello@summit.test",
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
  assert(HOME_CHAT_LAYOUT.desktopPanelHeightPx === 560, "homepage desktop chat 560");
  assert(HOME_CHAT_LAYOUT.mobilePanelHeightPx === 430, "homepage mobile chat 430");
  assert(
    PULSETECH_CANVAS_GRADIENT ===
      "linear-gradient(160deg, #023047 0%, #03485f 42%, #012536 100%)",
    "canonical navy-blue canvas token"
  );
  assert(
    !("customerPanelWidthPx" in DEMO_CHAT_LAYOUT),
    "customer panel must not be width-capped"
  );

  const workspace = readSrc("src/components/DemoWorkspace.tsx");
  assert(
    workspace.includes("VoiceDemoCard"),
    "personalized demo page must include voice demo card"
  );
  assert(
    workspace.includes("pt-voice-demo-wrap"),
    "voice demo card must sit outside the two chat panels"
  );
  assert(
    workspace.includes('id="phone-test"'),
    "phone-test section needs a stable mobile scroll target"
  );
  assert(
    !/className="pt-content[^"]*overflow-x-hidden/.test(workspace),
    "demo content must not use overflow-x-hidden (clips phone card on Android)"
  );
  const wrapIndex = workspace.indexOf("pt-voice-demo-wrap");
  const customerIndex = workspace.indexOf("data-demo-customer-panel");
  assert(
    customerIndex >= 0 && wrapIndex > customerIndex,
    "voice demo wrap must render after the customer chat panel"
  );

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
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/.test(css),
    "desktop grid must be equal 50/50 columns"
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
    cssHasRule(css, ".pt-demo-panel-customer", /width:\s*100%/),
    "customer panel fills its equal grid column"
  );
  assert(!css.includes("--pt-demo-customer-width"), "no customer width CSS variable");
  assert(!/max-w-\[420px\]/.test(css), "no 420px max-width on demo workspace");
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
  assert(chatMessage.includes('data-chat-role={isUser ? "user" : "assistant"}'), "role marker");
  assert(chatMessage.includes("bg-blue-600 text-white"), "outgoing bubble PulseTech blue + white text");
  assert(chatMessage.includes("bg-white text-slate-800"), "assistant bubble white + dark text");

  assert(
    /\[data-chat-role="user"\][\s\S]{0,160}background:\s*#209ebb/.test(css) &&
      /\[data-chat-role="user"\][\s\S]{0,200}color:\s*#ffffff/.test(css),
    "demo outgoing bubbles are PulseTech blue with white text"
  );
  assert(
    /\[data-chat-role="assistant"\][\s\S]{0,160}background:\s*#ffffff/.test(css) &&
      /\[data-chat-role="assistant"\][\s\S]{0,200}color:\s*#1e293b/.test(css),
    "demo assistant bubbles stay dark text on white"
  );
  assert(
    !/\[data-chat-role="user"\][\s\S]{0,120}background:\s*#fff(?:fff)?\b/.test(css),
    "outgoing bubbles must not be white"
  );

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
  assert(!html.includes("--pt-demo-customer-width"), "no 420px customer width var");
  assert(/560px/.test(html), "inline layout height 560");
  assert(!html.includes("420px"), "customer chat must not be 420px capped");
  assert(!html.includes("max-w-none"), "customer chat must not drop max-width");
  assert(html.includes("1 · Customize"), "setup panel label");
  assert(html.includes("2 · Test as a customer"), "customer panel label");
  assert(
    html.includes("Guide your setup on the left. Test the customer experience on the right."),
    "desktop instruction copy"
  );
  assert(
    html.includes(
      "Customize your AI Sales Employee below. Then test the customer experience in the next chat."
    ),
    "mobile instruction copy"
  );
  assert(html.includes("Skip to customer test"), "mobile customer-test shortcut");
  assert(html.includes('id="customer-experience"'), "customer panel has a stable skip target");
  assert(html.includes("data-voice-demo-card"), "rendered voice demo card");
  assert(html.includes("3 · Test by phone"), "mobile phone-test step label");
  assert(
    html.includes(
      "Call this number to speak with your personalized AI Sales Employee."
    ),
    "mobile phone-test support line"
  );
  assert(css.includes("color: #b45309"), "customer label uses readable burnt orange");
  assert(
    !cssHasRule(css, ".pt-demo-label-customer", /#ffb701|#fc8500/i),
    "customer label must not use pale gold or light orange"
  );
  assert(
    css.includes("overscroll-behavior: contain"),
    "inner transcripts contain overscroll so the card height stays fixed"
  );
  assert(
    !/@media \(max-width: 1023\.98px\)[\s\S]{0,800}height:\s*auto/.test(css),
    "mobile demo panels must not grow with height:auto"
  );
  assert(
    css.includes("--pt-canvas: linear-gradient(160deg, #023047 0%, #03485f 42%, #012536 100%)"),
    "demo canvas uses canonical navy-blue token"
  );
  assert(
    !/--pt-demo-canvas:\s*linear-gradient\([^)]*#0b7285/.test(css),
    "demo canvas must not use the green/teal stop"
  );
  assert(
    css.includes(".pt-demo .pt-voice-demo"),
    "voice card has demo-scoped contrast styles"
  );

  assert(
    landingCss.includes("--pt-canvas: linear-gradient(160deg, #023047 0%, #03485f 42%, #012536 100%)"),
    "homepage canvas token matches desktop blue"
  );
  assert(
    landingCss.includes("background: var(--pt-canvas)"),
    "product canvas uses the canonical token on all viewports"
  );
  assert(
    /@media \(max-width: 639px\)[\s\S]*\.pt-product-canvas \{[\s\S]*?background:\s*var\(--pt-canvas\)/.test(
      landingCss
    ),
    "mobile product canvas keeps the same canvas token"
  );
  assert(
    landingCss.includes("[data-chat-agent-name]") &&
      landingCss.includes("color: #ffffff !important"),
    "Peter's name uses light text on the dark homepage header"
  );
  assert(
    landingCss.includes("height: 560px") &&
      landingCss.includes("max-height: 560px"),
    "desktop homepage chat shell is locked at 560px"
  );
  assert(
    landingCss.includes("height: 430px") &&
      landingCss.includes("max-height: 430px"),
    "375px homepage chat shell is locked at 430px"
  );
  assert(
    landingCss.includes(".pt-chat-body [data-chat-messages]") &&
      /overflow-y:\s*auto/.test(landingCss),
    "homepage transcripts scroll inside a stable shell"
  );
  assert(
    /\[data-chat-role="user"\][\s\S]{0,160}background:\s*#209ebb/.test(landingCss) &&
      /\[data-chat-role="user"\][\s\S]{0,220}color:\s*#ffffff/.test(landingCss),
    "homepage outgoing bubbles are PulseTech blue with white text"
  );
  assert(
    /\[data-chat-role="assistant"\][\s\S]{0,160}background:\s*#ffffff/.test(landingCss) &&
      /\[data-chat-role="assistant"\][\s\S]{0,200}color:\s*#1e293b/.test(landingCss),
    "homepage assistant bubbles stay dark text on white"
  );

  const agentShell = readSrc("src/components/Chat/ChatAgentShell.tsx");
  assert(
    agentShell.includes("data-chat-agent-name"),
    "agent name has a contrast hook for dark homepage headers"
  );
  assert(
    agentShell.includes("data-compact-avatar") &&
      agentShell.includes("data-compact-avatar-fallback") &&
      agentShell.includes("CHAT_AVATAR_SURFACE") &&
      agentShell.includes("object-contain") &&
      agentShell.includes("fallbackLabel"),
    "chat headers use adaptive avatar surface + monogram fallback"
  );

  const demoWorkspace = readSrc("src/components/DemoWorkspace.tsx");
  assert(
    demoWorkspace.includes("PULSETECH_CHAT_ICON") ||
      demoWorkspace.includes("/branding/pulsetech-icon-color.svg"),
    "two-panel demo uses the tracked PulseTech identity icon for Peter"
  );
  assert(
    !/pulsetechlabs\.com\/wp-content\/uploads\/2026\/07\/PulseTech-Labs-Logo-icon/i.test(
      demoWorkspace
    ),
    "two-panel demo must not depend on the remote webp avatar URL"
  );

  const customerAi = readSrc("src/components/CustomerAI.tsx");
  assert(
    customerAi.includes("fallbackLabel={business.businessName"),
    "customer chat monogram falls back to the business name"
  );

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

const TIMING_ACK = buildSuccessfulLeadHandoffCustomerMessage(
  "Maya",
  "tomorrow morning"
);

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

  const arrangeClaim = validateSalesReply(
    "Great — we'll arrange a site assessment for you.",
    securedLead({ currentObjective: "ADVANCE_TO_NEXT_STEP", preferredTiming: null }),
    business
  );
  assert(!arrangeClaim.ok, "must not say we'll arrange a site assessment");
  assert(
    arrangeClaim.reasons.some((r) => /confirmed site assessment|we'll arrange/i.test(r)),
    arrangeClaim.reasons.join("; ")
  );

  const yesAck = validateSalesReply(
    SITE_ASSESSMENT_TEAM_ALERT_ASK,
    securedLead({
      currentObjective: "ADVANCE_TO_NEXT_STEP",
      preferredTiming: null,
      appointmentIntent: true,
    }),
    business
  );
  assert(
    yesAck.ok,
    `yes → preferred-time ask should pass: ${yesAck.reasons.join("; ")}`
  );
  assert(
    !/\bi('ll| will) alert the team\b/i.test(SITE_ASSESSMENT_TEAM_ALERT_ASK) &&
      !/\brecorded your request\b/i.test(SITE_ASSESSMENT_TEAM_ALERT_ASK) &&
      !/\bshared your request\b/i.test(SITE_ASSESSMENT_TEAM_ALERT_ASK),
    "preferred-time ask must not promise an alert before handoff is queued"
  );

  const afterSent = { ...after, leadDeliveryStatus: "SENT" as const };
  const good = validateSalesReply(TIMING_ACK, afterSent, business);
  assert(good.ok, `preferred-time ack should pass: ${good.reasons.join("; ")}`);
  assert(
    TIMING_ACK.includes("earliest available appointment") ||
      /preferred time.*confirm availability/i.test(TIMING_ACK),
    "preferred-time ack must note preference and team confirmation"
  );
  assert(
    /We'll note tomorrow morning as your preferred time/i.test(TIMING_ACK),
    "preferred-time ack must use natural preferred-time wording"
  );
  assert(
    !/\bnot booked yet\b/i.test(TIMING_ACK),
    "preferred-time ack should not use stiff not-booked-yet phrasing by default"
  );
  assert(
    shouldAttemptLeadHandoff(after, "closure", "Can you arrange tomorrow morning?"),
    "name/phone/address/preferred time must auto-trigger handoff"
  );

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
  assert(
    email.text.includes(
      "Contact the customer to confirm availability for their preferred time. The requested time has not been confirmed or booked with the customer."
    ),
    "internal email NEXT STEP must use the preferred-time confirmation wording"
  );
  assert(
    !email.text.includes("Do not treat the time as booked."),
    "internal email must not keep the old next-step wording"
  );
  assert(
    shouldAttemptLeadHandoff(after, "closure", "Can you arrange tomorrow morning?"),
    "captured visit preference must send/keep the internal alert immediately"
  );

  const comeTomorrow = updateSalesStateFromTurn(
    securedLead(),
    [{ role: "user", content: "Can you come tomorrow?" }],
    business
  );
  assert(
    /tomorrow/i.test(comeTomorrow.preferredTiming || ""),
    "Can you come tomorrow? must capture preferred_visit_time"
  );
  const tomorrowAck = validateSalesReply(
    TIMING_ACK,
    { ...comeTomorrow, leadDeliveryStatus: "SENT" },
    business
  );
  assert(
    tomorrowAck.ok,
    `immediate-response wording must pass: ${tomorrowAck.reasons.join("; ")}`
  );

  const invented = validateSalesReply(
    "Would you prefer next week, 2–4 weeks, or later?",
    after,
    business
  );
  assert(!invented.ok, "must not invent future scheduling ranges");
  assert(
    invented.reasons.some((r) => /scheduling range|time-window menu/i.test(r)),
    invented.reasons.join("; ")
  );

  const askPreferred = validateSalesReply(
    SITE_ASSESSMENT_TEAM_ALERT_ASK,
    securedLead({
      currentObjective: "ADVANCE_TO_NEXT_STEP",
      preferredTiming: null,
      appointmentIntent: true,
    }),
    business
  );
  assert(
    askPreferred.ok,
    `non-urgent site-assessment ask should pass: ${askPreferred.reasons.join("; ")}`
  );
  assert(
    ASK_PREFERRED_DAY_TIME.includes("What day or time would you prefer?"),
    "short preferred-day ask remains available for voice"
  );
  assert(
    !PRE_QUEUE_ALERT_PROMISE_RE.test(ASK_PREFERRED_DAY_TIME) &&
      !PRE_QUEUE_ALERT_PROMISE_RE.test(SITE_ASSESSMENT_TEAM_ALERT_ASK) &&
      !PRE_QUEUE_ALERT_PROMISE_RE.test(ASK_EXPLICIT_AGREEMENT),
    "preferred-time and agreement asks must not promise an alert before queue"
  );

  const urgentTurn = updateSalesStateFromTurn(
    securedLead(),
    [{ role: "user", content: "Can you come today? I need this as soon as possible." }],
    business
  );
  assert(urgentTurn.urgency === "IMMEDIATE", `urgency should be IMMEDIATE, got ${urgentTurn.urgency}`);
  assert(
    shouldAttemptLeadHandoff(
      urgentTurn,
      "closure",
      "Can you come today? I need this as soon as possible."
    ),
    "urgent visit request must trigger an immediate internal alert"
  );
  const urgentEmail = buildLeadNotificationEmail(business, urgentTurn);
  assert(/URGENT/i.test(urgentEmail.subject), "urgent website alert subject");
  assert(urgentEmail.text.includes("IMMEDIATE"), "urgent website alert body");

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

  const timingOnly = validateSalesReply(
    TIMING_ACK,
    { ...afterTiming, leadDeliveryStatus: "SENT" },
    solarBusiness
  );
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

function testTexasSolarLogo() {
  const bundled = getBundledTestDemo(TEXAS_SOLAR_TEST_DEMO_ID);
  assert(!!bundled, "texassolar bundled demo must exist");
  assert(
    texasSolarProfessionalTestProfile.logo === TEXAS_SOLAR_LOGO_URL,
    "Texas Solar test profile must use the texassolar.pro favicon/site-icon URL"
  );
  assert(
    /^https:\/\/texassolar\.pro\/wp-content\/uploads\/.+cropped-web-app-manifest.+\.png$/i.test(
      texasSolarProfessionalTestProfile.logo
    ),
    "logo must be the absolute cropped web-app-manifest favicon URL"
  );
  assert(
    bundled!.profile.logo === TEXAS_SOLAR_LOGO_URL,
    "bundled texassolar demo must expose the same favicon"
  );
  assert(
    !texasSolarProfessionalTestProfile.logo.includes("/2025/06/2-3-1.png"),
    "must not use the wide white wordmark as the chat avatar"
  );
  console.log("PASS — Texas Solar test profile stores favicon/site-icon URL");
}

function dallasPlumbingProfile(): BusinessProfile {
  return {
    website: "https://dallasplumbing.co",
    businessName: "Dallas Plumbing Co",
    tagline: "Plumbing done right",
    logo: "https://dallasplumbing.co/favicon.ico",
    primaryColor: "#1d4ed8",
    secondaryColor: "#0f172a",
    phone: "2145550100",
    email: "hello@dallasplumbing.co",
    address: "Dallas, TX",
    services: ["Drain cleaning", "Water heater repair"],
    serviceAreas: ["Dallas", "Plano"],
    faqs: [],
    leadQuestions: ["What is your name?"],
    systemPrompt: "Represent Dallas Plumbing Co only.",
    isTestData: false,
  };
}

async function testPersonalizedDemoSaveAndLoad() {
  const previous = {
    vercel: process.env.VERCEL,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: globalThis.fetch,
  };

  process.env.VERCEL = "1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

  const store = new Map<
    string,
    { id: string; profile: BusinessProfile; updated_at: string }
  >();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes("/rest/v1/business_profiles")) {
      throw new Error("unexpected fetch: " + url);
    }
    if ((init?.method || "GET").toUpperCase() === "POST") {
      const body = JSON.parse(String(init?.body || "{}")) as {
        id: string;
        profile: BusinessProfile;
        updated_at: string;
      };
      store.set(body.id, body);
      return new Response(null, { status: 201 });
    }
    const match = url.match(/id=eq\.([^&]+)/);
    const id = match ? decodeURIComponent(match[1]) : "";
    const row = store.get(id);
    return new Response(JSON.stringify(row ? [row] : []), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const generatedId = createPersonalizedDemoId("https://dallasplumbing.co");
    assert(generatedId !== TEXAS_SOLAR_TEST_DEMO_ID, "generated id must not be texassolar");
    assert(
      generatedId.startsWith("dallasplumbing-"),
      "generated id should be derived from the entered website"
    );
    assert(
      createPersonalizedDemoId("https://texassolar.pro") !== TEXAS_SOLAR_TEST_DEMO_ID,
      "analyzing the sample site must not reuse the showcase slug"
    );

    const commit = await saveNewPersonalizedDemo(dallasPlumbingProfile());
    assert(commit.persisted === true, "successful supabase write must persist");
    assert(commit.durable === true, "successful supabase write must be durable");
    assert(isInvitationSaveReady(commit), "invitation requires a durable saved demo");
    assert(commit.demo.id !== TEXAS_SOLAR_TEST_DEMO_ID, "saved id is not the showcase");
    assert(
      commit.demo.profile.businessName === "Dallas Plumbing Co",
      "saved business must be the analyzed company"
    );
    assert(
      !/texas solar/i.test(commit.demo.profile.businessName),
      "generated business must not be Texas Solar"
    );
    assert(
      invitationPathForDemoId(commit.demo.id) === "/demo/" + encodeURIComponent(commit.demo.id),
      "invitation path uses the exact saved id"
    );

    const loaded = await loadSharedProfile(commit.demo.id);
    assert(Boolean(loaded), "saved demo must load by id");
    assert(
      loaded?.profile.businessName === "Dallas Plumbing Co",
      "loaded demo must keep Dallas Plumbing details"
    );
    assert(
      Boolean(loaded?.profile.services.includes("Drain cleaning")),
      "loaded customer chat profile must include the new business services"
    );

    const showcase = getBundledTestDemo(TEXAS_SOLAR_TEST_DEMO_ID);
    assert(showcase?.profile.businessName === "Texas Solar Professional", "showcase fixture remains");

    console.log("PASS — personalized demo save-and-load is independent of Texas Solar");
  } finally {
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    globalThis.fetch = previous.fetch;
  }
}

async function testPersonalizedDemoFailedSave() {
  const previous = {
    vercel: process.env.VERCEL,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: globalThis.fetch,
  };

  process.env.VERCEL = "1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";

  globalThis.fetch = (async () => new Response(null, { status: 500 })) as typeof fetch;

  try {
    const commit = await saveNewPersonalizedDemo(dallasPlumbingProfile());
    assert(commit.persisted === false, "failed supabase write must not persist");
    assert(
      isInvitationSaveReady(commit) === false,
      "failed save must not produce an invitation"
    );
    console.log("PASS — failed demo save does not return an invitation");
  } finally {
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    globalThis.fetch = previous.fetch;
  }
}

function testHomepageDoesNotHardcodeTexasSolar() {
  const assistant = readSrc("src/components/PulseTechSalesAssistant.tsx");
  const analyzeRoute = readSrc("src/app/api/analyze/route.ts");
  const websiteInput = readSrc("src/components/WebsiteInput.tsx");
  const analyzer = readSrc("src/lib/aiAnalyzer.ts");

  assert(
    !/texassolar|Texas Solar Professional/i.test(assistant),
    "homepage onboarding must not hardcode Texas Solar"
  );
  assert(
    assistant.includes("openSavedDemo"),
    "homepage must open only a server-saved demo"
  );
  assert(
    !assistant.includes("savePendingDemo"),
    "homepage must not treat browser memory as the invitation source"
  );
  assert(
    analyzeRoute.includes("saveNewPersonalizedDemo"),
    "analyze API must create the unique demo record"
  );
  assert(
    analyzeRoute.includes("isInvitationSaveReady"),
    "analyze API must refuse invitation URLs when save fails"
  );
  assert(
    analyzeRoute.includes("SETUP_SAVE_FAILED_MESSAGE"),
    "failed save must return the setup error, not an invitation"
  );
  assert(
    assistant.includes("could not save your demo"),
    "homepage must show the setup-save error copy"
  );
  assert(
    !/texassolar\.pro/i.test(websiteInput),
    "website input must not default to the sample company"
  );
  assert(
    !/Texas Solar Professional|texassolar/i.test(analyzer),
    "analyzer must not bake in the sample company"
  );
  console.log("PASS — homepage/runtime creation path has no Texas Solar hardcoding");
}

function smilePestProfile(): BusinessProfile {
  return {
    website: "https://smilepest.test",
    businessName: "Smile Pest Control",
    tagline: "",
    logo: "",
    primaryColor: "",
    secondaryColor: "",
    phone: "",
    email: "",
    address: "",
    services: ["Pest control"],
    serviceAreas: ["Dallas"],
    faqs: [],
    leadQuestions: [],
    systemPrompt: "Represent Smile Pest Control only.",
    isTestData: false,
  };
}

function otherPestProfile(): BusinessProfile {
  return {
    ...smilePestProfile(),
    website: "https://northtexaspest.test",
    businessName: "North Texas Pest",
    systemPrompt: "Represent North Texas Pest only.",
  };
}

function qualifiedWebsiteLead(businessKey: string): SalesState {
  return {
    ...createInitialSalesState({
      conversationId: "conv_lead_alert_" + businessKey.slice(-12),
      businessKey,
    }),
    intent: "HIGH",
    leadStatus: "SECURED",
    handoffReady: true,
    customerAgreed: true,
    currentObjective: "CLOSE",
    lead: {
      name: "Jordan",
      phone: "2145550199",
      email: null,
      address: "200 Main St, Dallas TX",
    },
    customerNeed: "Kitchen is clogged and needs pest treatment today.",
    preferredTiming: "today",
  };
}

async function withMockSupabase(
  run: (store: Map<string, { id: string; profile: BusinessProfile; updated_at: string }>) => Promise<void>
) {
  const previous = {
    vercel: process.env.VERCEL,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: globalThis.fetch,
    dryRun: process.env.LEAD_HANDOFF_DRY_RUN,
    fallbackEmail: process.env.LEAD_NOTIFICATION_EMAIL,
    fallbackSms: process.env.PHONE_AGENT_ALERT_PHONE,
  };

  process.env.VERCEL = "1";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  process.env.LEAD_HANDOFF_DRY_RUN = "true";
  process.env.LEAD_NOTIFICATION_EMAIL = "pulsetech-fallback@example.test";
  process.env.PHONE_AGENT_ALERT_PHONE = "+15550000000";

  const store = new Map<
    string,
    { id: string; profile: BusinessProfile; updated_at: string }
  >();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.includes("/rest/v1/business_profiles")) {
      throw new Error("unexpected fetch: " + url);
    }
    if ((init?.method || "GET").toUpperCase() === "POST") {
      const body = JSON.parse(String(init?.body || "{}")) as {
        id: string;
        profile: BusinessProfile;
        updated_at: string;
      };
      store.set(body.id, body);
      return new Response(null, { status: 201 });
    }
    const match = url.match(/id=eq\.([^&]+)/);
    const id = match ? decodeURIComponent(match[1]) : "";
    const row = store.get(id);
    return new Response(JSON.stringify(row ? [row] : []), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await run(store);
  } finally {
    if (previous.vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous.vercel;
    if (previous.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    if (previous.dryRun === undefined) delete process.env.LEAD_HANDOFF_DRY_RUN;
    else process.env.LEAD_HANDOFF_DRY_RUN = previous.dryRun;
    if (previous.fallbackEmail === undefined) delete process.env.LEAD_NOTIFICATION_EMAIL;
    else process.env.LEAD_NOTIFICATION_EMAIL = previous.fallbackEmail;
    if (previous.fallbackSms === undefined) delete process.env.PHONE_AGENT_ALERT_PHONE;
    else process.env.PHONE_AGENT_ALERT_PHONE = previous.fallbackSms;
    globalThis.fetch = previous.fetch;
  }
}

async function testPerBusinessLeadAlerts() {
  assert(isValidLeadAlertEmail("owner@smilepest.test"), "valid email accepted");
  assert(!isValidLeadAlertEmail("not-an-email"), "invalid email rejected");
  assert(normalizeLeadAlertSms("2145550189") === "+12145550189", "US 10-digit normalizes");
  assert(normalizeLeadAlertSms("+12145550189") === "+12145550189", "E.164 accepted");
  assert(normalizeLeadAlertSms("555") === null, "short number rejected");

  const engine = readSrc("src/components/PulseTechEngineChat.tsx");
  const copy = readSrc("src/lib/leadAlertRecipients.ts");
  assert(copy.includes(LEAD_ALERT_EMAIL_PROMPT), "email prompt copy is exact");
  assert(copy.includes(LEAD_ALERT_SMS_PROMPT), "SMS prompt copy is exact");
  assert(engine.includes("LEAD_ALERT_EMAIL_PROMPT"), "Peter asks for the alert email");
  assert(engine.includes("LEAD_ALERT_SMS_PROMPT"), "Peter asks for the alert SMS number");
  assert(engine.includes("formatLeadAlertsConfigured"), "Peter confirms saved recipients");
  assert(
    readSrc("src/app/api/demo/[id]/route.ts").includes("loadSharedProfile"),
    "GET /api/demo/[id] reloads the shared profile"
  );

  await withMockSupabase(async () => {
    const savedA = await commitSharedProfile("lead-alert-a", {
      ...smilePestProfile(),
      leadNotificationEmail: "alerts-a@smilepest.test",
      leadNotificationPhone: "+12145550101",
    });
    const savedB = await commitSharedProfile("lead-alert-b", {
      ...otherPestProfile(),
      leadNotificationEmail: "alerts-b@northtexaspest.test",
      leadNotificationPhone: "+12145550102",
    });

    assert(savedA.persisted && savedA.demo.profile.leadNotificationEmail === "alerts-a@smilepest.test", "business A email saved");
    assert(savedA.demo.profile.leadNotificationPhone === "+12145550101", "business A SMS saved");
    assert(savedB.persisted && savedB.demo.profile.leadNotificationEmail === "alerts-b@northtexaspest.test", "business B email saved");
    assert(savedB.demo.profile.leadNotificationPhone === "+12145550102", "business B SMS saved");

    const loadedA = await loadSharedProfile("lead-alert-a");
    const loadedB = await loadSharedProfile("lead-alert-b");
    assert(
      loadedA?.profile.leadNotificationEmail === "alerts-a@smilepest.test" &&
        loadedA.profile.leadNotificationPhone === "+12145550101",
      "GET-equivalent load returns business A recipients"
    );
    assert(
      loadedB?.profile.leadNotificationEmail === "alerts-b@northtexaspest.test" &&
        loadedB.profile.leadNotificationPhone === "+12145550102",
      "GET-equivalent load returns business B recipients"
    );

    const routeA = resolveWebsiteChatLeadAlert(loadedA!.profile);
    const routeB = resolveWebsiteChatLeadAlert(loadedB!.profile);
    assert(routeA.ok && routeA.email === "alerts-a@smilepest.test" && routeA.sms === "+12145550101", "A routes to A");
    assert(routeB.ok && routeB.email === "alerts-b@northtexaspest.test" && routeB.sms === "+12145550102", "B routes to B");
    assert(routeA.ok && routeB.ok && routeA.email !== routeB.email && routeA.sms !== routeB.sms, "A and B recipients are isolated");

    const sendA = await maybeSendLeadHandoff(
      loadedA!.profile,
      qualifiedWebsiteLead("https://smilepest.test"),
      "closure",
      "Yes, let's do it."
    );
    const sendB = await maybeSendLeadHandoff(
      loadedB!.profile,
      qualifiedWebsiteLead("https://northtexaspest.test"),
      "closure",
      "Yes, let's do it."
    );
    assert(sendA.status === "SENT" && sendA.emailTo === "alerts-a@smilepest.test" && sendA.smsTo === "+12145550101", "A alert uses only A");
    assert(sendB.status === "SENT" && sendB.emailTo === "alerts-b@northtexaspest.test" && sendB.smsTo === "+12145550102", "B alert uses only B");
    assert(sendA.emailTo !== "pulsetech-fallback@example.test", "A does not use PulseTech fallback email");
    assert(sendA.smsTo !== "+15550000000", "A does not use PulseTech fallback SMS");

    const missing = resolveWebsiteChatLeadAlert(smilePestProfile());
    assert(!missing.ok && missing.error === LEAD_ALERT_SETUP_NEEDED_ERROR, "missing recipients are setup-needed");
    const missingSend = await maybeSendLeadHandoff(
      smilePestProfile(),
      qualifiedWebsiteLead("https://smilepest.test"),
      "closure",
      "Yes, let's do it."
    );
    assert(missingSend.status === "FAILED", "missing recipients send no alert");
    assert(!missingSend.emailTo && !missingSend.smsTo, "failed setup does not expose a fallback recipient");
    assert(missingSend.error === LEAD_ALERT_SETUP_NEEDED_ERROR, "failed setup returns a clear error");

    const invalid = resolveWebsiteChatLeadAlert({
      ...smilePestProfile(),
      leadNotificationEmail: "not-valid",
      leadNotificationPhone: "555",
    });
    assert(!invalid.ok, "invalid recipients send no alert");

    assert(shouldCollectLeadAlertSetup(smilePestProfile()) === true, "generated demo collects alerts");
    assert(
      shouldCollectLeadAlertSetup(texasSolarProfessionalTestProfile) === false,
      "Texas Solar showcase skips the collection chat"
    );
    assert(
      formatLeadAlertsConfigured("a@x.test", "+12145550189").includes("Lead alerts configured"),
      "confirmation copy"
    );
  });

  console.log("PASS — per-business lead alerts save, isolate, reload, and never fallback");
}

function testCustomerFacingHandoffWording() {
  const success = buildSuccessfulLeadHandoffCustomerMessage(
    "Maya",
    "tomorrow morning"
  );
  assert(isSuccessfulLeadHandoffCustomerMessage(success), "success helper matches wording");
  assert(/Thanks, Maya/.test(success), "success uses customer name");
  assert(/shared your request with the team/.test(success), "success says request was shared");
  assert(
    /We'll note tomorrow morning as your preferred time/i.test(success),
    "success notes preferred time naturally"
  );
  assert(
    /team will contact you at the number you provided to confirm availability/i.test(
      success
    ),
    "success says the team will contact the customer at the number they provided"
  );
  assert(
    !success.includes(business.phone) && !/\bif you prefer to call\b/i.test(success),
    "success close must not include the business phone number"
  );
  assert(!/\bnot booked yet\b/i.test(success), "default success copy avoids stiff not-booked-yet");
  assert(!/\bbooked\b/i.test(success), "success must not claim booked");

  const queued = buildQueuedLeadHandoffCustomerMessage(
    "Maya",
    "tomorrow morning"
  );
  assert(isQueuedLeadHandoffCustomerMessage(queued), "queued helper matches wording");
  assert(/recorded your request/i.test(queued), "queued says the request was recorded");
  assert(/noted tomorrow morning as your preferred time/i.test(queued), "queued notes preferred time");
  assert(!/shared your request with the team/i.test(queued), "queued must not claim the request was shared");

  const failed = buildFailedLeadHandoffCustomerMessage(business);
  assert(isFailedLeadHandoffCustomerMessage(failed), "failed helper matches wording");
  assert(/unable to send your request to the team/.test(failed), "failed does not fake an alert");
  assert(failed.includes("(512) 555-0142") || failed.includes("hello@summit.test"), "failed includes business contact");
  assert(!/handoff failed|lead hasn'?t been sent|office hasn'?t been reached/i.test(failed), "failed copy is customer-safe");

  const sentState = securedLead({
    preferredTiming: "tomorrow morning",
    currentObjective: "ADVANCE_TO_NEXT_STEP",
    leadDeliveryStatus: "SENT",
  });
  const successValidation = validateSalesReply(success, sentState, business);
  assert(successValidation.ok, `success wording must pass: ${successValidation.reasons.join("; ")}`);

  const queuedState = { ...sentState, leadDeliveryStatus: "QUEUED" as const };
  const queuedValidation = validateSalesReply(queued, queuedState, business);
  assert(queuedValidation.ok, `queued wording must pass: ${queuedValidation.reasons.join("; ")}`);
  const falseSuccessOnQueued = validateSalesReply(success, queuedState, business);
  assert(!falseSuccessOnQueued.ok, "must not claim the team was alerted while delivery is queued");

  const failedState = { ...sentState, leadDeliveryStatus: "FAILED" as const };
  const failedValidation = validateSalesReply(failed, failedState, business);
  assert(failedValidation.ok, `failed wording must pass: ${failedValidation.reasons.join("; ")}`);

  const falseSuccessOnFail = validateSalesReply(success, failedState, business);
  assert(!falseSuccessOnFail.ok, "must not claim the team was alerted after a failed send");

  for (const leak of [
    "The lead hasn’t been sent yet.",
    "The office hasn’t been reached yet.",
    "The handoff failed, so the email/SMS was not delivered.",
  ]) {
    const leaked = validateSalesReply(leak, failedState, business);
    assert(!leaked.ok, `must reject internal status: ${leak}`);
  }

  const resolvedSuccess = resolveWebsiteChatCustomerHandoffReply({
    attempted: true,
    status: "SENT",
    currentObjective: "ADVANCE_TO_NEXT_STEP",
    customerName: "Maya",
    preferredTiming: "tomorrow morning",
    business,
  });
  assert(resolvedSuccess === success, "successful handoff uses the customer-facing close");

  const resolvedQueued = resolveWebsiteChatCustomerHandoffReply({
    attempted: true,
    status: "QUEUED",
    currentObjective: "ADVANCE_TO_NEXT_STEP",
    customerName: "Maya",
    preferredTiming: "tomorrow morning",
    business,
  });
  assert(resolvedQueued === queued, "queued handoff uses recorded-request wording");

  const resolvedFailed = resolveWebsiteChatCustomerHandoffReply({
    attempted: true,
    status: "FAILED",
    currentObjective: "CLOSE",
    customerName: "Maya",
    business,
  });
  assert(resolvedFailed === failed, "failed handoff uses the contact-the-business fallback");

  const priceAfterCapture = resolveWebsiteChatCustomerHandoffReply({
    attempted: false,
    status: "SENT",
    currentObjective: "HANDLE_PRICE_OBJECTION",
    customerName: "Maya",
    business,
  });
  assert(priceAfterCapture === null, "price questions after capture must not repeat handoff wording");

  const closeOnCaptureTurn = resolveWebsiteChatCustomerHandoffReply({
    attempted: true,
    status: "SENT",
    currentObjective: "PRESENT_SOLUTION",
    customerName: "Maya",
    preferredTiming: "tomorrow morning",
    business,
  });
  assert(
    closeOnCaptureTurn === success,
    "the capture turn must close immediately even if the objective is not CLOSE"
  );

  const priceState = {
    ...sentState,
    currentObjective: "HANDLE_PRICE_OBJECTION" as const,
    customerAskedAboutFee: true,
  };
  const priceReply = validateSalesReply(
    "A $79 site-visit fee applies. The team can explain the details before any visit is confirmed.",
    { ...priceState, siteVisitFeeLabel: "$79" },
    solarBusiness
  );
  assert(priceReply.ok, `price after capture should pass: ${priceReply.reasons.join("; ")}`);

  console.log("PASS — customer-facing handoff success and failure wording");
}

function testCompoundPriceAndPreferredTime() {
  const compoundMsg =
    "How do you charge? Hourly or for full work? Please keep the appointment for tomorrow evening.";
  assert(
    messageAsksPricingOrBilling(compoundMsg),
    "compound message must be detected as pricing/billing"
  );

  const roofingBusiness: BusinessProfile = {
    ...business,
    website: "https://ridgecrest-roofing.test",
    businessName: "Ridgecrest Roofing",
    services: ["Roof inspection", "Shingle repair", "Storm damage assessment"],
    pricingRules: "",
    leadNotificationEmail: "alerts@ridgecrest-roofing.test",
    leadNotificationPhone: "+12145550177",
  };

  const prior = securedLead({
    businessKey: roofingBusiness.website,
    customerNeed: "Storm damaged shingles need inspection and repair.",
    lead: {
      name: "Sam Rivera",
      phone: "4695550188",
      email: null,
      address: "8801 Mockingbird Ln, Dallas TX",
    },
    preferredTiming: null,
    currentObjective: "PRESENT_SOLUTION",
    leadDeliveryStatus: "NOT_SENT",
  });

  const after = updateSalesStateFromTurn(
    prior,
    [
      {
        role: "assistant",
        content: "Thanks Sam — I have your details. What day or time would you prefer?",
      },
      { role: "user", content: compoundMsg },
    ],
    roofingBusiness
  );

  assert(
    /tomorrow evening/i.test(after.preferredTiming || ""),
    `preferred time must be captured from compound message, got ${after.preferredTiming}`
  );
  assert(
    after.currentObjective === "HANDLE_PRICE_OBJECTION",
    `compound price+timing should pursue pricing, got ${after.currentObjective}`
  );
  assert(
    shouldAttemptLeadHandoff(after, "closure", compoundMsg),
    "compound message with complete lead must still trigger handoff"
  );

  const pricingOnly = buildPricingApproachAnswer(roofingBusiness);
  assert(
    /depends on the diagnosis|verified price to quote|scope of work|site assessment|fixtures or materials/i.test(
      pricingOnly
    ),
    "without profile pricing rules, answer must be scope-dependent and not invent hourly/fixed"
  );
  assert(
    !/\bwe charge hourly\b/i.test(pricingOnly) &&
      !/\btypically charges hourly\b/i.test(pricingOnly) &&
      !/\btypically prices the full job\b/i.test(pricingOnly),
    "must not invent hourly or fixed pricing when profile is silent"
  );
  assert(
    !/\bteam can confirm\b/i.test(pricingOnly) &&
      !PRE_QUEUE_ALERT_PROMISE_RE.test(pricingOnly),
    "unverified pricing must not defer to a team confirm before handoff"
  );

  const hourlyApproach = buildPricingApproachAnswer({
    ...roofingBusiness,
    pricingRules: "",
    systemPrompt: "Labor is billed hourly.",
  });
  assert(
    /typically charges hourly/i.test(hourlyApproach),
    "when the profile establishes hourly billing, say that accurately"
  );
  assert(
    /depends on the diagnosis/i.test(hourlyApproach),
    "hourly approach without a quoted rate must still say the exact amount depends on diagnosis"
  );
  assert(
    !/\bteam can confirm\b/i.test(hourlyApproach) &&
      !PRE_QUEUE_ALERT_PROMISE_RE.test(hourlyApproach) &&
      !/\$\s?\d/.test(hourlyApproach),
    "hourly fallback must not invent an amount or promise a team confirm"
  );

  const reply = resolveWebsiteChatCustomerHandoffReply({
    attempted: true,
    status: "SENT",
    currentObjective: after.currentObjective,
    customerName: after.lead.name,
    preferredTiming: after.preferredTiming,
    business: roofingBusiness,
    latestUserMessage: compoundMsg,
  });
  assert(!!reply, "compound handoff reply must be produced");
  assert(
    /depends on the diagnosis|verified price to quote|scope of work|site assessment/i.test(
      reply!
    ),
    "compound reply must answer the pricing question"
  );
  assert(
    /shared your request with the team/i.test(reply!),
    "compound reply must still acknowledge the handoff"
  );
  assert(
    /We'll note tomorrow evening as your preferred time/i.test(reply!),
    "compound reply must note preferred time naturally"
  );
  assert(!/\bnot booked yet\b/i.test(reply!), "avoid stiff not-booked-yet by default");
  assert(!/\bbooked\b/i.test(reply!), "must not claim appointment is booked");

  const withHourly: BusinessProfile = {
    ...roofingBusiness,
    pricingRules: "Labor is billed hourly; materials are itemized separately.",
  };
  const hourlyReply = resolveWebsiteChatCustomerHandoffReply({
    attempted: true,
    status: "SENT",
    currentObjective: "HANDLE_PRICE_OBJECTION",
    customerName: "Sam Rivera",
    preferredTiming: "tomorrow evening",
    business: withHourly,
    latestUserMessage: compoundMsg,
  });
  assert(
    /hourly/i.test(hourlyReply || ""),
    "when profile establishes hourly pricing, the compound reply may use it"
  );

  console.log("PASS — compound price question + preferred time in one message");
}

function testRajaNameCaptureAndPreferredTime() {
  let state = createInitialSalesState({
    conversationId: "conv_raja_name",
    businessKey: business.website,
  });

  state = updateSalesStateFromTurn(
    state,
    [
      { role: "assistant", content: "Hi — how can I help today?" },
      {
        role: "user",
        content: "I want my central heating system fixed. Can you do it? And how much will it cost?",
      },
    ],
    business
  );

  state = updateSalesStateFromTurn(
    state,
    [
      { role: "assistant", content: "I can help with that. What's your first name?" },
      { role: "user", content: "Raja" },
    ],
    business
  );
  assert(state.lead.name === "Raja", `Raja must be stored as the name, got ${state.lead.name}`);
  assert(state.currentObjective !== "COLLECT_NAME", "valid first name must not stay on name capture");

  const confirmAsk = validateSalesReply(
    "Thanks — is your first name Raja?",
    state,
    business
  );
  assert(!confirmAsk.ok, "must not ask to confirm a normal entered first name");
  assert(
    confirmAsk.reasons.some((r) => /already-captured name|already-collected field: name/i.test(r)),
    confirmAsk.reasons.join("; ")
  );

  state = updateSalesStateFromTurn(
    state,
    [
      { role: "assistant", content: "Thanks Raja — what's the best number to reach you?" },
      { role: "user", content: "9898989898" },
    ],
    business
  );
  assert(state.lead.name === "Raja", "phone turn must not rewrite the name");

  state = updateSalesStateFromTurn(
    state,
    [
      { role: "assistant", content: "What's the service address?" },
      { role: "user", content: "1500 Marilla St, Dallas, TX 75201" },
    ],
    business
  );
  assert(state.lead.name === "Raja", "address turn must not rewrite the name");

  const preferred = "Tomorrow afternoon is good with me";
  assert(
    extractPreferredVisitTimeFromText(preferred) === "tomorrow afternoon",
    `preferred time must normalize to tomorrow afternoon, got ${extractPreferredVisitTimeFromText(preferred)}`
  );

  const named = {
    ...state,
    currentObjective: "COLLECT_NAME" as const,
  };
  const afterTime = updateSalesStateFromTurn(
    named,
    [
      { role: "assistant", content: "What day or time would you prefer? The team will confirm availability." },
      { role: "user", content: preferred },
    ],
    business
  );
  assert(afterTime.lead.name === "Raja", `preferred time must not overwrite name, got ${afterTime.lead.name}`);
  assert(
    afterTime.preferredTiming === "tomorrow afternoon",
    `preferred time stored cleanly, got ${afterTime.preferredTiming}`
  );

  const expected =
    "Thanks, Raja — I've recorded your request and noted tomorrow afternoon as your preferred time. The team will contact you at the number you provided to confirm availability.";
  const finalReply = resolveWebsiteChatCustomerHandoffReply({
    attempted: true,
    status: "QUEUED",
    currentObjective: afterTime.currentObjective,
    customerName: afterTime.lead.name,
    preferredTiming: afterTime.preferredTiming,
    business,
    latestUserMessage: preferred,
  });
  assert(finalReply === expected, `exact final reply, got ${finalReply}`);

  const confirmOverwrite = updateSalesStateFromTurn(
    afterTime,
    [
      { role: "assistant", content: "Thanks — is your first name Raja?" },
      { role: "user", content: "yes" },
    ],
    business
  );
  assert(
    confirmOverwrite.lead.name === "Raja",
    `confirmation must not replace Raja with a fragment, got ${confirmOverwrite.lead.name}`
  );

  console.log("PASS — Raja name capture, no confirmation, preferred-time isolation");
}

function testStickyPrimaryNeedInAlerts() {
  function run(opening: string) {
    let state = createInitialSalesState({
      conversationId: "conv_need_" + opening.slice(0, 12),
      businessKey: business.website,
    });
    state = updateSalesStateFromTurn(
      state,
      [{ role: "user", content: opening }],
      business
    );
    state = updateSalesStateFromTurn(
      state,
      [
        { role: "assistant", content: "What's your first name?" },
        { role: "user", content: "Sam" },
      ],
      business
    );
    state = updateSalesStateFromTurn(
      state,
      [
        { role: "assistant", content: "What's the best phone number?" },
        { role: "user", content: "5125550100" },
      ],
      business
    );
    state = updateSalesStateFromTurn(
      state,
      [
        { role: "assistant", content: "What's the service address?" },
        { role: "user", content: "88 Oak Ave, Austin TX 78701" },
      ],
      business
    );
    state = updateSalesStateFromTurn(
      state,
      [
        { role: "assistant", content: "What day or time would you prefer?" },
        { role: "user", content: "tomorrow afternoon" },
      ],
      business
    );
    return state;
  }

  const mosquito = run("I need mosquito treatment/inspection. Can you do it?");
  const mosquitoNeed = formatPrimaryNeedForAlert(mosquito);
  assert(mosquitoNeed === "Mosquito treatment / inspection", `mosquito label: ${mosquitoNeed}`);
  const mosquitoEmail = buildLeadNotificationEmail(business, mosquito);
  const mosquitoSms = buildWebsiteLeadSms(business, mosquito);
  assert(mosquitoEmail.text.includes(mosquitoNeed), "email has mosquito need");
  assert(mosquitoSms.includes("Need: Mosquito treatment / inspection"), "SMS has mosquito need");

  const driveway = run("I want my driveway sealed.");
  const drivewayNeed = formatPrimaryNeedForAlert(driveway);
  assert(drivewayNeed === "Driveway sealed", `driveway label: ${drivewayNeed}`);
  assert(buildLeadNotificationEmail(business, driveway).text.includes(drivewayNeed), "email has driveway need");
  assert(buildWebsiteLeadSms(business, driveway).includes("Need: Driveway sealed"), "SMS has driveway need");

  let none = createInitialSalesState({ conversationId: "conv_need_none", businessKey: business.website });
  none = updateSalesStateFromTurn(
    none,
    [
      { role: "assistant", content: "What's your first name?" },
      { role: "user", content: "Sam" },
    ],
    business
  );
  assert(formatPrimaryNeedForAlert(none) === "Not established", "no request stays Not established");

  console.log("PASS — sticky primary need in website-chat email and SMS", {
    mosquitoEmailNeed: mosquitoNeed,
    mosquitoSms,
    drivewayEmailNeed: drivewayNeed,
  });
}

function testGenericPreferredTimeLeadCapture() {
  assert(
    extractPreferredVisitTimeFromText("Tomorrow afternoon. How much will it cost?") ===
      "tomorrow afternoon",
    "must extract preferred time from a combined time + pricing message"
  );
  assert(
    extractPreferredVisitTimeFromText(
      "Tomorrow morning works, but what do you charge?"
    ) === "tomorrow morning",
    "must extract preferred time when a pricing question follows"
  );
  assert(
    extractPreferredVisitTimeFromText("Tommorow afternoon") === "tomorrow afternoon",
    "must tolerate the common Tommorow spelling"
  );

  const proceedAsk =
    "I can share typical pricing. Would you like me to arrange a site assessment?";
  const mixed = "Tomorrow afternoon. How much will it cost?";
  const prior = securedLead({
    preferredTiming: null,
    currentObjective: "PRESENT_SOLUTION",
    leadDeliveryStatus: "NOT_SENT",
    customerAgreed: false,
  });

  let state = updateSalesStateFromTurn(
    prior,
    [
      { role: "assistant", content: proceedAsk },
      { role: "user", content: mixed },
    ],
    business
  );
  assert(
    state.preferredTiming === "tomorrow afternoon",
    `combined message must persist preferredTiming, got ${state.preferredTiming}`
  );

  state = updateSalesStateFromTurn(
    state,
    [
      { role: "assistant", content: proceedAsk },
      { role: "user", content: mixed },
      {
        role: "assistant",
        content: "Pricing depends on the scope of work. Would you like me to arrange a site assessment?",
      },
      { role: "user", content: "How much will it cost?" },
    ],
    business
  );
  assert(
    state.preferredTiming === "tomorrow afternoon",
    `preferredTiming must stay sticky after a later pricing question, got ${state.preferredTiming}`
  );

  state = updateSalesStateFromTurn(
    state,
    [
      { role: "assistant", content: proceedAsk },
      { role: "user", content: mixed },
      {
        role: "assistant",
        content: "Pricing depends on the scope of work. Would you like me to arrange a site assessment?",
      },
      { role: "user", content: "Yes" },
    ],
    business
  );
  assert(
    state.preferredTiming === "tomorrow afternoon",
    `preferredTiming must stay sticky after Yes, got ${state.preferredTiming}`
  );

  const yesDecision = evaluateHandoffReadiness(state, "Yes");
  assert(yesDecision.handoffReady === true, "central evaluator must be ready after Yes");
  assert(
    yesDecision.missingRequiredFields.length === 0,
    `no missing fields after Yes, got ${yesDecision.missingRequiredFields.join(",")}`
  );

  let handoffAttempts = 0;
  const afterMixed = updateSalesStateFromTurn(
    prior,
    [
      { role: "assistant", content: proceedAsk },
      { role: "user", content: mixed },
    ],
    business
  );
  if (shouldAttemptLeadHandoff(afterMixed, "closure", mixed)) {
    handoffAttempts += 1;
  }
  const afterYesState = {
    ...state,
    leadDeliveryStatus: (handoffAttempts > 0 ? "QUEUED" : "NOT_SENT") as SalesState["leadDeliveryStatus"],
  };
  if (shouldAttemptLeadHandoff(afterYesState, "closure", "Yes")) {
    handoffAttempts += 1;
  }
  assert(
    handoffAttempts === 1,
    `combined time + pricing then Yes must queue exactly one handoff, got ${handoffAttempts}`
  );

  const missingPrior = securedLead({
    preferredTiming: null,
    currentObjective: "PRESENT_SOLUTION",
    leadDeliveryStatus: "NOT_SENT",
    customerAgreed: false,
  });
  const missingTime = updateSalesStateFromTurn(
    missingPrior,
    [
      { role: "assistant", content: proceedAsk },
      { role: "user", content: "Yes" },
    ],
    business
  );
  assert(!missingTime.preferredTiming, "Yes must not invent a preferred time");
  const missingDecision = evaluateHandoffReadiness(missingTime, "Yes");
  assert(
    missingDecision.handoffReady === false,
    "missing preferred time must not be handoff-ready"
  );
  assert(
    missingDecision.missingRequiredFields.includes("preferredTiming"),
    "central evaluator must report missing preferredTiming"
  );
  assert(
    !shouldAttemptLeadHandoff(missingTime, "closure", "Yes"),
    "missing preferred time must send no handoff"
  );
  const missingAsk = validateSalesReply(
    SITE_ASSESSMENT_TEAM_ALERT_ASK,
    missingTime,
    business
  );
  assert(
    missingAsk.ok,
    `missing preferred time must ask once: ${missingAsk.reasons.join("; ")}`
  );
  const claimedRecorded = validateSalesReply(
    "Thanks, Maya — I've recorded your request. The team will contact you at the number you provided to confirm availability.",
    missingTime,
    business
  );
  assert(!claimedRecorded.ok, "must not say the request was recorded without preferred time");

  const success = buildSuccessfulLeadHandoffCustomerMessage(
    "Maya",
    "tomorrow afternoon"
  );
  assert(
    !success.includes(business.phone) &&
      !/\bif you prefer to call\b/i.test(success) &&
      /contact you at the number you provided/i.test(success),
    "normal success close must not include the business phone number"
  );

  console.log("PASS — generic preferred-time capture, sticky Yes handoff, missing-time ask");
}

function testHighIntentLeadCaptureOrder() {
  const highIntentRequests = [
    "Our unit has no heat and no cooling. Can you help?",
    "The drain is clogged and I need it fixed.",
  ];

  for (const request of highIntentRequests) {
    const started = updateSalesStateFromTurn(
      createInitialSalesState({
        conversationId: "conv_high_intent_order",
        businessKey: business.website,
      }),
      [{ role: "user", content: request }],
      business
    );
    assert(
      started.intent === "HIGH" || started.intent === "READY_TO_ACT",
      `high-intent request must raise intent, got ${started.intent} for: ${request}`
    );
    assert(
      started.currentObjective === "COLLECT_NAME",
      `next question must be name, got ${started.currentObjective} for: ${request}`
    );

    const nameAsk = validateSalesReply(
      buildEmpatheticNameAsk(request),
      started,
      business,
      request
    );
    assert(nameAsk.ok, `name ask must pass: ${nameAsk.reasons.join("; ")}`);
    const coldName = validateSalesReply(
      `We can help with that. ${PRE_CONTACT_ASK_FIRST_NAME}`,
      started,
      business,
      request
    );
    assert(!coldName.ok, "cold form name ask must fail when a problem was stated");

    const propertyType = validateSalesReply(
      "Is this for a residential or commercial property?",
      started,
      business,
      request
    );
    assert(!propertyType.ok, "must not ask property type before name, phone, and address");

    const troubleshooting = validateSalesReply(
      "Have you tried checking the thermostat or filter?",
      started,
      business,
      request
    );
    assert(
      !troubleshooting.ok,
      "must not ask troubleshooting questions before name, phone, and address"
    );

    const servicePitch = validateSalesReply(
      `We offer 24/7 emergency service. You can call us at ${business.phone} anytime.`,
      started,
      business,
      request
    );
    assert(
      !servicePitch.ok,
      "must not expose the business phone or pitch service before the lead is secured"
    );

    const earlyTime = validateSalesReply(
      SITE_ASSESSMENT_TEAM_ALERT_ASK,
      started,
      business,
      request
    );
    assert(!earlyTime.ok, "must not ask preferred time before name, phone, and address");
  }

  let afterNamePhone = updateSalesStateFromTurn(
    createInitialSalesState({
      conversationId: "conv_missing_address_close",
      businessKey: business.website,
    }),
    [
      {
        role: "user",
        content: "Our unit has no heat and no cooling. Can you help?",
      },
    ],
    business
  );
  afterNamePhone = updateSalesStateFromTurn(
    afterNamePhone,
    [
      { role: "assistant", content: "Absolutely, we can help with that. What's your name?" },
      { role: "user", content: "Jordan" },
    ],
    business
  );
  afterNamePhone = updateSalesStateFromTurn(
    afterNamePhone,
    [
      { role: "assistant", content: "Thanks, Jordan. What's the best number to reach you?" },
      { role: "user", content: "5125550198. Tomorrow morning works." },
    ],
    business
  );
  assert(afterNamePhone.lead.name === "Jordan", "name stays sticky");
  assert(!!afterNamePhone.lead.phone, "customer phone stays sticky");
  assert(!afterNamePhone.lead.address, "address must still be missing");
  assert(
    afterNamePhone.currentObjective === "COLLECT_ADDRESS",
    `missing address must collect address, got ${afterNamePhone.currentObjective}`
  );
  const missingAddressDecision = evaluateHandoffReadiness(
    afterNamePhone,
    "Tomorrow morning works."
  );
  assert(
    missingAddressDecision.handoffReady === false,
    "missing address must not be handoff-ready"
  );
  assert(
    missingAddressDecision.missingRequiredFields.includes("address"),
    "central evaluator must report missing address"
  );
  assert(
    !shouldAttemptLeadHandoff(afterNamePhone, "closure", "Tomorrow morning works."),
    "missing address must send no handoff"
  );
  const falseRecorded = validateSalesReply(
    "Thanks, Jordan — I've recorded your request and noted tomorrow morning as your preferred time. The team will confirm availability.",
    afterNamePhone,
    business,
    "5125550198. Tomorrow morning works."
  );
  assert(
    !falseRecorded.ok,
    "must not use recorded/team-confirm wording while address is missing"
  );
  const askAddress = validateSalesReply(
    PRE_CONTACT_ASK_ADDRESS,
    afterNamePhone,
    business,
    "5125550198. Tomorrow morning works."
  );
  assert(askAddress.ok, `next field must be address: ${askAddress.reasons.join("; ")}`);
  const mechanicalName = validateSalesReply(
    "Thanks, Jordan. What's the service address?",
    afterNamePhone,
    business,
    "5125550198. Tomorrow morning works."
  );
  assert(!mechanicalName.ok, "must not start the address ask with Thanks, {name}");

  const askedForNumber = validateSalesReply(
    `Our number is ${business.phone}. What's your name?`,
    updateSalesStateFromTurn(
      createInitialSalesState({
        conversationId: "conv_asked_number",
        businessKey: business.website,
      }),
      [{ role: "user", content: "What's your phone number? The drain is clogged." }],
      business
    ),
    business,
    "What's your phone number? The drain is clogged."
  );
  assert(
    askedForNumber.ok,
    `business phone is allowed when the customer asked: ${askedForNumber.reasons.join("; ")}`
  );

  const complete = securedLead({
    preferredTiming: "tomorrow morning",
    customerAgreed: true,
    currentObjective: "CLOSE",
    leadDeliveryStatus: "NOT_SENT",
  });
  const completeDecision = evaluateHandoffReadiness(complete, "Yes");
  assert(completeDecision.handoffReady === true, "complete agreed lead must be handoff-ready");
  assert(
    shouldAttemptLeadHandoff(complete, "closure", "Yes") === true,
    "complete agreed lead must attempt exactly one handoff path"
  );
  const email = buildLeadNotificationEmail(business, complete);
  const sms = buildWebsiteLeadSms(business, complete);
  assert(
    /Kitchen sink is clogged/i.test(email.text) && /tomorrow morning/i.test(email.text),
    "email must include primary need and preferred time"
  );
  assert(
    /Kitchen sink is clogged/i.test(sms) && /tomorrow morning/i.test(sms),
    "SMS must include primary need and preferred time"
  );

  console.log("PASS — high-intent capture order, no false close without address");
}

function assertNoPreContactLeak(reply: string, allowBusinessPhone = false) {
  assert(
    !/residential or commercial|commercial or residential|property type|have you tried|thermostat|filter|breaker|recorded your request|shared your request|alert the team|team will confirm|preferred time|how much|we offer|maintenance plan|book(ed|ing)? appointment|pricing/i.test(
      reply
    ),
    `pre-contact reply leaked sales/discovery/close wording: ${reply}`
  );
  if (!allowBusinessPhone) {
    assert(
      !reply.includes(business.phone) && !/\bif you prefer to call\b/i.test(reply),
      `pre-contact reply exposed business phone: ${reply}`
    );
  }
}

async function testDeterministicPreContactChatReplies() {
  const highIntentRequests = [
    "Our unit has no heat and no cooling. Can you help?",
    "The drain is clogged and I need it fixed.",
  ];

  for (const request of highIntentRequests) {
    const first = await generateSalesReply(business, [
      { role: "user", content: request },
    ]);
    assert(
      first.reply === buildEmpatheticNameAsk(request),
      `final chat reply must be the empathetic name question, got: ${first.reply}`
    );
    assert(
      first.reply.includes(PRE_CONTACT_ASK_FIRST_NAME) &&
        !first.reply.includes("? ") &&
        (first.reply.match(/\?/g) || []).length === 1,
      "name step asks exactly one question"
    );
    assertNoPreContactLeak(first.reply);

    const afterName = await generateSalesReply(
      business,
      [
        { role: "user", content: request },
        { role: "assistant", content: first.reply },
        { role: "user", content: "Jordan" },
      ],
      first.salesState
    );
    assert(
      afterName.reply === PRE_CONTACT_ASK_PHONE,
      `final chat reply must ask for customer phone, got: ${afterName.reply}`
    );
    assertNoPreContactLeak(afterName.reply);

    const afterPhone = await generateSalesReply(
      business,
      [
        { role: "user", content: request },
        { role: "assistant", content: first.reply },
        { role: "user", content: "Jordan" },
        { role: "assistant", content: afterName.reply },
        { role: "user", content: "5125550198" },
      ],
      afterName.salesState
    );
    assert(
      afterPhone.reply === PRE_CONTACT_ASK_ADDRESS,
      `final chat reply must ask for service address, got: ${afterPhone.reply}`
    );
    assertNoPreContactLeak(afterPhone.reply);
    assert(
      !shouldAttemptLeadHandoff(afterPhone.salesState, "closure", "5125550198"),
      "no handoff before service address"
    );
  }

  const askedNumber = await generateSalesReply(business, [
    {
      role: "user",
      content: "What's your phone number? The drain is clogged.",
    },
  ]);
  assert(
    askedNumber.reply.startsWith(`You can reach us at ${business.phone}.`) &&
      askedNumber.reply.endsWith(PRE_CONTACT_ASK_FIRST_NAME),
    `number request may include business phone then still ask name, got: ${askedNumber.reply}`
  );
  assertNoPreContactLeak(askedNumber.reply, true);

  const completeState = securedLead({
    preferredTiming: "tomorrow morning",
    customerAgreed: true,
    currentObjective: "CLOSE",
    leadDeliveryStatus: "NOT_SENT",
    conversationId: "conv_precontact_complete_handoff",
  });
  const alertBusiness: BusinessProfile = {
    ...business,
    leadNotificationEmail: "alerts@summit.test",
    leadNotificationPhone: "+15125550198",
  };
  const previousDryRun = process.env.LEAD_HANDOFF_DRY_RUN;
  process.env.LEAD_HANDOFF_DRY_RUN = "true";
  try {
    const completeChat = await generateSalesReply(
      alertBusiness,
      [{ role: "user", content: "Yes" }],
      completeState
    );
    assert(
      /shared your request with the team|recorded your request/i.test(
        completeChat.reply
      ),
      `complete lead must use the existing close path, got: ${completeChat.reply}`
    );
    assert(
      completeChat.salesState.leadDeliveryStatus === "QUEUED" ||
        completeChat.salesState.leadDeliveryStatus === "SENT",
      `complete lead must queue/send once, got ${completeChat.salesState.leadDeliveryStatus}`
    );
    assert(
      !shouldAttemptLeadHandoff(completeChat.salesState, "closure", "Yes"),
      "replay after queued/sent must not attempt another handoff"
    );
  } finally {
    if (previousDryRun === undefined) delete process.env.LEAD_HANDOFF_DRY_RUN;
    else process.env.LEAD_HANDOFF_DRY_RUN = previousDryRun;
  }

  console.log("PASS — deterministic pre-contact chat replies; complete lead still one handoff");
}

async function testPostContactSalesConversation() {
  const secured = securedLead({
    preferredTiming: null,
    customerAgreed: false,
    currentObjective: "PRESENT_SOLUTION",
    leadDeliveryStatus: "NOT_SENT",
    conversationId: "conv_post_contact_price",
  });

  const priceTurn = await generateSalesReply(
    business,
    [{ role: "user", content: "How much will it cost?" }],
    secured
  );
  const priceIdx = priceTurn.reply.toLowerCase().indexOf("cost") >= 0
    ? priceTurn.reply.toLowerCase().indexOf("cost")
    : priceTurn.reply.toLowerCase().indexOf("amount");
  const arrangeIdx = priceTurn.reply.toLowerCase().indexOf("would you like to arrange");
  assert(priceIdx >= 0, `price must be answered first, got: ${priceTurn.reply}`);
  assert(arrangeIdx > priceIdx, `arrange ask must follow the price answer, got: ${priceTurn.reply}`);
  assert(
    !/what day or time would you prefer/i.test(priceTurn.reply),
    `price must not force a preferred-time question, got: ${priceTurn.reply}`
  );
  assert(
    /depends on (what the assessment finds|the diagnosis)|scope of work|exact cost depends|final cost depends/i.test(
      priceTurn.reply
    ),
    `unverified price must not invent an amount, got: ${priceTurn.reply}`
  );
  assert(
    !/i don't have a verified price to quote from here/i.test(priceTurn.reply),
    `must not use the old verified-price refusal, got: ${priceTurn.reply}`
  );
  assert(!/\$\s?\d/.test(priceTurn.reply), `must not invent a dollar amount, got: ${priceTurn.reply}`);
  assert(
    !/\bi('ll| will) alert the team\b/i.test(priceTurn.reply) &&
      !/\brecorded your request\b/i.test(priceTurn.reply) &&
      !/\bshared your request\b/i.test(priceTurn.reply) &&
      !/\bteam will contact\b/i.test(priceTurn.reply),
    `must not promise team alert before queued handoff, got: ${priceTurn.reply}`
  );

  const pricedBusiness: BusinessProfile = {
    ...business,
    pricingRules: "Diagnostic visit is $89 before any repair work.",
  };
  const verified = await generateSalesReply(
    pricedBusiness,
    [{ role: "user", content: "How much will it cost?" }],
    secured
  );
  assert(
    verified.reply.includes("$89"),
    `verified pricing must be used when configured, got: ${verified.reply}`
  );
  assert(
    /would you like to arrange/i.test(verified.reply),
    "after a price answer, ask whether to arrange the next step"
  );
  assert(
    !/what day or time would you prefer/i.test(verified.reply),
    "verified price must not jump to preferred time before agreement"
  );

  const completeState = securedLead({
    preferredTiming: "tomorrow morning",
    customerAgreed: true,
    currentObjective: "CLOSE",
    leadDeliveryStatus: "NOT_SENT",
    conversationId: "conv_post_contact_complete_handoff",
  });
  const alertBusiness: BusinessProfile = {
    ...business,
    leadNotificationEmail: "alerts@summit.test",
    leadNotificationPhone: "+15125550198",
  };
  const email = buildLeadNotificationEmail(alertBusiness, completeState);
  const sms = buildWebsiteLeadSms(alertBusiness, completeState);
  assert(
    /Kitchen sink is clogged/i.test(email.text) && /tomorrow morning/i.test(email.text),
    "complete-lead email must include need and preferred time"
  );
  assert(
    /Kitchen sink is clogged/i.test(sms) && /tomorrow morning/i.test(sms),
    "complete-lead SMS must include need and preferred time"
  );
  const previousDryRun = process.env.LEAD_HANDOFF_DRY_RUN;
  process.env.LEAD_HANDOFF_DRY_RUN = "true";
  try {
    const completeChat = await generateSalesReply(
      alertBusiness,
      [{ role: "user", content: "Yes" }],
      completeState
    );
    assert(
      /shared your request with the team|recorded your request/i.test(
        completeChat.reply
      ),
      `complete lead must use truthful close wording, got: ${completeChat.reply}`
    );
    assert(
      completeChat.salesState.leadDeliveryStatus === "QUEUED" ||
        completeChat.salesState.leadDeliveryStatus === "SENT",
      `complete lead must queue/send once, got ${completeChat.salesState.leadDeliveryStatus}`
    );
    assert(
      !shouldAttemptLeadHandoff(completeChat.salesState, "closure", "Yes"),
      "replay after queued/sent must not attempt another handoff"
    );
  } finally {
    if (previousDryRun === undefined) delete process.env.LEAD_HANDOFF_DRY_RUN;
    else process.env.LEAD_HANDOFF_DRY_RUN = previousDryRun;
  }

  const early = await generateSalesReply(business, [
    { role: "user", content: "The drain is clogged and I need it fixed." },
  ]);
  assert(
    early.reply === buildEmpatheticNameAsk("The drain is clogged and I need it fixed."),
    `early capture must stay deterministic, got: ${early.reply}`
  );

  console.log("PASS — post-contact price-first sales conversation; no premature alert");
}

function testPreQueueAlertWordingBan() {
  const afterAddress = securedLead({
    preferredTiming: null,
    customerAgreed: false,
    leadDeliveryStatus: "NOT_SENT",
    currentObjective: "PRESENT_SOLUTION",
  });
  const prematureAlert = validateSalesReply(
    "I'll alert the team now so they can contact you.",
    afterAddress,
    business
  );
  assert(!prematureAlert.ok, "I'll alert after address must fail before queued handoff");
  assert(
    prematureAlert.reasons.some((r) => /before a handoff was queued/i.test(r)),
    prematureAlert.reasons.join("; ")
  );

  const timeAsk = validateSalesReply(
    SITE_ASSESSMENT_TEAM_ALERT_ASK,
    afterAddress,
    business
  );
  assert(!timeAsk.ok, "preferred time before agreement must fail after contacts");
  const nextStepAsk = validateSalesReply(
    buildPostContactNextStepReply(afterAddress, business),
    afterAddress,
    business
  );
  assert(
    nextStepAsk.ok,
    `missing agreement must allow a next-step explanation: ${nextStepAsk.reasons.join("; ")}`
  );

  const afterTime = securedLead({
    preferredTiming: "tomorrow morning",
    customerAgreed: false,
    leadDeliveryStatus: "NOT_SENT",
    currentObjective: "ADVANCE_TO_NEXT_STEP",
  });
  const alertAfterTime = validateSalesReply(
    "I've recorded your request. The team will confirm availability.",
    afterTime,
    business
  );
  assert(!alertAfterTime.ok, "recorded/team-confirm after time must fail before agreement and queue");
  const agreementAsk = validateSalesReply(ASK_EXPLICIT_AGREEMENT, afterTime, business);
  assert(
    agreementAsk.ok,
    `missing agreement must allow an agreement ask: ${agreementAsk.reasons.join("; ")}`
  );

  const queued = validateSalesReply(
    buildQueuedLeadHandoffCustomerMessage("Maya", "tomorrow morning"),
    securedLead({
      preferredTiming: "tomorrow morning",
      customerAgreed: true,
      leadDeliveryStatus: "QUEUED",
      currentObjective: "CLOSE",
    }),
    business
  );
  assert(queued.ok, `queued close must still be allowed: ${queued.reasons.join("; ")}`);

  const sent = validateSalesReply(
    buildSuccessfulLeadHandoffCustomerMessage("Maya", "tomorrow morning"),
    securedLead({
      preferredTiming: "tomorrow morning",
      customerAgreed: true,
      leadDeliveryStatus: "SENT",
      currentObjective: "CLOSE",
    }),
    business
  );
  assert(sent.ok, `sent close must still be allowed: ${sent.reasons.join("; ")}`);
  assert(
    !PRE_QUEUE_ALERT_PROMISE_RE.test(PREFERRED_TIME_TEAM_ALERT_ACK),
    "voice preferred-time ack must follow the same pre-queue ban"
  );

  console.log("PASS — pre-queue alert/recorded/shared/team-contact wording banned");
}

async function testProfileAwareSalesConversationQuality() {
  const cases: Array<{
    label: string;
    opening: string;
    profile: BusinessProfile;
    fieldService: boolean;
    tone: "PROBLEM" | "ASPIRATIONAL" | "CELEBRATION" | "CONSULTATION";
    nameAck: RegExp;
    forbidSorry: boolean;
    postContactHint: RegExp;
  }> = [
    {
      label: "plumbing",
      opening: "My kitchen sink is clogged and water is backing up.",
      fieldService: true,
      tone: "PROBLEM",
      nameAck: /i'm sorry you're dealing with/i,
      forbidSorry: false,
      postContactHint: /visit lets the professional|identify the cause|arrange a visit/i,
      profile: {
        ...business,
        businessName: "Clearflow Plumbing",
        services: ["Drain clearing", "Pipe repair"],
        systemPrompt: "We send technicians for on-site plumbing repairs.",
        leadNotificationEmail: "alerts@clearflow.test",
        leadNotificationPhone: "+15125550111",
      },
    },
    {
      label: "HVAC",
      opening: "Our unit has no heat and no cooling.",
      fieldService: true,
      tone: "PROBLEM",
      nameAck: /i'm sorry you're dealing with/i,
      forbidSorry: false,
      postContactHint: /visit lets the professional|identify the cause|arrange a visit/i,
      profile: {
        ...business,
        businessName: "Northwind HVAC",
        services: ["Heating repair", "Cooling repair"],
        systemPrompt: "Field technicians handle on-site heating and cooling service visits.",
        leadNotificationEmail: "alerts@northwind.test",
        leadNotificationPhone: "+15125550112",
      },
    },
    {
      label: "electrical",
      opening: "An outlet has no power and I need it checked.",
      fieldService: true,
      tone: "PROBLEM",
      nameAck: /i'm sorry you're dealing with/i,
      forbidSorry: false,
      postContactHint: /visit lets the professional|identify the cause|arrange a visit/i,
      profile: {
        ...business,
        businessName: "Brightline Electrical",
        services: ["Outlet repair", "Electrical inspection"],
        systemPrompt: "Licensed electricians visit the property to inspect power issues.",
        leadNotificationEmail: "alerts@brightline.test",
        leadNotificationPhone: "+15125550113",
      },
    },
    {
      label: "roofing",
      opening: "There is a leak in the roof.",
      fieldService: true,
      tone: "PROBLEM",
      nameAck: /i'm sorry you're dealing with/i,
      forbidSorry: false,
      postContactHint: /visit lets the professional|identify the cause|arrange a visit/i,
      profile: {
        ...business,
        businessName: "Ridgeview Roofing",
        services: ["Roof leak repair", "Roof inspection"],
        systemPrompt: "We inspect roofs on site and repair leaks.",
        leadNotificationEmail: "alerts@ridgeview.test",
        leadNotificationPhone: "+15125550114",
      },
    },
    {
      label: "aspirational-jacuzzi",
      opening: "I'd like to install a jacuzzi in my backyard.",
      fieldService: true,
      tone: "ASPIRATIONAL",
      nameAck: /that sounds like a great project/i,
      forbidSorry: true,
      postContactHint:
        /consultation lets the team understand the space|before you commit|arrange a consultation/i,
      profile: {
        ...business,
        businessName: "Bluewater Outdoor Living",
        services: ["Jacuzzi installation", "Patio upgrades"],
        systemPrompt: "We install outdoor living features and send technicians for installation visits.",
        leadNotificationEmail: "alerts@bluewater.test",
        leadNotificationPhone: "+15125550116",
      },
    },
    {
      label: "celebration-wedding",
      opening: "We're looking for a wedding venue for our celebration.",
      fieldService: false,
      tone: "CELEBRATION",
      nameAck: /how exciting|congratulations/i,
      forbidSorry: true,
      postContactHint:
        /short consultation lets the team understand the occasion|prepare options that fit|arrange a consultation/i,
      profile: {
        ...business,
        businessName: "Gardenview Events",
        services: ["Wedding venues", "Anniversary celebrations"],
        systemPrompt: "We host celebrations and provide venue consultations. We do not send technicians on site.",
        leadNotificationEmail: "alerts@gardenview.test",
        leadNotificationPhone: "+15125550117",
      },
    },
    {
      label: "consultation",
      opening: "I need a consultation to improve our sales process.",
      fieldService: false,
      tone: "CONSULTATION",
      nameAck: /absolutely, i'?d be glad to help/i,
      forbidSorry: true,
      postContactHint:
        /short conversation lets the team understand your goals|recommend the right next step|arrange a consultation/i,
      profile: {
        ...business,
        businessName: "Northline Advisory",
        services: ["Business strategy consultation", "Growth planning"],
        systemPrompt: "We provide consultations and recommendations. We do not send technicians on site.",
        leadNotificationEmail: "alerts@northline.test",
        leadNotificationPhone: "+15125550115",
      },
    },
  ];

  const previousDryRun = process.env.LEAD_HANDOFF_DRY_RUN;
  process.env.LEAD_HANDOFF_DRY_RUN = "true";
  try {
    for (const sample of cases) {
      assert(
        isFieldServiceProfile(sample.profile) === sample.fieldService,
        `${sample.label}: field-service profile detection`
      );
      assert(
        classifyConversationNeedTone(sample.opening, sample.profile) ===
          sample.tone,
        `${sample.label}: tone classification`
      );

      const first = await generateSalesReply(sample.profile, [
        { role: "user", content: sample.opening },
      ]);
      assert(
        first.reply === buildEmpatheticNameAsk(sample.opening, sample.profile),
        `${sample.label}: intent-aware acknowledgement before name, got ${first.reply}`
      );
      assert(
        sample.nameAck.test(first.reply),
        `${sample.label}: expected tone acknowledgement, got ${first.reply}`
      );
      assert(
        first.reply.includes(PRE_CONTACT_ASK_FIRST_NAME),
        `${sample.label}: still asks first name`
      );
      assert(
        !/^we can help with that\.\s*what's your first name/i.test(first.reply),
        `${sample.label}: must not use the cold form`
      );
      if (sample.forbidSorry) {
        assert(
          !/\bi'?m sorry\b/i.test(first.reply),
          `${sample.label}: must not use problem empathy for this intent, got ${first.reply}`
        );
      }

      const afterName = await generateSalesReply(
        sample.profile,
        [
          { role: "user", content: sample.opening },
          { role: "assistant", content: first.reply },
          { role: "user", content: "Alex" },
        ],
        first.salesState
      );
      assert(
        afterName.reply === PRE_CONTACT_ASK_PHONE,
        `${sample.label}: phone after name, got ${afterName.reply}`
      );
      assert(
        !/^thanks, alex/i.test(afterName.reply),
        `${sample.label}: must not mechanically thank the name`
      );

      const afterPhone = await generateSalesReply(
        sample.profile,
        [
          { role: "user", content: sample.opening },
          { role: "assistant", content: first.reply },
          { role: "user", content: "Alex" },
          { role: "assistant", content: afterName.reply },
          { role: "user", content: "5125550198" },
        ],
        afterName.salesState
      );
      assert(
        afterPhone.reply === PRE_CONTACT_ASK_ADDRESS,
        `${sample.label}: address after phone, got ${afterPhone.reply}`
      );
      assert(
        !/^thanks, alex/i.test(afterPhone.reply),
        `${sample.label}: address ask must not thank the name`
      );

      const afterAddress = await generateSalesReply(
        sample.profile,
        [
          { role: "user", content: sample.opening },
          { role: "assistant", content: first.reply },
          { role: "user", content: "Alex" },
          { role: "assistant", content: afterName.reply },
          { role: "user", content: "5125550198" },
          { role: "assistant", content: afterPhone.reply },
          { role: "user", content: "400 Main St, Dallas TX 75201" },
        ],
        afterPhone.salesState
      );
      assert(
        /would you like to arrange/i.test(afterAddress.reply),
        `${sample.label}: post-contact must ask to arrange, got ${afterAddress.reply}`
      );
      assert(
        sample.postContactHint.test(afterAddress.reply),
        `${sample.label}: profile-aware next-step wording, got ${afterAddress.reply}`
      );
      assert(
        !/what day or time would you prefer/i.test(afterAddress.reply),
        `${sample.label}: must not jump to preferred time after address, got ${afterAddress.reply}`
      );
      if (sample.tone !== "PROBLEM" || !sample.fieldService) {
        assert(
          !replyUsesFieldServiceJargon(afterAddress.reply),
          `${sample.label}: must not use field-service jargon, got ${afterAddress.reply}`
        );
      }

      const priceTurn = await generateSalesReply(
        sample.profile,
        [{ role: "user", content: "How much will it cost?" }],
        afterAddress.salesState
      );
      assert(
        !/i don't have a verified price to quote from here/i.test(priceTurn.reply),
        `${sample.label}: no verified-price refusal`
      );
      assert(
        !/\bteam can confirm (the )?rate\b/i.test(priceTurn.reply),
        `${sample.label}: must not defer to team-confirm rate`
      );
      assert(!/\$\s?\d/.test(priceTurn.reply), `${sample.label}: must not invent a price`);
      if (sample.tone !== "PROBLEM" || !sample.fieldService) {
        assert(
          !replyUsesFieldServiceJargon(priceTurn.reply) &&
            !/\bdiagnosis\b/i.test(priceTurn.reply),
          `${sample.label}: price must not use diagnosis/technician jargon, got ${priceTurn.reply}`
        );
      }
      const pIdx =
        priceTurn.reply.toLowerCase().indexOf("cost") >= 0
          ? priceTurn.reply.toLowerCase().indexOf("cost")
          : priceTurn.reply.toLowerCase().indexOf("depend");
      const aIdx = priceTurn.reply.toLowerCase().indexOf("would you like to arrange");
      assert(
        pIdx >= 0 && aIdx > pIdx,
        `${sample.label}: price first then arrange, got ${priceTurn.reply}`
      );
      assert(
        !/what day or time would you prefer/i.test(priceTurn.reply),
        `${sample.label}: price must not force preferred time`
      );

      const unagreedTime = await generateSalesReply(
        sample.profile,
        [
          { role: "assistant", content: afterAddress.reply },
          { role: "user", content: "tomorrow morning" },
        ],
        afterAddress.salesState
      );
      assert(
        unagreedTime.salesState.leadDeliveryStatus !== "QUEUED" &&
          unagreedTime.salesState.leadDeliveryStatus !== "SENT",
        `${sample.label}: time without agreement must not hand off`
      );
      assert(
        !shouldAttemptLeadHandoff(
          unagreedTime.salesState,
          "closure",
          "tomorrow morning"
        ),
        `${sample.label}: no handoff when time exists without agreement`
      );
      assert(
        /would you like to arrange/i.test(unagreedTime.reply),
        `${sample.label}: time without agreement must ask to arrange, got ${unagreedTime.reply}`
      );
      assert(
        !PRE_QUEUE_ALERT_PROMISE_RE.test(unagreedTime.reply),
        `${sample.label}: no recorded/shared/alert claim before agreement`
      );

      const agreed = await generateSalesReply(
        sample.profile,
        [
          { role: "assistant", content: afterAddress.reply },
          { role: "user", content: "yes" },
        ],
        afterAddress.salesState
      );
      assert(
        /what day or time would you prefer/i.test(agreed.reply),
        `${sample.label}: agreement then preferred time, got ${agreed.reply}`
      );

      const timed = await generateSalesReply(
        sample.profile,
        [
          { role: "assistant", content: agreed.reply },
          { role: "user", content: "tomorrow morning" },
        ],
        agreed.salesState
      );
      assert(
        timed.salesState.leadDeliveryStatus === "QUEUED" ||
          timed.salesState.leadDeliveryStatus === "SENT",
        `${sample.label}: complete agreed lead queues one handoff, got ${timed.salesState.leadDeliveryStatus}`
      );
      assert(
        /recorded your request|shared your request/i.test(timed.reply),
        `${sample.label}: truthful completion only after queued handoff, got ${timed.reply}`
      );
      assert(
        !shouldAttemptLeadHandoff(timed.salesState, "closure", "tomorrow morning"),
        `${sample.label}: replay must not send a second handoff`
      );
      const email = buildLeadNotificationEmail(sample.profile, timed.salesState);
      const sms = buildWebsiteLeadSms(sample.profile, timed.salesState);
      assert(
        /tomorrow morning/i.test(email.text) && /tomorrow morning/i.test(sms),
        `${sample.label}: email and SMS include preferred time`
      );
    }
  } finally {
    if (previousDryRun === undefined) delete process.env.LEAD_HANDOFF_DRY_RUN;
    else process.env.LEAD_HANDOFF_DRY_RUN = previousDryRun;
  }

  console.log(
    "PASS — profile-aware sales conversation quality across problem, project, celebration, and consultation intents"
  );
}

function testVerifiedPricingNeverLeaksFieldServiceJargon() {
  const hourlyPrompt = "Labor is billed hourly.";

  const fieldProblem = securedLead({
    customerNeed: "The heating unit is broken and needs repair.",
    preferredTiming: null,
    customerAgreed: false,
  });
  const fieldBusiness: BusinessProfile = {
    ...business,
    services: ["Heating repair"],
    systemPrompt: `${hourlyPrompt} Field technicians handle on-site service visits.`,
    pricingRules: "",
  };
  const fieldPrice = buildIntentAwarePriceAnswer(fieldProblem, fieldBusiness);
  assert(/hourly/i.test(fieldPrice), `field-service verified approach, got ${fieldPrice}`);
  assert(
    /assessment|visit|professional/i.test(fieldPrice),
    `field-service problem may use visit/assessment wording, got ${fieldPrice}`
  );
  assert(
    !/\bdiagnosis\b/i.test(fieldPrice) &&
      !/\bwhat the work includes\b/i.test(fieldPrice),
    `field-service path must not use diagnosis fallback, got ${fieldPrice}`
  );

  const projectState = securedLead({
    customerNeed: "I'd like to install an outdoor upgrade for our patio.",
    preferredTiming: null,
    customerAgreed: false,
  });
  const projectBusiness: BusinessProfile = {
    ...business,
    services: ["Outdoor installation"],
    systemPrompt: `${hourlyPrompt} We install outdoor living features.`,
    pricingRules: "",
  };
  assert(
    classifyConversationNeedTone(projectState.customerNeed) === "ASPIRATIONAL",
    "generic install/upgrade phrasing is ASPIRATIONAL"
  );
  const projectPrice = buildIntentAwarePriceAnswer(projectState, projectBusiness);
  assert(/hourly/i.test(projectPrice), `project verified approach, got ${projectPrice}`);
  assert(
    /design|materials|scope of the project/i.test(projectPrice),
    `project price uses design/materials/scope, got ${projectPrice}`
  );
  assert(
    !replyUsesFieldServiceJargon(projectPrice) &&
      !/\bdiagnosis\b|\bassessment\b|\btechnician\b|\bsite visit\b|\bwork required\b|\bwhat the work includes\b/i.test(
        projectPrice
      ),
    `project price must not use field-service jargon, got ${projectPrice}`
  );

  const eventState = securedLead({
    customerNeed: "We're planning a celebration event for our family.",
    preferredTiming: null,
    customerAgreed: false,
  });
  const eventBusiness: BusinessProfile = {
    ...business,
    services: ["Event venues"],
    systemPrompt: `${hourlyPrompt} We host celebrations and provide venue consultations.`,
    pricingRules: "",
  };
  assert(
    classifyConversationNeedTone(eventState.customerNeed) === "CELEBRATION",
    "generic celebration/event phrasing is CELEBRATION"
  );
  const eventPrice = buildIntentAwarePriceAnswer(eventState, eventBusiness);
  assert(/hourly/i.test(eventPrice), `event verified approach, got ${eventPrice}`);
  assert(
    /date|guest count|options/i.test(eventPrice),
    `event price uses date/guest/options, got ${eventPrice}`
  );
  assert(
    !replyUsesFieldServiceJargon(eventPrice) &&
      !/\bdiagnosis\b|\bassessment\b|\btechnician\b|\bsite visit\b|\bwork required\b|\bwhat the work includes\b/i.test(
        eventPrice
      ),
    `event price must not use field-service jargon, got ${eventPrice}`
  );

  const consultState = securedLead({
    customerNeed: "I need advice on improving our sales strategy.",
    preferredTiming: null,
    customerAgreed: false,
  });
  const consultBusiness: BusinessProfile = {
    ...business,
    services: ["Business strategy consultation"],
    systemPrompt: `${hourlyPrompt} We provide consultations and recommendations. We do not send technicians on site.`,
    pricingRules: "",
  };
  assert(
    classifyConversationNeedTone(consultState.customerNeed) === "CONSULTATION",
    "generic advice/strategy phrasing is CONSULTATION"
  );
  assert(
    classifyConversationNeedTone("I'd be glad to learn more about your services.") ===
      "CONSULTATION",
    "neutral fallback is confident consultation, not problem sympathy"
  );
  const consultPrice = buildIntentAwarePriceAnswer(consultState, consultBusiness);
  assert(/hourly/i.test(consultPrice), `consultation verified approach, got ${consultPrice}`);
  assert(
    /requirements|scope of the consultation/i.test(consultPrice),
    `consultation price uses requirements/scope, got ${consultPrice}`
  );
  assert(
    !replyUsesFieldServiceJargon(consultPrice) &&
      !/\bdiagnosis\b|\bassessment\b|\btechnician\b|\bsite visit\b|\bwork required\b|\bwhat the work includes\b/i.test(
        consultPrice
      ),
    `consultation price must not use field-service jargon, got ${consultPrice}`
  );

  assert(
    !/\bi'm sorry\b/i.test(
      buildEmpatheticNameAsk("I'd like to install an outdoor upgrade for our patio.")
    ),
    "project tone must not use problem sympathy"
  );
  assert(
    !/\bi'm sorry\b/i.test(
      buildEmpatheticNameAsk("We're planning a celebration event for our family.")
    ),
    "celebration tone must not use problem sympathy"
  );
  assert(
    /absolutely, i'?d be glad to help/i.test(
      buildEmpatheticNameAsk("I need advice on improving our sales strategy.")
    ),
    "consultation tone stays confident and helpful"
  );

  console.log(
    "PASS — verified hourly/fixed pricing stays tone-aware; no diagnosis/work leak on project/event/consultation"
  );
}

function testPersuasivePostContactInvitations() {
  const fieldBusiness: BusinessProfile = {
    ...business,
    services: ["Heating repair"],
    systemPrompt: "Field technicians handle on-site service visits.",
  };
  const projectBusiness: BusinessProfile = {
    ...business,
    services: ["Outdoor installation"],
    systemPrompt: "We install outdoor living features.",
  };
  const eventBusiness: BusinessProfile = {
    ...business,
    services: ["Event venues"],
    systemPrompt:
      "We host celebrations and provide venue consultations. We do not send technicians on site.",
  };
  const consultBusiness: BusinessProfile = {
    ...business,
    services: ["Business strategy consultation"],
    systemPrompt:
      "We provide consultations and recommendations. We do not send technicians on site.",
  };

  const repair = buildPersuasiveArrangeInvitation(
    fieldBusiness,
    "PROBLEM"
  );
  assert(
    /visit lets the professional identify the cause/i.test(repair) &&
      /explain the options/i.test(repair) &&
      /clear quote before any work begins/i.test(repair) &&
      /would you like to arrange a visit/i.test(repair),
    `repair invitation, got ${repair}`
  );

  const project = buildPersuasiveArrangeInvitation(
    projectBusiness,
    "ASPIRATIONAL"
  );
  assert(
    /understand the space/i.test(project) &&
      /before you commit to anything/i.test(project) &&
      /would you like to arrange a consultation/i.test(project),
    `project invitation, got ${project}`
  );

  const event = buildPersuasiveArrangeInvitation(
    eventBusiness,
    "CELEBRATION"
  );
  assert(
    /understand the occasion and your plans/i.test(event) &&
      /prepare options that fit/i.test(event) &&
      /would you like to arrange a consultation/i.test(event),
    `event invitation, got ${event}`
  );

  const consult = buildPersuasiveArrangeInvitation(
    consultBusiness,
    "CONSULTATION"
  );
  assert(
    /understand your goals/i.test(consult) &&
      /recommend the right next step/i.test(consult) &&
      /would you like to arrange a consultation/i.test(consult),
    `consultation invitation, got ${consult}`
  );

  for (const reply of [repair, project, event, consult]) {
    assert(
      !/\bfree\b/i.test(reply) &&
        !/\bno obligation\b/i.test(reply) &&
        !/\bbooked\b/i.test(reply) &&
        !/\bavailable (today|tomorrow|now)\b/i.test(reply) &&
        !/\$\s?\d/.test(reply),
      `must not invent promises or prices, got ${reply}`
    );
  }

  const projectState = securedLead({
    customerNeed: "I'd like to install an outdoor upgrade for our patio.",
    preferredTiming: null,
    customerAgreed: false,
  });
  assert(
    buildPostContactNextStepReply(projectState, projectBusiness) === project,
    "post-contact next step uses persuasive project invitation"
  );

  const hesitationMessage =
    "I will decide after seeing the financial implication and options.";
  assert(
    isCostOptionsHesitation(hesitationMessage),
    "cost/options hesitation must be detected"
  );
  const hesitation = resolvePostContactConversationReply(
    projectState,
    projectBusiness,
    hesitationMessage,
    "We can review fixture options during a consultation."
  );
  assert(!!hesitation, "cost/options hesitation must get a deterministic reply");
  assert(
    /^that makes sense\./i.test(hesitation!),
    `hesitation must acknowledge naturally, got ${hesitation}`
  );
  assert(
    /review the options and likely cost before deciding on fixtures/i.test(
      hesitation!
    ),
    `hesitation must continue the product conversation, got ${hesitation}`
  );
  assert(
    /would you like to arrange one/i.test(hesitation!),
    `hesitation must invite arrangement, got ${hesitation}`
  );
  assert(
    !/that sounds like a great project/i.test(hesitation!) &&
      !/understand the space, discuss the options, and give you a clear quote before you commit/i.test(
        hesitation!
      ),
    `hesitation must not replay the original invitation, got ${hesitation}`
  );
  assert(
    buildCostOptionsHesitationReply(
      projectState,
      projectBusiness,
      "We can review fixture options during a consultation."
    ) === hesitation,
    "hesitation helper must match resolvePostContactConversationReply"
  );

  console.log(
    "PASS — persuasive post-contact invitations + cost/options hesitation"
  );
}

function testChatAvatarIdentityVisibility() {
  assert(
    chatAvatarMonogram("Gardenview Events") === "GE",
    "business-name monogram uses two initials"
  );
  assert(
    chatAvatarMonogram("PulseTech") === "PU",
    "single-word monogram uses two letters"
  );
  assert(
    chatAvatarMonogram("  ") === "A",
    "empty label falls back to A"
  );
  assert(
    /linear-gradient/i.test(CHAT_AVATAR_SURFACE),
    "avatar surface uses a neutral adaptive gradient"
  );
  assert(
    PULSETECH_CHAT_ICON === "/branding/pulsetech-icon-color.svg",
    "PulseTech chat icon points at the tracked branding asset"
  );

  const markup = renderToStaticMarkup(
    createElement(DemoWorkspace, {
      initialProfile: {
        ...business,
        businessName: "Northline Advisory",
        logo: "",
        agentName: "Ava",
        leadNotificationEmail: "alerts@northline.test",
        leadNotificationPhone: "+15125550115",
      },
      demoId: "demo_avatar_visibility",
    })
  );
  assert(
    markup.includes(PULSETECH_CHAT_ICON),
    "rendered two-panel demo includes the PulseTech identity icon"
  );
  assert(
    markup.includes("Northline Advisory"),
    "customer header keeps business-name personalization"
  );

  console.log("PASS — chat avatar identity visibility helpers");
}

async function main() {
  testLayoutConstraints();
  testTexasSolarLogo();
  testVisitPreferenceNoDuplicateAddress();
  testRajaNameCaptureAndPreferredTime();
  testStickyPrimaryNeedInAlerts();
  testGenericPreferredTimeLeadCapture();
  testHighIntentLeadCaptureOrder();
  await testDeterministicPreContactChatReplies();
  await testPostContactSalesConversation();
  await testProfileAwareSalesConversationQuality();
  testVerifiedPricingNeverLeaksFieldServiceJargon();
  testPersuasivePostContactInvitations();
  testChatAvatarIdentityVisibility();
  testPreQueueAlertWordingBan();
  testCustomerFacingHandoffWording();
  testCompoundPriceAndPreferredTime();
  testSiteVisitFeeOnce();
  testHomepageDoesNotHardcodeTexasSolar();
  await testPersonalizedDemoSaveAndLoad();
  await testPersonalizedDemoFailedSave();
  await testPerBusinessLeadAlerts();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
