"use client";

import { useEffect, useRef, useState } from "react";
import ChatWindow from "./Chat/ChatWindow";

type PulseTechAssistantProps = {
  onReady: () => void;
};

export default function PulseTechAssistant({
  onReady,
}: PulseTechAssistantProps) {
  const started = useRef(false);

  const [assistantMessages, setAssistantMessages] = useState<string[]>([]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    setAssistantMessages([
      "👋 Welcome!\n\nI've started preparing your AI Sales Employee.",
    ]);

    const timers = [
      setTimeout(() => {
        setAssistantMessages((prev) => [
          ...prev,
          `✓ Website analysed
✓ Understanding your business
✓ Learning your services
✓ Applying your branding`,
        ]);
      }, 1800),

      setTimeout(() => {
        setAssistantMessages((prev) => [
          ...prev,
          `🎉 Your AI Sales Employee is Ready.

Please spend a few minutes testing it exactly as one of your customers would.

Things to test:
• Ask about your services
• Ask if you service your location
• Ask common questions your customers usually ask
• Try to book a quote or consultation
• Check whether the answers sound like your business

If anything doesn't feel right, just tell me here and I'll update it immediately.`,
        ]);

        onReady();
      }, 3200),
    ];

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [onReady]);

  async function handleMessage(message: string): Promise<string> {
    const text = message.toLowerCase();

    if (
      text.includes("yes") ||
      text.includes("looks good") ||
      text.includes("approved") ||
      text.includes("perfect")
    ) {
      return `Fantastic!

I'm glad you're happy with your AI Sales Employee.

Before we prepare everything for deployment, I'll need a few details to generate your invoice.

We'll do that in the next step.`;
    }

    return `I've updated our records and made the necessary changes.

Please test your AI again and let me know if everything looks right now.`;
  }

  return (
    <ChatWindow
      assistantMessages={assistantMessages}
      placeholder="Tell me what you would like to change..."
      onUserMessage={handleMessage}
    />
  );
}