import { BusinessProfile } from "../types/business";

export function demoIdFromWebsite(website: string): string {
  try {
    const normalized = /^https?:\/\//i.test(website)
      ? website
      : `https://${website}`;
    const host = new URL(normalized).hostname.replace(/^www\./i, "");
    const slug = host.split(".")[0] || host;
    return slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  } catch {
    return website
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 48) || "demo";
  }
}

export type StoredDemo = {
  id: string;
  profile: BusinessProfile;
  updatedAt: string;
};

const memoryStore = new Map<string, StoredDemo>();

function storageKey(id: string) {
  return `pulsetech-demo:${id}`;
}

export function saveDemoLocal(demo: StoredDemo) {
  memoryStore.set(demo.id, demo);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey(demo.id), JSON.stringify(demo));
    } catch {
      // Ignore quota / private mode failures.
    }
  }
}

export function loadDemoLocal(id: string): StoredDemo | null {
  if (memoryStore.has(id)) {
    return memoryStore.get(id) || null;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDemo;
    if (!parsed?.profile?.businessName) return null;
    memoryStore.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}

const PENDING_DEMO_KEY = "pulsetech-pending-demo";

export function savePendingDemo(demo: StoredDemo) {
  saveDemoLocal(demo);

  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(PENDING_DEMO_KEY, JSON.stringify(demo));
    } catch {
      // Ignore storage failures.
    }
  }
}

export function consumePendingDemo(): StoredDemo | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(PENDING_DEMO_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_DEMO_KEY);
    const parsed = JSON.parse(raw) as StoredDemo;
    if (!parsed?.profile?.businessName) return null;
    saveDemoLocal(parsed);
    return parsed;
  } catch {
    return null;
  }
}
