import { createHash } from "node:crypto";
import { ChatError, chatDatabaseConfig, validBusinessId } from "./store";
import { validConversation } from "./store";
export type PhotoSummary = { id: string; fileName: string; conversationId: string };
const maxPhotoBytes = 2 * 1024 * 1024;
export function validatePhoto(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > maxPhotoBytes) throw new ChatError("Please choose a photo smaller than 2 MB.");
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = Buffer.from(bytes.slice(0, 4)).toString() === "RIFF" && Buffer.from(bytes.slice(8, 12)).toString() === "WEBP";
  if (!(mime === "image/png" && png || mime === "image/jpeg" && jpeg || mime === "image/webp" && webp)) throw new ChatError("Please upload a JPG, PNG, or WebP photo.");
}
export async function listPhotos(businessId: string, conversationId?: string): Promise<PhotoSummary[]> {
  validBusinessId(businessId);
  if (conversationId) validConversation(conversationId);
  const { url, headers } = chatDatabaseConfig();
  const response = await fetch(`${url}/rest/v1/business_profiles?profile->>kind=eq.business-chat-photo-v1&profile->>businessId=eq.${businessId}${conversationId ? `&profile->>conversationId=eq.${conversationId}` : ""}&select=id,fileName:profile->>fileName,conversationId:profile->>conversationId&limit=300`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new ChatError("Photos are temporarily unavailable. Please try again.", 503);
  return response.json();
}
export async function savePhoto(businessId: string, conversationId: string, file: File) {
  validBusinessId(businessId); validConversation(conversationId);
  if (file.size > maxPhotoBytes) throw new ChatError("Please choose a photo smaller than 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  validatePhoto(bytes, file.type);
  const photos = await listPhotos(businessId, conversationId);
  if (photos.length >= 3) throw new ChatError("You can share up to three photos per conversation.");
  const slot = photos.length;
  const id = "businesschat-photo-" + createHash("sha256").update(`${businessId}:${conversationId}:${slot}`).digest("hex");
  const fileName = file.name.replace(/[\r\n]/g, " ").slice(0, 120);
  const { url, headers } = chatDatabaseConfig();
  const response = await fetch(`${url}/rest/v1/business_profiles`, { method: "POST", headers, body: JSON.stringify({ id, profile: { kind: "business-chat-photo-v1", businessId, conversationId, fileName, mime: file.type, dataUrl: `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}` }, updated_at: new Date().toISOString() }), signal: AbortSignal.timeout(15000) });
  if (response.status === 409) throw new ChatError("Another photo was uploaded at the same time. Please retry.", 409);
  if (!response.ok) throw new ChatError("The photo could not be saved. Please retry.", 503);
  return { id, fileName, conversationId };
}
export async function readPhoto(businessId: string, photoId: string, conversationId?: string): Promise<string> {
  validBusinessId(businessId);
  if (!/^businesschat-photo-[a-f0-9]{64}$/.test(photoId)) throw new ChatError("Invalid photo.");
  const { url, headers } = chatDatabaseConfig();
  const response = await fetch(`${url}/rest/v1/business_profiles?id=eq.${photoId}&select=profile`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new ChatError("The photo is temporarily unavailable.", 503);
  const row = (await response.json())[0]?.profile;
  if (row?.kind !== "business-chat-photo-v1" || row.businessId !== businessId || (conversationId && row.conversationId !== conversationId) || typeof row.dataUrl !== "string") throw new ChatError("Photo not found.", 404);
  return row.dataUrl;
}
