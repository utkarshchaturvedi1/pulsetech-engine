import nodemailer from "nodemailer";
import { BusinessProfile } from "../types/business";
import { SalesState } from "./salesState";
import {
  resolveWebsiteChatLeadAlert,
} from "./leadAlertRecipients";
import {
  isClosureHandoffTrigger,
  isLeadQualified,
  isLeadReadyForHandoff,
  isVisitFollowupAlertTrigger,
  isWebsiteLeadCaptureComplete,
  LEAD_INACTIVITY_MS,
  shouldAttemptLeadHandoff,
  type LeadHandoffReason,
} from "./leadHandoffShared";

export {
  isClosureHandoffTrigger,
  isLeadQualified,
  isLeadReadyForHandoff,
  isVisitFollowupAlertTrigger,
  isWebsiteLeadCaptureComplete,
  LEAD_INACTIVITY_MS,
  shouldAttemptLeadHandoff,
};
export type { LeadHandoffReason };

function formatUrgency(state: SalesState): string {
  if (state.urgency === "IMMEDIATE") return "IMMEDIATE";
  if (state.urgency === "SOON") return "NORMAL / soon";
  return "Not specified";
}

function formatCustomerStatus(state: SalesState): string {
  if (state.customerAgreed) {
    return "Customer agreed to proceed";
  }
  if (state.handoffReady) {
    return "Customer completed the conversation and is ready for business follow-up";
  }
  if (state.appointmentIntent === true) {
    return "Interested / wants contact or visit";
  }
  if (state.intent === "READY_TO_ACT" || state.intent === "HIGH") {
    return "Interested";
  }
  return "No explicit closure";
}

function buildCustomerContextSection(state: SalesState): string | null {
  if (!state.customerContext?.length) return null;
  return state.customerContext.map((c) => `- ${c}`).join("\n");
}

function buildSalesContext(state: SalesState): string | null {
  const lines: string[] = [];
  if (state.objections.length) {
    state.objections.forEach((o) => lines.push(`- ${o}`));
  }
  if (state.customerAgreed) {
    lines.push("- Customer clearly agreed to proceed");
  }
  if (state.appointmentIntent === true) {
    lines.push("- Customer indicated interest in a visit / appointment");
  }
  if (!lines.length) return null;
  return lines.join("\n");
}

function buildNextStep(state: SalesState): string {
  if (state.urgency === "IMMEDIATE") {
    return "URGENT: Contact this customer as soon as possible to confirm the earliest available time. Do not send automatic customer SMS.";
  }
  if (state.preferredTiming) {
    return "Contact the customer to confirm availability for their preferred time. The requested time has not been confirmed or booked with the customer.";
  }
  if (state.customerAgreed) {
    return "Customer agreed to proceed. Follow up using the captured contact details to confirm timing.";
  }
  if (state.handoffReady) {
    return "Lead is ready for follow-up based on the captured request and conversation.";
  }
  return "Follow up with the customer using the captured contact details.";
}

function buildConversationSummary(state: SalesState): string {
  const name = state.lead.name || "The customer";
  const need = state.customerNeed || "a service need";
  const parts: string[] = [];

  parts.push(`${name} is interested in: ${need}.`);

  if (state.customerContext.length) {
    parts.push(state.customerContext.slice(0, 4).join(" "));
  }

  if (state.urgency === "IMMEDIATE") {
    parts.push("They indicated urgency / need service today or ASAP.");
  } else if (state.urgency === "SOON") {
    parts.push("They indicated they want help soon.");
  }

  if (state.preferredTiming) {
    parts.push(`Preferred visit time: ${state.preferredTiming}.`);
  }

  if (state.contactPreference) {
    parts.push(`Contact preference: ${state.contactPreference}.`);
  }

  if (state.customerAvailable === true) {
    parts.push("They indicated someone is / will be home.");
  }

  if (state.customerAgreed) {
    parts.push("They clearly agreed to move forward.");
  } else if (state.handoffReady) {
    parts.push(
      "They completed the conversation and the lead is ready for business follow-up."
    );
  }

  if (state.objections.length) {
    parts.push(`Sales context: ${state.objections.join("; ")}.`);
  }

  return parts.join(" ");
}

export function buildLeadNotificationEmail(
  business: BusinessProfile,
  state: SalesState
): { subject: string; text: string } {
  const businessName = business.businessName || "Business";
  const urgent = state.urgency === "IMMEDIATE";
  const subject = urgent
    ? `URGENT PulseTech Website Lead - ${businessName}`
    : `🔥 New PulseTech Website Lead - ${businessName}`;

  const sections: string[] = [
    urgent ? "URGENT WEBSITE LEAD" : "🔥 NEW WEBSITE LEAD",
    "",
    "BUSINESS:",
    businessName,
    "",
    "CUSTOMER",
    `Name: ${state.lead.name || "Not provided"}`,
    `Phone: ${state.lead.phone || "Not provided"}`,
    `Email: ${state.lead.email || "Not provided"}`,
    `Address: ${state.lead.address || "Not provided"}`,
    "",
    "PRIMARY CUSTOMER NEED",
    state.customerNeed || "Not established",
  ];

  sections.push("", "URGENCY", formatUrgency(state));

  if (state.preferredTiming) {
    sections.push("", "PREFERRED VISIT TIME", state.preferredTiming);
  }

  if (state.contactPreference) {
    sections.push("", "CONTACT PREFERENCE", state.contactPreference);
  }

  const context = buildCustomerContextSection(state);
  if (context) {
    sections.push("", "CUSTOMER CONTEXT", context);
  }

  const salesContext = buildSalesContext(state);
  if (salesContext) {
    sections.push("", "SALES CONTEXT", salesContext);
  }

  sections.push("", "CUSTOMER STATUS", formatCustomerStatus(state));
  sections.push("", "NEXT STEP", buildNextStep(state));
  sections.push("", "CONVERSATION SUMMARY", buildConversationSummary(state));
  sections.push("", "Captured by PulseTech AI Sales Employee");

  return { subject, text: sections.join("\n").trim() };
}

export type LeadHandoffResult = {
  attempted: boolean;
  status: "NOT_SENT" | "SENT" | "FAILED";
  error?: string;
  emailTo?: string;
  smsTo?: string;
  /** Await inside Next.js `after()` — never fire-and-forget. */
  delivery?: () => Promise<void>;
};

/** Next.js/Vercel `after()`-compatible scheduler. */
export type LeadAlertAfter = (task: () => void | Promise<void>) => void;

/**
 * Schedules email/SMS work on a Vercel-safe background lifecycle.
 * The HTTP response must be returned without awaiting the task.
 */
export function scheduleLeadAlertDelivery(
  afterFn: LeadAlertAfter,
  delivery?: () => Promise<void>
): void {
  if (!delivery) return;
  afterFn(async () => {
    try {
      await delivery();
    } catch (error) {
      console.error("[leadHandoff] background delivery failed", error);
    }
  });
}

function getSmtpTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "465");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;

  return { host, port, user, pass, from };
}

function getTwilioSmsTransport() {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  return { sid, token, from };
}

export function isLeadEmailConfigured(): boolean {
  return isSmtpLeadAlertConfigured() && isSmsLeadAlertConfigured();
}

export function buildWebsiteLeadSms(
  business: BusinessProfile,
  state: SalesState
): string {
  const businessName = business.businessName || "Business";
  const urgent = state.urgency === "IMMEDIATE";
  const prefix = urgent ? "URGENT website lead for " : "New website lead for ";
  return [
    prefix + businessName,
    (state.lead.name || "Unknown") + " | " + (state.lead.phone || "no phone"),
    state.customerNeed || "",
    state.lead.address || "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1500);
}

async function sendWebsiteLeadEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { host, port, user, pass, from } = getSmtpTransport();
  if (!host || !user || !pass || !from) {
    return { ok: false, error: "SMTP transport is not configured." };
  }
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
    });
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown email delivery error";
    return { ok: false, error: message };
  }
}

async function sendWebsiteLeadSms(params: {
  to: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { sid, token, from } = getTwilioSmsTransport();
  if (!sid || !token || !from) {
    return { ok: false, error: "SMS transport is not configured." };
  }
  try {
    const response = await fetch(
      "https://api.twilio.com/2010-04-01/Accounts/" +
        encodeURIComponent(sid) +
        "/Messages.json",
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(sid + ":" + token).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: from,
          To: params.to,
          Body: params.body,
        }),
      }
    );
    if (!response.ok) {
      return { ok: false, error: "SMS delivery failed (" + response.status + ")" };
    }
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown SMS delivery error";
    return { ok: false, error: message };
  }
}

/** When true, handoff skips SMTP and simulates SENT (for automated tests). */
export function isLeadHandoffDryRun(): boolean {
  const value = process.env.LEAD_HANDOFF_DRY_RUN?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export type LeadHandoffTestDelivery = (input: {
  emailTo: string;
  smsTo: string;
  subject: string;
  text: string;
  smsBody: string;
}) => Promise<{ emailOk: boolean; smsOk: boolean; error?: string }>;

let leadHandoffTestDelivery: LeadHandoffTestDelivery | null = null;

/** Test-only: intercept real SMTP/SMS. Pass null to restore. */
export function setLeadHandoffTestDelivery(
  delivery: LeadHandoffTestDelivery | null
): void {
  leadHandoffTestDelivery = delivery;
}

export function isSmtpLeadAlertConfigured(): boolean {
  const { host, user, pass, from } = getSmtpTransport();
  return Boolean(host && user && pass && from);
}

export function isSmsLeadAlertConfigured(): boolean {
  const { sid, token, from } = getTwilioSmsTransport();
  return Boolean(sid && token && from);
}

export function describeLeadAlertTransport(): {
  smtpConfigured: boolean;
  smsConfigured: boolean;
} {
  return {
    smtpConfigured: isSmtpLeadAlertConfigured(),
    smsConfigured: isSmsLeadAlertConfigured(),
  };
}

export function applyLeadDeliveryResult(
  state: SalesState,
  result: LeadHandoffResult
): SalesState {
  if (!result.attempted) {
    return state;
  }

  const facts = state.establishedFacts.filter(
    (f) => !f.startsWith("leadDelivery=")
  );

  return {
    ...state,
    leadDeliveryStatus: result.status,
    establishedFacts: [...facts, `leadDelivery=${result.status}`],
  };
}

/**
 * Sends a qualified lead email once, only when the timing reason allows it.
 */
export async function maybeSendLeadHandoff(
  business: BusinessProfile,
  state: SalesState,
  reason: LeadHandoffReason,
  latestUserMessage?: string
): Promise<LeadHandoffResult> {
  if (state.leadDeliveryStatus === "SENT") {
    return { attempted: false, status: "SENT" };
  }

  if (!shouldAttemptLeadHandoff(state, reason, latestUserMessage)) {
    return { attempted: false, status: state.leadDeliveryStatus || "NOT_SENT" };
  }

  const recipients = resolveWebsiteChatLeadAlert(business);
  if (!recipients.ok) {
    console.error("[leadHandoff] " + recipients.error);
    return {
      attempted: true,
      status: "FAILED",
      error: recipients.error,
    };
  }

  const { subject, text } = buildLeadNotificationEmail(business, state);
  const smsBody = buildWebsiteLeadSms(business, state);

  // Automated tests / explicit dry-run: never touch real SMTP/SMS.
  if (isLeadHandoffDryRun()) {
    console.log(
      "[leadHandoff] DRY RUN — SMTP/SMS not called; simulating SENT",
      {
        conversationId: state.conversationId || "(none)",
        businessKey: state.businessKey || "(none)",
        businessName: business.businessName,
        reason,
        subject,
        emailTo: recipients.email,
        smsTo: recipients.sms,
      }
    );
    return {
      attempted: true,
      status: "SENT",
      emailTo: recipients.email,
      smsTo: recipients.sms,
    };
  }

  const smtpConfigured = isSmtpLeadAlertConfigured();
  const smsConfigured = isSmsLeadAlertConfigured();
  const transport = { smtpConfigured, smsConfigured };

  if (state.leadDeliveryStatus === "FAILED" && !smtpConfigured && !smsConfigured && !leadHandoffTestDelivery) {
    return { attempted: false, status: "FAILED", error: "Alert transport not configured" };
  }

  if (!leadHandoffTestDelivery && !smtpConfigured && !smsConfigured) {
    console.error(
      "[leadHandoff] Alert transport is not configured. Set SMTP_* for email and TWILIO_* for SMS."
    );
    return {
      attempted: true,
      status: "FAILED",
      error: "Alert transport is not configured",
      emailTo: recipients.email,
      smsTo: recipients.sms,
    };
  }

  const delivery = async () => {
    const started = Date.now();
    if (leadHandoffTestDelivery) {
      const result = await leadHandoffTestDelivery({
        emailTo: recipients.email,
        smsTo: recipients.sms,
        subject,
        text,
        smsBody,
      });
      console.log("[leadHandoff] background delivery finished", {
        conversationId: state.conversationId || "(none)",
        elapsedMs: Date.now() - started,
        emailOk: result.emailOk,
        smsOk: result.smsOk,
        ...transport,
      });
      if (result.error) {
        console.error("[leadHandoff] background delivery error:", result.error);
      }
      return;
    }

    const emailStarted = Date.now();
    const emailResult = smtpConfigured
      ? await sendWebsiteLeadEmail({ to: recipients.email, subject, text })
      : { ok: true, skipped: true as const };
    const emailMs = Date.now() - emailStarted;

    const smsStarted = Date.now();
    const smsResult = smsConfigured
      ? await sendWebsiteLeadSms({ to: recipients.sms, body: smsBody })
      : { ok: true, skipped: true as const };
    const smsMs = Date.now() - smsStarted;

    const emailOk = "skipped" in emailResult ? true : emailResult.ok;
    const smsOk = "skipped" in smsResult ? true : smsResult.ok;
    const emailError =
      smtpConfigured && !emailResult.ok && "error" in emailResult
        ? emailResult.error
        : null;
    const smsError =
      smsConfigured && !smsResult.ok && "error" in smsResult
        ? smsResult.error
        : null;
    const message = [emailError, smsError].filter(Boolean).join("; ");

    console.log("[leadHandoff] background delivery timing", {
      conversationId: state.conversationId || "(none)",
      businessName: business.businessName,
      reason,
      elapsedMs: Date.now() - started,
      emailMs,
      smsMs,
      smtpConfigured,
      smsConfigured,
      emailOk,
      smsOk,
      emailSkipped: !smtpConfigured,
      smsSkipped: !smsConfigured,
    });

    if (!emailOk || !smsOk) {
      console.error("[leadHandoff] Failed to send website lead alert:", message);
    }
  };

  return {
    attempted: true,
    status: "SENT",
    emailTo: recipients.email,
    smsTo: recipients.sms,
    delivery,
  };
}
