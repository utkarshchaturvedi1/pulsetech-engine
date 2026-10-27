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
  const { data: existingAccount, error: existingAccountError } = await admin.from("customer_accounts")
    .select("id,customer_id,business_name,owner_email").eq("demo_id", demoId).maybeSingle();
  if (existingAccountError) {
    return NextResponse.json({ error: "Could not check the existing client account. Please try again." }, { status: 503 });
  }

  let account = existingAccount;
  let createdAccount = false;
  if (account) {
    if (normalizeClientEmail(account.owner_email) !== email) {
      return NextResponse.json({ error: "This business profile is already connected to a different account. Do not create a second account; contact PulseTech to update access." }, { status: 409 });
    }
    const { data: existingMembership, error: existingMembershipError } = await admin.from("customer_memberships")
      .select("user_id").eq("customer_account_id", account.id).maybeSingle();
    if (existingMembershipError) {
      return NextResponse.json({ error: "Could not check the existing account login. Please try again." }, { status: 503 });
    }
    if (existingMembership) {
      return NextResponse.json({
        ok: true,
        existingAccount: true,
        invitationSent: false,
        customerId: account.customer_id,
        businessName: account.business_name,
        message: "This email already has an account for this business. Keep the same login; do not create another account.",
      });
    }
  } else {
    const { data: created, error: accountError } = await admin.from("customer_accounts")
      .insert({ business_name: profile.profile.businessName, owner_email: email, demo_id: demoId })
      .select("id,customer_id,business_name,owner_email").single();
    if (accountError || !created) {
      return NextResponse.json({ error: accountError?.code === "23505" ? "This email or saved business profile was connected at the same time. Refresh and use the existing account." : "Could not create the client account. Check that the client account migration has been applied." }, { status: 409 });
    }
    account = created;
    createdAccount = true;
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${baseUrl}/auth/callback?next=${encodeURIComponent(`/reset-password?next=${encodeURIComponent(`/demo/${demoId}`)}`)}`,
    data: { customer_id: account.customer_id },
  });
  if (inviteError || !invited.user) {
    if (createdAccount) await admin.from("customer_accounts").delete().eq("id", account.id);
    return NextResponse.json({ error: "Account created, but the invitation could not be sent. Confirm Supabase email delivery and try again." }, { status: 502 });
  }

  const { error: membershipError } = await admin.from("customer_memberships").insert({
    user_id: invited.user.id,
    customer_account_id: account.id,
  });
  if (membershipError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    if (createdAccount) await admin.from("customer_accounts").delete().eq("id", account.id);
    return NextResponse.json({ error: "Could not connect the invited user to the client account. No account was kept." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, existingAccount: !createdAccount, invitationSent: true, customerId: account.customer_id, businessName: account.business_name, message: createdAccount ? "Invitation sent." : "Connected this login to the existing business account. Invitation sent." }, { status: createdAccount ? 201 : 200 });
}
