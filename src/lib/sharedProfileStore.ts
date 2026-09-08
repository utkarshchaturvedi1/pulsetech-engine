import { getBundledTestDemo } from "../data/testBusinessProfiles";
import { BusinessProfile } from "../types/business";
import {
  loadDemoRecord,
  saveDemoRecord,
  sanitizeDemoId,
} from "./demoRepository";
import { StoredDemo } from "./demoStore";
import { mergeOwnerProfileUpdate, type OwnerProfilePatch } from "./ownerProfileUpdate";

export type ProfileStoreBackend = "supabase" | "filesystem" | "none";

export type SharedProfileCommitResult = {
  demo: StoredDemo;
  persisted: boolean;
  durable: boolean;
  backend: ProfileStoreBackend;
  reason: string;
};

function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

export function isDurableProfileStoreConfigured(): boolean {
  return supabaseConfig() !== null;
}

export function isEphemeralRuntime(): boolean {
  return process.env.VERCEL === "1";
}

async function saveSupabaseRecord(
  record: StoredDemo
): Promise<boolean> {
  const config = supabaseConfig();
  if (!config) return false;
  const response = await fetch(
    config.url + "/rest/v1/business_profiles?on_conflict=id",
    {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: "Bearer " + config.key,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id: record.id,
        profile: record.profile,
        updated_at: record.updatedAt,
      }),
    }
  );
  return response.ok;
}

async function loadSupabaseRecord(id: string): Promise<StoredDemo | null> {
  const config = supabaseConfig();
  if (!config) return null;
  const safe = sanitizeDemoId(id);
  if (!safe) return null;
  const response = await fetch(
    config.url +
      "/rest/v1/business_profiles?id=eq." +
      encodeURIComponent(safe) +
      "&select=id,profile,updated_at",
    {
      headers: {
        apikey: config.key,
        Authorization: "Bearer " + config.key,
      },
      cache: "no-store",
    }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{
    id?: string;
    profile?: BusinessProfile;
    updated_at?: string;
  }>;
  const row = rows[0];
  if (!row?.profile?.businessName) return null;
  return {
    id: row.id || safe,
    profile: row.profile,
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

function markTestData(id: string, demo: StoredDemo): StoredDemo {
  if (!getBundledTestDemo(id)) return demo;
  return {
    ...demo,
    profile: { ...demo.profile, isTestData: true },
  };
}

/** Shared BusinessProfile lookup for website demo and inbound voice. */
export async function loadSharedProfile(
  id: string
): Promise<StoredDemo | null> {
  const safe = sanitizeDemoId(id);
  if (!safe) return null;

  const fromSupabase = await loadSupabaseRecord(safe);
  if (fromSupabase) return markTestData(safe, fromSupabase);

  const fromDisk = await loadDemoRecord(safe);
  if (fromDisk) return markTestData(safe, fromDisk);

  return getBundledTestDemo(safe);
}

export async function commitSharedProfile(
  id: string,
  profile: BusinessProfile
): Promise<SharedProfileCommitResult> {
  const safe = sanitizeDemoId(id);
  if (!safe) {
    throw new Error("A valid demo id is required.");
  }

  let demo = await saveDemoRecord(safe, profile);
  demo = markTestData(safe, demo);

  const durableConfigured = isDurableProfileStoreConfigured();
  let supabaseOk = false;
  if (durableConfigured) {
    supabaseOk = await saveSupabaseRecord(demo);
    if (supabaseOk) {
      return {
        demo,
        persisted: true,
        durable: true,
        backend: "supabase",
        reason: "saved to durable business_profiles store",
      };
    }
  }

  const localOk = Boolean(demo.profile.businessName);
  const ephemeral = isEphemeralRuntime();
  if (localOk && !ephemeral) {
    return {
      demo,
      persisted: true,
      durable: false,
      backend: "filesystem",
      reason: "saved to local .data/demos filesystem (not durable on Vercel)",
    };
  }

  return {
    demo,
    persisted: false,
    durable: false,
    backend: durableConfigured ? "supabase" : ephemeral ? "none" : "filesystem",
    reason: durableConfigured
      ? "durable store save failed; Vercel filesystem is ephemeral"
      : "no durable store configured; Vercel filesystem is ephemeral",
  };
}

export async function applyOwnerPatchToSharedProfile(
  demoId: string,
  patch: OwnerProfilePatch
): Promise<SharedProfileCommitResult> {
  const stored = await loadSharedProfile(demoId);
  if (!stored?.profile) {
    throw new Error("Shared profile not found for demoId " + demoId);
  }
  const next = mergeOwnerProfileUpdate(stored.profile, patch);
  return commitSharedProfile(demoId, next);
}
