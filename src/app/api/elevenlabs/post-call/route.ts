import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

function verify(raw: string, signature: string | null): boolean {
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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function field(source: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = source[name];
    const found = clean(value) || clean((value as { value?: unknown })?.value);
    if (found) return found;
  }
  return "";
}

type Lead = {
  business: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  need: string;
};

async function sendEmail(lead: Lead): Promise<"SENT" | "SKIPPED" | "FAILED"> {
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
    await transport.sendMail({
      from, to,
      subject: "New PulseTech Phone Lead - " + lead.business,
      text: [
        "NEW PHONE LEAD", "",
        "Business: " + lead.business,
        "Customer: " + lead.name,
        "Phone: " + lead.phone,
        lead.email ? "Email: " + lead.email : "",
        "Service address: " + lead.address,
        "Service needed: " + lead.need, "",
        "Next step: Contact this customer promptly.",
      ].filter(Boolean).join("\n"),
    });
    return "SENT";
  } catch (error) {
    console.error("[phone-lead] Email failed", error);
    return "FAILED";
  }
}

async function sendSms(lead: Lead): Promise<"SENT" | "SKIPPED" | "FAILED"> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  const to = process.env.PHONE_AGENT_ALERT_PHONE?.trim();
  if (!sid || !token || !from || !to) return "SKIPPED";
  const body = new URLSearchParams({
    From: from, To: to,
    Body: [
      "New PulseTech phone lead for " + lead.business,
      lead.name + " | " + lead.phone,
      lead.need, lead.address,
    ].join("\n").slice(0, 1500),
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
  if (!verify(raw, request.headers.get("elevenlabs-signature"))) {
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
  const analysis = payload.data.analysis as
    | { data_collection_results?: Record<string, unknown> }
    | undefined;
  const extracted = analysis?.data_collection_results || {};
  const lead: Lead = {
    business: process.env.PHONE_AGENT_BUSINESS_NAME?.trim() ||
      "Texas Solar Professional",
    name: field(extracted, "full_name", "name"),
    phone: field(extracted, "phone_number", "phone"),
    email: field(extracted, "email"),
    address: field(extracted, "service_address", "address"),
    need: field(extracted, "service_needed", "customer_need"),
  };
  if (!lead.name || !lead.phone || !lead.address || !lead.need) {
    return NextResponse.json({ ok: true, qualified: false });
  }
  const [email, sms] = await Promise.all([sendEmail(lead), sendSms(lead)]);
  return NextResponse.json({ ok: true, qualified: true, email, sms });
}
