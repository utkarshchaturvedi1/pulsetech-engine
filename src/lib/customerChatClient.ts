import { BusinessProfile } from "../types/business";
import { cloneBusinessProfile } from "./businessProfile";
import {
  isLeadReadyForHandoff,
  LEAD_INACTIVITY_MS,
} from "./leadHandoffShared";
import {
  businessIdentityKey,
  createConversationId,
  createInitialSalesState,
  SalesState,
} from "./salesState";

export type CustomerChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Customer AI chat session.
 * conversationId is immutable. BusinessProfile content can be rebound
 * when the owner updates knowledge for the same business identity.
 */
export function createCustomerChatSession(
  business: BusinessProfile,
  openingMessage = "👋 Hi! How can I help you today?"
) {
  const conversationId = createConversationId();
  let boundBusiness: BusinessProfile = cloneBusinessProfile(business);
  const businessKey = businessIdentityKey(boundBusiness);

  let history: CustomerChatMessage[] = [
    {
      role: "assistant",
      content: openingMessage,
    },
  ];
  let salesState: SalesState | null = null;
  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  let inactivityGeneration = 0;
  let sessionActive = true;

  function clearInactivityTimer() {
    if (inactivityTimer !== null) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  }

  function destroy() {
    sessionActive = false;
    clearInactivityTimer();
    inactivityGeneration += 1;
  }

  /**
   * Refresh business knowledge for this conversation without resetting
   * conversationId or SalesState. Rejects identity mismatches.
   */
  function updateBusiness(next: BusinessProfile): boolean {
    if (!sessionActive) return false;
    const nextKey = businessIdentityKey(next);
    if (nextKey !== businessKey) return false;
    boundBusiness = cloneBusinessProfile(next);
    return true;
  }

  function stampConversation(state: SalesState): SalesState {
    return {
      ...state,
      conversationId,
      businessKey,
    };
  }

  async function finalizeInactivityHandoff(
    generation: number,
    scheduledConversationId: string,
    scheduledBusinessKey: string
  ) {
    if (!sessionActive) return;
    if (generation !== inactivityGeneration) return;
    if (scheduledConversationId !== conversationId) return;
    if (scheduledBusinessKey !== businessKey) return;
    if (!salesState) return;
    if (salesState.conversationId !== conversationId) return;
    if (salesState.businessKey !== businessKey) return;
    if (salesState.leadDeliveryStatus === "SENT") return;
    if (!isLeadReadyForHandoff(salesState)) return;

    try {
      const response = await fetch("/api/lead-handoff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          business: boundBusiness,
          salesState,
          reason: "inactivity",
        }),
      });

      if (!response.ok) return;

      const data = (await response.json()) as {
        salesState?: SalesState;
      };

      if (!sessionActive) return;
      if (generation !== inactivityGeneration) return;
      if (scheduledConversationId !== conversationId) return;

      if (data.salesState) {
        salesState = stampConversation(data.salesState);
      }

      if (salesState?.leadDeliveryStatus === "SENT") {
        clearInactivityTimer();
      }
    } catch (error) {
      console.error("[customerChatClient] inactivity handoff failed", error);
    }
  }

  function scheduleInactivityHandoff() {
    clearInactivityTimer();

    if (!sessionActive) return;
    if (!salesState) return;
    if (salesState.leadDeliveryStatus === "SENT") return;
    if (!isLeadReadyForHandoff(salesState)) return;

    const generation = ++inactivityGeneration;
    const scheduledConversationId = conversationId;
    const scheduledBusinessKey = businessKey;

    inactivityTimer = setTimeout(() => {
      void finalizeInactivityHandoff(
        generation,
        scheduledConversationId,
        scheduledBusinessKey
      );
    }, LEAD_INACTIVITY_MS);
  }

  async function send(message: string): Promise<string> {
    if (!sessionActive) {
      throw new Error("Chat session is no longer active.");
    }

    clearInactivityTimer();
    inactivityGeneration += 1;

    const nextMessages: CustomerChatMessage[] = [
      ...history,
      {
        role: "user",
        content: message,
      },
    ];

    const outboundState = salesState
      ? stampConversation(salesState)
      : createInitialSalesState({ conversationId, businessKey });

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        conversationId,
        business: boundBusiness,
        messages: nextMessages,
        salesState: outboundState,
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
      salesState = stampConversation(data.salesState);
    }

    history = [
      ...nextMessages,
      {
        role: "assistant",
        content: reply,
      },
    ];

    if (salesState?.leadDeliveryStatus !== "SENT") {
      scheduleInactivityHandoff();
    } else {
      clearInactivityTimer();
    }

    return reply;
  }

  return {
    openingMessage,
    conversationId,
    businessKey,
    send,
    destroy,
    updateBusiness,
    getSalesState: () => salesState,
    getBoundBusiness: () => boundBusiness,
    isActive: () => sessionActive,
    clearInactivityTimer,
    getInactivityMs: () => LEAD_INACTIVITY_MS,
  };
}

export type CustomerChatSession = ReturnType<typeof createCustomerChatSession>;
