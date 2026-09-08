import { NextRequest, NextResponse } from "next/server";
import { BusinessProfile } from "../../../../types/business";
import { loadSharedProfile, commitSharedProfile } from "../../../../lib/sharedProfileStore";
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
    const commit = await commitSharedProfile(demoId, profile);
    return NextResponse.json(commit.demo);
  } catch (error) {
    console.error("PUT /api/demo/[id] failed:", error);
    return NextResponse.json(
      { error: "Unable to save demo." },
      { status: 500 }
    );
  }
}
