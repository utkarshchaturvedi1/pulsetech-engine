"use client";

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
      className={`mb-3.5 flex ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`max-w-[82%] whitespace-pre-wrap px-4 py-2.5 text-[15px] leading-6 shadow-sm ${
          isUser
            ? "rounded-[18px] rounded-br-md bg-blue-600 text-white"
            : "rounded-[18px] rounded-bl-md border border-slate-200/90 bg-white text-slate-800"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
