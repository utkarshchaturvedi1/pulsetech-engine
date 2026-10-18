import { createClient } from "@supabase/supabase-js";
import type { SalesState } from "./salesState";
import { sanitizeDemoId } from "./demoRepository";

type LeadDelivery = "NOT_SENT" | "QUEUED" | "SENT" | "FAILED";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

/**
 * Saves a minimal lead record for a paid client account. The service role is
 * used only server-side; authenticated clients can read their own account's
 * rows through the customer_leads RLS policy.
 */
export async function persistCustomerLead(
  demoIdValue: unknown,
  state: SalesState
): Promise<{ saved: boolean; applicable: boolean }> {
  const demoId = typeof demoIdValue === "string" ? sanitizeDemoId(demoIdValue) : null;
  if (!demoId) return { saved: false, applicable: false };

  const hasCapturedData = Boolean(
    state.lead.name?.trim() ||
    state.lead.phone?.trim() ||
    state.lead.email?.trim() ||
    state.lead.address?.trim() ||
    state.primaryNeed?.trim() ||
    state.customerNeed?.trim()
  );
  // No lead details means there is nothing to persist; this is not a save failure.
  if (!hasCapturedData) return { saved: false, applicable: false };

  const admin = adminClient();
  if (!admin) return { saved: false, applicable: true };

  const { data: account, error: accountError } = await admin
    .from("customer_accounts")
    .select("id")
    .eq("demo_id", demoId)
    .maybeSingle();
  if (accountError) {
    console.error("[customer-lead] account lookup failed", accountError.code);
    return { saved: false, applicable: true };
  }
  if (!account) return { saved: false, applicable: false };

  const deliveryStatus: LeadDelivery = state.leadDeliveryStatus || "NOT_SENT";
  const { error } = await admin.from("customer_leads").upsert({
    customer_account_id: account.id,
    conversation_id: state.conversationId,
    customer_name: state.lead.name?.trim().slice(0, 200) || null,
    customer_phone: state.lead.phone?.trim().slice(0, 80) || null,
    customer_email: state.lead.email?.trim().slice(0, 254) || null,
    service_address: state.lead.address?.trim().slice(0, 500) || null,
    primary_need: (state.primaryNeed || state.customerNeed || "").trim().slice(0, 1000) || null,
    urgency: state.urgency,
    preferred_timing: state.preferredTiming?.trim().slice(0, 300) || null,
    alert_delivery_status: deliveryStatus,
    updated_at: new Date().toISOString(),
  }, { onConflict: "customer_account_id,conversation_id" });

  if (error) {
    console.error("[customer-lead] save failed", error.code);
    return { saved: false, applicable: true };
  }
  return { saved: true, applicable: true };
}
