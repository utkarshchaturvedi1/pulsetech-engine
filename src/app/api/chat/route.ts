import { NextRequest, NextResponse } from "next/server";

import { BusinessProfile } from "../../../types/business";
import {
  generateSalesReply,
  SalesChatMessage,
} from "../../../lib/salesChat";
import {
  businessIdentityKey,
  createInitialSalesState,
  isSalesState,
  isValidConversationId,
  normalizeSalesState,
  SalesState,
} from "../../../lib/salesState";

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
    const conversationId = body.conversationId;

    if (!isValidConversationId(conversationId)) {
      return NextResponse.json(
        { error: "A valid conversationId is required." },
        { status: 400 }
      );
    }

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

    const businessKey = businessIdentityKey(business);

    let previousState: SalesState | null = isSalesState(body.salesState)
      ? normalizeSalesState(body.salesState)
      : null;

    if (
      previousState?.conversationId &&
      previousState.conversationId !== conversationId
    ) {
      return NextResponse.json(
        { error: "conversationId does not match sales state." },
        { status: 400 }
      );
    }

    if (
      previousState?.businessKey &&
      previousState.businessKey !== businessKey
    ) {
      return NextResponse.json(
        { error: "business identity does not match sales state." },
        { status: 400 }
      );
    }

    if (previousState) {
      previousState = {
        ...previousState,
        conversationId,
        businessKey: previousState.businessKey || businessKey,
      };
    } else {
      previousState = createInitialSalesState({ conversationId, businessKey });
    }

    const { reply, salesState: nextState } = await generateSalesReply(
      business,
      messages,
      previousState
    );

    const salesState: SalesState = {
      ...nextState,
      conversationId,
      businessKey: nextState.businessKey || businessKey,
    };

    return NextResponse.json({ reply, salesState, conversationId });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Unable to generate a reply right now." },
      { status: 500 }
    );
  }
}
