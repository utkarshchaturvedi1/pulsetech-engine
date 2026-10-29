import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";
import { isPulseTechAdmin } from "./clientAccess";
import { checkProfileAccess, type ProfileAccess } from "./profileAccess";
import { getBundledTestDemo } from "../data/testBusinessProfiles";

export async function authorizeProfileAccess(demoId: string, mode: "read" | "write"): Promise<ProfileAccess> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Bundled test fixtures contain no customer data. Local regression workflows use disk.
    if (process.env.VERCEL !== "1" || (mode === "read" && getBundledTestDemo(demoId))) return { allowed: true };
    return { allowed: false, status: 503, error: "Business profile access is not configured." };
  }
  const admin = createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  let session: Awaited<ReturnType<typeof createClient>>;
  return checkProfileAccess(demoId, {
    async findAccount(id) {
      const { data, error } = await admin.from("customer_accounts").select("id").eq("demo_id", id).maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    async currentUser() {
      session = await createClient();
      const { data: { user }, error } = await session.auth.getUser();
      if (error || !user) return null;
      return { id: user.id, admin: isPulseTechAdmin(user.email, process.env.PULSETECH_ADMIN_EMAILS) };
    },
    async belongsToAccount(userId, accountId) {
      const { data, error } = await session.from("customer_memberships").select("customer_account_id")
        .eq("user_id", userId).eq("customer_account_id", accountId).maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
}
