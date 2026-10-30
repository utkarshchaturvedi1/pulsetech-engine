import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { dodoBillingCommand, dodoCheckoutConfig, verifyDodoSignature } from "../src/lib/dodoBilling";

const setup = "pdt_0NqqS9Oa274LBB5NcBL1J";
const monthly = "pdt_0NqqSKk27jMr6B740Vvrw";
const webhookId = "msg_test_01";
const key = Buffer.from("dodo-test-webhook-signing-key");
const secret = `whsec_${key.toString("base64")}`;

const savedEnv = { ...process.env };
function setBillingEnv(values: Record<string, string | undefined>) {
  for (const name of [
    "VERCEL_ENV", "DODO_LIVE_ENABLED", "DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_KEY",
    "DODO_SETUP_PRODUCT_ID", "DODO_MONTHLY_PRODUCT_ID", "DODO_TEST_ENABLED", "DODO_TEST_API_KEY",
    "DODO_TEST_WEBHOOK_KEY", "DODO_TEST_SETUP_PRODUCT_ID", "DODO_TEST_MONTHLY_PRODUCT_ID",
  ]) {
    const value = values[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

setBillingEnv({
  VERCEL_ENV: "preview",
  DODO_TEST_ENABLED: "true",
  DODO_TEST_API_KEY: "test_api",
  DODO_TEST_WEBHOOK_KEY: "test_webhook",
  DODO_TEST_SETUP_PRODUCT_ID: "pdt_test_setup",
  DODO_TEST_MONTHLY_PRODUCT_ID: "pdt_test_monthly",
  DODO_LIVE_ENABLED: "true",
  DODO_PAYMENTS_API_KEY: "live_api",
  DODO_PAYMENTS_WEBHOOK_KEY: "live_webhook",
  DODO_SETUP_PRODUCT_ID: "pdt_live_setup",
  DODO_MONTHLY_PRODUCT_ID: "pdt_live_monthly",
});
assert.deepEqual(dodoCheckoutConfig(), {
  environment: "sandbox", apiKey: "test_api", webhookKey: "test_webhook",
  setupProductId: "pdt_test_setup", monthlyProductId: "pdt_test_monthly",
}, "Preview must use test credentials even when live credentials exist");

setBillingEnv({ VERCEL_ENV: "production", DODO_LIVE_ENABLED: "false", DODO_PAYMENTS_API_KEY: "live_api", DODO_PAYMENTS_WEBHOOK_KEY: "live_webhook", DODO_SETUP_PRODUCT_ID: "pdt_live_setup", DODO_MONTHLY_PRODUCT_ID: "pdt_live_monthly" });
assert.equal(dodoCheckoutConfig(), null, "live checkout remains gated by the explicit live flag");
setBillingEnv({ VERCEL_ENV: "production", DODO_LIVE_ENABLED: "true", DODO_PAYMENTS_API_KEY: "live_api", DODO_PAYMENTS_WEBHOOK_KEY: "live_webhook", DODO_SETUP_PRODUCT_ID: "pdt_live_setup", DODO_MONTHLY_PRODUCT_ID: "pdt_live_monthly", DODO_TEST_ENABLED: "true", DODO_TEST_API_KEY: "test_api", DODO_TEST_WEBHOOK_KEY: "test_webhook", DODO_TEST_SETUP_PRODUCT_ID: "pdt_test_setup", DODO_TEST_MONTHLY_PRODUCT_ID: "pdt_test_monthly" });
assert.equal(dodoCheckoutConfig()?.environment, "live", "Production must keep using live Dodo credentials");
setBillingEnv({ VERCEL_ENV: "development", DODO_TEST_ENABLED: "true", DODO_TEST_API_KEY: "test_api", DODO_TEST_WEBHOOK_KEY: "test_webhook", DODO_TEST_SETUP_PRODUCT_ID: "pdt_test_setup", DODO_TEST_MONTHLY_PRODUCT_ID: "pdt_test_monthly" });
assert.equal(dodoCheckoutConfig(), null, "test checkout is enabled only on a Vercel Preview deployment");
for (const name of Object.keys(process.env)) {
  if (!(name in savedEnv) && name.startsWith("DODO_")) delete process.env[name];
}
for (const [name, value] of Object.entries(savedEnv)) if (name.startsWith("DODO_") || name === "VERCEL_ENV") process.env[name] = value;

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
