import { createHmac, timingSafeEqual } from "node:crypto";
import { billingTokenHash } from "./clientBilling";

export type DodoBillingCommand = {
  provider: "dodo";
  eventId: string;
  occurredAt: string;
  kind: "payment" | "subscription" | "adjustment";
  entityId: string;
  paymentId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  intentId: string | null;
  tokenHash: string | null;
  initial: boolean;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number | null;
  currency: string | null;
  products: Array<{ productId: string; quantity: number }>;
};

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => value && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;

export function verifyDodoSignature(input: {
  rawBody: string;
  webhookId: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  nowMs?: number;
}): boolean {
  const { rawBody, webhookId, timestamp, signature, secret } = input;
  if (!rawBody || !webhookId || !/^\d+$/.test(timestamp || "") || !signature || !secret) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs((input.nowMs ?? Date.now()) / 1000 - seconds) > 300) return false;
  let key: Buffer;
  try { key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64"); }
  catch { return false; }
  if (!key.length) return false;
  const expected = createHmac("sha256", key).update(`${webhookId}.${timestamp}.${rawBody}`).digest();
  return signature.split(/\s+/).some((part) => {
    const match = /^v1,([A-Za-z0-9+/]+=*)$/.exec(part);
    if (!match) return false;
    try {
      const actual = Buffer.from(match[1], "base64");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch { return false; }
  });
}

function ids(data: Obj) {
  const customer = obj(data.customer);
  const metadata = obj(data.metadata);
  const token = typeof metadata.pulsetech_checkout_token === "string" && /^[a-f0-9]{64}$/.test(metadata.pulsetech_checkout_token) ? metadata.pulsetech_checkout_token : null;
  const intent = typeof metadata.pulsetech_checkout_id === "string" && /^[a-f0-9-]{36}$/i.test(metadata.pulsetech_checkout_id) ? metadata.pulsetech_checkout_id : null;
  const subs = Array.isArray(data.subscription_ids) ? data.subscription_ids : [];
  return {
    customerId: typeof customer.customer_id === "string" ? customer.customer_id : (typeof data.customer_id === "string" ? data.customer_id : null),
    subscriptionId: typeof data.subscription_id === "string" ? data.subscription_id : (typeof subs[0] === "string" ? subs[0] : null),
    intentId: intent,
    tokenHash: token ? billingTokenHash(token) : null,
  };
}

/** Parses only supported Dodo events; amounts and both product IDs are checked before activation. */
export function dodoBillingCommand(input: {
  webhookId: string;
  event: unknown;
  setupProductId: string;
  monthlyProductId: string;
}): DodoBillingCommand | null {
  const { webhookId, setupProductId, monthlyProductId } = input;
  if (!webhookId || !setupProductId || !monthlyProductId || setupProductId === monthlyProductId) return null;
  const event = obj(input.event), data = obj(event.data);
  const occurredAt = date(event.timestamp);
  const type = typeof event.type === "string" ? event.type : "";
  if (!occurredAt || !["Payment", "Subscription", "Refund", "Dispute"].includes(String(data.payload_type))) return null;
  const ref = ids(data);
  const productRows = Array.isArray(data.product_cart) ? data.product_cart : [];
  const products = productRows.map((row) => {
    const item = obj(row);
    return { productId: typeof item.product_id === "string" ? item.product_id : "", quantity: Number(item.quantity) };
  });
  const currencyObj = obj(data.currency);
  const currency = typeof data.currency === "string" ? data.currency : typeof currencyObj.currency === "string" ? currencyObj.currency : typeof currencyObj.code === "string" ? currencyObj.code : null;
  const amount = Number.isSafeInteger(data.total_amount) ? data.total_amount as number : null;
  const base = {
    provider: "dodo" as const, eventId: webhookId, occurredAt, ...ref,
    paymentId: typeof data.payment_id === "string" ? data.payment_id : null,
    amount, currency, products,
    periodStart: date(obj(data.service_period).start),
    periodEnd: date(obj(data.service_period).end),
  };

  if (type === "payment.succeeded") {
    if (!base.paymentId || !base.customerId || !base.subscriptionId || data.status !== "succeeded" || currency !== "USD") return null;
    const initial = products.length === 2 && products.some((p) => p.productId === setupProductId) && products.some((p) => p.productId === monthlyProductId);
    const renewal = products.length === 1 && products[0].productId === monthlyProductId;
    if (!initial && !renewal || products.some((p) => p.quantity !== 1)) return null;
    if (data.discount_id != null || data.discount_ids != null || initial && (amount == null || amount < 250000) || renewal && (amount == null || amount < 50000)) return null;
    return { ...base, kind: "payment", entityId: base.paymentId, initial, status: "paid" };
  }
  if (type.startsWith("subscription.")) {
    if (!ref.subscriptionId) return null;
    const states: Record<string, string> = {
      "subscription.active": "paid", "subscription.renewed": "paid", "subscription.on_hold": "past_due",
      "subscription.past_due": "past_due", "subscription.paused": "paused", "subscription.unpaused": "paid",
      "subscription.cancelled": "canceled", "subscription.expired": "canceled", "subscription.failed": "past_due",
    };
    const status = states[type];
    if (!status) return null;
    return { ...base, kind: "subscription", entityId: ref.subscriptionId, initial: false, status };
  }
  if (type === "refund.succeeded") {
    const paymentId = typeof data.payment_id === "string" ? data.payment_id : null;
    const refundId = typeof data.refund_id === "string" ? data.refund_id : null;
    if (!paymentId || !refundId || data.is_full_refund !== true) return null;
    return { ...base, kind: "adjustment", entityId: refundId, paymentId, initial: false, status: "refunded" };
  }
  if (type === "dispute.opened") {
    const paymentId = typeof data.payment_id === "string" ? data.payment_id : null;
    const disputeId = typeof data.dispute_id === "string" ? data.dispute_id : null;
    if (!paymentId || !disputeId) return null;
    return { ...base, kind: "adjustment", entityId: disputeId, paymentId, initial: false, status: "disputed" };
  }
  return null;
}

export function dodoApiEnvironment() {
  return process.env.VERCEL_ENV === "production" ? "live_mode" : "test_mode";
}

export function dodoCheckoutEnabled() {
  return process.env.VERCEL_ENV === "production" && process.env.DODO_LIVE_ENABLED === "true" &&
    Boolean(process.env.DODO_PAYMENTS_API_KEY && process.env.DODO_SETUP_PRODUCT_ID && process.env.DODO_MONTHLY_PRODUCT_ID && process.env.DODO_PAYMENTS_WEBHOOK_KEY);
}
