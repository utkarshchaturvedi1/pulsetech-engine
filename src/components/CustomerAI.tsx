"use client";

import { useEffect, useRef } from "react";
import ChatWindow from "./Chat/ChatWindow";
import ChatAgentShell from "./Chat/ChatAgentShell";
import { BusinessProfile } from "../types/business";
import { createCustomerChatSession } from "../lib/customerChatClient";

type CustomerAIProps = {
  business: BusinessProfile;
  disabled: boolean;
  className?: string;
};

const INITIAL_MESSAGE = "👋 Hi! How can I help you today?";

export default function CustomerAI({
  business,
  disabled,
  className = "",
}: CustomerAIProps) {
  const sessionRef = useRef<ReturnType<typeof createCustomerChatSession> | null>(
    null
  );
  const businessRef = useRef(business);

  useEffect(() => {
    businessRef.current = business;
    if (!sessionRef.current) {
      sessionRef.current = createCustomerChatSession(
        () => businessRef.current,
        INITIAL_MESSAGE
      );
    }
  }, [business]);

  async function handleCustomerMessage(message: string): Promise<string> {
    if (!sessionRef.current) {
      sessionRef.current = createCustomerChatSession(
        () => businessRef.current,
        INITIAL_MESSAGE
      );
    }

    try {
      return await sessionRef.current.send(message);
    } catch {
      return "I'm having trouble responding right now. Please try again in a moment.";
    }
  }

  return (
    <ChatAgentShell
      name={business.businessName || "AI Sales Employee"}
      role="AI Sales Employee"
      avatar={business.logo || undefined}
      className={className}
    >
      <ChatWindow
        key={business.website}
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
