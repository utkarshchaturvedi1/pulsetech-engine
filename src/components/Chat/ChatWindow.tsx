"use client";

import { useEffect, useRef, useState } from "react";
import ChatInput from "./ChatInput";
import ChatMessage, { ChatMessageData } from "./ChatMessage";

type ChatWindowProps = {
  initialMessage?: string;
  assistantMessages?: string[];
  placeholder?: string;
  disabled?: boolean;
  statusSlot?: React.ReactNode;
  onUserMessage?: (message: string) => Promise<string> | string;
};

export default function ChatWindow({
  initialMessage,
  assistantMessages = [],
  placeholder = "Type your message...",
  disabled = false,
  statusSlot,
  onUserMessage,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [typing, setTyping] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const addedMessages = useRef(0);

  useEffect(() => {
    if (!initialMessage) return;

    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: initialMessage,
      },
    ]);

    addedMessages.current = 0;
  }, [initialMessage]);

  useEffect(() => {
    if (assistantMessages.length <= addedMessages.current) return;

    const newMessages = assistantMessages
      .slice(addedMessages.current)
      .map((content) => ({
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content,
      }));

    addedMessages.current = assistantMessages.length;

    setMessages((prev) => [...prev, ...newMessages]);
  }, [assistantMessages]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [messages, typing, statusSlot]);

  async function handleSend(text: string) {
    if (disabled) return;

    const userMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);

    setTyping(true);

    let reply =
      "Thank you. This is a temporary response until OpenAI is connected.";

    if (onUserMessage) {
      const result = await onUserMessage(text);

      if (result) {
        reply = result;
      }
    }

    setTyping(false);

    const assistantMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: reply,
    };

    setMessages((prev) => [...prev, assistantMessage]);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F7F8FA]">
      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5"
      >
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
          />
        ))}

        {typing && (
          <div className="mb-3.5 flex justify-start">
            <div className="rounded-[18px] rounded-bl-md border border-slate-200/90 bg-white px-4 py-2.5 text-sm text-slate-500 shadow-sm">
              Typing...
            </div>
          </div>
        )}
      </div>

      {statusSlot ? (
        <div className="shrink-0 border-t border-slate-200/60 bg-[#F7F8FA] px-4 pb-2 pt-1 sm:px-5">
          {statusSlot}
        </div>
      ) : null}

      <div className="shrink-0">
        <ChatInput
          placeholder={placeholder}
          disabled={disabled}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}
