import { NextRequest, NextResponse } from "next/server";

import { BusinessProfile } from "../../../types/business";
import {
  generateSalesReply,
  SalesChatMessage,
} from "../../../lib/salesChat";
import { isSalesState, SalesState } from "../../../lib/salesState";

function isBusinessProfile(value: unknown): value is BusinessProfile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const profile = value as Record<string, unknown>;

  return (
    typeof profile.businessName === "string" &&
    typeof profile.website === "string" &&
    typeof profile.systemPrompt === "string" &&
    Array.isArray(profile.services) &&
    Array.isArray(profile.serviceAreas) &&
    Array.isArray(profile.faqs) &&
    Array.isArray(profile.leadQuestions)
  );
}

function isChatMessages(value: unknown): value is SalesChatMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  return value.every((message) => {
    if (!message || typeof message !== "object") {
      return false;
    }

    const item = message as Record<string, unknown>;

    return (
      (item.role === "user" || item.role === "assistant") &&
      typeof item.content === "string" &&
      item.content.trim().length > 0
    );
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Chat service is not configured." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const business = body.business;
    const messages = body.messages;
    const previousState: SalesState | null = isSalesState(body.salesState)
      ? body.salesState
      : null;

    if (!isBusinessProfile(business)) {
      return NextResponse.json(
        { error: "A valid business profile is required." },
        { status: 400 }
      );
    }

    if (!isChatMessages(messages)) {
      return NextResponse.json(
        { error: "Conversation messages are required." },
        { status: 400 }
      );
    }

    const { reply, salesState } = await generateSalesReply(
      business,
      messages,
      previousState
    );

    return NextResponse.json({ reply, salesState });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Unable to generate a reply right now." },
      { status: 500 }
    );
  }
}
