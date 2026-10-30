import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { PaddleSandboxNotification } from "./paddleSandboxWebhook";

export const BILLING_EVENTS = ["transaction.completed", "transaction.payment_failed", "subscription.created", "subscription.updated", "subscription.activated", "subscription.resumed", "subscription.paused", "subscription.past_due", "subscription.canceled", "adjustment.created", "adjustment.updated"] as const;
export const billingTokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newBillingToken = () => randomBytes(32).toString("hex");
export function billingAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Account service is unavailable.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
}
const id = (value: unknown, prefix: string) => typeof value === "string" && new RegExp(`^${prefix}_[a-z0-9]{26}$`).test(value) ? value : null;
export type BillingCommand = {
  kind: "payment" | "subscription" | "adjustment";
  eventId: string; occurredAt: string; entityId: string; customerId: string;
  subscriptionId: string | null; transactionId: string | null;
  intentId: string | null; tokenHash: string | null;
  status: string; initial: boolean; periodStart: string | null; periodEnd: string | null;
};

/** Only provider-signed, real platform events may change an existing account.
 * Client IDs and email addresses in checkout data are never account selectors. */
export function billingCommand(record: PaddleSandboxNotification, setupPriceId: string, monthlyPriceId: string): BillingCommand | null {
  if (!/^evt_[a-z0-9]{26}$/.test(record.eventId) || !Number.isFinite(Date.parse(record.occurredAt))) return null;
  const d = object(record.payload);
  const customerId = id(d.customer_id, "ctm");
  if (!customerId) return null;
  const custom = object(d.custom_data);
  const intentId = typeof custom.pulsetech_checkout_id === "string" && /^[0-9a-f-]{36}$/i.test(custom.pulsetech_checkout_id) ? custom.pulsetech_checkout_id : null;
  const token = typeof custom.pulsetech_checkout_token === "string" && /^[a-f0-9]{64}$/.test(custom.pulsetech_checkout_token) ? custom.pulsetech_checkout_token : null;
  const period = object(d.billing_period ?? d.current_billing_period);
  const date = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
  const base = { eventId: record.eventId, occurredAt: record.occurredAt, customerId, intentId, tokenHash: token ? billingTokenHash(token) : null, initial: false, periodStart: date(period.starts_at), periodEnd: date(period.ends_at) };
  if (record.eventType === "transaction.completed") {
    const entityId = id(d.id, "txn");
    const subscriptionId = id(d.subscription_id, "sub");
    if (!entityId || !subscriptionId || d.status !== "completed" || d.currency_code !== "USD" || !setupPriceId || !monthlyPriceId || setupPriceId === monthlyPriceId || !Array.isArray(d.items)) return null;
    const items = d.items.map(object);
    const initial = items.length === 2;
    if (items.length !== 1 && !initial) return null;
    const expected = initial ? new Map([[setupPriceId, "200000"], [monthlyPriceId, "50000"]]) : new Map([[monthlyPriceId, "50000"]]);
    for (const item of items) {
      const price = object(item.price);
      const unit = object(price.unit_price);
      if (typeof price.id !== "string" || !expected.has(price.id) || item.quantity !== 1 || unit.currency_code !== "USD" || String(unit.amount) !== expected.get(price.id)) return null;
      const cycle = object(price.billing_cycle);
      if (price.id === monthlyPriceId && (cycle.interval !== "month" || cycle.frequency !== 1)) return null;
      if (price.id === setupPriceId && price.billing_cycle != null) return null;
      expected.delete(price.id);
    }
    const totals = object(object(d.details).totals);
    if (expected.size || d.discount_id != null || String(totals.discount ?? "0") !== "0" || String(totals.subtotal) !== (initial ? "250000" : "50000")) return null;
    return { ...base, kind: "payment", entityId, transactionId: entityId, subscriptionId, initial, status: "paid" };
  }
  if (record.eventType.startsWith("subscription.")) {
    const entityId = id(d.id, "sub");
    const states: Record<string, string> = { active: "paid", past_due: "past_due", paused: "paused", canceled: "canceled", trialing: "unpaid" };
    if (!entityId || typeof d.status !== "string" || !states[d.status]) return null;
    return { ...base, kind: "subscription", entityId, subscriptionId: entityId, transactionId: null, status: states[d.status] };
  }
  if (record.eventType.startsWith("adjustment.")) {
    const entityId = id(d.id, "adj");
    const transactionId = id(d.transaction_id, "txn");
    if (!entityId || !transactionId || d.status !== "approved") return null;
    const status = d.action === "chargeback" || d.action === "chargeback_warning" ? "disputed" : d.action === "refund" && d.type === "full" ? "refunded" : "review";
    return { ...base, kind: "adjustment", entityId, subscriptionId: id(d.subscription_id, "sub"), transactionId, status };
  }
  // A failed attempt is recorded, but cannot revoke a subscription that remains
  // active. subscription.past_due is the authoritative delinquency transition.
  return null;
}

export async function applyPaddleBilling(record: PaddleSandboxNotification, environment: "sandbox" | "live") {
  const command = billingCommand(record, process.env.NEXT_PUBLIC_PADDLE_SETUP_PRICE_ID || "", process.env.NEXT_PUBLIC_PADDLE_MONTHLY_PRICE_ID || "");
  if (!command) return;
  const { data, error } = await billingAdmin().rpc("apply_client_billing_event", { command: { ...command, environment } });
  if (error || data === "deferred") throw new Error("Billing application needs retry.");
}

export async function applySandboxBilling(record: PaddleSandboxNotification) {
  return applyPaddleBilling(record, "sandbox");
}
