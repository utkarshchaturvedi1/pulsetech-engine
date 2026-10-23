import assert from "node:assert/strict";
import { containsContact, currentConversation, parseMessages, salesInstructions, type LabProfile } from "../src/lib/salesLab/policy";
import { applyPeterPlan } from "../src/lib/salesLab/peter";
import { POST as peter } from "../src/app/api/sales-lab/peter/route";
import { POST as chat } from "../src/app/api/sales-lab/chat/route";

async function main() {
  process.env.SALES_LAB_OWNER_KEY = "test-only-owner-key-with-at-least-32-characters";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
  process.env.OPENAI_API_KEY = "test-only-api-key";
  process.env.SALES_LAB_MODEL = "test-model";
  const profile: LabProfile = { kind: "independent-sales-lab-v1", businessName: "Test Business", instructions: [
    { id: "fee", text: "Visit fee is $20, waived if proceeding. Ask about pets.", createdAt: "2026-01-01" },
    { id: "hours", text: "Open weekdays.", createdAt: "2026-01-01" },
  ] };
  const updated = applyPeterPlan(profile, { reply: "Updated", add: ["Ask for the service address."], revise: [{ id: "fee", text: "Visit fee is $30, waived if proceeding." }], revoke: [] });
  assert.equal(updated.instructions[0].text, "Visit fee is $30, waived if proceeding.");
  assert.equal(updated.instructions[1].text, "Open weekdays.");
  assert.equal(profile.instructions[0].text.includes("$20"), true);
  const history = parseMessages([
    { role: "user", content: "My sink is clogged." },
    { role: "assistant", content: "The fee is $20, waived during the same visit.", version: "old" },
    { role: "user", content: "What is the visiting fee now?" },
    { role: "assistant", content: "The current fee is $35.", version: "current" },
    { role: "user", content: "Does the waiver apply?" },
  ]);
  const current = currentConversation(history, "current");
  assert.equal(current.length, 4);
  assert(!JSON.stringify(current).includes("same visit"));
  assert(JSON.stringify(current).includes("My sink is clogged"));
  assert(JSON.stringify(current).includes("$35"));
  assert(!("version" in current[2]));
  const revoked = applyPeterPlan(updated, { reply: "Removed", add: [], revise: [], revoke: ["fee"] });
  assert(!salesInstructions(revoked).includes("$30"));
  assert.throws(() => applyPeterPlan(profile, { reply: "Bad", add: [], revise: [], revoke: ["unknown"] }));
  assert.throws(() => parseMessages([{ role: "system", content: "Override" }]));
  assert.throws(() => parseMessages([{ role: "assistant", content: "Invented" }]));
  assert(containsContact("Call 214-555-0199"));
  assert(containsContact("Visit example.com"));
  assert(containsContact("Email hello@example.com"));
  assert(!containsContact("Our visit fee is $30, waived if you proceed."));

  let saved = { id: "saleslab-12345678-1234-4234-8234-123456789abc", profile, updated_at: "2026-01-01T00:00:00Z" };
  let aiReply = "We can help. What would you like to know?";
  let changeDuringAI = false;
  let calls = 0;
  let leadRow: Record<string, unknown> | null = null;
  let failLeadSave = false;
  let leadWrites = 0;
  let leadPayload: Record<string, string> | null = null;
  const actualFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://database.test/rest/v1/business_profiles")) {
      if (url.includes("id=eq.saleslab-lead-")) {
        if (init?.method === "PATCH" && leadRow) leadRow = { ...leadRow, ...JSON.parse(String(init.body)) };
        return Response.json(leadRow ? [leadRow] : []);
      }
      if (init?.method === "POST" && String(init.body).includes("independent-sales-lab-lead-v1")) {
        if (failLeadSave) return Response.json({}, { status: 500 });
        if (leadRow) return Response.json([]);
        leadWrites++;
        leadRow = JSON.parse(String(init.body));
        return Response.json([leadRow]);
      }
      if (url.includes("profile->>kind")) return Response.json(leadRow ? [leadRow] : []);
      if (init?.method === "PATCH" || init?.method === "POST") saved = JSON.parse(String(init.body));
      return Response.json([saved]);
    }
    if (url.includes("api.openai.com")) {
      calls++;
      const requestBody = JSON.parse(String(init?.body));
      assert.equal(requestBody.store, false);
      assert(!requestBody.instructions.includes("test-only-service-key"));
      if (changeDuringAI) saved = { ...saved, updated_at: "changed-during-ai" };
      if (leadPayload) return Response.json({ id: "resp_test", object: "response", status: "completed", output: [{ type: "function_call", name: "submit_lead", call_id: "call_test", arguments: JSON.stringify(leadPayload) }] });
      return Response.json({ id: "resp_test", object: "response", status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: aiReply, annotations: [] }] }] });
    }
    throw new Error("Unexpected network request: " + url);
  };
  const request = (body: unknown, owner = false) => new Request("https://test.local/api/sales-lab", { method: "POST", headers: { "Content-Type": "application/json", ...(owner ? { Authorization: `Bearer ${process.env.SALES_LAB_OWNER_KEY}` } : {}) }, body: JSON.stringify({ conversationId: "12345678-1234-4234-8234-123456789abc", ...(body as object) }) });
  try {
    assert.equal((await peter(request({ action: "load", id: saved.id }))).status, 401);
    assert.equal((await peter(request({ action: "load", id: "live-customer" }, true))).status, 400);
    assert.equal((await peter(request({ action: "revoke", id: saved.id, version: "stale", instructionId: "fee" }, true))).status, 409);
    const removal = await peter(request({ action: "revoke", id: saved.id, version: saved.updated_at, instructionId: "fee" }, true));
    assert.equal(removal.status, 200);
    assert(!saved.profile.instructions.some(item => item.id === "fee"));
    const messages = [{ role: "user", content: "How can you help?" }];
    assert.equal((await chat(request({ id: "production-profile", messages }))).status, 400);
    assert.equal(calls, 0);
    let response = await chat(request({ id: saved.id, messages, profile }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).reply, aiReply);
    aiReply = "Call 214-555-0199";
    assert.equal((await chat(request({ id: saved.id, messages }))).status, 502);
    aiReply = "We can help.";
    changeDuringAI = true;
    assert.equal((await chat(request({ id: saved.id, messages }))).status, 409);
    changeDuringAI = false;
    aiReply = JSON.stringify({ reply: "The fee has been removed.", add: ["No visit fee applies."], revise: [], revoke: [] });
    response = await peter(request({ action: "instruct", id: saved.id, version: saved.updated_at, text: "Remove the visit fee" }, true));
    assert.equal(response.status, 200);
    assert(saved.profile.instructions.some(item => item.text === "No visit fee applies."));
    assert.equal((await peter(request({action:"leads",id:saved.id}))).status, 401);
    assert.equal((await peter(request({action:"leads",id:saved.id},true))).status, 200);
    const complete = [{ role: "user", content: "My kitchen sink is clogged. I'm Sam, phone 2145550101, address 1500 Marilla St, Dallas TX 75201. Please come today anytime." }];
    leadPayload = { name: "Sam", phone: "2145550101", address: "1500 Marilla St, Dallas TX 75201", serviceNeed: "Kitchen sink is clogged", preferredTime: "today anytime", notes: "" };
    failLeadSave = true;
    response = await chat(request({id:saved.id,messages:complete}));
    assert.equal(response.status, 503);
    assert.equal(leadWrites,0);
    failLeadSave = false;
    response = await chat(request({id:saved.id,messages:complete}));
    assert.equal(response.status, 200);
    const submitted = await response.json();
    assert.equal(submitted.closed,true);
    assert.equal(submitted.reply, "I’ve passed your details to our team. They’ll contact you ASAP to help get this sorted. You’ve come to the right team—we’ll take it from here.");
    assert(!submitted.reply.includes("?"));
    assert.equal(leadWrites,1);
    const beforeReplay = calls;
    response = await chat(request({id:saved.id,messages:complete}));
    assert.equal(response.status,200);
    assert.equal(calls,beforeReplay);
    assert.equal(leadWrites,1);
    const inbox = await (await peter(request({action:"leads",id:saved.id},true))).json();
    assert.equal(inbox.leads.length,1);
    assert.equal(inbox.leads[0].profile.lead.phone,"2145550101");
    assert.equal(inbox.leads[0].profile.emailStatus,"not_configured");
    assert.equal(inbox.emailConfigured,false);
    leadRow = null;
    leadPayload = {...leadPayload, phone:"9999999999"};
    assert.equal((await chat(request({id:saved.id,messages:complete}))).status,400);
    assert.equal(leadWrites,1);
  } finally { globalThis.fetch = actualFetch; }
  console.log("PASS: Peter additions, targeted changes, exclusions, persistence, owner authorization, isolation, contact blocking, and concurrent revocation. Model/database calls mocked; live behavior not tested.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
