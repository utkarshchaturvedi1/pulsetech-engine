import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { verifyElevenLabsSignature } from "../../../../lib/elevenlabsWebhook";
import {
  logInboundVoiceResolution,
  resolvePostCallBusiness,
} from "../../../../lib/inboundVoice";
import {
  buildPhoneLeadEmail,
  buildPhoneLeadSms,
  evaluatePhoneLeadAlert,
  extractPhoneLead,
  transcriptToText,
  type PhoneLead,
} from "../../../../lib/phoneLead";

async function sendEmail(
  lead: PhoneLead,
  alertKind: "lead" | "callback"
): Promise<"SENT" | "SKIPPED" | "FAILED"> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || "465");
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || user;
  const to = process.env.PHONE_AGENT_LEAD_EMAIL?.trim();
  if (!host || !user || !pass || !from || !to) return "SKIPPED";
  try {
    const transport = nodemailer.createTransport({
      host, port, secure: port === 465, auth: { user, pass },
    });
    const message = buildPhoneLeadEmail(lead, alertKind);
    await transport.sendMail({
      from, to,
      subject: message.subject,
      text: message.text,
    });
    return "SENT";
  } catch (error) {
    console.error("[phone-lead] Email failed", error);
    return "FAILED";
  }
}

async function sendSms(
  lead: PhoneLead,
  alertKind: "lead" | "callback"
): Promise<"SENT" | "SKIPPED" | "FAILED"> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const to = process.env.PHONE_AGENT_ALERT_PHONE?.trim();
  if (!sid || !token || !from || !to) return "SKIPPED";
  const body = new URLSearchParams({
    From: from, To: to,
    Body: buildPhoneLeadSms(lead, alertKind),
  });
  try {
    const response = await fetch(
      "https://api.twilio.com/2010-04-01/Accounts/" +
        encodeURIComponent(sid) + "/Messages.json",
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(sid + ":" + token).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );
    if (!response.ok) {
      console.error("[phone-lead] SMS failed", response.status);
      return "FAILED";
    }
    return "SENT";
  } catch (error) {
    console.error("[phone-lead] SMS failed", error);
    return "FAILED";
  }
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyElevenLabsSignature(raw, request.headers.get("elevenlabs-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let payload: { type?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (payload.type !== "post_call_transcription" || !payload.data) {
    return NextResponse.json({ ok: true });
  }
  const data = payload.data;
  const analysis = data.analysis as
    | { data_collection_results?: Record<string, unknown> }
    | undefined;
  const extracted = analysis?.data_collection_results || {};
  const resolution = await resolvePostCallBusiness(data);
  logInboundVoiceResolution(resolution);

  if (!resolution.ok) {
    return NextResponse.json({
      ok: true,
      qualified: false,
      fallback: resolution.reason,
    });
  }

  const lead = extractPhoneLead(extracted, {
    businessName: resolution.demo.profile.businessName,
    demoId: resolution.demoId,
    isTestData: Boolean(resolution.demo.profile.isTestData),
    transcriptText: transcriptToText(data.transcript),
  });
  const alert = evaluatePhoneLeadAlert(lead);
  if (!alert.qualified || alert.alertKind === "none") {
    return NextResponse.json({ ok: true, qualified: false });
  }
  const [email, sms] = await Promise.all([
    sendEmail(lead, alert.alertKind),
    sendSms(lead, alert.alertKind),
  ]);
  return NextResponse.json({
    ok: true,
    qualified: true,
    alertKind: alert.alertKind,
    email,
    sms,
  });
}
