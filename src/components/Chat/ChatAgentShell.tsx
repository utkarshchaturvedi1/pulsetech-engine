"use client";

type ChatAgentShellProps = {
  name: string;
  role: string;
  avatar?: string;
  className?: string;
  statusLabel?: string;
  children: React.ReactNode;
};

const DEFAULT_AVATAR =
  "http://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-icon-2.webp";

export default function ChatAgentShell({
  name,
  role,
  avatar = DEFAULT_AVATAR,
  className = "",
  statusLabel = "Online",
  children,
}: ChatAgentShellProps) {
  return (
    <div
      className={`flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-[#FBFCFD] shadow-[0_10px_40px_-18px_rgba(15,23,42,0.28)] ${className}`.trim()}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3.5 backdrop-blur-[2px]">
        <div className="relative shrink-0">
          {avatar ? (
            <img
              src={avatar}
              alt={name}
              className="h-11 w-11 rounded-full object-cover ring-2 ring-white shadow-sm"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700 ring-2 ring-white shadow-sm">
              {name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span
            className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500"
            aria-hidden
          />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-slate-900">
            {name}
          </h2>
          <p className="truncate text-sm text-slate-500">{role}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {statusLabel}
          </p>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
