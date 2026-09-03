"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

type ChatAgentShellProps = {
  name: string;
  role: string;
  avatar?: string;
  className?: string;
  statusLabel?: string;
  themeStyle?: CSSProperties;
  themeSource?: "brand" | "fallback";
  children: ReactNode;
};

export default function ChatAgentShell({
  name,
  role,
  avatar,
  className = "",
  statusLabel = "Online",
  themeStyle,
  themeSource,
  children,
}: ChatAgentShellProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const avatarSrc = avatar?.trim() || "";
  const showImage = Boolean(avatarSrc) && failedSrc !== avatarSrc;

  return (
    <div
      data-customer-widget-shell
      data-theme-source={themeSource || "fallback"}
      className={("flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-[#FBFCFD] shadow-[0_18px_50px_-24px_rgba(15,23,42,0.32)] " + className).trim()}
      style={{
        ...themeStyle,
        borderTopWidth: 3,
        borderTopColor: "var(--pt-accent, #2563eb)",
      }}
    >
      <header
        data-chat-header
        className="flex shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white px-4 py-3.5"
      >
        <div className="relative shrink-0">
          {showImage ? (
            <img
              data-compact-avatar
              src={avatarSrc}
              alt=""
              onError={() => setFailedSrc(avatarSrc)}
              className="h-10 w-10 rounded-full bg-white object-contain p-0.5 ring-1 ring-slate-200"
            />
          ) : (
            <div
              data-compact-avatar-fallback
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ring-1 ring-slate-200"
              style={{
                background: "var(--pt-accent-soft, #dbeafe)",
                color: "var(--pt-accent, #2563eb)",
              }}
            >
              {name.slice(0, 1).toUpperCase() || "A"}
            </div>
          )}
          <span
            className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500"
            aria-hidden
          />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold leading-5 tracking-tight text-slate-950">
            {name}
          </h2>
          <p className="truncate text-xs leading-4 text-slate-500">
            {role}
            <span className="mx-1.5 text-slate-300" aria-hidden>
              ·
            </span>
            <span className="font-medium text-emerald-600">{statusLabel}</span>
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
