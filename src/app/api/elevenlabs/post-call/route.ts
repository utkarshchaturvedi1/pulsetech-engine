import { after, NextRequest, NextResponse } from "next/server";
import { verifyElevenLabsSignature } from "../../../../lib/elevenlabsWebhook";
import { persistLiveClientLead } from "../../../../lib/persistClientLead";
import {
  logInboundVoiceResolution,
  resolvePostCallBusiness,
} from "../../../../lib/inboundVoice";
import {
  isPostCallTranscriptionEvent,
  processVoiceLeadHandoff,
  publicVoiceHandoffLog,
  scheduleVoiceLeadAlertDelivery,
} from "../../../../lib/voiceLeadHandoff";

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyElevenLabsSignature(raw, request.headers.get("elevenlabs-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { type?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isPostCallTranscriptionEvent(payload) || !payload.data) {
    console.log(
      "[voice-lead]",
      publicVoiceHandoffLog({
        eventType: payload.type || "(none)",
        conversationId: "(none)",
        demoResolved: false,
        extractedFields: {
          name: false,
          phone: false,
          address: false,
          preferredTiming: false,
          need: false,
        },
        voiceHandoffReady: false,
        queueStatus: "skipped",
        skipReason: "not_transcription",
      })
    );
    return NextResponse.json({
      ok: true,
      queued: false,
      skipReason: "not_transcription",
    });
  }

  const data = payload.data;
  const resolution = await resolvePostCallBusiness(data);
  logInboundVoiceResolution(resolution);

  const result = await processVoiceLeadHandoff({
    eventType: payload.type || "post_call_transcription",
    data,
    business: resolution.ok ? resolution.demo.profile : null,
    demoId: resolution.ok ? resolution.demoId : resolution.demoId,
    demoResolved: resolution.ok,
  });

  // Persist a complete live-client call lead even when SMS/email delivery fails.
  if (result.salesState) {
    try {
      const deliveryState = {
        ...result.salesState,
        leadDeliveryStatus: result.queueStatus === "sent" ? "SENT" as const
          : result.queueStatus === "queued" ? "QUEUED" as const
          : result.queueStatus === "failed" ? "FAILED" as const
          : result.salesState.leadDeliveryStatus,
      };
      await persistLiveClientLead(resolution.demoId, deliveryState);
    } catch (error) {
      console.error("[voice-lead] portal lead persistence failed", error);
    }
  }

  scheduleVoiceLeadAlertDelivery(after, result.delivery);

  return NextResponse.json({
    ok: true,
    queued: result.queueStatus === "queued" || result.queueStatus === "sent",
    delivered: false,
    queueStatus: result.queueStatus,
    skipReason: result.skipReason,
    voiceHandoffReady: result.voiceHandoffReady,
    conversationId: result.conversationId,
  });
}
