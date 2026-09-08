import { NextRequest, NextResponse } from "next/server";
import { BusinessProfile } from "../../../types/business";
import { sanitizeDemoId } from "../../../lib/demoRepository";
import {
  buildOwnerUpdateReply,
  summarizeOwnerProfileChanges,
} from "../../../lib/ownerProfileUpdate";
import {
  commitSharedProfile,
  loadSharedProfile,
} from "../../../lib/sharedProfileStore";
import { applyOwnerFeedbackToProfile } from "../../../lib/updateBusinessProfile";

function isBusinessProfile(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.businessName === "string" &&
    typeof profile.website === "string" &&
    typeof profile.systemPrompt === "string"
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Update service is not configured." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const demoId = sanitizeDemoId(
      typeof body.demoId === "string" ? body.demoId : ""
    );
    const feedback =
      typeof body.feedback === "string" ? body.feedback.trim() : "";
    const clientProfile = body.business;

    if (!demoId) {
      return NextResponse.json(
        { error: "A valid demoId is required." },
        { status: 400 }
      );
    }

    if (!feedback) {
      return NextResponse.json(
        { error: "Feedback is required." },
        { status: 400 }
      );
    }

    const stored = await loadSharedProfile(demoId);
    const base = stored?.profile;
    if (!base) {
      if (!isBusinessProfile(clientProfile)) {
        return NextResponse.json(
          { error: "A valid business profile is required." },
          { status: 400 }
        );
      }
    }

    const current = base || (clientProfile as BusinessProfile);
    const result = await applyOwnerFeedbackToProfile(current, feedback);
    const commit = await commitSharedProfile(demoId, result.profile);
    const changes = summarizeOwnerProfileChanges(current, commit.demo.profile);
    const reply = commit.persisted
      ? result.reply || buildOwnerUpdateReply(changes, true)
      : buildOwnerUpdateReply(changes, false);

    return NextResponse.json({
      profile: commit.demo.profile,
      reply,
      changes,
      persisted: commit.persisted,
      durable: commit.durable,
      backend: commit.backend,
      demoId: commit.demo.id,
    });
  } catch (error) {
    console.error("POST /api/update-profile failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update the business profile.",
      },
      { status: 500 }
    );
  }
}
