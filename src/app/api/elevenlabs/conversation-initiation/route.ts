import { NextRequest, NextResponse } from "next/server";
import { authorizeConversationInitiation } from "../../../../lib/elevenlabsWebhook";
import {
  buildConversationInitiationResponse,
  extractCalledNumberFromInitiationPayload,
  logInboundVoiceResolution,
  resolveInboundVoice,
  resolveVoiceDemoBoundCall,
} from "../../../../lib/inboundVoice";
import { isVoiceDemoPublicNumber } from "../../../../lib/voiceDemoNumbers";
import { lookupVoiceDemoCallBinding } from "../../../../lib/voiceDemoSession";

function extractCallSid(payload: Record<string, unknown>): string {
  const direct = payload.call_sid ?? payload.CallSid;
  if (typeof direct === "string") return direct;
  const nested = payload.data;
  if (nested && typeof nested === "object") {
    const inner = nested as Record<string, unknown>;
    const sid = inner.call_sid ?? inner.CallSid;
    if (typeof sid === "string") return sid;
  }
  const metadata = payload.metadata;
  if (metadata && typeof metadata === "object") {
    const sid = (metadata as Record<string, unknown>).call_sid;
    if (typeof sid === "string") return sid;
  }
  return "";
}

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
  const callSid = extractCallSid(payload);

  let resolution;
  if (isVoiceDemoPublicNumber(calledNumber)) {
    // Never map a shared public demo number to a fixed business.
    // Only a CallSid binding created after access-code validation may resolve.
    resolution = await resolveVoiceDemoBoundCall({
      callSid,
      calledNumberRaw: calledNumber,
    });
  } else {
    // Private / paying-client numbers (including Texas Solar test DID) — unchanged.
    resolution = await resolveInboundVoice(calledNumber);
  }

  logInboundVoiceResolution(resolution);
  const response = buildConversationInitiationResponse(resolution);

  if (resolution.ok && callSid && isVoiceDemoPublicNumber(calledNumber)) {
    const binding = await lookupVoiceDemoCallBinding(callSid);
    if (binding && binding.demoId === resolution.demoId) {
      response.dynamic_variables.voice_demo = true;
      response.dynamic_variables.voice_demo_session_id = binding.sessionId;
    }
  }

  return NextResponse.json(response);
}
