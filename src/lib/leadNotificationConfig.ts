const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const EMAIL_FIND_RE = /[^\s,;:<>()"']+@[^\s,;:<>()"']+/g;

export function isReasonableEmail(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length <= 254 && EMAIL_RE.test(value.trim());
}

export function normalizeNotificationEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function extractEmailCandidate(text: string): string | undefined {
  const matches = text.match(EMAIL_FIND_RE) || [];
  for (const raw of matches) {
    const candidate = raw.replace(/[.,!?]+$/g, "");
    if (isReasonableEmail(candidate)) {
      return normalizeNotificationEmail(candidate);
    }
  }
  return undefined;
}

function hasNotificationEmailIntent(text: string): boolean {
  return (
    /\b(lead|new lead|notification)s?\b[\s\S]{0,48}\b(email|inbox|send|recipient)\b/i.test(text) ||
    /\bsend[\s\S]{0,48}\b(lead|notification)s?\b/i.test(text) ||
    /\b(change|update|use|set)\b[\s\S]{0,48}@/i.test(text) ||
    /\b(send them to|send it to|send to)\b/i.test(text)
  );
}

export function parseLeadNotificationEmailUpdate(
  text: string,
  options?: { awaitingCapture?: boolean }
): {
  requested: boolean;
  email?: string;
} {
  const email = extractEmailCandidate(text);
  const awaitingCapture = Boolean(options?.awaitingCapture);
  const requested = awaitingCapture || hasNotificationEmailIntent(text);
  return {
    requested,
    email,
  };
}

export type LeadNotificationCaptureResult =
  | { kind: "saved"; email: string; reply: string }
  | { kind: "ask"; reply: string }
  | { kind: "passthrough" };

/** "Email address" must render bold in chat (via ** markers in ChatMessage). */
export const LEAD_NOTIFICATION_EMAIL_QUESTION =
  "What **Email address** should we use to send you new lead notifications?";

export const LEAD_NOTIFICATION_EMAIL_SETUP_INTRO =
  "Before you start customer testing, we need one important detail.";

export function leadNotificationEmailPrompt(): string {
  return `${LEAD_NOTIFICATION_EMAIL_SETUP_INTRO}\n\n${LEAD_NOTIFICATION_EMAIL_QUESTION}`;
}

export function leadNotificationEmailConfirmation(email: string): string {
  return `Perfect. New lead notifications will be sent to ${email}. You can change this anytime.`;
}

export function leadNotificationEmailReadyInvite(email: string): string {
  return `${leadNotificationEmailConfirmation(email)}

Your AI Sales Employee is ready.

I've analyzed your website and built it around your business, your services, and the customers you serve.

Now put it to work. Test it like a real customer, challenge it, and see how it handles the conversation. Find something missing? Tell me. I'll fix it instantly.`;
}

export function leadNotificationEmailExistingInvite(email: string): string {
  return `New lead notifications will be sent to ${email}. You can change this anytime.

Your AI Sales Employee is ready.

I've analyzed your website and built it around your business, your services, and the customers you serve.

Now put it to work. Test it like a real customer, challenge it, and see how it handles the conversation. Find something missing? Tell me. I'll fix it instantly.`;
}

export function invalidLeadNotificationEmailReply(): string {
  return `Please enter a valid email address. ${LEAD_NOTIFICATION_EMAIL_QUESTION}`;
}

/**
 * Owner-side capture for the internal lead recipient.
 * When the address is not yet saved, any valid email in natural language is enough.
 * After it is saved, only an explicit change/set instruction updates it.
 */
export function handleLeadNotificationOwnerText(
  currentEmail: string | undefined,
  text: string
): LeadNotificationCaptureResult {
  const awaitingCapture = !isReasonableEmail(currentEmail);
  const parsed = parseLeadNotificationEmailUpdate(text, { awaitingCapture });

  if (awaitingCapture) {
    if (parsed.email) {
      return {
        kind: "saved",
        email: parsed.email,
        reply: leadNotificationEmailConfirmation(parsed.email),
      };
    }
    return { kind: "ask", reply: invalidLeadNotificationEmailReply() };
  }

  if (!parsed.requested) {
    return { kind: "passthrough" };
  }

  if (!parsed.email) {
    return { kind: "ask", reply: invalidLeadNotificationEmailReply() };
  }

  return {
    kind: "saved",
    email: parsed.email,
    reply: leadNotificationEmailConfirmation(parsed.email),
  };
}
