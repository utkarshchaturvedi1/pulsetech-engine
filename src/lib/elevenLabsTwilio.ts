import type { ConversationInitiationResponse } from "./inboundVoice";

/**
 * ElevenLabs Twilio register-call handoff.
 * Docs: POST https://api.elevenlabs.io/v1/convai/twilio/register-call
 */
export async function registerElevenLabsTwilioCall(params: {
  agentId: string;
  fromNumber: string;
  toNumber: string;
  apiKey: string;
  conversationInitiationClientData: ConversationInitiationResponse;
}): Promise<{ ok: true; twiml: string } | { ok: false; error: string }> {
  const agentId = params.agentId.trim();
  const apiKey = params.apiKey.trim();
  if (!agentId || !apiKey) {
    return {
      ok: false,
      error: "ELEVENLABS_AGENT_ID and ELEVENLABS_API_KEY are required for voice demo handoff.",
    };
  }

  try {
    const response = await fetch(
      "https://api.elevenlabs.io/v1/convai/twilio/register-call",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          agent_id: agentId,
          from_number: params.fromNumber,
          to_number: params.toNumber,
          direction: "inbound",
          conversation_initiation_client_data: params.conversationInitiationClientData,
        }),
      }
    );

    const text = await response.text();
    if (!response.ok) {
      console.error(
        "[voice-demo] ElevenLabs register-call failed status=" + response.status
      );
      return {
        ok: false,
        error: "ElevenLabs register-call failed.",
      };
    }

    if (!text.includes("<Response") && !text.includes("<Connect")) {
      console.error("[voice-demo] ElevenLabs register-call returned non-TwiML body");
      return { ok: false, error: "ElevenLabs register-call returned invalid TwiML." };
    }

    return { ok: true, twiml: text };
  } catch {
    return { ok: false, error: "ElevenLabs register-call network error." };
  }
}
