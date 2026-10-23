import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { LabError, labDatabaseConfig, type LabRecord, validLabId } from "./store";
import type { LabMessage } from "./policy";

export type LabLead = { name: string; phone: string; address: string; serviceNeed: string; preferredTime: string; notes: string };
export type OwnerLead = { id: string; profile: { kind: "independent-sales-lab-lead-v1"; businessName: string; labId: string; lead: LabLead; emailStatus?: string }; updated_at: string };
export const leadTool = {
  type: "function" as const, name: "submit_lead",
  description: "Submit a customer's service request to the owner's lead inbox after collecting the required details. The visitor must have asked for service or agreed to business follow-up. All values must come from customer messages; never invent missing details. Do not call this for browsing or a declined visit.",
  strict: true, parameters: {
    type: "object", additionalProperties: false,
    required: ["name", "phone", "address", "serviceNeed", "preferredTime", "notes"],
    properties: Object.fromEntries(["name", "phone", "address", "serviceNeed", "preferredTime", "notes"].map(key => [key, { type: "string", description: key === "notes" ? "Other customer details and answers to owner-required questions, or empty string." : `Customer-provided ${key}; use their wording.` }])),
  },
};
export function validConversation(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new LabError("Please start a new chat.");
  return value;
}
export function parseLead(value: unknown, messages: LabMessage[]): LabLead {
  if (!value || typeof value !== "object") throw new LabError("Please try sending your last message again.");
  const obj = value as Record<string, unknown>;
  for (const key of ["name", "phone", "address", "serviceNeed", "preferredTime", "notes"]) {
    if (typeof obj[key] !== "string" || (key !== "notes" && !obj[key].trim()) || obj[key].length > 2000) throw new LabError("Please complete the missing service-request details.");
  }
  const lead = obj as LabLead;
  const digits = lead.phone.replace(/\D/g, "");
  const userText = messages.filter(message => message.role === "user").map(message => message.content).join("\n");
  if (digits.length < 7 || digits.length > 15 || !userText.replace(/\D/g, "").includes(digits)) throw new LabError("Please provide a valid callback phone number.");
  const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (!normalize(userText).includes(normalize(lead.name)) || !normalize(userText).includes(normalize(lead.address))) throw new LabError("Please confirm your name and full service address.");
  return lead;
}
export async function findLead(labId: string, conversationId: string): Promise<OwnerLead | null> {
  const { url, headers } = labDatabaseConfig();
  const id = leadId(labId, conversationId);
  const response = await fetch(`${url}/rest/v1/business_profiles?id=eq.${id}&select=id,profile,updated_at`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new LabError("Please try again in a moment — your request could not be checked.", 503);
  const rows = await response.json();
  return rows[0]?.profile?.kind === "independent-sales-lab-lead-v1" && rows[0].profile.labId === labId ? rows[0] : null;
}
function leadId(labId: string, conversationId: string) {
  return "saleslab-lead-" + createHash("sha256").update(validLabId(labId) + ":" + validConversation(conversationId)).digest("hex");
}
export async function saveLead(record: LabRecord, conversationId: string, lead: LabLead): Promise<{ created: boolean }> {
  const { url, headers } = labDatabaseConfig();
  const row: OwnerLead = { id: leadId(record.id, conversationId), profile: { kind: "independent-sales-lab-lead-v1", businessName: record.profile.businessName, labId: record.id, lead }, updated_at: new Date().toISOString() };
  const response = await fetch(`${url}/rest/v1/business_profiles?on_conflict=id`, {
    method: "POST", headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(row), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new LabError("Your request hasn't been saved yet. Please try sending your last message again.", 503);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new LabError("Please try sending your last message again.", 503);
  return { created: rows.length === 1 };
}
export async function listLeads(labId: string): Promise<OwnerLead[]> {
  validLabId(labId);
  const { url, headers } = labDatabaseConfig();
  const response = await fetch(`${url}/rest/v1/business_profiles?profile->>kind=eq.independent-sales-lab-lead-v1&profile->>labId=eq.${labId}&select=id,profile,updated_at&order=updated_at.desc&limit=100`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new LabError("Peter couldn't load your leads. Please retry.", 503);
  return response.json();
}
export async function notifyOwner(record: LabRecord, lead: LabLead): Promise<"sent" | "not_configured" | "failed"> {
  const to = record.profile.leadAlertEmail;
  if (!to || !process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM) return "not_configured";
  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 8000 });
    await transport.sendMail({ to, from: process.env.SMTP_FROM, subject: `New service request — ${record.profile.businessName.replace(/[\r\n]/g, " ")}`, text: `Name: ${lead.name}\nPhone: ${lead.phone}\nAddress: ${lead.address}\nService: ${lead.serviceNeed}\nRequested time: ${lead.preferredTime}\nNotes: ${lead.notes}\n\nContact this customer ASAP to confirm the visit. Their requested time is not a confirmed appointment.` });
    return "sent";
  } catch { return "failed"; }
}
export async function recordEmailStatus(labId: string, conversationId: string, status: string) {
  try {
    const row = await findLead(labId, conversationId);
    if (!row) return;
    const { url, headers } = labDatabaseConfig();
    await fetch(`${url}/rest/v1/business_profiles?id=eq.${row.id}`, { method: "PATCH", headers, body: JSON.stringify({ profile: { ...row.profile, emailStatus: status } }), signal: AbortSignal.timeout(10000) });
  } catch { /* The lead remains in the owner inbox even if status recording fails. */ }
}
export const leadClosing = "I’ve passed your details to our team. They’ll contact you ASAP to help get this sorted. You’ve come to the right team—we’ll take it from here.";
