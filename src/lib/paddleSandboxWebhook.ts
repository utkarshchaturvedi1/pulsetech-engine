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

/** A live client token must never be used as this Sandbox destination secret. */
export function isSandboxWebhookSecret(secret: string): boolean {
  return secret.length > 0 && !secret.startsWith("live_");
}

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
  if (!isSandboxWebhookSecret(secret) || !signatureHeader) return false;
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

export async function handlePaddleSandboxWebhook(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  store: PaddleNotificationStore;
  nowMs?: number;
}): Promise<HandlerResult> {
  if (!isSandboxWebhookSecret(input.secret)) {
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
  if (event.environment === "production" || event.environment === "live") {
    return { status: 400, body: { error: "Live Paddle events are not accepted." } };
  }

  const eventType = typeof event.event_type === "string" ? event.event_type : "";
  if (!isSupportedEventType(eventType)) {
    return { status: 200, body: { ok: true, ignored: true } };
  }

  const eventId = typeof event.event_id === "string" ? event.event_id : "";
  const notificationId = typeof event.notification_id === "string" ? event.notification_id : "";
  const occurredAt = typeof event.occurred_at === "string" ? event.occurred_at : "";
  if (!/^evt_[A-Za-z0-9]+$/.test(eventId) || !/^ntf_[A-Za-z0-9]+$/.test(notificationId) || !occurredAt) {
    return { status: 400, body: { error: "Invalid event" } };
  }

  try {
    const outcome = await input.store.saveIfNew({
      eventId,
      notificationId,
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
