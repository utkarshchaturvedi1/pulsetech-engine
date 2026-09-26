"use client";

import { PULSETECH_CHAT_ICON } from "../../lib/chatAvatar";

export type ChatMessageData = {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp?: string;
};

type ChatMessageProps = {
  message: ChatMessageData;
};

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      data-chat-message-row
      data-chat-role={isUser ? "user" : "assistant"}
      className={`mb-3.5 flex items-end gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser ? (
        <span data-chat-message-avatar className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" aria-hidden>
          <img src={PULSETECH_CHAT_ICON} alt="" className="h-full w-full rounded-full object-contain p-1" />
        </span>
      ) : null}
      <div
        data-chat-message-bubble
        data-chat-role={isUser ? "user" : "assistant"}
        className={`max-w-[82%] min-w-0 overflow-hidden break-words [overflow-wrap:anywhere] whitespace-pre-wrap px-4 py-2.5 text-[15px] leading-6 shadow-sm ${
          isUser
            ? "rounded-[18px] rounded-br-md bg-blue-600 text-white"
            : "rounded-[18px] rounded-bl-md border border-slate-200/90 bg-white text-slate-800"
        }`}
      >
        {message.content}
      </div>
      {isUser ? (
        <span data-chat-visitor-avatar className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx="12" cy="7" r="4"/><path d="M3 22v-3c0-4 4-6 9-6s9 2 9 6v3z"/></svg>
        </span>
      ) : null}
    </div>
  );
}
