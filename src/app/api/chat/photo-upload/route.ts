import { NextResponse } from "next/server";
import { loadSharedProfile } from "@/lib/sharedProfileStore";
import { createCustomerPhotoUpload, validCustomerPhotoIdentity } from "@/lib/customerChatPhotos";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let stage = "parse";
  try {
    const body = await request.json();
    if (!validCustomerPhotoIdentity(body.demoId, body.conversationId)) {
      return NextResponse.json({ error: "Reopen the chat and try again." }, { status: 400 });
    }
    const { demoId, conversationId } = body as { demoId: string; conversationId: string };
    const slot = Number(body.slot);
    if (typeof body.contentType !== "string") {
      return NextResponse.json({ error: "Choose a supported photo." }, { status: 400 });
    }
    stage = "load-chat";
    const profile = await loadSharedProfile(demoId);
    if (!profile) return NextResponse.json({ error: "This chat is unavailable." }, { status: 404 });

    stage = "prepare-storage";
    const upload = await createCustomerPhotoUpload(demoId, conversationId, slot, body.contentType);
    if (!upload.anonKey) return NextResponse.json({ error: "Photo uploads are not configured." }, { status: 503 });
    return NextResponse.json(upload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Photo upload is unavailable.";
    console.error("[chat-photo-upload] failed", { stage, error: message });
    const status = /slot is already used/i.test(message) ? 409 : /Choose a JPEG/i.test(message) ? 400 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
