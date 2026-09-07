import { NextRequest, NextResponse } from "next/server";
import { authorizeConversationInitiation } from "../../../../lib/elevenlabsWebhook";
import {
  buildConversationInitiationResponse,
  extractCalledNumberFromInitiationPayload,
  logInboundVoiceResolution,
  resolveInboundVoice,
} from "../../../../lib/inboundVoice";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!authorizeConversationInitiation(raw, request.headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const calledNumber = extractCalledNumberFromInitiationPayload(payload);
  const resolution = await resolveInboundVoice(calledNumber);
  logInboundVoiceResolution(resolution);

  return NextResponse.json(buildConversationInitiationResponse(resolution));
}
