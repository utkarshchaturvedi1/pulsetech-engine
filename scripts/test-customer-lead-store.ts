import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createInitialSalesState } from "../src/lib/salesState";
import { persistCustomerLead, updateCustomerLeadAlertStatus } from "../src/lib/customerLeadStore";

const accountId = "00000000-0000-4000-8000-000000000001";
const originalFetch = globalThis.fetch;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://staging.example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_fake_test_key";

async function main() {
  const state = createInitialSalesState({
    conversationId: "conversation-lead-test-001",
    businessKey: "https://example.test",
  });
  let calls: Array<{ url: string; method: string; body?: string }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    if (url.includes("/rest/v1/customer_accounts")) {
      assert.match(url, /demo_id=eq\.pt-demo-test-001/);
      return Response.json({ id: accountId });
    }
    if (url.includes("/rest/v1/customer_leads")) {
      if (method === "PATCH") return Response.json({ id: "lead-test-001" });
      return new Response(null, { status: 201 });
    }
    throw new Error("Unexpected request " + url);
  }) as typeof fetch;

  const empty = await persistCustomerLead("pt-demo-test-001", state);
  assert.deepEqual(empty, { saved: false, applicable: false }, "empty chat is not a lead-save failure");
  assert.equal(calls.length, 0, "empty conversations should not create lead records");

  state.lead.name = "Jordan Test";
  state.lead.phone = "+12025550123";
  state.lead.email = "jordan@example.test";
  state.lead.address = "999 Demo Avenue";
  state.primaryNeed = "Repair a water heater";
  state.urgency = "SOON";
  state.preferredTiming = "Tomorrow morning";
  state.leadDeliveryStatus = "QUEUED";

  const result = await persistCustomerLead("pt-demo-test-001", state);
  assert.deepEqual(result, { saved: true, applicable: true });
  assert.equal(calls.length, 2, "lead save must resolve the account then upsert once");
  assert.equal(calls[1].method, "POST");
  assert.match(calls[1].url, /on_conflict=customer_account_id%2Cconversation_id/);

  const row = JSON.parse(calls[1].body || "{}") as Record<string, unknown>;
  assert.equal(row.customer_account_id, accountId, "lead must be bound to the server-resolved account");
  assert.equal(row.conversation_id, state.conversationId);
  assert.equal(row.customer_name, "Jordan Test");
  assert.equal(row.customer_phone, "+12025550123");
  assert.equal(row.customer_email, "jordan@example.test");
  assert.equal(row.service_address, "999 Demo Avenue");
  assert.equal(row.primary_need, "Repair a water heater");
  assert.equal(row.alert_delivery_status, "QUEUED");
  assert.ok(!("messages" in row) && !("transcript" in row), "store only the minimum lead fields, not chat transcripts");

  assert.equal(
    await updateCustomerLeadAlertStatus("pt-demo-test-001", state.conversationId, "SENT"),
    true,
    "delivery completion updates the same account's lead"
  );
  const statusUpdate = calls.at(-1);
  assert.ok(statusUpdate);
  assert.equal(statusUpdate.method, "PATCH");
  assert.ok(statusUpdate.url.includes("customer_account_id=eq." + accountId));
  assert.ok(statusUpdate.url.includes("conversation_id=eq.conversation-lead-test-001"));
  assert.deepEqual(JSON.parse(statusUpdate.body || "{}"), { alert_delivery_status: "SENT" });

  const migration = readFileSync(path.join(process.cwd(), "supabase/customer_leads.sql"), "utf8");
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /membership\.customer_account_id = customer_leads\.customer_account_id/);
  assert.match(migration, /membership\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /unique \(customer_account_id, conversation_id\)/);

  console.log("PASS client lead store: empty chat, account-scoped upsert, minimal PII payload, RLS migration");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
});
