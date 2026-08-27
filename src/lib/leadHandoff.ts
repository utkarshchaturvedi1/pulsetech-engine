import nodemailer from "nodemailer";
import { BusinessProfile } from "../types/business";
import { SalesState } from "./salesState";
import { isReasonableEmail, normalizeNotificationEmail } from "./leadNotificationConfig";
import {
  isClosureHandoffTrigger,
  isLeadQualified,
  isLeadReadyForHandoff,
  LEAD_INACTIVITY_MS,
  shouldAttemptLeadHandoff,
  type LeadHandoffReason,
} from "./leadHandoffShared";

export {
  isClosureHandoffTrigger,
  isLeadQualified,
  isLeadReadyForHandoff,
  LEAD_INACTIVITY_MS,
  shouldAttemptLeadHandoff,
};
export type { LeadHandoffReason };

function formatUrgency(state: SalesState): string {
  if (state.urgency === "IMMEDIATE") return "ASAP / urgent attention requested";
  if (state.urgency === "SOON") return "Requested soon";
  return "";
}

function formatCustomerStatus(state: SalesState): string {
  if (state.customerAgreed) {
    return "Ready for follow-up";
  }
  if (state.handoffReady) {
    return "Ready for follow-up";
  }
  if (state.appointmentIntent === true) {
    return "Follow-up requested";
  }
  return "Qualified lead";
}

function buildCustomerWants(state: SalesState): string[] {
  const notes = state.customerContext?.map((context) => `• ${context}`) || [];
  if (state.contactPreference) {
    notes.push(`• Prefers ${state.contactPreference}`);
  }
  for (const objection of state.objections) {
    notes.push(`• ${objection}`);
  }
  const urgency = formatUrgency(state);
  if (urgency) notes.push(`• ${urgency}`);
  return notes;
}

function buildPricingSalesNotes(state: SalesState): string | null {
  const lines: string[] = [];
  if (state.objections.length) {
    state.objections.forEach((objection) => lines.push(`• ${objection}`));
  }
  return lines.length ? lines.join("\n") : null;
}

function buildNextStep(state: SalesState): string {
  if (state.preferredTiming) {
    return "Contact the customer to confirm availability for the requested time.";
  }
  return "Contact the customer to discuss the request and next step.";
}

function buildConversationSummary(state: SalesState): string {
  const name = state.lead.name || "The customer";
  const need = state.customerNeed || "a service need";
  const parts: string[] = [];

  parts.push(`${name} requested help with ${need}.`);

  if (state.customerContext.length) {
    parts.push(state.customerContext.slice(0, 4).join(" "));
  }

  const urgency = formatUrgency(state);
  if (urgency) {
    parts.push(`Timing priority: ${urgency}.`);
  }

  if (state.preferredTiming) {
    parts.push(`Preferred timing: ${state.preferredTiming}.`);
  }

  if (state.contactPreference) {
    parts.push(`Contact preference: ${state.contactPreference}.`);
  }

  if (state.customerAgreed) {
    parts.push("They agreed to move forward.");
  }

  return parts.slice(0, 4).join(" ");
}

export function buildLeadNotificationEmail(
  business: BusinessProfile,
  state: SalesState
): { subject: string; text: string } {
  const businessName = business.businessName || "Business";
  const subject = `🔥 New PulseTech Website Lead - ${businessName}`;

  const sections: string[] = ["🔥 NEW WEBSITE LEAD"];

  if (business.businessName) {
    sections.push("", "BUSINESS", business.businessName);
  }

  sections.push("", "CUSTOMER", state.lead.name || "Not provided");
  if (state.lead.phone) sections.push(`Phone: ${state.lead.phone}`);
  if (state.lead.email) sections.push(`Email: ${state.lead.email}`);
  if (state.lead.address) sections.push(`Address: ${state.lead.address}`);

  sections.push("", "SERVICE NEEDED", state.customerNeed || "Not established");

  const customerWants = buildCustomerWants(state);
  if (customerWants.length) {
    sections.push("", "CUSTOMER WANTS / CONCERNS", ...customerWants);
  }

  if (state.preferredTiming) {
    sections.push("", "PREFERRED TIMING", state.preferredTiming);
  }

  const pricingSalesNotes = buildPricingSalesNotes(state);
  if (pricingSalesNotes) {
    sections.push("", "PRICING / SALES NOTES", pricingSalesNotes);
  }

  sections.push("", "STATUS", formatCustomerStatus(state));
  sections.push("", "NEXT STEP", buildNextStep(state));
  sections.push("", "CONVERSATION SUMMARY", buildConversationSummary(state));
  sections.push("", "Captured by PulseTech AI Sales Employee");

  return { subject, text: sections.join("\n").trim() };
}

export type LeadHandoffResult = {
  attempted: boolean;
  status: "NOT_SENT" | "SENT" | "FAILED";
  error?: string;
  smtpAcceptedCount?: number;
  smtpMessageId?: string;
  smtpResponse?: string;
};

export type LeadRecipientResolution = {
  recipient?: string;
  source: "business" | "development-fallback" | "missing";
};

/**
 * Production never falls back to PulseTech's development recipient. That
 * avoids silently cross-delivering a client's customer data.
 */
export function resolveLeadNotificationRecipient(
  business: BusinessProfile,
  environment = process.env.NODE_ENV
): LeadRecipientResolution {
  if (isReasonableEmail(business.leadNotificationEmail)) {
    return { recipient: normalizeNotificationEmail(business.leadNotificationEmail), source: "business" };
  }
  if (environment !== "production") {
    const fallback = process.env.LEAD_NOTIFICATION_EMAIL?.trim();
    if (isReasonableEmail(fallback)) {
      return { recipient: normalizeNotificationEmail(fallback), source: "development-fallback" };
    }
  }
  return { source: "missing" };
}

function getSmtpConfig(business: BusinessProfile) {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "465");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;
  const recipient = resolveLeadNotificationRecipient(business);
  const to = recipient.recipient;

  return { host, port, user, pass, from, to, recipient };
}

export function isLeadEmailConfigured(business: BusinessProfile): boolean {
  const { host, user, pass, from, to } = getSmtpConfig(business);
  return Boolean(host && user && pass && from && to);
}

/** When true, handoff skips SMTP and simulates SENT (for automated tests). */
export function isLeadHandoffDryRun(): boolean {
  const value = process.env.LEAD_HANDOFF_DRY_RUN?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
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

  const { subject, text } = buildLeadNotificationEmail(business, state);
  const recipientResolution = resolveLeadNotificationRecipient(business);
  const smtpReady = Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim() &&
      (process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim())
  );

  // Automated tests / explicit dry-run: never touch real SMTP.
  if (isLeadHandoffDryRun()) {
    console.log(
      "[leadHandoff] DRY RUN — SMTP not called; simulating SENT",
      {
        conversationId: state.conversationId || "(none)",
        businessKey: state.businessKey || "(none)",
        businessName: business.businessName,
        reason,
        recipientSource: recipientResolution.source,
        recipientConfigured: Boolean(recipientResolution.recipient),
        smtpConfigured: smtpReady,
        subject,
      }
    );
    return { attempted: true, status: "SENT" };
  }

  if (state.leadDeliveryStatus === "FAILED" && !isLeadEmailConfigured(business)) {
    return { attempted: false, status: "FAILED" };
  }

  const { host, port, user, pass, from, to, recipient } = getSmtpConfig(business);

  if (!host || !user || !pass || !from || !to) {
    console.error(
      `[leadHandoff] Lead notification recipient is not configured for ${business.businessName || "this business"}. Configure leadNotificationEmail before production handoff.`
    );
    return {
      attempted: true,
      status: "FAILED",
      error: recipient.source === "missing" ? "Lead notification recipient not configured" : "SMTP not configured",
    };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text,
    });

    const acceptedCount = Array.isArray(info.accepted) ? info.accepted.length : 0;
    console.log("[leadHandoff] SENT", {
      conversationId: state.conversationId || "(none)",
      businessKey: state.businessKey || "(none)",
      businessName: business.businessName,
      reason,
      recipientSource: recipient.source,
      recipientConfigured: true,
      smtpConfigured: true,
      smtpAcceptedCount: acceptedCount,
      smtpResponse: typeof info.response === "string" ? info.response : undefined,
      smtpMessageId: info.messageId,
    });

    return {
      attempted: true,
      status: "SENT",
      smtpAcceptedCount: acceptedCount,
      smtpMessageId: info.messageId,
      smtpResponse: typeof info.response === "string" ? info.response : undefined,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown email delivery error";
    console.error("[leadHandoff] Failed to send lead email:", message);
    return {
      attempted: true,
      status: "FAILED",
      error: message,
    };
  }
}
