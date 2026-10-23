import { randomUUID, timingSafeEqual } from "node:crypto";
import type { LabProfile } from "./policy";

export class LabError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function requireOwner(request: Request) {
  const expected = process.env.SALES_LAB_OWNER_KEY;
  if (!expected || expected.length < 32) throw new LabError("Sales lab owner access has not been configured.", 503);
  const actual = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const a = Buffer.from(actual), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new LabError("Enter the sales lab owner key.", 401);
}
export function validLabId(value: unknown): string {
  if (typeof value !== "string" || !/^saleslab-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new LabError("Invalid test business ID.");
  return value;
}
function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new LabError("The test database connection is not configured.", 503);
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } };
}
export type LabRecord = { id: string; profile: LabProfile; updated_at: string };
export async function readLab(id: string): Promise<LabRecord> {
  validLabId(id);
  const { url, headers } = config();
  const response = await fetch(`${url}/rest/v1/business_profiles?id=eq.${id}&select=id,profile,updated_at`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new LabError("The test database is unavailable.", 503);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows[0]?.profile?.kind !== "independent-sales-lab-v1") throw new LabError("Test business not found.", 404);
  return rows[0];
}
export async function writeLab(profile: LabProfile, previous?: LabRecord): Promise<LabRecord> {
  const { url, headers } = config();
  const record = { id: previous ? validLabId(previous.id) : `saleslab-${randomUUID()}`, profile, updated_at: new Date().toISOString() };
  const filter = previous ? `?id=eq.${previous.id}&updated_at=eq.${encodeURIComponent(previous.updated_at)}` : "";
  const response = await fetch(`${url}/rest/v1/business_profiles${filter}`, {
    method: previous ? "PATCH" : "POST", headers: { ...headers, Prefer: "return=representation" }, body: JSON.stringify(record), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new LabError("Peter could not save the change. Nothing has been confirmed.", 503);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw new LabError("The instructions changed in another window. Reload before trying again.", 409);
  return rows[0];
}
export function labError(error: unknown): Response {
  return Response.json({ error: error instanceof LabError ? error.message : "The test service is unavailable. Please try again." }, { status: error instanceof LabError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
export async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 200000) throw new LabError("This message is too long.", 413);
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch { throw new LabError("Invalid request."); }
}
