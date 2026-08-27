"use client";

import type { ReactNode } from "react";

export type ChatMessageData = {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp?: string;
};

type ChatMessageProps = {
  message: ChatMessageData;
  messageRef?: (node: HTMLDivElement | null) => void;
};

/** Render lightweight **bold** markers as <strong> for intentional UX emphasis. */
function renderInlineMarkdown(content: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={`b-${key++}`} className="font-bold">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [content];
}

export default function ChatMessage({ message, messageRef }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      ref={messageRef}
      data-chat-message-id={message.id}
      className={`mb-3.5 flex ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[82%] whitespace-pre-wrap px-4 py-2.5 text-[15px] leading-6 shadow-sm ${
          isUser
            ? "rounded-[18px] rounded-br-md text-[var(--pt-on-accent,#fff)]"
            : "rounded-[18px] rounded-bl-md border border-slate-200/90 bg-white text-slate-800"
        }`}
        style={
          isUser
            ? { background: "var(--pt-accent, #2563eb)" }
            : undefined
        }
      >
        {renderInlineMarkdown(message.content)}
      </div>
    </div>
  );
}
