import { promises as fs } from "fs";
import path from "path";
import { BusinessProfile } from "../types/business";
import { StoredDemo } from "./demoStore";

const DATA_DIR = path.join(process.cwd(), ".data", "demos");

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export function sanitizeDemoId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9-_]/g, "");
}

function demoPath(id: string) {
  return path.join(DATA_DIR, `${sanitizeDemoId(id)}.json`);
}

export async function saveDemoRecord(
  id: string,
  profile: BusinessProfile
): Promise<StoredDemo> {
  await ensureDataDir();

  const record: StoredDemo = {
    id: sanitizeDemoId(id) || id,
    profile,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(demoPath(id), JSON.stringify(record, null, 2), "utf8");
  return record;
}

export async function loadDemoRecord(id: string): Promise<StoredDemo | null> {
  try {
    const raw = await fs.readFile(demoPath(id), "utf8");
    const parsed = JSON.parse(raw) as StoredDemo;
    if (!parsed?.profile?.businessName) return null;
    return parsed;
  } catch {
    return null;
  }
}
