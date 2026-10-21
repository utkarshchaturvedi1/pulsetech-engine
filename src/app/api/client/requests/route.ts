import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return NextResponse.json({ error: "Client portal is not configured." }, { status: 503 });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  let body: { subject?: unknown; details?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter a subject and details." }, { status: 400 }); }
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const details = typeof body.details === "string" ? body.details.trim() : "";
  if (subject.length < 3 || subject.length > 120 || details.length < 10 || details.length > 4000) {
    return NextResponse.json({ error: "Use a subject of 3–120 characters and details of 10–4,000 characters." }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("customer_memberships").select("customer_account_id").eq("user_id", user.id).maybeSingle();
  if (membershipError || !membership) return NextResponse.json({ error: "No client account is connected to this login." }, { status: 403 });

  const { data: account } = await supabase.from("customer_accounts")
    .select("customer_id,business_name").eq("id", membership.customer_account_id).maybeSingle();
  if (!account) return NextResponse.json({ error: "The linked client account could not be found." }, { status: 403 });

  const { error } = await supabase.from("handover_requests").insert({
    customer_account_id: membership.customer_account_id,
    requested_by: user.id,
    subject,
    details,
  });
  if (error) return NextResponse.json({ error: "We couldn’t save this request. Please try again." }, { status: 503 });

  let notificationSent = false;
  const host = process.env.SMTP_HOST?.trim();
  const userName = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || userName;
  const to = process.env.PULSETECH_SUPPORT_EMAIL?.trim() || "contact@pulsetechlabs.com";
  const port = Number(process.env.SMTP_PORT || "465");
  if (host && userName && password && from && Number.isInteger(port) && port > 0) {
    try {
      const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user: userName, pass: password } });
      await transporter.sendMail({
        from,
        to,
        subject: `Client support request: ${account.business_name} (${account.customer_id})`,
        text: [`Customer: ${account.customer_id} — ${account.business_name}`, `From: ${user.email || "signed-in client"}`, `Subject: ${subject}`, "", details].join("\n"),
      });
      notificationSent = true;
    } catch (mailError) {
      console.error("[client-support] notification delivery failed", mailError instanceof Error ? mailError.name : "unknown");
    }
  }
  return NextResponse.json({ ok: true, notificationSent }, { status: 201 });
}
