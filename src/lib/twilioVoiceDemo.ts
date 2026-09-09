import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify Twilio request signatures (X-Twilio-Signature).
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function verifyTwilioSignature(params: {
  authToken: string;
  signature: string | null;
  url: string;
  form: Record<string, string>;
}): boolean {
  const token = params.authToken.trim();
  const signature = params.signature?.trim();
  if (!token || !signature) return false;

  const keys = Object.keys(params.form).sort();
  let data = params.url;
  for (const key of keys) {
    data += key + (params.form[key] ?? "");
  }

  const expected = createHmac("sha1", token).update(data, "utf8").digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function twilioFormFromSearchParams(
  params: URLSearchParams
): Record<string, string> {
  const form: Record<string, string> = {};
  params.forEach((value, key) => {
    form[key] = value;
  });
  return form;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function twimlResponse(bodyInner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${bodyInner}</Response>`;
}

/** Neutral Gather greeting — must not identify any business. */
export function buildVoiceDemoGatherTwiml(actionUrl: string): string {
  const action = escapeXml(actionUrl);
  return twimlResponse(
    `<Gather input="dtmf" timeout="12" numDigits="6" action="${action}" method="POST">` +
      `<Say voice="Polly.Joanna">Thanks for calling the PulseTech voice demo line. ` +
      `Please enter your six digit access code from the demo page, followed by the pound key if needed.</Say>` +
      `</Gather>` +
      `<Say voice="Polly.Joanna">We did not receive a code. Please return to your demo page for a new access code, then call again. Goodbye.</Say>` +
      `<Hangup/>`
  );
}

export function buildVoiceDemoInvalidCodeTwiml(): string {
  return twimlResponse(
    `<Say voice="Polly.Joanna">That access code is invalid or has expired. ` +
      `Please return to your demo page to get a new code, then call again. Goodbye.</Say>` +
      `<Hangup/>`
  );
}

export function buildVoiceDemoRateLimitedTwiml(): string {
  return twimlResponse(
    `<Say voice="Polly.Joanna">Too many invalid attempts. Please return to your demo page and try again later. Goodbye.</Say>` +
      `<Hangup/>`
  );
}

export function buildVoiceDemoUnavailableTwiml(): string {
  return twimlResponse(
    `<Say voice="Polly.Joanna">The voice demo line is not available right now. Please try again later. Goodbye.</Say>` +
      `<Hangup/>`
  );
}
