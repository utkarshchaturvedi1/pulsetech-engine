import { NextRequest, NextResponse } from "next/server";
import { BusinessProfile } from "../../../types/business";
import { handleLeadNotificationOwnerText } from "../../../lib/leadNotificationConfig";
import { applyOwnerFeedbackToProfile } from "../../../lib/updateBusinessProfile";

function isBusinessProfile(value: unknown): value is BusinessProfile {
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
    const body = await request.json();
    const business = body.business;
    const feedback =
      typeof body.feedback === "string" ? body.feedback.trim() : "";

    if (!isBusinessProfile(business)) {
      return NextResponse.json(
        { error: "A valid business profile is required." },
        { status: 400 }
      );
    }

    if (!feedback) {
      return NextResponse.json(
        { error: "Feedback is required." },
        { status: 400 }
      );
    }

    const notificationOnly = handleLeadNotificationOwnerText(
      typeof business.leadNotificationEmail === "string"
        ? business.leadNotificationEmail
        : undefined,
      feedback
    );

    if (notificationOnly.kind === "passthrough" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Update service is not configured." },
        { status: 500 }
      );
    }

    const result = await applyOwnerFeedbackToProfile(business, feedback);

    return NextResponse.json(result);
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
