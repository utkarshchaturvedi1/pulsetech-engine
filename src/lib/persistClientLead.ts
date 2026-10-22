import { createClient } from "@supabase/supabase-js";
import { sanitizeDemoId } from "./demoRepository";
import type { SalesState } from "./salesState";

/** Save only complete leads for a live client, independently of alert delivery. */
export async function persistLiveClientLead(demoId: unknown, state: SalesState) {
  const id = typeof demoId === "string" ? sanitizeDemoId(demoId.trim()) : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!id || !url || !serviceKey || !state.handoffReady || !state.lead.name || !state.lead.phone || !state.lead.address) return;

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: account, error: accountError } = await admin.from("customer_accounts")
    .select("id").eq("demo_id", id).eq("handover_status", "live").maybeSingle();
  if (accountError) throw accountError;
  if (!account) return; // Public demos and prelaunch accounts are not client lead records.

  const now = new Date().toISOString();
  const { error } = await admin.from("customer_leads").upsert({
    customer_account_id: account.id,
    conversation_id: state.conversationId,
    customer_name: state.lead.name.trim().slice(0, 240),
    customer_phone: state.lead.phone.trim().slice(0, 80),
    customer_email: state.lead.email?.trim().slice(0, 320) || null,
    service_address: state.lead.address.trim().slice(0, 600),
    primary_need: (state.primaryNeed || state.customerNeed || state.summary || "").trim().slice(0, 2000) || null,
    urgency: state.urgency,
    preferred_timing: state.preferredTiming?.trim().slice(0, 240) || null,
    alert_delivery_status: state.leadDeliveryStatus,
    first_captured_at: now,
    updated_at: now,
  }, { onConflict: "customer_account_id,conversation_id", ignoreDuplicates: true });
  if (error) throw error;
}
