import { BusinessProfile } from "../types/business";
import { SalesState } from "./salesState";

export type CustomerChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type BusinessSource = BusinessProfile | (() => BusinessProfile);

export function createCustomerChatSession(
  businessSource: BusinessSource,
  openingMessage = "👋 Hi! How can I help you today?"
) {
  let history: CustomerChatMessage[] = [
    {
      role: "assistant",
      content: openingMessage,
    },
  ];
  let salesState: SalesState | null = null;

  function getBusiness(): BusinessProfile {
    return typeof businessSource === "function"
      ? businessSource()
      : businessSource;
  }

  async function send(message: string): Promise<string> {
    const nextMessages: CustomerChatMessage[] = [
      ...history,
      {
        role: "user",
        content: message,
      },
    ];

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        business: getBusiness(),
        messages: nextMessages,
        salesState,
      }),
    });

    if (!response.ok) {
      throw new Error("Chat request failed.");
    }

    const data = (await response.json()) as {
      reply?: string;
      salesState?: SalesState;
    };

    if (!data.reply?.trim()) {
      throw new Error("Empty chat reply.");
    }

    const reply = data.reply.trim();

    if (data.salesState) {
      salesState = data.salesState;
    }

    history = [
      ...nextMessages,
      {
        role: "assistant",
        content: reply,
      },
    ];

    return reply;
  }

  return {
    openingMessage,
    send,
    getSalesState: () => salesState,
  };
}
