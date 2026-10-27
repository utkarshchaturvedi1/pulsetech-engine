import { createClient as createAdminClient } from "@supabase/supabase-js";
import { loadSharedProfile } from "./sharedProfileStore";

export type DemoClaimResult = "claimed" | "already-linked" | "conflict" | "unavailable";

/** Connect a verified sign-in to the saved demo that initiated free registration. */
export async function claimDemoForUser(
  demoId: string,
  user: { id: string; email?: string | null },
): Promise<DemoClaimResult> {
  const email = user.email?.trim().toLowerCase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!email || !url || !serviceKey) return "unavailable";

  const profile = await loadSharedProfile(demoId);
  if (!profile?.profile.businessName) return "unavailable";

  const admin = createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const [{ data: membership, error: membershipReadError }, { data: account, error: accountReadError }] = await Promise.all([
    admin.from("customer_memberships").select("customer_account_id").eq("user_id", user.id).maybeSingle(),
    admin.from("customer_accounts").select("id,owner_email").eq("demo_id", demoId).maybeSingle(),
  ]);
  if (membershipReadError || accountReadError) return "unavailable";

  if (account) {
    if (account.owner_email.trim().toLowerCase() !== email) return "conflict";
    if (membership) return membership.customer_account_id === account.id ? "already-linked" : "conflict";
    const { error } = await admin.from("customer_memberships").insert({ user_id: user.id, customer_account_id: account.id });
    return error ? "conflict" : "already-linked";
  }
  if (membership) return "conflict";

  const { data: created, error: createError } = await admin.from("customer_accounts")
    .insert({
      business_name: profile.profile.businessName,
      owner_email: email,
      demo_id: demoId,
      handover_status: "setup",
    })
    .select("id")
    .single();
  if (createError || !created) return "conflict";

  const { error: membershipError } = await admin.from("customer_memberships").insert({
    user_id: user.id,
    customer_account_id: created.id,
  });
  if (membershipError) {
    await admin.from("customer_accounts").delete().eq("id", created.id);
    return "conflict";
  }
  return "claimed";
}
