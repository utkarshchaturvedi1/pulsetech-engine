import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isPulseTechAdmin, normalizeClientEmail } from "@/lib/clientAccess";
import { loadSharedProfile } from "@/lib/sharedProfileStore";
import { sanitizeDemoId } from "@/lib/demoRepository";

export async function POST(request: Request) {
  const sessionClient = await createClient().catch(() => null);
  if (!sessionClient) return NextResponse.json({ error: "Client portal is not configured." }, { status: 503 });
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user || !isPulseTechAdmin(user.email, process.env.PULSETECH_ADMIN_EMAILS)) {
    return NextResponse.json({ error: "PulseTech administrator access is required." }, { status: 403 });
  }

  let body: { email?: unknown; demoId?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter a client email and saved business profile ID." }, { status: 400 }); }
  const email = normalizeClientEmail(body.email);
  const demoId = typeof body.demoId === "string" ? sanitizeDemoId(body.demoId.trim()) : null;
  if (!email || !demoId) return NextResponse.json({ error: "Enter a valid work email and business profile ID." }, { status: 400 });

  const profile = await loadSharedProfile(demoId);
  if (!profile?.profile.businessName) return NextResponse.json({ error: "That saved business profile could not be found." }, { status: 404 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const baseUrl = process.env.PULSETECH_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!url || !serviceKey || !baseUrl) {
    return NextResponse.json({ error: "Client onboarding is missing its server configuration." }, { status: 503 });
  }

  const admin = createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: account, error: accountError } = await admin.from("customer_accounts")
    .insert({ business_name: profile.profile.businessName, owner_email: email, demo_id: demoId })
    .select("id,customer_id,business_name").single();
  if (accountError || !account) {
    return NextResponse.json({ error: accountError?.code === "23505" ? "This email or saved business profile is already connected to a client account." : "Could not create the client account. Check that the client account migration has been applied." }, { status: 409 });
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${baseUrl}/auth/callback`,
    data: { customer_id: account.customer_id },
  });
  if (inviteError || !invited.user) {
    await admin.from("customer_accounts").delete().eq("id", account.id);
    return NextResponse.json({ error: "Account created, but the invitation could not be sent. Confirm Supabase email delivery and try again." }, { status: 502 });
  }

  const { error: membershipError } = await admin.from("customer_memberships").insert({
    user_id: invited.user.id,
    customer_account_id: account.id,
  });
  if (membershipError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    await admin.from("customer_accounts").delete().eq("id", account.id);
    return NextResponse.json({ error: "Could not connect the invited user to the client account. No account was kept." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, customerId: account.customer_id, businessName: account.business_name }, { status: 201 });
}
