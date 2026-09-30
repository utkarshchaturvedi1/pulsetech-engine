import { NextRequest, NextResponse } from "next/server";
import { BusinessProfile } from "../../../../types/business";
import { loadSharedProfile, commitSharedProfile, ProfileUpdateConflict } from "../../../../lib/sharedProfileStore";
import { sanitizeDemoId } from "../../../../lib/demoRepository";

function isBusinessProfile(value: unknown): value is BusinessProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.businessName === "string" &&
    typeof profile.website === "string"
  );
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const demo = await loadSharedProfile(id);

    if (!demo) {
      return NextResponse.json({ error: "Demo not found." }, { status: 404 });
    }

    return NextResponse.json(demo);
  } catch (error) {
    console.error("GET /api/demo/[id] failed:", error);
    return NextResponse.json(
      { error: "Unable to load demo." },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const profile = body.profile;

    if (!isBusinessProfile(profile)) {
      return NextResponse.json(
        { error: "A valid business profile is required." },
        { status: 400 }
      );
    }

    const demoId = sanitizeDemoId(id);
    if (!demoId) {
      return NextResponse.json(
        { error: "A valid demo id is required." },
        { status: 400 }
      );
    }
    const stored = await loadSharedProfile(demoId);
    // This endpoint saves onboarding alert recipients. Owner instruction edits
    // go through /api/update-profile; a stale onboarding tab cannot revive an
    // old corrected rule or erase newer saved configuration.
    const nextProfile = stored ? {
      ...stored.profile,
      leadNotificationEmail: profile.leadNotificationEmail ?? stored.profile.leadNotificationEmail,
      leadNotificationPhone: profile.leadNotificationPhone ?? stored.profile.leadNotificationPhone,
    } : profile;
    const commit = await commitSharedProfile(demoId, nextProfile, stored ? stored.durableVersion || "" : undefined);
    if (!commit.persisted) {
      return NextResponse.json(
        {
          error: "Unable to save demo.",
          reason: commit.reason,
          persisted: false,
          durable: commit.durable,
          backend: commit.backend,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({
      ...commit.demo,
      persisted: commit.persisted,
      durable: commit.durable,
      backend: commit.backend,
    });
  } catch (error) {
    if (error instanceof ProfileUpdateConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("PUT /api/demo/[id] failed:", error);
    return NextResponse.json(
      { error: "Unable to save demo." },
      { status: 500 }
    );
  }
}
