import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import path from "path";
import DemoWorkspace from "../src/components/DemoWorkspace";
import { DEMO_CHAT_LAYOUT } from "../src/lib/demoChatLayout";
import { buildLeadNotificationEmail, shouldAttemptLeadHandoff } from "../src/lib/leadHandoff";
import {
  ASK_PREFERRED_DAY_TIME,
  SITE_ASSESSMENT_TEAM_ALERT_ASK,
  buildFailedLeadHandoffCustomerMessage,
  buildSuccessfulLeadHandoffCustomerMessage,
  isFailedLeadHandoffCustomerMessage,
  isSuccessfulLeadHandoffCustomerMessage,
  resolveWebsiteChatCustomerHandoffReply,
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
import {
  commitSharedProfile,
  loadSharedProfile,
} from "../src/lib/sharedProfileStore";
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
    css.includes("overscroll-behavior: auto"),
    "mobile chat transcripts must allow outer-page overscroll"
  );
  assert(
    css.includes(".pt-demo .pt-voice-demo"),
    "voice card has demo-scoped contrast styles"
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

const TIMING_ACK = buildSuccessfulLeadHandoffCustomerMessage("Maya");

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
    securedLead({ currentObjective: "ADVANCE_TO_NEXT_STEP", preferredTiming: null }),
    business
  );
  assert(
    yesAck.ok,
    `yes → site-assessment team alert should pass: ${yesAck.reasons.join("; ")}`
  );

  const afterSent = { ...after, leadDeliveryStatus: "SENT" as const };
  const good = validateSalesReply(TIMING_ACK, afterSent, business);
  assert(good.ok, `preferred-time ack should pass: ${good.reasons.join("; ")}`);
  assert(
    TIMING_ACK.includes("earliest available appointment"),
    "preferred-time ack must use appointment confirmation language for the team follow-up"
  );
  assert(
    TIMING_ACK.includes("not booked yet"),
    "preferred-time ack must not claim the visit is booked"
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
    securedLead({ currentObjective: "ADVANCE_TO_NEXT_STEP", preferredTiming: null }),
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
  const success = buildSuccessfulLeadHandoffCustomerMessage("Maya");
  assert(isSuccessfulLeadHandoffCustomerMessage(success), "success helper matches wording");
  assert(/Thanks, Maya/.test(success), "success uses customer name");
  assert(/shared your request with the team/.test(success), "success says request was shared");
  assert(/earliest available appointment/.test(success), "success asks team to confirm appointment");
  assert(/not booked yet/.test(success), "success does not book the visit");
  assert(!/booked(?! yet)/i.test(success.replace(/not booked yet/i, "")), "success must not claim booked");

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
    business,
  });
  assert(resolvedSuccess === success, "successful handoff uses the customer-facing close");

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

async function main() {
  testLayoutConstraints();
  testTexasSolarLogo();
  testVisitPreferenceNoDuplicateAddress();
  testCustomerFacingHandoffWording();
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
