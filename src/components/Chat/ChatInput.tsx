"use client";

import { useState, type Ref } from "react";

type ChatInputProps = {
  placeholder?: string;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onSend: (message: string) => void;
};

export default function ChatInput({
  placeholder = "Type your message...",
  disabled = false,
  inputRef,
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
    <div className="border-t border-slate-200 bg-white px-3 py-3 sm:px-4">
      <div
        data-chat-composer-field
        className="flex items-center gap-2 rounded-xl border-2 bg-white px-2 py-1.5 shadow-sm transition focus-within:ring-4"
        style={{
          borderColor: "var(--pt-accent, #2563eb)",
          boxShadow: "0 0 0 0 var(--pt-accent-soft, #dbeafe)",
        }}
      >
        <input
          ref={inputRef}
          value={message}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Message"
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[15px] text-slate-900 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="button"
          data-chat-send
          onClick={send}
          disabled={disabled || !message.trim()}
          aria-label="Send message"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:bg-slate-300"
          style={
            disabled || !message.trim()
              ? undefined
              : {
                  background: "var(--pt-accent, #2563eb)",
                  color: "var(--pt-on-accent, #ffffff)",
                }
          }
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
