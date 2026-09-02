import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret || request.headers.get("elevenlabs-signature") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const event = await request.json();
  if (event.type !== "post_call_transcription") return NextResponse.json({ ok: true });
  console.log("ElevenLabs phone lead received", event.data?.conversation_id);
  return NextResponse.json({ ok: true });
}
