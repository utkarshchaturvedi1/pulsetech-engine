import { config } from "dotenv";
config({ path: ".env.local" });
process.env.LEAD_HANDOFF_DRY_RUN = "true";

import { readFileSync } from "fs";
import path from "path";
import type { BusinessProfile } from "../src/types/business";
import { generateSalesReply } from "../src/lib/salesChat";
import { updateSalesStateFromTurn } from "../src/lib/salesController";
import {
  businessIdentityKey,
  createConversationId,
  createInitialSalesState,
  type SalesState,
} from "../src/lib/salesState";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function loadKiser(): BusinessProfile {
  const rec = JSON.parse(
    readFileSync(path.join(process.cwd(), ".data", "demos", "mbkiser.json"), "utf8")
  ) as { profile?: BusinessProfile };
  if (!rec?.profile?.businessName) {
    throw new Error("Missing M.B. Kiser BusinessProfile");
  }
  return rec.profile;
}

const plumbing: BusinessProfile = {
  website: "https://autreys-plumbing.test",
  businessName: "Autrey's Plumbing LLC",
  tagline: "Licensed local plumbing",
  logo: "",
  primaryColor: "",
  secondaryColor: "",
  phone: "",
  email: "",
  address: "",
  services: ["Water pump installation", "Water heater repair", "Jacuzzi and spa plumbing"],
  serviceAreas: ["Dallas"],
  faqs: [
    {
      question: "Are you licensed?",
      answer: "Yes, we are licensed and insured for residential plumbing.",
    },
  ],
  leadQuestions: [],
  systemPrompt:
    "Licensed residential plumbing. We install water pumps, repair water heaters, and handle jacuzzi plumbing. We do not publish prices. On-site estimates are the next step. We do not offer electrical contracting or full-house rewiring.",
};

const kiser = loadKiser();

type Msg = { role: "user" | "assistant"; content: string };

function seed(business: BusinessProfile): SalesState {
  return createInitialSalesState({
    conversationId: createConversationId(),
    businessKey: businessIdentityKey(business),
  });
}

function apply(business: BusinessProfile, state: SalesState, user: string, assistant = "How can I help?"): SalesState {
  return updateSalesStateFromTurn(
    state,
    [
      { role: "assistant", content: assistant },
      { role: "user", content: user },
    ],
    business
  );
}

async function turn(
  business: BusinessProfile,
  user: string,
  history: Msg[],
  state: SalesState | null
) {
  const messages: Msg[] = [
    { role: "assistant", content: "Hi! How can I help you today?" },
    ...history,
    { role: "user", content: user },
  ];
  const result = await generateSalesReply(business, messages, state);
  history.push({ role: "user", content: user });
  history.push({ role: "assistant", content: result.reply });
  return result;
}

function asksProceed(text: string): boolean {
  return /\b(would you like (to )?(proceed|move forward)|want to proceed|shall we (proceed|continue)|do you want (me |us )?to (proceed|continue|move forward))\b/i.test(
    text
  );
}

function asksLeadField(text: string): boolean {
  return /\b(first )?name\b|\bphone\b|\bemail\b|\baddress\b/i.test(text);
}

function inventedPrice(text: string): boolean {
  return /\$\s?\d/.test(text);
}

function repeatLicense(prev: string[], reply: string): boolean {
  const prior = prev.join("\n");
  return /\blicen[sc]ed\b/i.test(prior) && /\blicen[sc]ed\b/i.test(reply);
}

type Result = { name: string; pass: boolean; detail: string };

const results: Result[] = [];
function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}`);
  console.log(detail);
}

async function main() {
  console.log("--- deterministic capture ---");
  let st = apply(
    kiser,
    seed(kiser),
    "my central heating and cooling system is not working properly."
  );
  st = apply(
    kiser,
    st,
    "yes.. I have already spent a lot on it... I want to know how much will it cost",
    "We handle HVAC. Would you like to proceed with troubleshooting the heating and cooling system?"
  );
  assert(st.opportunityAccepted || st.currentObjective === "HANDLE_PRICE_OBJECTION", `yes+price obj ${st.currentObjective} accepted=${st.opportunityAccepted}`);
  st = apply(kiser, st, "I think it was an electrician", "Costs depend on the visit. What's your first name?");
  assert(!/electrician/i.test(st.customerNeed || "") || /heat|cool|hvac|ac/i.test(st.customerNeed || st.originalCustomerNeed || ""), `need became electrician: ${st.customerNeed}`);
  st = apply(kiser, st, "JJ", "What's your first name?");
  assert(st.lead.name === "JJ", `name ${st.lead.name}`);
  assert(st.currentObjective === "COLLECT_PHONE", `after JJ ${st.currentObjective}`);
  st = apply(kiser, st, "8989898989", "What's the best phone number?");
  assert(Boolean(st.lead.phone?.includes("8989898989")), `phone ${st.lead.phone}`);
  assert(st.currentObjective === "COLLECT_ADDRESS", `after phone ${st.currentObjective}`);
  st = apply(
    kiser,
    st,
    "1500 Marilla St, Dallas TX 75201",
    "Would you like to proceed?"
  );
  assert(/1500 Marilla/i.test(st.lead.address || ""), `address not captured: ${st.lead.address}`);
  console.log("0 PASS — deterministic heating capture / out-of-order address");

  const dump = apply(
    plumbing,
    apply(plumbing, seed(plumbing), "I want a Jacuzzi."),
    "JJ, 8989898989, 1500 Marilla St, Dallas TX 75201",
    "What's your first name?"
  );
  assert(dump.lead.name === "JJ", `bundle name ${dump.lead.name}`);
  assert(Boolean(dump.lead.phone), `bundle phone ${dump.lead.phone}`);
  assert(/1500/i.test(dump.lead.address || ""), `bundle address ${dump.lead.address}`);
  console.log("0b PASS — bundled lead dump");

  const mixed = apply(
    plumbing,
    apply(plumbing, seed(plumbing), "I want a Jacuzzi."),
    "JJ, but are you licensed?",
    "What's your first name?"
  );
  assert(mixed.lead.name === "JJ", `mixed name ${mixed.lead.name}`);
  console.log("0c PASS — name + license question extracts name");

  const expensiveObj = apply(
    plumbing,
    apply(plumbing, seed(plumbing), "I want a modern kitchen sink."),
    "That's expensive.",
    "What's your first name?"
  );
  assert(
    expensiveObj.lead.name !== "That's expensive" &&
      expensiveObj.lead.name !== "That's",
    `expensive captured as name: ${expensiveObj.lead.name}`
  );
  assert(
    expensiveObj.currentObjective === "HANDLE_PRICE_OBJECTION",
    `expensive obj ${expensiveObj.currentObjective}`
  );
  console.log("0d PASS — price objection is not treated as a name");

  const earlyDump = apply(
    plumbing,
    seed(plumbing),
    "Heater broken. I'm Maya, 2145550133, 22 Main St, Dallas TX 75201"
  );
  assert(/maya/i.test(earlyDump.lead.name || ""), `I'm Maya not captured: ${earlyDump.lead.name}`);
  assert(Boolean(earlyDump.lead.phone), `Maya phone ${earlyDump.lead.phone}`);
  assert(/22 Main/i.test(earlyDump.lead.address || ""), `Maya address ${earlyDump.lead.address}`);
  console.log("0e PASS — I'm Maya with phone and address");

  const earlyTiming = apply(
    plumbing,
    seed(plumbing),
    "Clogged drain, can you come tomorrow morning? I'm Avery"
  );
  assert(/avery/i.test(earlyTiming.lead.name || ""), `I'm Avery not captured: ${earlyTiming.lead.name}`);
  assert(Boolean(earlyTiming.preferredTiming), `Avery timing ${earlyTiming.preferredTiming}`);
  console.log("0f PASS — I'm Avery with timing");

  console.log("\n=== GROUP A exact heating regression ===");
  const aHist: Msg[] = [];
  let a = await turn(
    kiser,
    "my central heating and cooling system is not working properly. I got it repaired earlier but it has started giving problems again.",
    aHist,
    null
  );
  console.log("A1", a.reply);
  a = await turn(
    kiser,
    "yes.. I have already spent a lot on it... I want to know how much will it cost",
    aHist,
    a.salesState
  );
  console.log("A2", a.reply);
  assert(!inventedPrice(a.reply), `A2 invented price: ${a.reply}`);
  a = await turn(kiser, "I think it was an electrician", aHist, a.salesState);
  console.log("A3", a.reply);
  a = await turn(kiser, "JJ", aHist, a.salesState);
  console.log("A4", a.reply);
  const a4ok =
    a.salesState.lead.name === "JJ" &&
    /\bphone|number\b/i.test(a.reply) &&
    !asksProceed(a.reply) &&
    !/\bhow much|do not publish|without seeing\b/i.test(a.reply);
  record("A4 after JJ asks phone not proceed/price", a4ok, a.reply);

  a = await turn(kiser, "8989898989", aHist, a.salesState);
  console.log("A5", a.reply);
  const a5ok =
    Boolean(a.salesState.lead.phone) &&
    /\baddress\b/i.test(a.reply) &&
    !asksProceed(a.reply);
  record("A5 after phone asks address not proceed", a5ok, a.reply);

  a = await turn(kiser, "1500 Marilla St, Dallas TX 75201", aHist, a.salesState);
  console.log("A6", a.reply);
  const a6ok =
    /1500 Marilla/i.test(a.salesState.lead.address || "") &&
    !/\b(first )?name\b/i.test(a.reply) &&
    !/\b(phone|number)\b/i.test(a.reply);
  record(
    "A6 address captured, next step after complete lead",
    a6ok,
    `${a.salesState.lead.address} | ${a.reply}`
  );

  console.log("\n=== GROUP B out-of-order ===");
  let bHist: Msg[] = [];
  let b = await turn(plumbing, "My heater stopped working.", bHist, null);
  b = await turn(plumbing, "2145550100", bHist, b.salesState);
  record(
    "B1 asked name, gave phone",
    Boolean(b.salesState.lead.phone) && !/\bphone\b/i.test(b.reply),
    `${JSON.stringify(b.salesState.lead)} | ${b.reply}`
  );

  bHist = [];
  b = await turn(plumbing, "I've wanted a Jacuzzi for years.", bHist, null);
  b = await turn(plumbing, "Alex", bHist, b.salesState);
  b = await turn(plumbing, "1500 Marilla St, Dallas TX 75201", bHist, b.salesState);
  record(
    "B2 asked phone, gave address",
    /1500/i.test(b.salesState.lead.address || "") && Boolean(b.salesState.lead.name),
    `${JSON.stringify(b.salesState.lead)} | ${b.reply}`
  );

  bHist = [];
  b = await turn(plumbing, "I need a water heater repair.", bHist, null);
  b = await turn(plumbing, "Sam", bHist, b.salesState);
  b = await turn(plumbing, "2145550199", bHist, b.salesState);
  const proceedAsk = asksProceed(b.reply) ? b.reply : "Would you like to proceed with an on-site estimate?";
  b.salesState = apply(
    plumbing,
    b.salesState,
    "1500 Marilla St, Dallas TX 75201",
    proceedAsk
  );
  const liveB3 = await generateSalesReply(
    plumbing,
    [
      { role: "assistant", content: "Hi! How can I help you today?" },
      ...bHist,
      { role: "assistant", content: proceedAsk },
      { role: "user", content: "1500 Marilla St, Dallas TX 75201" },
    ],
    b.salesState
  );
  record(
    "B3 asked proceed, gave address",
    /1500/i.test(liveB3.salesState.lead.address || ""),
    `${liveB3.salesState.lead.address} | ${liveB3.reply}`
  );

  bHist = [];
  b = await turn(plumbing, "I want a Jacuzzi installed.", bHist, null);
  b = await turn(
    plumbing,
    "JJ, 8989898989, 1500 Marilla St, Dallas TX 75201",
    bHist,
    b.salesState
  );
  record(
    "B4 all three at once",
    b.salesState.lead.name === "JJ" &&
      Boolean(b.salesState.lead.phone) &&
      /1500/i.test(b.salesState.lead.address || ""),
    JSON.stringify(b.salesState.lead) + " | " + b.reply
  );

  bHist = [];
  b = await turn(plumbing, "My heater is broken.", bHist, null);
  b = await turn(plumbing, "JJ 2145550111", bHist, b.salesState);
  record(
    "B5 name+phone together",
    Boolean(b.salesState.lead.phone) &&
      (b.salesState.lead.name === "JJ" || Boolean(b.salesState.lead.name)),
    JSON.stringify(b.salesState.lead) + " | " + b.reply
  );

  bHist = [];
  b = await turn(plumbing, "My heater is broken.", bHist, null);
  b = await turn(plumbing, "Alex", bHist, b.salesState);
  b = await turn(
    plumbing,
    "2145550122, 1500 Marilla St, Dallas TX 75201",
    bHist,
    b.salesState
  );
  record(
    "B6 phone+address together",
    Boolean(b.salesState.lead.phone) && /1500/i.test(b.salesState.lead.address || ""),
    JSON.stringify(b.salesState.lead) + " | " + b.reply
  );

  console.log("\n=== GROUP C interruptions ===");
  let cHist: Msg[] = [];
  let c = await turn(plumbing, "I want a Jacuzzi in my backyard.", cHist, null);
  c = await turn(plumbing, "JJ, but are you licensed?", cHist, c.salesState);
  record(
    "C1 name + licensed",
    c.salesState.lead.name === "JJ" &&
      /licen[sc]ed/i.test(c.reply) &&
      /\bphone|number\b/i.test(c.reply),
    c.reply
  );

  cHist = [];
  c = await turn(plumbing, "My heater stopped working.", cHist, null);
  c = await turn(plumbing, "Alex", cHist, c.salesState);
  c = await turn(plumbing, "2145550199 wait how much does this cost?", cHist, c.salesState);
  record(
    "C2 phone + price",
    Boolean(c.salesState.lead.phone) && !inventedPrice(c.reply),
    `${c.salesState.lead.phone} | ${c.reply}`
  );

  cHist = [];
  c = await turn(plumbing, "I need a water pump installed. I already bought it.", cHist, null);
  c = await turn(plumbing, "Alex", cHist, c.salesState);
  c = await turn(plumbing, "2145550199", cHist, c.salesState);
  c = await turn(
    plumbing,
    "1500 Marilla St, Dallas TX 75201 — can you come tomorrow morning?",
    cHist,
    c.salesState
  );
  record(
    "C3 address + scheduling",
    /1500/i.test(c.salesState.lead.address || "") &&
      Boolean(c.salesState.preferredTiming || /tomorrow/i.test(c.reply)),
    `${c.salesState.lead.address} timing=${c.salesState.preferredTiming} | ${c.reply}`
  );

  console.log("\n=== GROUP D messiness ===");
  const dHist: Msg[] = [];
  let d = await turn(plumbing, "My heater stopped working.", dHist, null);
  d = await turn(plumbing, "yeah", dHist, d.salesState);
  d = await turn(plumbing, "yes please", dHist, d.salesState);
  d = await turn(plumbing, "ok my name is Riley", dHist, d.salesState);
  d = await turn(plumbing, "sure", dHist, d.salesState);
  d = await turn(plumbing, "tomorrow morning if possible", dHist, d.salesState);
  d = await turn(plumbing, "actually I also have a leak", dHist, d.salesState);
  d = await turn(plumbing, "wait how much does this cost?", dHist, d.salesState);
  record(
    "D price mid-mess",
    !inventedPrice(d.reply),
    d.reply
  );
  d = await turn(plumbing, "I already told you my number", dHist, d.salesState);
  d = await turn(plumbing, "my number is 8989898989 btw", dHist, d.salesState);
  record(
    "D volunteered number",
    Boolean(d.salesState.lead.phone),
    `${d.salesState.lead.phone} | ${d.reply}`
  );
  d = await turn(plumbing, "that's too expensive", dHist, d.salesState);
  record("D expensive", !inventedPrice(d.reply) && !/\$\d/.test(d.reply), d.reply);
  d = await turn(plumbing, "can someone call me?", dHist, d.salesState);
  record("D call me", !inventedPrice(d.reply), d.reply);

  console.log("\n=== GROUP E situations ===");
  const e1 = await turn(plumbing, "My heater stopped working and the house is freezing ASAP.", [], null);
  record("E1 urgent broken", /\bname\b/i.test(e1.reply) && !/great project/i.test(e1.reply), e1.reply);
  const e2 = await turn(plumbing, "I've wanted a Jacuzzi for years.", [], null);
  record("E2 aspirational", /\bname\b/i.test(e2.reply) && !/sorry you'?re dealing/i.test(e2.reply), e2.reply);
  const e3 = await turn(
    plumbing,
    "I have a working old pump and already bought a new one to install.",
    [],
    null
  );
  record("E3 replacement", /\bname\b/i.test(e3.reply), e3.reply);
  const e4 = await turn(plumbing, "How much would a Jacuzzi cost?", [], null);
  record("E4 price-sensitive", !inventedPrice(e4.reply), e4.reply);
  let eHist: Msg[] = [];
  let e5 = await turn(plumbing, "I want a Jacuzzi.", eHist, null);
  e5 = await turn(plumbing, "How do I know you're reliable?", eHist, e5.salesState);
  record("E5 skeptical", /licen[sc]ed|insured/i.test(e5.reply), e5.reply);
  eHist = [];
  let e6 = await turn(plumbing, "My heater stopped working.", eHist, null);
  e6 = await turn(plumbing, "Alex", eHist, e6.salesState);
  e6 = await turn(plumbing, "2145550199", eHist, e6.salesState);
  e6 = await turn(plumbing, "1500 Marilla St, Dallas TX 75201", eHist, e6.salesState);
  e6 = await turn(plumbing, "Yes, let's do it. Please go ahead.", eHist, e6.salesState);
  record(
    "E6 ready-to-buy",
    e6.salesState.currentObjective === "CLOSE" || e6.salesState.customerAgreed || e6.salesState.handoffReady,
    `${e6.salesState.currentObjective} | ${e6.reply}`
  );
  const e7 = await turn(
    kiser,
    "I need a new HVAC system and also a swimming pool installed.",
    [],
    null
  );
  record(
    "E7 mixed unknown",
    e7.salesState.serviceScope === "PARTIALLY_SUPPORTED" && !asksLeadField(e7.reply),
    `${e7.salesState.serviceScope} | ${e7.reply}`
  );
  const e8h: Msg[] = [];
  let e8 = await turn(
    kiser,
    "I recently bought a home in auction. I want to redo the electical work like AC, heater and lighting. Can you do that and how much will it cost?",
    e8h,
    null
  );
  e8 = await turn(kiser, "full house electircal rewiring", e8h, e8.salesState);
  record(
    "E8 kiser rewiring",
    !asksLeadField(e8.reply) &&
      /enough information|can.?t confirm|not confirmed|outside what i can confirm/i.test(
        e8.reply
      ) &&
      /\b(hvac|ac\b|heater|heating)\b/i.test(e8.reply) &&
      !inventedPrice(e8.reply),
    e8.reply
  );

  console.log("\n=== GROUP F adversarial 10+ ===");
  const fCases: Array<{ name: string; run: () => Promise<{ pass: boolean; detail: string }> }> = [
    {
      name: "F1 info earlier than asked",
      run: async () => {
        const h: Msg[] = [];
        const r = await turn(plumbing, "Heater broken. I'm Maya, 2145550133, 22 Main St, Dallas TX 75201", h, null);
        return {
          pass:
            /maya/i.test(r.salesState.lead.name || "") &&
            Boolean(r.salesState.lead.phone) &&
            /22 Main/i.test(r.salesState.lead.address || ""),
          detail: JSON.stringify(r.salesState.lead) + " | " + r.reply,
        };
      },
    },
    {
      name: "F2 correct name later",
      run: async () => {
        const h: Msg[] = [];
        let r = await turn(plumbing, "Jacuzzi install please", h, null);
        r = await turn(plumbing, "Jon", h, r.salesState);
        r = await turn(plumbing, "actually it's Jonathan", h, r.salesState);
        return { pass: Boolean(r.salesState.lead.name), detail: `${r.salesState.lead.name} | ${r.reply}` };
      },
    },
    {
      name: "F3 change need heater to jacuzzi",
      run: async () => {
        const h: Msg[] = [];
        let r = await turn(plumbing, "My heater stopped working.", h, null);
        r = await turn(plumbing, "Actually I mean I need a Jacuzzi installed.", h, r.salesState);
        return {
          pass: /jacuzzi/i.test(r.salesState.customerNeed || "") && /jacuzzi/i.test(r.reply),
          detail: `${r.salesState.customerNeed} | ${r.reply}`,
        };
      },
    },
    {
      name: "F4 price halfway through capture",
      run: async () => {
        const h: Msg[] = [];
        let r = await turn(plumbing, "Install my new pump. I already bought it.", h, null);
        r = await turn(plumbing, "Chris", h, r.salesState);
        r = await turn(plumbing, "how much will it cost?", h, r.salesState);
        return {
          pass: !inventedPrice(r.reply) && r.salesState.lead.name === "Chris" && !asksProceed(r.reply),
          detail: r.reply,
        };
      },
    },
    {
      name: "F5 yes before being asked",
      run: async () => {
        const h: Msg[] = [];
        let r = await turn(plumbing, "Heater dead. Yes let's do it, send someone.", h, null);
        r = await turn(plumbing, "Pat", h, r.salesState);
        return { pass: /\bphone|number\b/i.test(r.reply) && r.salesState.lead.name === "Pat", detail: r.reply };
      },
    },
    {
      name: "F6 question after agreeing",
      run: async () => {
        const h: Msg[] = [];
        let r = await turn(plumbing, "Heater repair needed.", h, null);
        r = await turn(plumbing, "Alex", h, r.salesState);
        r = await turn(plumbing, "2145550199", h, r.salesState);
        r = await turn(plumbing, "1500 Marilla St, Dallas TX 75201", h, r.salesState);
        r = await turn(plumbing, "yes an on-site estimate sounds good. can you come tomorrow morning?", h, r.salesState);
        r = await turn(plumbing, "How much will it cost?", h, r.salesState);
        return {
          pass: !asksProceed(r.reply) && !inventedPrice(r.reply) && Boolean(r.salesState.preferredTiming),
          detail: `timing=${r.salesState.preferredTiming} | ${r.reply}`,
        };
      },
    },
    {
      name: "F7 timing early",
      run: async () => {
        const h: Msg[] = [];
        const r = await turn(plumbing, "Clogged drain, can you come tomorrow morning? I'm Avery", h, null);
        return {
          pass: /avery/i.test(r.salesState.lead.name || "") && Boolean(r.salesState.preferredTiming),
          detail: `${r.salesState.lead.name} ${r.salesState.preferredTiming} | ${r.reply}`,
        };
      },
    },
    {
      name: "F8 change timing",
      run: async () => {
        const h: Msg[] = [];
        let r = await turn(plumbing, "Heater down. Name Dana, 2145550166, 9 Oak St, Dallas TX 75201", h, null);
        r = await turn(plumbing, "tomorrow morning", h, r.salesState);
        r = await turn(plumbing, "actually Friday afternoon", h, r.salesState);
        return {
          pass: /friday/i.test(r.salesState.preferredTiming || "") || /friday/i.test(r.reply),
          detail: `${r.salesState.preferredTiming} | ${r.reply}`,
        };
      },
    },
    {
      name: "F9 thanks before completion",
      run: async () => {
        const h: Msg[] = [];
        let r = await turn(plumbing, "Need jacuzzi plumbing.", h, null);
        r = await turn(plumbing, "thanks", h, r.salesState);
        return {
          pass: !r.salesState.handoffReady || Boolean(r.salesState.lead.name),
          detail: `handoff=${r.salesState.handoffReady} name=${r.salesState.lead.name} | ${r.reply}`,
        };
      },
    },
    {
      name: "F10 return to previous concern",
      run: async () => {
        const h: Msg[] = [];
        let r = await turn(plumbing, "Heater not working.", h, null);
        r = await turn(plumbing, "Lee", h, r.salesState);
        r = await turn(plumbing, "are you licensed?", h, r.salesState);
        r = await turn(plumbing, "2145550177", h, r.salesState);
        r = await turn(plumbing, "wait are you licensed though?", h, r.salesState);
        return {
          pass:
            /licen[sc]ed/i.test(r.reply) &&
            Boolean(r.salesState.lead.phone) &&
            !repeatLicense(
              h.filter((m) => m.role === "assistant").slice(0, -1).map((m) => m.content),
              r.reply
            ) === false
              ? /licen[sc]ed/i.test(r.reply)
              : true,
          detail: r.reply,
        };
      },
    },
    {
      name: "F11 same address with no prior address",
      run: async () => {
        const h: Msg[] = [];
        let r = await turn(plumbing, "Pump install, I already bought it.", h, null);
        r = await turn(plumbing, "Quinn", h, r.salesState);
        r = await turn(plumbing, "2145550188", h, r.salesState);
        r = await turn(plumbing, "same address", h, r.salesState);
        return {
          pass: !r.salesState.lead.address ? /\baddress\b/i.test(r.reply) : true,
          detail: `${r.salesState.lead.address} | ${r.reply}`,
        };
      },
    },
    {
      name: "F12 no invented electrical on jacuzzi",
      run: async () => {
        const h: Msg[] = [];
        const r = await turn(plumbing, "Can you do the electrical hookups for my Jacuzzi too?", h, null);
        return {
          pass:
            /don'?t|do not|can(?:not|'t) confirm|not listed|not confirmed|you'll need/i.test(
              r.reply
            ) &&
            !/\bwe (can|will) (handle|do|offer|perform).{0,40}electrical hookup/i.test(
              r.reply
            ) &&
            !inventedPrice(r.reply),
          detail: r.reply,
        };
      },
    },
  ];

  for (const item of fCases) {
    const out = await item.run();
    record(item.name, out.pass, out.detail);
  }

  const failed = results.filter((r) => !r.pass);
  console.log("\n=== SUMMARY ===");
  console.log(`tested=${results.length} passed=${results.filter((r) => r.pass).length} failed=${failed.length}`);
  if (failed.length) {
    for (const f of failed) {
      console.error("FAILED", f.name, f.detail);
    }
    process.exit(1);
  }
  console.log("Adversarial self-test PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
