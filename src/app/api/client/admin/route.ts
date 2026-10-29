import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billingAdmin } from "@/lib/clientBilling";
import { isPulseTechAdmin } from "@/lib/clientAccess";
import { websiteDomain } from "@/lib/clientService";
import { loadSharedProfile } from "@/lib/sharedProfileStore";
import { getInboundVoiceNumberMap } from "@/lib/inboundVoice";

export async function PATCH(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user || !isPulseTechAdmin(user.email, process.env.PULSETECH_ADMIN_EMAILS)) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const body = await request.json();
    const admin = billingAdmin();
    if (body.requestId) {
      if (!/^[a-f0-9-]{36}$/i.test(body.requestId) || !["received", "in_progress", "resolved"].includes(body.status)) return NextResponse.json({ error: "Invalid request update." }, { status: 400 });
      const { data, error } = await admin.from("handover_requests").update({ status: body.status }).eq("id", body.requestId).select("id").maybeSingle();
      if (error) throw error;
      return data ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Request not found." }, { status: 404 });
    }
    if (!/^[a-f0-9-]{36}$/i.test(body.accountId) || !["testing", "activate_chat", "activate_phone", "suspend"].includes(body.action)) return NextResponse.json({ error: "Invalid account action." }, { status: 400 });
    const { data: account, error } = await admin.from("customer_accounts").select("id,demo_id,billing_status,billing_environment,handover_status").eq("id", body.accountId).single();
    if (error) throw error;
    if (process.env.VERCEL_ENV === "production" && account.billing_environment !== "live") return NextResponse.json({ error: "Sandbox accounts cannot be activated in production." }, { status: 409 });
    let patch: Record<string, unknown>;
    if (body.action === "suspend") patch = { website_status: "suspended", phone_status: "suspended" };
    else {
      if (account.billing_status !== "paid") return NextResponse.json({ error: "Verified payment is required before launch." }, { status: 409 });
      if (body.action === "testing") patch = { handover_status: "testing" };
      else {
        if (body.internalChecksPassed !== true) return NextResponse.json({ error: "Complete and record the internal chat, instructions, pricing and alert checks first." }, { status: 400 });
        const demo = await loadSharedProfile(account.demo_id);
        const profile = demo?.profile;
        if (!profile?.leadNotificationEmail || !/^\+[1-9]\d{7,14}$/.test(profile.leadNotificationPhone || "")) return NextResponse.json({ error: "Save the business email and internal mobile alert recipients in Peter first." }, { status: 409 });
        const checked = { launch_checked_at: new Date().toISOString(), launch_checked_by: user.id };
        if (body.action === "activate_chat") {
          const domain = typeof body.domain === "string" ? websiteDomain(body.domain) : null;
          if (!domain || domain !== websiteDomain(profile.website)) return NextResponse.json({ error: "Installation domain must match the saved business website." }, { status: 400 });
          patch = { ...checked, allowed_domain: domain, website_status: "live", handover_status: "live" };
        } else {
          const phone = typeof body.phone === "string" ? body.phone.trim() : "";
          if (!/^\+[1-9]\d{7,14}$/.test(phone) || getInboundVoiceNumberMap()[phone] !== account.demo_id) return NextResponse.json({ error: "This number must already be assigned and mapped to this business in the inbound phone provider setup." }, { status: 409 });
          patch = { ...checked, inbound_phone: phone, phone_status: "live" };
        }
      }
    }
    const { error: updateError } = await admin.from("customer_accounts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", account.id);
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not save the account change. Please try again." }, { status: 503 }); }
}
