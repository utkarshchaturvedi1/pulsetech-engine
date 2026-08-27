"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import ChatInput from "./ChatInput";
import ChatMessage, { ChatMessageData } from "./ChatMessage";

type ChatWindowProps = {
  initialMessage?: string;
  assistantMessages?: string[];
  placeholder?: string;
  disabled?: boolean;
  statusSlot?: ReactNode;
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
  const [messages, setMessages] = useState<ChatMessageData[]>(() =>
    initialMessage
      ? [
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: initialMessage,
          },
        ]
      : []
  );
  const [typing, setTyping] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollTarget = useRef<{ id: string; role: ChatMessageData["role"] } | null>(null);
  const addedMessages = useRef(0);
  const sendInFlight = useRef(false);
  const restoreFocusAfterReply = useRef(false);
  const skipFocusRestore = useRef(false);

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

    if (newMessages.length > 0) {
      scrollTarget.current = {
        id: newMessages[0].id,
        role: "assistant",
      };
    }

    setMessages((prev) => [...prev, ...newMessages]);
  }, [assistantMessages]);

  useEffect(() => {
    const list = listRef.current;
    const target = scrollTarget.current;
    if (!list || !target) return;

    const message = messageRefs.current.get(target.id);
    if (!message) return;

    if (target.role === "assistant") {
      list.scrollTo({ top: Math.max(0, message.offsetTop - list.clientHeight * 0.18) });
    } else {
      list.scrollTo({ top: list.scrollHeight });
    }

    scrollTarget.current = null;
  }, [messages]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (composerRef.current?.contains(target)) return;
      skipFocusRestore.current = true;
    }

    function onSelectionChange() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
      const node = selection.anchorNode;
      if (node && listRef.current?.contains(node)) {
        skipFocusRestore.current = true;
      }
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("selectionchange", onSelectionChange);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  }, []);

  useEffect(() => {
    if (typing || disabled || !restoreFocusAfterReply.current) return;
    restoreFocusAfterReply.current = false;

    if (skipFocusRestore.current) return;

    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      return;
    }

    const active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== inputRef.current &&
      !composerRef.current?.contains(active)
    ) {
      return;
    }

    inputRef.current?.focus({ preventScroll: true });
  }, [typing, disabled]);

  async function handleSend(text: string) {
    if (disabled || sendInFlight.current) return;
    sendInFlight.current = true;
    skipFocusRestore.current = false;
    restoreFocusAfterReply.current = true;

    const userMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    scrollTarget.current = { id: userMessage.id, role: "user" };
    setMessages((prev) => [...prev, userMessage]);

    try {
      setTyping(true);

      let reply =
        "Thank you. This is a temporary response until OpenAI is connected.";

      if (onUserMessage) {
        const result = await onUserMessage(text);

        if (result) {
          reply = result;
        }
      }

      const assistantMessage: ChatMessageData = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
      };

      scrollTarget.current = { id: assistantMessage.id, role: "assistant" };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      sendInFlight.current = false;
      setTyping(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50">
      <div
        ref={listRef}
        data-chat-transcript
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50 px-3 py-3 sm:px-4"
      >
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            messageRef={(node) => {
              if (node) messageRefs.current.set(message.id, node);
              else messageRefs.current.delete(message.id);
            }}
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

      <div ref={composerRef} data-chat-composer className="shrink-0">
        <ChatInput
          inputRef={inputRef}
          placeholder={placeholder}
          disabled={disabled || typing}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}
