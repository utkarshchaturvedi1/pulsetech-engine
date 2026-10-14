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
 * Platform notifications use `evt_` plus 26 characters and a separate `ntf_` id.
 * The webhook simulator wraps the same event differently: `event_id` is
 * `ntfsimevt_` plus 26 characters, and `notification_id` is omitted.
 */
const PADDLE_PLATFORM_EVENT_ID = /^evt_[a-z0-9]{26}$/;
const PADDLE_SIMULATION_EVENT_ID = /^ntfsimevt_[a-z0-9]{26}$/;
const PADDLE_NOTIFICATION_ID = /^ntf_[a-z0-9]{26}$/;

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

/**
 * Simulation requests have no `notification_id`. The `ntfsimevt_` value is the
 * delivery id, so it is stored in that column. A present `notification_id`
 * must still be a platform `ntf_` id.
 */
function readPaddleNotificationIdentity(event: Record<string, unknown>): {
  eventId: string;
  notificationId: string;
} | null {
  const eventId = typeof event.event_id === "string" ? event.event_id : "";
  if (PADDLE_PLATFORM_EVENT_ID.test(eventId)) {
    const notificationId = typeof event.notification_id === "string" ? event.notification_id : "";
    if (!PADDLE_NOTIFICATION_ID.test(notificationId)) return null;
    return { eventId, notificationId };
  }
  if (PADDLE_SIMULATION_EVENT_ID.test(eventId)) {
    if (event.notification_id == null) {
      return { eventId, notificationId: eventId };
    }
    const notificationId = typeof event.notification_id === "string" ? event.notification_id : "";
    if (!PADDLE_NOTIFICATION_ID.test(notificationId)) return null;
    return { eventId, notificationId };
  }
  return null;
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
    return { status: 400, body: { error: "Invalid event" } };
  }
  const event = parsed as Record<string, unknown>;

  const eventType = typeof event.event_type === "string" ? event.event_type : "";
  if (!isSupportedEventType(eventType)) {
    return { status: 200, body: { ok: true, ignored: true } };
  }

  const occurredAt = typeof event.occurred_at === "string" ? event.occurred_at : "";
  const identity = occurredAt ? readPaddleNotificationIdentity(event) : null;
  if (!identity) {
    return { status: 400, body: { error: "Invalid event" } };
  }

  try {
    const outcome = await input.store.saveIfNew({
      eventId: identity.eventId,
      notificationId: identity.notificationId,
      eventType,
      occurredAt,
      payload: event.data ?? null,
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
