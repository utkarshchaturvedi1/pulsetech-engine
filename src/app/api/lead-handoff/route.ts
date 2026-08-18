import { NextRequest, NextResponse } from "next/server";

import { BusinessProfile } from "../../../types/business";
import {
  applyLeadDeliveryResult,
  maybeSendLeadHandoff,
  type LeadHandoffReason,
} from "../../../lib/leadHandoff";
import {
  businessIdentityKey,
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const business = body.business;
    const reason = (body.reason || "inactivity") as LeadHandoffReason;
    const conversationId = body.conversationId;
    const latestUserMessage =
      typeof body.latestUserMessage === "string"
        ? body.latestUserMessage
        : undefined;

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

    if (!isSalesState(body.salesState)) {
      return NextResponse.json(
        { error: "A valid sales state is required." },
        { status: 400 }
      );
    }

    if (reason !== "closure" && reason !== "inactivity") {
      return NextResponse.json(
        { error: "Invalid handoff reason." },
        { status: 400 }
      );
    }

    let salesState: SalesState = normalizeSalesState(body.salesState);
    const businessKey = businessIdentityKey(business);

    if (
      salesState.conversationId &&
      salesState.conversationId !== conversationId
    ) {
      return NextResponse.json(
        { error: "conversationId does not match sales state." },
        { status: 400 }
      );
    }

    if (salesState.businessKey && salesState.businessKey !== businessKey) {
      return NextResponse.json(
        { error: "business identity does not match sales state." },
        { status: 400 }
      );
    }

    salesState = {
      ...salesState,
      conversationId,
      businessKey: salesState.businessKey || businessKey,
    };

    const handoff = await maybeSendLeadHandoff(
      business,
      salesState,
      reason,
      latestUserMessage
    );
    salesState = applyLeadDeliveryResult(salesState, handoff);

    return NextResponse.json({
      salesState,
      handoff,
      conversationId,
    });
  } catch (error) {
    console.error("[lead-handoff]", error);
    return NextResponse.json(
      { error: "Unable to process lead handoff." },
      { status: 500 }
    );
  }
}
