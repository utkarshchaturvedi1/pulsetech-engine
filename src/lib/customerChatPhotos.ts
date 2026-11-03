import { createClient } from "@supabase/supabase-js";

export const CUSTOMER_CHAT_PHOTO_BUCKET = "customer-chat-photos";
export const CUSTOMER_CHAT_PHOTO_LIMIT = 3;
export const CUSTOMER_CHAT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const CUSTOMER_CHAT_PHOTO_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const EXTENSIONS: Record<(typeof CUSTOMER_CHAT_PHOTO_MIME_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function storageAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Customer photo storage is not configured.");
  return { url, key, client: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) };
}

async function ensurePrivateBucket() {
  const { client } = storageAdmin();
  const { data, error } = await client.storage.listBuckets();
  if (error) throw error;
  if (!data.some((bucket) => bucket.id === CUSTOMER_CHAT_PHOTO_BUCKET)) {
    const { error: createError } = await client.storage.createBucket(CUSTOMER_CHAT_PHOTO_BUCKET, {
      public: false,
      fileSizeLimit: CUSTOMER_CHAT_PHOTO_MAX_BYTES,
      allowedMimeTypes: [...CUSTOMER_CHAT_PHOTO_MIME_TYPES],
    });
    if (createError && !/already exists/i.test(createError.message)) throw createError;
  }
  return client;
}

export function customerPhotoExtension(mimeType: string): string | null {
  return EXTENSIONS[mimeType as keyof typeof EXTENSIONS] || null;
}

export function validCustomerPhotoIdentity(demoId: unknown, conversationId: unknown): demoId is string {
  return typeof demoId === "string" && /^[a-z0-9_-]{2,120}$/i.test(demoId) &&
    typeof conversationId === "string" && /^[a-z0-9_-]{8,120}$/i.test(conversationId);
}

export function normalizeCustomerPhotoPaths(value: unknown, demoId: string, conversationId: string): string[] {
  if (!Array.isArray(value) || !validCustomerPhotoIdentity(demoId, conversationId)) return [];
  const prefix = `${demoId}/${conversationId}/`;
  const paths = value.filter((path): path is string =>
    typeof path === "string" && path.startsWith(prefix) &&
    new RegExp(`^${demoId}/${conversationId}/photo-[1-${CUSTOMER_CHAT_PHOTO_LIMIT}]\\.(jpg|png|webp)$`, "i").test(path)
  );
  return [...new Set(paths)].slice(0, CUSTOMER_CHAT_PHOTO_LIMIT);
}

export async function createCustomerPhotoUpload(demoId: string, conversationId: string, slot: number, mimeType: string) {
  const extension = customerPhotoExtension(mimeType);
  if (!extension || !Number.isInteger(slot) || slot < 1 || slot > CUSTOMER_CHAT_PHOTO_LIMIT) {
    throw new Error("Choose a JPEG, PNG, or WebP photo. You can add up to three.");
  }

  const client = await ensurePrivateBucket();
  const folder = `${demoId}/${conversationId}`;
  const { data: existing, error: listError } = await client.storage.from(CUSTOMER_CHAT_PHOTO_BUCKET).list(folder, { limit: 10 });
  if (listError) throw listError;
  if (existing?.some((item) => new RegExp(`^photo-${slot}\\.(jpg|png|webp)$`, "i").test(item.name))) {
    throw new Error("That photo slot is already used. Start a new chat to add different photos.");
  }

  const path = `${folder}/photo-${slot}.${extension}`;
  const { data, error } = await client.storage.from(CUSTOMER_CHAT_PHOTO_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  const { url } = storageAdmin();
  return { path, signedUrl: data.signedUrl, supabaseUrl: url, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || "" };
}

export async function signCustomerPhotoLinks(demoId: string, conversationId: string, value: unknown): Promise<string[]> {
  const paths = normalizeCustomerPhotoPaths(value, demoId, conversationId);
  if (!paths.length) return [];
  const client = await ensurePrivateBucket();
  const { data, error } = await client.storage.from(CUSTOMER_CHAT_PHOTO_BUCKET).createSignedUrls(paths, 60 * 60 * 24 * 7);
  if (error) throw error;
  return (data || []).map((item) => item.signedUrl).filter((url): url is string => typeof url === "string");
}
