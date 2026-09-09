import { NextRequest, NextResponse } from "next/server";
import { registerElevenLabsTwilioCall } from "../../../../lib/elevenLabsTwilio";
import {
  buildConversationInitiationResponse,
} from "../../../../lib/inboundVoice";
import { loadSharedProfile } from "../../../../lib/sharedProfileStore";
import { isVoiceDemoPublicNumber } from "../../../../lib/voiceDemoNumbers";
import {
  bindVoiceDemoCall,
  isInvalidCodeRateLimited,
  lookupVoiceDemoSessionByCode,
  markVoiceDemoSessionUsed,
  recordInvalidCodeAttempt,
} from "../../../../lib/voiceDemoSession";
import {
  buildVoiceDemoGatherTwiml,
  buildVoiceDemoInvalidCodeTwiml,
  buildVoiceDemoRateLimitedTwiml,
  buildVoiceDemoUnavailableTwiml,
  twilioFormFromSearchParams,
  verifyTwilioSignature,
} from "../../../../lib/twilioVoiceDemo";

function xml(twiml: string, status = 200) {
  return new NextResponse(twiml, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function absoluteActionUrl(request: NextRequest): string {
  const configured = process.env.PULSETECH_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (configured) {
    return configured + "/api/twilio/voice-demo";
  }
  const url = new URL(request.url);
  return url.origin + "/api/twilio/voice-demo";
}

export async function POST(request: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  const rawBody = await request.text();
  const form = twilioFormFromSearchParams(new URLSearchParams(rawBody));

  const signature = request.headers.get("x-twilio-signature");
  const webhookUrl = absoluteActionUrl(request);

  // In production, require valid Twilio signatures when auth token is configured.
  if (authToken) {
    const ok = verifyTwilioSignature({
      authToken,
      signature,
      url: webhookUrl,
      form,
    });
    if (!ok) {
      // Retry with the request URL as received (proxy may differ).
      const altOk = verifyTwilioSignature({
        authToken,
        signature,
        url: request.url.split("?")[0],
        form,
      });
      if (!altOk) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[voice-demo] TWILIO_AUTH_TOKEN missing in production");
    return xml(buildVoiceDemoUnavailableTwiml());
  }

  const toNumber = form.To || "";
  const fromNumber = form.From || "";
  const callSid = form.CallSid || "";
  const digits = (form.Digits || "").replace(/\D/g, "");

  if (!isVoiceDemoPublicNumber(toNumber)) {
    // Never handle private/client numbers here — preserve Texas Solar direct routing.
    return xml(buildVoiceDemoUnavailableTwiml());
  }

  // First leg: collect the access code with a neutral greeting.
  if (!digits) {
    return xml(buildVoiceDemoGatherTwiml(webhookUrl));
  }

  const rateKey = callSid || fromNumber || "unknown";
  if (await isInvalidCodeRateLimited(rateKey)) {
    return xml(buildVoiceDemoRateLimitedTwiml());
  }

  const session = await lookupVoiceDemoSessionByCode(digits);
  if (!session) {
    await recordInvalidCodeAttempt(rateKey);
    return xml(buildVoiceDemoInvalidCodeTwiml());
  }

  const demo = await loadSharedProfile(session.demoId);
  if (!demo?.profile?.businessName || demo.id !== session.demoId) {
    await recordInvalidCodeAttempt(rateKey);
    return xml(buildVoiceDemoInvalidCodeTwiml());
  }

  await markVoiceDemoSessionUsed(session.id);
  await bindVoiceDemoCall({
    callSid,
    demoId: demo.id,
    sessionId: session.id,
  });

  const initiation = buildConversationInitiationResponse({
    ok: true,
    calledNumber: toNumber,
    demoId: demo.id,
    demo,
  });
  initiation.dynamic_variables.voice_demo = true;
  initiation.dynamic_variables.voice_demo_session_id = session.id;

  const agentId = process.env.ELEVENLABS_AGENT_ID?.trim() || "";
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim() || "";

  const registered = await registerElevenLabsTwilioCall({
    agentId,
    apiKey,
    fromNumber,
    toNumber,
    conversationInitiationClientData: initiation,
  });

  if (!registered.ok) {
    console.error("[voice-demo] handoff unavailable");
    return xml(buildVoiceDemoUnavailableTwiml());
  }

  return xml(registered.twiml);
}
