import { createHash } from "node:crypto";
import { loadSharedProfile, isDurableProfileStoreConfigured, isEphemeralRuntime } from "../sharedProfileStore";
import type { StoredDemo } from "../demoStore";
import type { LabMessage } from "./policy";

export class ChatError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function validBusinessId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,180}$/.test(value) || /^(saleslab-|businesschat-)/.test(value)) throw new ChatError("Please reopen this business chat.");
  return value;
}
export function validConversation(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new ChatError("Please start a new chat.");
  return value;
}
export async function readBusiness(value: unknown): Promise<StoredDemo> {
  const id = validBusinessId(value);
  const record = await loadSharedProfile(id);
  if (!record || typeof record.profile.website !== "string" || !Array.isArray(record.profile.services)) throw new ChatError("Business not found.", 404);
  if (isEphemeralRuntime() && isDurableProfileStoreConfigured() && !record.durableVersion && !record.profile.isTestData) throw new ChatError("Business information is temporarily unavailable.", 503);
  return record;
}
export function chatDatabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ChatError("The service is temporarily unavailable. Please try again shortly.", 503);
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } };
}
export type ServiceLead = { name: string; phone: string; address: string; serviceNeed: string; preferredTime: string; notes: string };
export type LeadRecord = { id: string; profile: { kind: "business-chat-lead-v1"; businessId: string; conversationId: string; businessName: string; lead: ServiceLead; alertStatus: string }; updated_at: string };
function leadId(id: string, conversationId: string) { return "businesschat-lead-" + createHash("sha256").update(validBusinessId(id) + ":" + validConversation(conversationId)).digest("hex"); }
export async function findLead(id: string, conversationId: string): Promise<LeadRecord | null> {
  const { url, headers } = chatDatabaseConfig();
  const response = await fetch(`${url}/rest/v1/business_profiles?id=eq.${leadId(id, conversationId)}&select=id,profile,updated_at`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new ChatError("Please try again in a moment.", 503);
  const row = (await response.json())[0];
  return row?.profile?.kind === "business-chat-lead-v1" && row.profile.businessId === id && row.profile.conversationId === conversationId ? row : null;
}
export async function saveLead(record: StoredDemo, conversationId: string, lead: ServiceLead, alertStatus: string): Promise<boolean> {
  const { url, headers } = chatDatabaseConfig();
  const row: LeadRecord = { id: leadId(record.id, conversationId), profile: { kind: "business-chat-lead-v1", businessId: record.id, conversationId, businessName: record.profile.businessName, lead, alertStatus }, updated_at: new Date().toISOString() };
  const response = await fetch(`${url}/rest/v1/business_profiles?on_conflict=id`, { method: "POST", headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(row), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new ChatError("Your request hasn't been saved yet. Please send your last message again.", 503);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new ChatError("Please send your last message again.", 503);
  return rows.length === 1;
}
export async function listLeads(id: string): Promise<LeadRecord[]> {
  validBusinessId(id);
  const { url, headers } = chatDatabaseConfig();
  const response = await fetch(`${url}/rest/v1/business_profiles?profile->>kind=eq.business-chat-lead-v1&profile->>businessId=eq.${id}&select=id,profile,updated_at&order=updated_at.desc&limit=100`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new ChatError("Leads are temporarily unavailable.", 503);
  return response.json();
}
export function parseLead(value: Record<string, unknown>, messages: LabMessage[]): ServiceLead {
  for (const key of ["name", "phone", "address", "serviceNeed", "preferredTime", "notes"]) {
    if (typeof value[key] !== "string" || (key !== "notes" && !(value[key] as string).trim()) || (value[key] as string).length > 2000) throw new ChatError("Please complete the missing service-request details.");
  }
  const lead = value as ServiceLead;
  const userText = messages.filter(m => m.role === "user").map(m => m.content).join("\n");
  const normalized = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const digits = lead.phone.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15 || !userText.replace(/\D/g, "").includes(digits)) throw new ChatError("Please provide your callback phone number.");
  if (![lead.name, lead.address, lead.preferredTime].every(text => normalized(userText).includes(normalized(text)))) throw new ChatError("Please confirm the missing service-request details.");
  return lead;
}
export async function readBody(request: Request) {
  const raw = await request.text();
  if (raw.length > 200000) throw new ChatError("Please send a shorter message.", 413);
  try { const body = JSON.parse(raw); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); return body as Record<string, unknown>; }
  catch { throw new ChatError("Invalid request."); }
}
export function chatError(error: unknown) { return Response.json({ error: error instanceof ChatError ? error.message : "Please try again in a moment." }, { status: error instanceof ChatError ? error.status : 503, headers: { "Cache-Control": "no-store" } }); }
