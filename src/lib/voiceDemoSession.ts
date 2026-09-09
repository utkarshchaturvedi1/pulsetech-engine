/**
 * Short-lived voice demo sessions for prospect testing only.
 * Paying clients use assigned/ported numbers with no access code.
 */
import { createHash, randomInt } from "crypto";
import { isDurableProfileStoreConfigured } from "./sharedProfileStore";
import { sanitizeDemoId } from "./demoRepository";
import {
  VOICE_DEMO_CODE_LENGTH,
  VOICE_DEMO_DISCLAIMER,
  VOICE_DEMO_INACTIVITY_MS,
  VOICE_DEMO_MAX_INVALID_ATTEMPTS,
  VOICE_DEMO_RATE_WINDOW_MS,
} from "./voiceDemoCopy";

export {
  VOICE_DEMO_CODE_LENGTH,
  VOICE_DEMO_DISCLAIMER,
  VOICE_DEMO_INACTIVITY_MS,
  VOICE_DEMO_MAX_INVALID_ATTEMPTS,
  VOICE_DEMO_RATE_WINDOW_MS,
};

export type VoiceDemoSessionStatus = "active" | "expired" | "revoked";

export type VoiceDemoSession = {
  id: string;
  code: string;
  demoId: string;
  status: VoiceDemoSessionStatus;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
};

export type VoiceDemoPublicConfig = {
  enabled: boolean;
  phoneNumber: string | null;
  message: string | null;
  disclaimer: string;
};

type SessionRow = {
  id: string;
  code: string;
  demo_id: string;
  status: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
};

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

function authHeaders(key: string) {
  return {
    apikey: key,
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
  };
}

function rowToSession(row: SessionRow): VoiceDemoSession {
  return {
    id: row.id,
    code: row.code,
    demoId: row.demo_id,
    status: (row.status as VoiceDemoSessionStatus) || "active",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
  };
}

export function generateVoiceDemoCode(length = VOICE_DEMO_CODE_LENGTH): string {
  const max = 10 ** length;
  const n = randomInt(0, max);
  return String(n).padStart(length, "0");
}

export function isSessionExpired(
  session: Pick<VoiceDemoSession, "status" | "expiresAt">,
  now = Date.now()
): boolean {
  if (session.status !== "active") return true;
  return new Date(session.expiresAt).getTime() <= now;
}

export function extendExpiryIso(fromMs = Date.now()): string {
  return new Date(fromMs + VOICE_DEMO_INACTIVITY_MS).toISOString();
}

/** In-memory fallback for local/dev when Supabase is not configured. */
const memorySessions = new Map<string, VoiceDemoSession>();
const memoryByDemo = new Map<string, string>();
const memoryInvalidAttempts = new Map<string, number[]>();
const memoryCallBindings = new Map<
  string,
  { demoId: string; sessionId: string; expiresAt: number }
>();

function memoryCleanup(now = Date.now()) {
  for (const [id, session] of memorySessions) {
    if (isSessionExpired(session, now)) {
      memorySessions.delete(id);
      if (memoryByDemo.get(session.demoId) === id) {
        memoryByDemo.delete(session.demoId);
      }
    }
  }
  for (const [key, times] of memoryInvalidAttempts) {
    const fresh = times.filter((t) => now - t < VOICE_DEMO_RATE_WINDOW_MS);
    if (fresh.length) memoryInvalidAttempts.set(key, fresh);
    else memoryInvalidAttempts.delete(key);
  }
  for (const [sid, binding] of memoryCallBindings) {
    if (binding.expiresAt <= now) memoryCallBindings.delete(sid);
  }
}

async function supabaseFetch(
  path: string,
  init: RequestInit & { key: string }
): Promise<Response> {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase not configured");
  return fetch(config.url + path, {
    ...init,
    headers: {
      ...authHeaders(init.key),
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}

export async function createOrReuseVoiceDemoSession(
  demoIdRaw: string,
  options?: { forceNew?: boolean }
): Promise<VoiceDemoSession> {
  const demoId = sanitizeDemoId(demoIdRaw);
  if (!demoId) throw new Error("A valid demo id is required.");

  const durable = isDurableProfileStoreConfigured() && !!supabaseConfig();

  if (!durable) {
    memoryCleanup();
    if (options?.forceNew) {
      const priorId = memoryByDemo.get(demoId);
      if (priorId) {
        const prior = memorySessions.get(priorId);
        if (prior) {
          prior.status = "revoked";
          memorySessions.set(priorId, prior);
        }
        memoryByDemo.delete(demoId);
      }
    } else {
      const existingId = memoryByDemo.get(demoId);
      const existing = existingId ? memorySessions.get(existingId) : null;
      if (existing && !isSessionExpired(existing)) {
        existing.expiresAt = extendExpiryIso();
        memorySessions.set(existing.id, existing);
        return { ...existing };
      }
    }
    const session: VoiceDemoSession = {
      id:
        "mem_" +
        createHash("sha256")
          .update(demoId + Date.now() + Math.random())
          .digest("hex")
          .slice(0, 24),
      code: generateVoiceDemoCode(),
      demoId,
      status: "active",
      createdAt: new Date().toISOString(),
      expiresAt: extendExpiryIso(),
      lastUsedAt: null,
    };
    memorySessions.set(session.id, session);
    memoryByDemo.set(demoId, session.id);
    return { ...session };
  }

  const config = supabaseConfig()!;
  if (!options?.forceNew) {
    const active = await findActiveSessionForDemo(demoId);
    if (active) {
      return touchVoiceDemoSession(active.id);
    }
  } else {
    await revokeActiveSessionsForDemo(demoId);
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateVoiceDemoCode();
    const now = new Date().toISOString();
    const body = {
      code,
      demo_id: demoId,
      status: "active",
      created_at: now,
      expires_at: extendExpiryIso(),
      last_used_at: null,
    };
    const res = await supabaseFetch("/rest/v1/voice_demo_sessions", {
      key: config.key,
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const rows = (await res.json()) as SessionRow[];
      return rowToSession(rows[0]);
    }
    const text = await res.text();
    // Unique violation on active code — retry with a new code.
    if (res.status === 409 || /duplicate|unique/i.test(text)) continue;
    throw new Error("Unable to create voice demo session.");
  }
  throw new Error("Unable to allocate a unique voice demo code.");
}

async function findActiveSessionForDemo(
  demoId: string
): Promise<VoiceDemoSession | null> {
  const config = supabaseConfig();
  if (!config) return null;
  const now = new Date().toISOString();
  const res = await supabaseFetch(
    "/rest/v1/voice_demo_sessions?demo_id=eq." +
      encodeURIComponent(demoId) +
      "&status=eq.active&expires_at=gt." +
      encodeURIComponent(now) +
      "&order=created_at.desc&limit=1",
    { key: config.key, method: "GET" }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as SessionRow[];
  return rows[0] ? rowToSession(rows[0]) : null;
}

async function revokeActiveSessionsForDemo(demoId: string): Promise<void> {
  const config = supabaseConfig();
  if (!config) return;
  await supabaseFetch(
    "/rest/v1/voice_demo_sessions?demo_id=eq." +
      encodeURIComponent(demoId) +
      "&status=eq.active",
    {
      key: config.key,
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "revoked" }),
    }
  );
}

export async function touchVoiceDemoSession(
  sessionId: string
): Promise<VoiceDemoSession> {
  const durable = isDurableProfileStoreConfigured() && !!supabaseConfig();
  if (!durable) {
    memoryCleanup();
    const existing = memorySessions.get(sessionId);
    if (!existing || isSessionExpired(existing)) {
      throw new Error("Voice demo session expired.");
    }
    existing.expiresAt = extendExpiryIso();
    existing.lastUsedAt = new Date().toISOString();
    memorySessions.set(sessionId, existing);
    return { ...existing };
  }

  const config = supabaseConfig()!;
  const res = await supabaseFetch(
    "/rest/v1/voice_demo_sessions?id=eq." +
      encodeURIComponent(sessionId) +
      "&status=eq.active",
    {
      key: config.key,
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        expires_at: extendExpiryIso(),
        last_used_at: new Date().toISOString(),
      }),
    }
  );
  if (!res.ok) throw new Error("Unable to refresh voice demo session.");
  const rows = (await res.json()) as SessionRow[];
  if (!rows[0] || isSessionExpired(rowToSession(rows[0]))) {
    throw new Error("Voice demo session expired.");
  }
  return rowToSession(rows[0]);
}

export async function lookupVoiceDemoSessionByCode(
  codeRaw: string
): Promise<VoiceDemoSession | null> {
  const code = codeRaw.replace(/\D/g, "");
  if (code.length !== VOICE_DEMO_CODE_LENGTH) return null;

  const durable = isDurableProfileStoreConfigured() && !!supabaseConfig();
  if (!durable) {
    memoryCleanup();
    for (const session of memorySessions.values()) {
      if (session.code === code && !isSessionExpired(session)) {
        return { ...session };
      }
    }
    return null;
  }

  const config = supabaseConfig()!;
  const now = new Date().toISOString();
  const res = await supabaseFetch(
    "/rest/v1/voice_demo_sessions?code=eq." +
      encodeURIComponent(code) +
      "&status=eq.active&expires_at=gt." +
      encodeURIComponent(now) +
      "&limit=1",
    { key: config.key, method: "GET" }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as SessionRow[];
  return rows[0] ? rowToSession(rows[0]) : null;
}

export async function markVoiceDemoSessionUsed(
  sessionId: string
): Promise<VoiceDemoSession | null> {
  try {
    return await touchVoiceDemoSession(sessionId);
  } catch {
    return null;
  }
}

export function hashCallerKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function recordInvalidCodeAttempt(
  callerKeyRaw: string
): Promise<{ blocked: boolean; count: number }> {
  const key = hashCallerKey(callerKeyRaw || "unknown");
  const now = Date.now();
  const durable = isDurableProfileStoreConfigured() && !!supabaseConfig();

  if (!durable) {
    memoryCleanup(now);
    const times = memoryInvalidAttempts.get(key) || [];
    times.push(now);
    memoryInvalidAttempts.set(key, times);
    return {
      blocked: times.length >= VOICE_DEMO_MAX_INVALID_ATTEMPTS,
      count: times.length,
    };
  }

  const config = supabaseConfig()!;
  await supabaseFetch("/rest/v1/voice_demo_invalid_attempts", {
    key: config.key,
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ caller_key: key, created_at: new Date().toISOString() }),
  });

  const since = new Date(now - VOICE_DEMO_RATE_WINDOW_MS).toISOString();
  const res = await supabaseFetch(
    "/rest/v1/voice_demo_invalid_attempts?caller_key=eq." +
      encodeURIComponent(key) +
      "&created_at=gte." +
      encodeURIComponent(since) +
      "&select=id",
    { key: config.key, method: "GET", headers: { Prefer: "count=exact" } }
  );
  const rows = res.ok ? ((await res.json()) as unknown[]) : [];
  const count = Array.isArray(rows) ? rows.length : VOICE_DEMO_MAX_INVALID_ATTEMPTS;
  return {
    blocked: count >= VOICE_DEMO_MAX_INVALID_ATTEMPTS,
    count,
  };
}

export async function isInvalidCodeRateLimited(
  callerKeyRaw: string
): Promise<boolean> {
  const key = hashCallerKey(callerKeyRaw || "unknown");
  const now = Date.now();
  const durable = isDurableProfileStoreConfigured() && !!supabaseConfig();

  if (!durable) {
    memoryCleanup(now);
    const times = memoryInvalidAttempts.get(key) || [];
    return times.length >= VOICE_DEMO_MAX_INVALID_ATTEMPTS;
  }

  const config = supabaseConfig()!;
  const since = new Date(now - VOICE_DEMO_RATE_WINDOW_MS).toISOString();
  const res = await supabaseFetch(
    "/rest/v1/voice_demo_invalid_attempts?caller_key=eq." +
      encodeURIComponent(key) +
      "&created_at=gte." +
      encodeURIComponent(since) +
      "&select=id",
    { key: config.key, method: "GET" }
  );
  if (!res.ok) return false;
  const rows = (await res.json()) as unknown[];
  return rows.length >= VOICE_DEMO_MAX_INVALID_ATTEMPTS;
}

/** Bind a Twilio CallSid to a validated demo session for initiation webhook resolution. */
export async function bindVoiceDemoCall(params: {
  callSid: string;
  demoId: string;
  sessionId: string;
}): Promise<void> {
  const callSid = params.callSid.trim();
  if (!callSid) return;
  const expiresAt = Date.now() + VOICE_DEMO_INACTIVITY_MS;
  const durable = isDurableProfileStoreConfigured() && !!supabaseConfig();

  if (!durable) {
    memoryCallBindings.set(callSid, {
      demoId: params.demoId,
      sessionId: params.sessionId,
      expiresAt,
    });
    return;
  }

  const config = supabaseConfig()!;
  await supabaseFetch("/rest/v1/voice_demo_call_bindings?on_conflict=call_sid", {
    key: config.key,
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      call_sid: callSid,
      demo_id: params.demoId,
      session_id: params.sessionId,
      expires_at: new Date(expiresAt).toISOString(),
    }),
  });
}

export async function lookupVoiceDemoCallBinding(
  callSidRaw: string
): Promise<{ demoId: string; sessionId: string } | null> {
  const callSid = callSidRaw.trim();
  if (!callSid) return null;
  const now = Date.now();
  const durable = isDurableProfileStoreConfigured() && !!supabaseConfig();

  if (!durable) {
    memoryCleanup(now);
    const binding = memoryCallBindings.get(callSid);
    if (!binding || binding.expiresAt <= now) return null;
    return { demoId: binding.demoId, sessionId: binding.sessionId };
  }

  const config = supabaseConfig()!;
  const res = await supabaseFetch(
    "/rest/v1/voice_demo_call_bindings?call_sid=eq." +
      encodeURIComponent(callSid) +
      "&expires_at=gt." +
      encodeURIComponent(new Date().toISOString()) +
      "&limit=1",
    { key: config.key, method: "GET" }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    demo_id?: string;
    session_id?: string;
  }>;
  const row = rows[0];
  if (!row?.demo_id || !row.session_id) return null;
  return { demoId: row.demo_id, sessionId: row.session_id };
}

/** Test-only helpers to reset in-memory stores. */
export function __resetVoiceDemoMemoryForTests() {
  memorySessions.clear();
  memoryByDemo.clear();
  memoryInvalidAttempts.clear();
  memoryCallBindings.clear();
}
