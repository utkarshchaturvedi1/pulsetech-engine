import { BusinessProfile } from "../types/business";

export async function analyzeWebsite(
  website: string,
  additionalInfo: string = ""
): Promise<BusinessProfile> {
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

  let payload: (Partial<BusinessProfile> & { error?: string }) | null = null;

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

  if (!payload || typeof payload.businessName !== "string") {
    throw new Error("Website analysis returned an invalid business profile.");
  }

  return payload as BusinessProfile;
}
