import { NextResponse } from "next/server";
import { loadSharedProfile } from "@/lib/sharedProfileStore";
import { storeCustomerPhotoUpload, validCustomerPhotoIdentity } from "@/lib/customerChatPhotos";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const demoId = form.get("demoId");
    const conversationId = form.get("conversationId");
    if (!validCustomerPhotoIdentity(demoId, conversationId) || typeof conversationId !== "string") {
      return NextResponse.json({ error: "Reopen the chat and try again." }, { status: 400 });
    }
    const slot = Number(form.get("slot"));
    const photo = form.get("photo");
    if (!(photo instanceof File)) {
      return NextResponse.json({ error: "Choose a supported photo." }, { status: 400 });
    }
    const profile = await loadSharedProfile(demoId);
    if (!profile) return NextResponse.json({ error: "This chat is unavailable." }, { status: 404 });

    const upload = await storeCustomerPhotoUpload(demoId, conversationId, slot, photo);
    return NextResponse.json(upload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Photo upload is unavailable.";
    const status = /slot is already used/i.test(message) ? 409 : /Choose a JPEG|5 MB limit/i.test(message) ? 400 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
