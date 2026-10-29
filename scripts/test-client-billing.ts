import assert from "node:assert/strict";
import { billingCommand, billingTokenHash } from "../src/lib/clientBilling";
import { createMemoryPaddleNotificationStore, handlePaddleSandboxWebhook, signPaddleSandboxPayload } from "../src/lib/paddleSandboxWebhook";

const pid = (p: string, c: string) => `${p}_${c.repeat(26)}`;
const setup = pid("pri", "a"), monthly = pid("pri", "b");
const intent = "10000000-0000-4000-8000-000000000001", token = "a".repeat(64);
const data = { id: pid("txn", "c"), status: "completed", customer_id: pid("ctm", "d"), subscription_id: pid("sub", "e"), currency_code: "USD", discount_id: null,
  custom_data: { pulsetech_checkout_id: intent, pulsetech_checkout_token: token, customer_account_id: "attacker-selected-account" },
  details: { totals: { subtotal: "250000", discount: "0" } },
  items: [{ quantity: 1, price: { id: setup, unit_price: { amount: "200000", currency_code: "USD" }, billing_cycle: null } }, { quantity: 1, price: { id: monthly, unit_price: { amount: "50000", currency_code: "USD" }, billing_cycle: { interval: "month", frequency: 1 } } }],
};
const record = { eventId: pid("evt", "f"), notificationId: pid("ntf", "g"), eventType: "transaction.completed" as const, occurredAt: new Date().toISOString(), payload: data };
const parsed = billingCommand(record, setup, monthly)!;
assert.equal(parsed.kind, "payment"); assert.equal(parsed.initial, true); assert.equal(parsed.intentId, intent); assert.equal(parsed.tokenHash, billingTokenHash(token));
assert.equal("customer_account_id" in parsed, false, "client-supplied account IDs are not selectors");
for (const change of [
  { currency_code: "EUR" }, { status: "paid" }, { subscription_id: null }, { customer_id: null },
  { discount_id: "discount" }, { details: { totals: { subtotal: "249999", discount: "0" } } },
  { items: [data.items[0], data.items[0]] }, { items: [{ ...data.items[0], quantity: 2 }, data.items[1]] },
  { items: [data.items[0], { ...data.items[1], price: { ...data.items[1].price, unit_price: { amount: "1", currency_code: "USD" } } }] },
  { items: [data.items[0], { ...data.items[1], price: { ...data.items[1].price, billing_cycle: { interval: "year", frequency: 1 } } }] },
]) assert.equal(billingCommand({ ...record, payload: { ...data, ...change } }, setup, monthly), null);
assert.equal(billingCommand({ ...record, eventId: "ntfsimevt_"+"a".repeat(26) }, setup, monthly), null, "simulator cannot grant paid access");
assert.equal(billingCommand(record, "", monthly), null);
const renewal = billingCommand({ ...record, payload: { ...data, items: [data.items[1]], details: { totals: { subtotal: "50000", discount: "0" } } } }, setup, monthly)!;
assert.equal(renewal.initial, false);
for (const [status, expected] of [["active", "paid"], ["canceled", "canceled"], ["past_due", "past_due"], ["paused", "paused"]]) {
  const command = billingCommand({ ...record, eventType: "subscription.updated", payload: { ...data, id: pid("sub", "e"), status } }, setup, monthly)!;
  assert.equal(command.status, expected);
}
for (const [action, type, status, expected] of [["refund", "full", "approved", "refunded"], ["refund", "partial", "approved", "review"], ["chargeback", "full", "approved", "disputed"], ["refund", "full", "pending_approval", null]]) {
  const command = billingCommand({ ...record, eventType: "adjustment.updated", payload: { ...data, id: pid("adj", "h"), transaction_id: data.id, action, type, status } }, setup, monthly);
  assert.equal(command?.status ?? null, expected);
}

async function retryApplication() {
  const store = createMemoryPaddleNotificationStore();
  const rawBody = JSON.stringify({ event_id: record.eventId, event_type: record.eventType, notification_id: record.notificationId, occurred_at: record.occurredAt, data });
  const secret = "test-webhook-secret";
  const nowMs = Date.now();
  let attempts = 0;
  const input = { rawBody, secret, signatureHeader: signPaddleSandboxPayload(rawBody, secret, Math.floor(nowMs/1000)), store, nowMs, vercelEnv: "preview", processNotification: async () => { if (++attempts === 1) throw new Error("database outage"); } };
  assert.equal((await handlePaddleSandboxWebhook(input)).status, 503);
  assert.equal(store.records.size, 1);
  const retried = await handlePaddleSandboxWebhook(input);
  assert.equal(retried.status, 200); assert.equal(retried.body.duplicate, true); assert.equal(attempts, 2, "stored-but-unapplied payment must be retried");
  assert.equal((await handlePaddleSandboxWebhook({ ...input, vercelEnv: "production" })).status, 403);
}
retryApplication().then(() => console.log("PASS billing: exact plan/items/currency, tenant selector, renewal, lifecycle, simulator rejection and retry-after-storage")).catch(error => { console.error(error); process.exitCode=1; });
