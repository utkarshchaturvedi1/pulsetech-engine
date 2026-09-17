import { BusinessProfile } from "../types/business";

export type CreatedPersonalizedDemo = {
  id: string;
  profile: BusinessProfile;
  invitationPath: string;
};

export async function analyzeWebsite(
  website: string,
  additionalInfo: string = ""
): Promise<CreatedPersonalizedDemo> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      website,
      additionalInfo,
    }),
  });

  let payload: {
    id?: string;
    profile?: BusinessProfile;
    invitationPath?: string;
    businessName?: string;
    error?: string;
  } | null = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      payload?.error || "Website analysis failed. Please try again from the homepage."
    );
  }

  const profile = payload?.profile;
  const id = payload?.id?.trim() || "";

  if (!id || !profile || typeof profile.businessName !== "string" || !profile.businessName.trim()) {
    throw new Error("Website analysis returned an invalid business profile.");
  }

  return {
    id,
    profile,
    invitationPath:
      payload?.invitationPath || "/demo/" + encodeURIComponent(id),
  };
}
