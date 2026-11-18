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

export const CHAT_REQUEST_FAILURE_REPLY =
  "I'm having trouble responding right now. Please try again in a moment.";

const RETRYABLE_CHAT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function canRetryChatRequest(state: SalesState, message: string): boolean {
  const mayContainPhone = /(?:^|\D)\+?[\d\s().-]{7,}\d(?:\D|$)/.test(message);
  return (
    !state.lead.phone &&
    !mayContainPhone &&
    !state.handoffReady &&
    state.leadDeliveryStatus !== "SENT" &&
    state.leadDeliveryStatus !== "QUEUED"
  );
}

function retryDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250));
}

/**
 * Customer AI chat session.
 * conversationId is immutable. BusinessProfile content can be rebound
 * when the owner updates knowledge for the same business identity.
 */
export function createCustomerChatSession(
  business: BusinessProfile,
  openingMessage = "👋 Hi! How can I help you today?",
  demoId?: string
) {
  const conversationId = createConversationId();
  let boundBusiness: BusinessProfile = cloneBusinessProfile(business);
  const businessKey = businessIdentityKey(boundBusiness, demoId);

  let history: CustomerChatMessage[] = [
    {
      role: "assistant",
      content: openingMessage,
    },
  ];
  let salesState: SalesState | null = null;
  let customerPhotoPaths: string[] = [];
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
    if (salesState.leadDeliveryStatus === "QUEUED") return;
    if (!isLeadReadyForHandoff(salesState)) return;

    try {
      const response = await fetch("/api/lead-handoff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          demoId,
          conversationId,
          business: boundBusiness,
          salesState,
          customerPhotoPaths,
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
      if (salesState?.leadDeliveryStatus === "QUEUED") {
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
    if (salesState.leadDeliveryStatus === "QUEUED") return;
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

    const request = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        demoId,
        conversationId,
        business: boundBusiness,
        messages: nextMessages,
        salesState: outboundState,
        customerPhotoPaths,
      }),
    };
    const retryAllowed = canRetryChatRequest(outboundState, message);
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetch("/api/chat", request);
      } catch {
        if (attempt === 0 && retryAllowed) {
          await retryDelay();
          continue;
        }
        history = [
          ...nextMessages,
          { role: "assistant", content: CHAT_REQUEST_FAILURE_REPLY },
        ];
        throw new Error("Chat request failed.");
      }

      if (response.ok) break;
      if (
        attempt === 0 &&
        retryAllowed &&
        RETRYABLE_CHAT_STATUSES.has(response.status)
      ) {
        await retryDelay();
        continue;
      }
      history = [
        ...nextMessages,
        { role: "assistant", content: CHAT_REQUEST_FAILURE_REPLY },
      ];
      throw new Error("Chat request failed.");
    }

    if (!response?.ok) {
      history = [
        ...nextMessages,
        { role: "assistant", content: CHAT_REQUEST_FAILURE_REPLY },
      ];
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

    if (salesState?.leadDeliveryStatus !== "SENT" && salesState?.leadDeliveryStatus !== "QUEUED") {
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
    addPhotoPath(path: string) {
      if (customerPhotoPaths.length >= 3 || customerPhotoPaths.includes(path)) return false;
      customerPhotoPaths = [...customerPhotoPaths, path];
      return true;
    },
    getPhotoPaths: () => [...customerPhotoPaths],
    getBoundBusiness: () => boundBusiness,
    isActive: () => sessionActive,
    clearInactivityTimer,
    getInactivityMs: () => LEAD_INACTIVITY_MS,
  };
}

export type CustomerChatSession = ReturnType<typeof createCustomerChatSession>;
