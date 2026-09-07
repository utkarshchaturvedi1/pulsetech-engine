import { createHmac, timingSafeEqual } from "crypto";

/**
 * ElevenLabs post-call HMAC verification.
 * Header: t=<unix>&v0=<hex> or t=<unix>,v0=<hex>
 * Signed payload: timestamp + "." + rawBody
 * Max age: 1800 seconds
 */
export function verifyElevenLabsSignature(
  raw: string,
  signature: string | null
): boolean {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET?.trim();
  const stamp = signature?.match(/t=(\d+)/)?.[1];
  const supplied = signature?.match(/v0=([a-f0-9]+)/i)?.[1];
  if (!secret || !stamp || !supplied) return false;
  const age = Math.abs(Date.now() / 1000 - Number(stamp));
  if (!Number.isFinite(age) || age > 1800) return false;
  const expected = createHmac("sha256", secret).update(stamp + "." + raw).digest("hex");
  return supplied.length === expected.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function secretsEqual(left: string, right: string): boolean {
  const key = "pulsetech-initiation-compare";
  const a = createHmac("sha256", key).update(left).digest();
  const b = createHmac("sha256", key).update(right).digest();
  return timingSafeEqual(a, b);
}

/**
 * Conversation-initiation auth.
 * Prefer HMAC when ElevenLabs-Signature is present (same secret as post-call).
 * Otherwise accept the configured initiation header secret.
 */
export function authorizeConversationInitiation(
  raw: string,
  headers: Headers
): boolean {
  const signature =
    headers.get("elevenlabs-signature") || headers.get("ElevenLabs-Signature");
  if (signature) {
    return verifyElevenLabsSignature(raw, signature);
  }

  const initiationSecret = process.env.ELEVENLABS_INITIATION_WEBHOOK_SECRET?.trim();
  if (initiationSecret) {
    const provided =
      headers.get("x-elevenlabs-webhook-secret")?.trim() ||
      headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
      "";
    return Boolean(provided) && secretsEqual(provided, initiationSecret);
  }

  if (process.env.ELEVENLABS_WEBHOOK_SECRET?.trim()) {
    return verifyElevenLabsSignature(raw, signature);
  }

  return false;
}
