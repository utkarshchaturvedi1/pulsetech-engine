import { createHmac, timingSafeEqual } from "crypto";

/** Paddle's documented replay window for the signature timestamp. */
export const PADDLE_SIGNATURE_MAX_SKEW_SECONDS = 5;

export const PADDLE_SANDBOX_EVENT_TYPES = [
  "transaction.completed",
  "subscription.created",
  "subscription.updated",
  "subscription.canceled",
] as const;

export type PaddleSandboxEventType = (typeof PADDLE_SANDBOX_EVENT_TYPES)[number];

export type PaddleSandboxNotification = {
  eventId: string;
  notificationId: string;
  eventType: PaddleSandboxEventType;
  occurredAt: string;
  payload: unknown;
};

export type PaddleNotificationStore = {
  saveIfNew(record: PaddleSandboxNotification): Promise<"stored" | "duplicate">;
};

export class PaddleStoreUnavailable extends Error {
  constructor(message = "Paddle notification storage is unavailable.") {
    super(message);
  }
}

export function createMemoryPaddleNotificationStore(): PaddleNotificationStore & {
  records: Map<string, PaddleSandboxNotification>;
} {
  const records = new Map<string, PaddleSandboxNotification>();
  return {
    records,
    async saveIfNew(record) {
      if (records.has(record.eventId)) return "duplicate";
      records.set(record.eventId, record);
      return "stored";
    },
  };
}

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

export const supabasePaddleNotificationStore: PaddleNotificationStore = {
  async saveIfNew(record) {
    const config = supabaseConfig();
    if (!config) throw new PaddleStoreUnavailable("Supabase is not configured.");
    const response = await fetch(config.url + "/rest/v1/paddle_sandbox_notifications", {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: "Bearer " + config.key,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        event_id: record.eventId,
        notification_id: record.notificationId,
        event_type: record.eventType,
        occurred_at: record.occurredAt,
        payload: record.payload,
      }),
    });
    if (response.status === 409) return "duplicate";
    if (response.ok) return "stored";
    throw new PaddleStoreUnavailable("Could not store the Paddle notification.");
  },
};

export function paddleSandboxWebhookSecret(): string {
  return process.env.PADDLE_SANDBOX_WEBHOOK_SECRET?.trim() || "";
}

/**
 * This route is available only outside Vercel production.
 * Sandbox is identified by using the Sandbox destination secret from local
 * .env.local or Vercel Preview, not by a key prefix or event.environment.
 */
export function isPaddleSandboxWebhookRuntime(vercelEnv: string | undefined): boolean {
  return vercelEnv !== "production";
}

/** A configured destination secret is required. A prefix does not prove the environment. */
export function isConfiguredWebhookSecret(secret: string): boolean {
  return secret.length > 0 && !secret.startsWith("live_");
}

/**
 * Platform events use `evt_`. Simulator deliveries use `ntfsimevt_` and may
 * include a notification id such as `ntf_` or `ntfsim_`, or omit it.
 * Longer prefixes are listed first so `ntf_` does not swallow `ntfsim_`.
 */
const PADDLE_EVENT_ID = /^(?:ntfsimevt|evt)_[a-z0-9]{26}$/;
const PADDLE_NOTIFICATION_ID = /^(?:ntfsimevt|ntfsimrun|ntflog|ntfset|ntfsim|ntf)_[a-z0-9]{26}$/;

/**
 * Verify a Paddle Billing `Paddle-Signature` header against the raw body.
 * Signed payload is `ts` + `:` + raw body. Any `h1` may match during secret rotation.
 */
export function verifyPaddleSandboxSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  if (!isConfiguredWebhookSecret(secret) || !signatureHeader) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of signatureHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    if (key === "ts" && /^\d+$/.test(value)) timestamp = value;
    if (key === "h1" && /^[a-f0-9]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  if (!timestamp || signatures.length === 0) return false;
  const ageSeconds = nowMs / 1000 - Number(timestamp);
  if (
    !Number.isFinite(ageSeconds) ||
    ageSeconds > PADDLE_SIGNATURE_MAX_SKEW_SECONDS ||
    ageSeconds < -PADDLE_SIGNATURE_MAX_SKEW_SECONDS
  ) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(timestamp + ":" + rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected);
  return signatures.some((signature) => timingSafeEqual(expectedBuf, Buffer.from(signature)));
}

export function signPaddleSandboxPayload(rawBody: string, secret: string, timestampSeconds: number): string {
  const ts = String(timestampSeconds);
  const h1 = createHmac("sha256", secret).update(ts + ":" + rawBody).digest("hex");
  return `ts=${ts};h1=${h1}`;
}

type HandlerResult = {
  status: number;
  body: Record<string, unknown>;
};

function isSupportedEventType(value: string): value is PaddleSandboxEventType {
  return (PADDLE_SANDBOX_EVENT_TYPES as readonly string[]).includes(value);
}

function paddleIdPrefix(value: unknown): string {
  if (typeof value !== "string") return "";
  const separator = value.indexOf("_");
  if (separator <= 0) return "";
  const prefix = value.slice(0, separator);
  return /^[a-z]{1,16}$/i.test(prefix) ? prefix.toLowerCase() : "";
}

/** Temporary Preview diagnostic. Names, prefixes, and types only. */
function logRejectedPaddleEvent(reason: string, value: unknown) {
  const event =
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const eventId =
    event && typeof event.event_id === "string" ? event.event_id : event && typeof event.id === "string" ? event.id : "";
  const eventType = event && typeof event.event_type === "string" ? event.event_type : "";
  console.info(
    JSON.stringify({
      source: "paddle-sandbox-webhook",
      reason,
      shape: event ? "object" : Array.isArray(value) ? "array" : value === null ? "null" : typeof value,
      keys: event ? Object.keys(event).filter((key) => /^[a-z0-9_]{1,40}$/i.test(key)).sort() : [],
      eventIdPrefix: paddleIdPrefix(eventId),
      eventType: /^[a-z0-9_.]{1,80}$/.test(eventType) ? eventType : "",
      hasNotificationId: Boolean(event && event.notification_id != null && event.notification_id !== ""),
      notificationIdPrefix: paddleIdPrefix(event?.notification_id),
    }),
  );
}

function occurredAtValue(event: Record<string, unknown>): string {
  if (typeof event.occurred_at === "string" && event.occurred_at) return event.occurred_at;
  if (typeof event.created_at === "string" && event.created_at) return event.created_at;
  return "";
}

/**
 * `notification_id` is optional. When it is present it must be a Paddle id,
 * including simulation prefixes. The event id is stored if it is omitted.
 */
function readPaddleNotificationIdentity(event: Record<string, unknown>): {
  eventId: string;
  notificationId: string;
  occurredAt: string;
} | null {
  const eventId =
    typeof event.event_id === "string" ? event.event_id : typeof event.id === "string" ? event.id : "";
  if (!PADDLE_EVENT_ID.test(eventId)) return null;
  const occurredAt = occurredAtValue(event);
  if (!occurredAt) return null;
  if (event.notification_id == null || event.notification_id === "") {
    return { eventId, notificationId: eventId, occurredAt };
  }
  if (typeof event.notification_id !== "string" || !PADDLE_NOTIFICATION_ID.test(event.notification_id)) {
    return null;
  }
  return { eventId, notificationId: event.notification_id, occurredAt };
}

function invalidEventReason(event: Record<string, unknown>): string {
  const eventId =
    typeof event.event_id === "string" ? event.event_id : typeof event.id === "string" ? event.id : "";
  if (!PADDLE_EVENT_ID.test(eventId)) return "event-id";
  if (!occurredAtValue(event)) return "missing-occurred-at";
  if (event.notification_id != null && event.notification_id !== "") return "notification-id";
  return "event-id";
}

export async function handlePaddleSandboxWebhook(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  store: PaddleNotificationStore;
  nowMs?: number;
  /** Pass VERCEL_ENV from the route. "production" is always rejected. */
  vercelEnv?: string;
}): Promise<HandlerResult> {
  // Verifies and stores a Sandbox notification. Does not activate an account
  // or attach the payment to a business.
  if (!isPaddleSandboxWebhookRuntime(input.vercelEnv)) {
    return { status: 403, body: { error: "Sandbox webhook is not available in production." } };
  }
  if (!isConfiguredWebhookSecret(input.secret)) {
    return { status: 503, body: { error: "Sandbox webhook is not configured." } };
  }
  if (!verifyPaddleSandboxSignature(input.rawBody, input.signatureHeader, input.secret, input.nowMs)) {
    return { status: 401, body: { error: "Invalid signature" } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    logRejectedPaddleEvent("not-object", parsed);
    return { status: 400, body: { error: "Invalid event" } };
  }
  const event = parsed as Record<string, unknown>;

  const eventType = typeof event.event_type === "string" ? event.event_type : "";
  if (!isSupportedEventType(eventType)) {
    return { status: 200, body: { ok: true, ignored: true } };
  }

  const identity = readPaddleNotificationIdentity(event);
  if (!identity) {
    logRejectedPaddleEvent(invalidEventReason(event), event);
    return { status: 400, body: { error: "Invalid event" } };
  }

  try {
    const outcome = await input.store.saveIfNew({
      eventId: identity.eventId,
      notificationId: identity.notificationId,
      eventType,
      occurredAt: identity.occurredAt,
      payload: "data" in event ? (event.data ?? null) : "payload" in event ? (event.payload ?? null) : null,
    });
    return {
      status: 200,
      body: { ok: true, duplicate: outcome === "duplicate", eventType },
    };
  } catch (error) {
    if (error instanceof PaddleStoreUnavailable) {
      return { status: 503, body: { error: "Notification storage is unavailable." } };
    }
    throw error;
  }
}
