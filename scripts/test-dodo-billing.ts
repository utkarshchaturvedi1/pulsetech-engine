import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { dodoBillingCommand, verifyDodoSignature } from "../src/lib/dodoBilling";

const setup = "pdt_0NqqS9Oa274LBB5NcBL1J";
const monthly = "pdt_0NqqSKk27jMr6B740Vvrw";
const webhookId = "msg_test_01";
const key = Buffer.from("dodo-test-webhook-signing-key");
const secret = `whsec_${key.toString("base64")}`;
const now = Date.now();
const timestamp = String(Math.floor(now / 1000));
function signature(raw: string) {
  return `v1,${createHmac("sha256", key).update(`${webhookId}.${timestamp}.${raw}`).digest("base64")}`;
}
const raw = JSON.stringify({ type: "payment.succeeded", timestamp: new Date(now).toISOString(), data: {
  payload_type: "Payment", payment_id: "pay_test_123", status: "succeeded", customer_id: "cus_test_123",
  subscription_id: "sub_test_123", currency: "USD", total_amount: 250000,
  metadata: { pulsetech_checkout_id: "10000000-0000-4000-8000-000000000001", pulsetech_checkout_token: "a".repeat(64) },
  product_cart: [{ product_id: setup, quantity: 1 }, { product_id: monthly, quantity: 1 }],
} });
assert.equal(verifyDodoSignature({ rawBody: raw, webhookId, timestamp, signature: signature(raw), secret, nowMs: now }), true);
assert.equal(verifyDodoSignature({ rawBody: raw + " ", webhookId, timestamp, signature: signature(raw), secret, nowMs: now }), false, "signature covers raw bytes");
assert.equal(verifyDodoSignature({ rawBody: raw, webhookId, timestamp: String(Number(timestamp) - 301), signature: signature(raw), secret, nowMs: now }), false, "stale messages are rejected");

const event = JSON.parse(raw);
const parsed = dodoBillingCommand({ webhookId, event, setupProductId: setup, monthlyProductId: monthly });
assert.equal(parsed?.kind, "payment");
assert.equal(parsed?.initial, true);
assert.equal(parsed?.intentId, "10000000-0000-4000-8000-000000000001");
assert.equal(parsed?.tokenHash?.length, 64);
for (const dataPatch of [
  { currency: "EUR" }, { status: "failed" }, { subscription_id: null },
  { discount_id: "discount" }, { total_amount: 249999 },
  { product_cart: [{ product_id: setup, quantity: 2 }, { product_id: monthly, quantity: 1 }] },
  { product_cart: [{ product_id: setup, quantity: 1 }, { product_id: "pdt_untrusted", quantity: 1 }] },
]) {
  assert.equal(dodoBillingCommand({ webhookId, event: { ...event, data: { ...event.data, ...dataPatch } }, setupProductId: setup, monthlyProductId: monthly }), null);
}

const renewal = dodoBillingCommand({ webhookId: "msg_renewal", event: { ...event, data: {
  ...event.data, payment_id: "pay_renewal_123", total_amount: 50000, metadata: {}, product_cart: [{ product_id: monthly, quantity: 1 }],
} }, setupProductId: setup, monthlyProductId: monthly });
assert.equal(renewal?.initial, false);
assert.equal(dodoBillingCommand({ webhookId: "msg_unknown", event: { ...event, type: "payment.failed" }, setupProductId: setup, monthlyProductId: monthly }), null);

console.log("PASS Dodo billing: raw-body signature, stale/replay protection, account-bound intent, fixed products/prices, and monthly renewal checks");
