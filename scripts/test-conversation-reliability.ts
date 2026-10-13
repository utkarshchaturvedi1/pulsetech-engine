/**
 * Conversation reliability tests.
 * The October 13, 2026 production transcript repeated an either/or owner
 * question after the customer answered "residential". These tests exercise
 * generateSalesReply, including a semantic checker that rejects or fails.
 */
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/chat/route";
import { describeOpenAIFailure } from "../src/lib/aiAnalyzer";
import { createBusinessProfile } from "../src/lib/businessProfile";
import { recognizedEitherOrAnswer } from "../src/lib/ownerQuestions";
import { generateSalesReply, type SalesChatMessage } from "../src/lib/salesChat";
import { validateSalesReply } from "../src/lib/salesController";
import { createInitialSalesState, type SalesState } from "../src/lib/salesState";
import type { BusinessProfile } from "../src/types/business";

const OPENING = "My kitchen sink is clogged.";
const ADDRESS = "1500 Marilla St, Dallas TX 75201";

function checker(body: string, status = 200): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        id: "resp_check",
        object: "response",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: body, annotations: [] }],
          },
        ],
      }),
      { status, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
}

function profile(website: string, questions: string[], extra: Partial<BusinessProfile> = {}): BusinessProfile {
  return createBusinessProfile({
    website,
    businessName: "Example Service Co",
    phone: "(214) 555-0190",
    services: ["On-site service"],
    serviceAreas: ["Dallas"],
    faqs: [],
    leadQuestions: questions,
    systemPrompt: "Help the customer using only saved business facts.",
    leadNotificationEmail: "alerts@example.test",
    ...extra,
  });
}

async function walk(
  business: BusinessProfile,
  turns: string[],
  fetchImpl?: typeof fetch
): Promise<{ reply: string; state: SalesState; steps: Array<{ user: string; reply: string; state: SalesState }> }> {
  if (fetchImpl) globalThis.fetch = fetchImpl;
  let state = createInitialSalesState({
    conversationId: `conv_${business.website.replace(/\W/g, "").slice(-24)}`,
    businessKey: business.website,
  });
  const messages: SalesChatMessage[] = [];
  const steps: Array<{ user: string; reply: string; state: SalesState }> = [];
  let reply = "";
  for (const turn of turns) {
    messages.push({ role: "user", content: turn });
    const result = await generateSalesReply(business, messages, state);
    reply = result.reply;
    state = result.salesState;
    messages.push({ role: "assistant", content: reply });
    steps.push({ user: turn, reply, state });
  }
  return { reply, state, steps };
}

function assertChoice(stored: string | undefined, selected: string, rejected: string) {
  assert.equal(typeof stored, "string", `expected a stored choice, got ${stored}`);
  assert.match(stored || "", new RegExp(selected, "i"));
  assert.doesNotMatch(stored || "", new RegExp(rejected, "i"));
}

async function testProductionRepeat() {
  process.env.OPENAI_API_KEY = "test-only";
  const questions = [
    "Is this for a residential or commercial property?",
    "Is the project for a residential property or a commercial property?",
  ];
  for (const question of questions) {
    assert.equal(recognizedEitherOrAnswer(question, "residential")?.includes("residential"), true);
    for (const fetchImpl of [checker('{"answersQuestion":false}'), (async () => { throw new Error("checker unavailable"); }) as typeof fetch]) {
      const result = await walk(
        profile(`https://repeat-${questions.indexOf(question)}-${fetchImpl === undefined ? "a" : "b"}.test`, [question]),
        [OPENING, "UT", "9898989898", ADDRESS, "residential"],
        fetchImpl
      );
      assert.equal(result.steps[3].reply, question, `address turn must ask the owner question, got ${result.steps[3].reply}`);
      const answered = result.steps[4];
      assertChoice(answered.state.ownerQuestionAnswers[question], "residential", "commercial");
      assert.equal(answered.reply.toLowerCase().includes(question.toLowerCase()), false, `answered question was repeated: ${answered.reply}`);
      assert.equal(answered.state.lead.name, "UT");
      assert.match(answered.state.lead.address || "", /1500 Marilla St/i);
      assert.equal(answered.state.leadDeliveryStatus, "NOT_SENT");
    }
  }
  console.log("PASS — production either/or answer is saved and not repeated");
}

async function testUnfamiliarBusinesses() {
  process.env.OPENAI_API_KEY = "test-only";
  globalThis.fetch = checker('{"answersQuestion":false}');
  const hvacQuestion = "Do you need a heat pump or a gas furnace?";
  const legalQuestion = "Is this a consultation or an existing matter?";
  const cleaningQuestion = "Are there pets we should know about?";
  const roofQuestion = "Can you describe the roofing problem you need help with?";

  const hvac = await walk(profile("https://hvac-north.test", [hvacQuestion], { services: ["Heating and cooling"] }), [
    "The heater is not working.",
    "Mina",
    "2145550102",
    "10 Oak Ave, Plano TX 75024",
    "heat pump",
  ]);
  assertChoice(hvac.state.ownerQuestionAnswers[hvacQuestion], "heat pump", "furnace");
  assert.equal(hvac.reply.includes(hvacQuestion), false);

  const legal = await walk(profile("https://legal-west.test", [legalQuestion], { services: ["Client intake"] }), [
    "I need help with a contract.",
    "Noah",
    "2145550103",
    "20 Elm St, Austin TX 78701",
    "consultation",
  ]);
  assertChoice(legal.state.ownerQuestionAnswers[legalQuestion], "consultation", "existing matter");
  assert.equal(legal.reply.includes(legalQuestion), false);

  const cleaning = await walk(profile("https://cleaning-east.test", [cleaningQuestion], { services: ["Home cleaning"] }), [
    "I need the house cleaned.",
    "Priya",
    "2145550104",
    "30 Pine Rd, Dallas TX 75201",
    "I would rather not say",
  ]);
  assert.match(cleaning.state.ownerQuestionAnswers[cleaningQuestion] || "", /rather not say/i);
  assert.equal(cleaning.reply.includes(cleaningQuestion), false, `declined question was repeated: ${cleaning.reply}`);

  const roofing = await walk(profile("https://roofing-south.test", [roofQuestion], { services: ["Roof repair"] }), [
    "There is a leak in the ceiling.",
    "Sam",
    "2145550105",
    "40 Cedar Ln, Dallas TX 75201",
    "I need to repair a leaking roof",
  ]);
  assert.match(roofing.state.ownerQuestionAnswers[roofQuestion] || "", /leaking roof/i);
  assert.equal(roofing.reply.includes(roofQuestion), false);

  const none = await walk(profile("https://no-questions.test", []), [
    "The lights are out.",
    "Ada",
    "2145550106",
    "50 Main St, Dallas TX 75201",
  ]);
  assert.deepEqual(none.state.requiredOwnerQuestions, []);
  assert.equal(JSON.stringify(none.state.ownerQuestionAnswers), "{}");

  const many = [
    "Do you need repair or replacement?",
    "Is access available during the day?",
    "Which day works for a visit?",
    "Can you describe the project you need help with?",
  ];
  const multi = await walk(profile("https://many-questions.test", many), [
    "I need a new panel.",
    "Lee",
    "2145550107",
    "60 Main St, Dallas TX 75201",
    "replacement",
  ]);
  assert.match(multi.state.ownerQuestionAnswers[many[0]] || "", /replacement/i);
  assert.equal(multi.reply, many[1], `next unanswered question should be asked, got ${multi.reply}`);
  console.log("PASS — unfamiliar businesses, refusals, and question counts");
}

async function testIsolationAndReplay() {
  process.env.OPENAI_API_KEY = "test-only";
  globalThis.fetch = checker('{"answersQuestion":false}');
  const question = "Do you need repair or replacement?";
  const alpha = profile("https://tenant-alpha.test", [question]);
  const beta = profile("https://tenant-beta.test", ["Do you need a quote or a site visit?"]);
  const left = await walk(alpha, [OPENING, "Ari", "2145550111", ADDRESS, "repair"]);
  const right = await walk(beta, ["The roof is leaking.", "Bea", "2145550112", "70 Main St, Dallas TX 75201", "site visit"]);
  assert.match(left.state.ownerQuestionAnswers[question] || "", /repair/i);
  assert.equal(right.state.ownerQuestionAnswers[question], undefined);
  assert.equal(left.state.businessKey, alpha.website);
  assert.equal(right.state.businessKey, beta.website);
  assert.notEqual(left.state.lead.phone, right.state.lead.phone);

  const prior = left.steps[3].state;
  const messages: SalesChatMessage[] = [
    { role: "user", content: OPENING },
    { role: "assistant", content: left.steps[0].reply },
    { role: "user", content: "Ari" },
    { role: "assistant", content: left.steps[1].reply },
    { role: "user", content: "2145550111" },
    { role: "assistant", content: left.steps[2].reply },
    { role: "user", content: ADDRESS },
    { role: "assistant", content: question },
    { role: "user", content: "repair" },
  ];
  const first = await generateSalesReply(alpha, messages, prior);
  const second = await generateSalesReply(alpha, messages, prior);
  assert.equal(first.reply, second.reply);
  assert.match(first.salesState.ownerQuestionAnswers[question] || "", /repair/i);
  assert.equal(first.reply.includes(question), false);

  const paraphrased = await generateSalesReply(alpha, [
    ...messages.slice(0, -2),
    { role: "assistant", content: "Just to confirm, is this a repair or a replacement?" },
    { role: "user", content: "replacement" },
  ], prior);
  assert.match(paraphrased.salesState.ownerQuestionAnswers[question] || "", /replacement/i);
  assert.equal(paraphrased.reply.includes(question), false);

  const blocked = validateSalesReply(
    "Is this a repair or a replacement?",
    paraphrased.salesState,
    alpha,
    "replacement"
  );
  assert.equal(blocked.ok, false);

  const unclear = await walk(alpha, [OPENING, "Ari", "2145550111", ADDRESS, "home", "home"]);
  const asked = unclear.steps[3].reply;
  assert.equal(asked, question);
  assert.equal(unclear.steps[4].state.ownerQuestionAnswers[question], undefined);
  assert.notEqual(unclear.steps[4].reply, question);
  assert.match(unclear.steps[4].reply, /which one applies/i);
  assert.notEqual(unclear.steps[5].reply, question);
  assert.doesNotMatch(unclear.steps[5].reply, /which one applies/i);
  console.log("PASS — tenant isolation, replay, paraphrase, and checker");
}

async function testFailureAndRoute() {
  const auth = describeOpenAIFailure(Object.assign(new Error("Incorrect API key"), { status: 401, name: "Error" }));
  assert.equal(auth.category === "authentication" || auth.status === null, true);

  process.env.OPENAI_API_KEY = "test-only";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "Incorrect API key provided", type: "invalid_request_error", code: "invalid_api_key" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  const priced = await walk(profile("https://outage.test", [], {
    pricingRules: "Visiting charge is $20. Waived if work proceeds.",
  }), [
    OPENING,
    "UT",
    "9898989898",
    ADDRESS,
    "How much is the total project?",
  ]);
  assert.doesNotMatch(priced.reply, /incorrect api key|openai|status 401|sk-/i);
  assert.doesNotMatch(priced.reply, /appointment is (booked|confirmed)|you're all set/i);
  assert.match(priced.reply, /depend|not the total|\$20/i);

  const business = profile("https://route-alpha.test", ["Is this for a house or a business?"]);
  const other = profile("https://route-beta.test", ["Is this for a house or a business?"]);
  const mismatch = await POST(new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: "conv_route_mismatch",
      business,
      messages: [{ role: "user", content: OPENING }],
      salesState: createInitialSalesState({ conversationId: "conv_route_mismatch", businessKey: other.website }),
    }),
  }));
  assert.equal(mismatch.status, 400);

  let state = createInitialSalesState({ conversationId: "conv_route_ok", businessKey: business.website });
  const messages: SalesChatMessage[] = [];
  let reply = "";
  for (const turn of [OPENING, "UT", "9898989898", ADDRESS, "house"]) {
    messages.push({ role: "user", content: turn });
    const response = await POST(new NextRequest("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: state.conversationId, business, messages, salesState: state }),
    }));
    const raw = await response.text();
    assert.equal(response.status, 200, raw);
    const body = JSON.parse(raw) as { reply: string; salesState: SalesState };
    reply = body.reply;
    state = body.salesState;
    messages.push({ role: "assistant", content: reply });
  }
  assert.match(state.ownerQuestionAnswers["Is this for a house or a business?"] || "", /house/i);
  assert.equal(reply.toLowerCase().includes("is this for a house or a business?"), false);
  console.log("PASS — failure fallback, route isolation, and production request path");
}

async function main() {
  await testProductionRepeat();
  await testUnfamiliarBusinesses();
  await testIsolationAndReplay();
  await testFailureAndRoute();
  console.log("PASS — conversation reliability");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
