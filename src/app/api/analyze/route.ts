import { NextRequest, NextResponse } from "next/server";

import { fetchWebsite } from "../../../lib/fetchWebsite";
import { cleanHtml } from "../../../lib/cleanHtml";
import { analyzeBusiness } from "../../../lib/aiAnalyzer";
import { extractSiteIcon } from "../../../lib/siteIcon";
import { createBusinessProfile } from "../../../lib/businessProfile";

function normalizeWebsite(website: string): string {
  const trimmed = website.trim();

  if (!trimmed) {
    return trimmed;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const website = normalizeWebsite(body.website ?? "");
    const additionalInfo =
      typeof body.additionalInfo === "string" ? body.additionalInfo.trim() : "";

    if (!website) {
      return NextResponse.json(
        {
          error: "Website is required.",
        },
        {
          status: 400,
        }
      );
    }

    const html = await fetchWebsite(website);

    const cleanedHtml = cleanHtml(html);

    const business = await analyzeBusiness(
      website,
      cleanedHtml,
      additionalInfo
    );

    const siteIcon = extractSiteIcon(html, website);

    return NextResponse.json(
      createBusinessProfile({
        ...business,
        siteIcon: siteIcon || business.siteIcon,
      })
    );
  } catch (error) {
    console.error("POST /api/analyze failed:", error);

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Unable to analyze website.";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}
