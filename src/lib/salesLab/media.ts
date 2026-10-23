import { createHash } from "node:crypto";
import { LabError, labDatabaseConfig, validLabId } from "./store";
import { validConversation } from "./leads";
export type PhotoSummary = { id: string; fileName: string; conversationId: string };
const maxPhotoBytes = 2 * 1024 * 1024;
export function validatePhoto(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > maxPhotoBytes) throw new LabError("Please choose a photo smaller than 2 MB.");
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = Buffer.from(bytes.slice(0, 4)).toString() === "RIFF" && Buffer.from(bytes.slice(8, 12)).toString() === "WEBP";
  if (!(mime === "image/png" && png || mime === "image/jpeg" && jpeg || mime === "image/webp" && webp)) throw new LabError("Please upload a JPG, PNG, or WebP photo.");
}
export async function listPhotos(labId: string, conversationId?: string): Promise<PhotoSummary[]> {
  validLabId(labId);
  if (conversationId) validConversation(conversationId);
  const { url, headers } = labDatabaseConfig();
  const response = await fetch(`${url}/rest/v1/business_profiles?profile->>kind=eq.independent-sales-lab-photo-v1&profile->>labId=eq.${labId}${conversationId ? `&profile->>conversationId=eq.${conversationId}` : ""}&select=id,fileName:profile->>fileName,conversationId:profile->>conversationId&limit=300`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new LabError("Photos are temporarily unavailable. Please try again.", 503);
  return response.json();
}
export async function savePhoto(labId: string, conversationId: string, file: File) {
  validLabId(labId); validConversation(conversationId);
  if (file.size > maxPhotoBytes) throw new LabError("Please choose a photo smaller than 2 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  validatePhoto(bytes, file.type);
  const photos = await listPhotos(labId, conversationId);
  if (photos.length >= 3) throw new LabError("You can share up to three photos per conversation.");
  const slot = photos.length;
  const id = "saleslab-photo-" + createHash("sha256").update(`${labId}:${conversationId}:${slot}`).digest("hex");
  const fileName = file.name.replace(/[\r\n]/g, " ").slice(0, 120);
  const { url, headers } = labDatabaseConfig();
  const response = await fetch(`${url}/rest/v1/business_profiles`, { method: "POST", headers, body: JSON.stringify({ id, profile: { kind: "independent-sales-lab-photo-v1", labId, conversationId, fileName, mime: file.type, dataUrl: `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}` }, updated_at: new Date().toISOString() }), signal: AbortSignal.timeout(15000) });
  if (response.status === 409) throw new LabError("Another photo was uploaded at the same time. Please retry.", 409);
  if (!response.ok) throw new LabError("The photo could not be saved. Please retry.", 503);
  return { id, fileName, conversationId };
}
export async function readPhoto(labId: string, photoId: string, conversationId?: string): Promise<string> {
  validLabId(labId);
  if (!/^saleslab-photo-[a-f0-9]{64}$/.test(photoId)) throw new LabError("Invalid photo.");
  const { url, headers } = labDatabaseConfig();
  const response = await fetch(`${url}/rest/v1/business_profiles?id=eq.${photoId}&select=profile`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new LabError("The photo is temporarily unavailable.", 503);
  const row = (await response.json())[0]?.profile;
  if (row?.kind !== "independent-sales-lab-photo-v1" || row.labId !== labId || (conversationId && row.conversationId !== conversationId) || typeof row.dataUrl !== "string") throw new LabError("Photo not found.", 404);
  return row.dataUrl;
}
