"use client";

import { useState } from "react";

type ChatInputProps = {
  placeholder?: string;
  disabled?: boolean;
  onSend: (message: string) => void;
};

export default function ChatInput({
  placeholder = "Type your message...",
  disabled = false,
  onSend,
}: ChatInputProps) {
  const [message, setMessage] = useState("");

  function send() {
    const text = message.trim();

    if (!text || disabled) return;

    onSend(text);
    setMessage("");
  }

  return (
    <div className="border-t border-slate-200/80 bg-white px-3 py-3 sm:px-4">
      <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 px-2 py-1.5 shadow-inner transition focus-within:border-blue-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
        <input
          value={message}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="button"
          onClick={send}
          disabled={disabled || !message.trim()}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
