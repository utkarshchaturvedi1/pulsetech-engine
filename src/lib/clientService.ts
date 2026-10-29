import { billingAdmin } from "./clientBilling";

export function websiteDomain(value: string): string | null {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(host) || host.includes("..")) return null;
    return host;
  } catch { return null; }
}

export function serviceEnabled(account: { billing_status: string; billing_environment: string | null; handover_status: string; website_status: string; launch_checked_at: string | null }, runtime = process.env.VERCEL_ENV) {
  return account.billing_status === "paid" && account.handover_status === "live" && account.website_status === "live" && !!account.launch_checked_at && (runtime !== "production" || account.billing_environment === "live");
}
export function phoneServiceEnabled(account: { billing_status: string; billing_environment: string | null; phone_status: string; launch_checked_at: string | null }, runtime = process.env.VERCEL_ENV) {
  return account.billing_status === "paid" && account.phone_status === "live" && !!account.launch_checked_at && (runtime !== "production" || account.billing_environment === "live");
}

export async function clientService(demoId: string) {
  const { data, error } = await billingAdmin().from("customer_accounts")
    .select("id,demo_id,business_name,billing_status,billing_environment,handover_status,website_status,phone_status,allowed_domain,launch_checked_at,inbound_phone,billing_period_start,billing_period_end")
    .eq("demo_id", demoId).maybeSingle();
  if (error) throw new Error("Service status unavailable.");
  return data;
}

export async function reserveClientChatConversation(demoId: string, conversationId: string) {
  const { data, error } = await billingAdmin().rpc("reserve_client_chat_conversation", { p_demo_id: demoId, p_conversation_id: conversationId });
  if (error) throw new Error("Usage tracking is unavailable.");
  return data === true;
}

export async function clientVoiceMinutesAvailable(demoId: string) {
  const { data, error } = await billingAdmin().rpc("client_voice_minutes_available", { p_demo_id: demoId });
  if (error) throw new Error("Usage tracking is unavailable.");
  return data === true;
}

export async function recordClientVoiceCall(demoId: string, conversationId: string, durationSeconds: number) {
  const { error } = await billingAdmin().rpc("record_client_voice_call", { p_demo_id: demoId, p_conversation_id: conversationId, p_duration_seconds: durationSeconds });
  if (error) throw new Error("Usage tracking is unavailable.");
}
