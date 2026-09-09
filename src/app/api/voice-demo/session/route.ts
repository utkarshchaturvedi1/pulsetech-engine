import { NextRequest, NextResponse } from "next/server";
import { loadSharedProfile } from "../../../../lib/sharedProfileStore";
import { sanitizeDemoId } from "../../../../lib/demoRepository";
import {
  createOrReuseVoiceDemoSession,
  touchVoiceDemoSession,
} from "../../../../lib/voiceDemoSession";
import { VOICE_DEMO_DISCLAIMER } from "../../../../lib/voiceDemoCopy";
import {
  formatVoiceDemoPhoneDisplay,
  getPrimaryVoiceDemoPhone,
  shouldShowVoiceDemoComingSoon,
} from "../../../../lib/voiceDemoNumbers";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      demoId?: string;
      forceNew?: boolean;
      refreshSessionId?: string;
    };

    const demoId = sanitizeDemoId(body.demoId || "");
    if (!demoId) {
      return NextResponse.json({ error: "demoId is required." }, { status: 400 });
    }

    const profile = await loadSharedProfile(demoId);
    if (!profile?.profile?.businessName) {
      return NextResponse.json({ error: "Demo profile not found." }, { status: 404 });
    }

    const phone = getPrimaryVoiceDemoPhone();
    if (!phone) {
      if (shouldShowVoiceDemoComingSoon()) {
        return NextResponse.json({
          enabled: false,
          phoneNumber: null,
          message: "Voice demo will be enabled shortly",
          disclaimer: VOICE_DEMO_DISCLAIMER,
          session: null,
        });
      }
      return NextResponse.json({
        enabled: false,
        phoneNumber: null,
        message: null,
        disclaimer: VOICE_DEMO_DISCLAIMER,
        session: null,
      });
    }

    let session;
    if (body.refreshSessionId && !body.forceNew) {
      try {
        session = await touchVoiceDemoSession(body.refreshSessionId);
        if (session.demoId !== demoId) {
          return NextResponse.json(
            { error: "Session does not belong to this demo." },
            { status: 403 }
          );
        }
      } catch {
        session = await createOrReuseVoiceDemoSession(demoId);
      }
    } else {
      session = await createOrReuseVoiceDemoSession(demoId, {
        forceNew: Boolean(body.forceNew),
      });
    }

    if (session.demoId !== demoId) {
      return NextResponse.json(
        { error: "Session isolation failure." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      enabled: true,
      phoneNumber: formatVoiceDemoPhoneDisplay(phone),
      phoneNumberE164: phone,
      message: null,
      disclaimer: VOICE_DEMO_DISCLAIMER,
      session: {
        id: session.id,
        code: session.code,
        demoId: session.demoId,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
      },
    });
  } catch (error) {
    console.error("POST /api/voice-demo/session failed");
    return NextResponse.json(
      { error: "Unable to create voice demo session." },
      { status: 500 }
    );
  }
}
