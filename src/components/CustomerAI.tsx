"use client";

import { useEffect, useRef } from "react";
import ChatWindow from "./Chat/ChatWindow";
import ChatAgentShell from "./Chat/ChatAgentShell";
import { BusinessProfile } from "../types/business";
import {
  createCustomerChatSession,
  type CustomerChatSession,
} from "../lib/customerChatClient";
import { businessIdentityKey } from "../lib/salesState";
import { compactBusinessAvatar } from "../lib/siteIcon";
import { deriveWidgetTheme, widgetThemeStyle } from "../lib/widgetTheme";

type CustomerAIProps = {
  business: BusinessProfile;
  disabled: boolean;
  className?: string;
};

const INITIAL_MESSAGE = "👋 Hi! How can I help you today?";

function profileContentSignature(business: BusinessProfile): string {
  return JSON.stringify({
    businessName: business.businessName,
    tagline: business.tagline,
    phone: business.phone,
    email: business.email,
    leadNotificationEmail: business.leadNotificationEmail,
    address: business.address,
    services: business.services,
    serviceAreas: business.serviceAreas,
    faqs: business.faqs,
    leadQuestions: business.leadQuestions,
    systemPrompt: business.systemPrompt,
    logo: business.logo,
    siteIcon: business.siteIcon,
    primaryColor: business.primaryColor,
    secondaryColor: business.secondaryColor,
  });
}

export default function CustomerAI({
  business,
  disabled,
  className = "",
}: CustomerAIProps) {
  const sessionRef = useRef<CustomerChatSession | null>(null);
  const identityKey = businessIdentityKey(business);
  const contentKey = profileContentSignature(business);

  useEffect(() => {
    sessionRef.current?.destroy();
    sessionRef.current = createCustomerChatSession(business, INITIAL_MESSAGE);

    return () => {
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
    // Recreate only when business identity (website) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identityKey is the isolation boundary
  }, [identityKey]);

  // Owner knowledge updates: rebind BusinessProfile, keep conversationId + SalesState.
  useEffect(() => {
    if (!sessionRef.current?.isActive()) return;
    sessionRef.current.updateBusiness(business);
  }, [contentKey, business]);

  async function handleCustomerMessage(message: string): Promise<string> {
    if (!sessionRef.current || !sessionRef.current.isActive()) {
      sessionRef.current = createCustomerChatSession(business, INITIAL_MESSAGE);
    } else {
      sessionRef.current.updateBusiness(business);
    }

    try {
      return await sessionRef.current.send(message);
    } catch {
      return "I'm having trouble responding right now. Please try again in a moment.";
    }
  }

  const theme = deriveWidgetTheme(business.primaryColor, business.secondaryColor);
  const compactAvatar = compactBusinessAvatar(business);

  return (
    <ChatAgentShell
      name={business.businessName || "AI Sales Employee"}
      role="AI Sales Employee"
      avatar={compactAvatar || undefined}
      themeStyle={widgetThemeStyle(theme)}
      themeSource={theme.source}
      className={`mx-auto h-full min-h-0 w-full max-w-[420px] ${className}`.trim()}
    >
      <ChatWindow
        key={identityKey}
        initialMessage={INITIAL_MESSAGE}
        placeholder={
          disabled
            ? "Preparing your AI Sales Employee..."
            : "Ask me anything..."
        }
        disabled={disabled}
        onUserMessage={handleCustomerMessage}
      />
    </ChatAgentShell>
  );
}
