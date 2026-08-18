import nodemailer from "nodemailer";
import { BusinessProfile } from "../types/business";
import { SalesState } from "./salesState";
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
    parts.push(`Preferred timing: ${state.preferredTiming}.`);
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
  const subject = `🔥 New PulseTech Website Lead - ${businessName}`;

  const sections: string[] = [
    "🔥 NEW WEBSITE LEAD",
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
    sections.push("", "PREFERRED TIMING", state.preferredTiming);
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
};

function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "465");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;
  const to = process.env.LEAD_NOTIFICATION_EMAIL?.trim();

  return { host, port, user, pass, from, to };
}

export function isLeadEmailConfigured(): boolean {
  const { host, user, pass, from, to } = getSmtpConfig();
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

  // Automated tests / explicit dry-run: never touch real SMTP.
  if (isLeadHandoffDryRun()) {
    console.log(
      "[leadHandoff] DRY RUN — SMTP not called; simulating SENT",
      {
        conversationId: state.conversationId || "(none)",
        businessKey: state.businessKey || "(none)",
        businessName: business.businessName,
        reason,
        subject,
      }
    );
    return { attempted: true, status: "SENT" };
  }

  if (state.leadDeliveryStatus === "FAILED" && !isLeadEmailConfigured()) {
    return { attempted: false, status: "FAILED" };
  }

  const { host, port, user, pass, from, to } = getSmtpConfig();

  if (!host || !user || !pass || !from || !to) {
    console.error(
      "[leadHandoff] Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, and LEAD_NOTIFICATION_EMAIL."
    );
    return {
      attempted: true,
      status: "FAILED",
      error: "SMTP/recipient not configured",
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

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
    });

    return { attempted: true, status: "SENT" };
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
