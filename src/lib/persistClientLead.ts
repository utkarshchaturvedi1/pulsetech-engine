import { createClient } from "@supabase/supabase-js";
import { sanitizeDemoId } from "./demoRepository";
import type { SalesState } from "./salesState";

/** Preserve partial, recoverable opportunities without triggering an alert. */
export async function persistLiveClientLead(demoId: unknown, state: SalesState, source: "website" | "phone" = "website") {
  const id = typeof demoId === "string" ? sanitizeDemoId(demoId.trim()) : "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!id || !url || !serviceKey || (!state.lead.phone && !state.lead.email)) return;

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: account, error: accountError } = await admin.from("customer_accounts")
    .select("id").eq("demo_id", id).eq("handover_status", "live").maybeSingle();
  if (accountError) throw accountError;
  if (!account) return; // Public demos and prelaunch accounts are not client lead records.

  const { error } = await admin.rpc("capture_client_lead", { p_demo_id: id, p_lead: {
    conversation_id: state.conversationId,
    source,
    customer_name: state.lead.name?.trim().slice(0, 240) || null,
    customer_phone: state.lead.phone?.trim().slice(0, 80) || null,
    customer_email: state.lead.email?.trim().slice(0, 320) || null,
    service_address: state.lead.address?.trim().slice(0, 600) || null,
    primary_need: (state.primaryNeed || state.customerNeed || state.summary || "").trim().slice(0, 2000) || null,
    urgency: state.urgency,
    preferred_timing: state.preferredTiming?.trim().slice(0, 240) || null,
    alert_delivery_status: state.leadDeliveryStatus,
    capture_status: state.handoffReady ? "qualified" : "partial",
  } });
  if (error) throw error;
}
