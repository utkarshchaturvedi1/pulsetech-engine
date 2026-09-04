import type { ReactNode } from "react";

export function ChatMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden>
      <rect x="6" y="10" width="52" height="34" rx="10" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.6" />
      <path d="M18 52 24 44h16" stroke="#60a5fa" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
      <path d="M18 22h28M18 30h18" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneIllustration() {
  return (
    <svg viewBox="0 0 220 160" className="h-auto w-full" aria-hidden>
      <defs>
        <linearGradient id="ptPhoneGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <circle cx="110" cy="80" r="54" fill="url(#ptPhoneGlow)" opacity="0.28" />
      <circle cx="110" cy="80" r="40" fill="none" stroke="#93c5fd" strokeWidth="1.4" opacity="0.7" />
      <circle cx="110" cy="80" r="28" fill="none" stroke="#c4b5fd" strokeWidth="1.2" opacity="0.55" />
      <rect x="86" y="28" width="48" height="104" rx="12" fill="#0f172a" />
      <rect x="91" y="36" width="38" height="78" rx="6" fill="#e0f2fe" />
      <circle cx="110" cy="122" r="4" fill="#93c5fd" />
      <path d="M146 52c10 8 10 48 0 56" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M158 42c16 14 16 62 0 76" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <circle cx="158" cy="38" r="11" fill="#2563eb" />
      <path d="M154 38h8M158 34v8" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function LeadMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden>
      <rect x="12" y="8" width="40" height="48" rx="8" fill="#eef2ff" stroke="#c4b5fd" strokeWidth="1.6" />
      <path d="M22 22h20M22 32h20M22 42h12" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="46" cy="46" r="10" fill="#2563eb" />
      <path d="M42 46.2 45 49l6-7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function WelcomeIcon() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
      <rect width="40" height="40" rx="12" fill="#eff6ff" />
      <path d="M10 26c4-8 16-8 20 0" fill="none" stroke="#2563eb" strokeWidth="2" />
      <circle cx="20" cy="16" r="5" fill="#93c5fd" stroke="#2563eb" strokeWidth="1.5" />
    </svg>
  );
}

export function AreaIcon() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
      <rect width="40" height="40" rx="12" fill="#eef2ff" />
      <path d="M20 10c6 0 10 5 10 11 0 8-10 15-10 15S10 29 10 21c0-6 4-11 10-11Z" fill="#c4b5fd" />
      <circle cx="20" cy="20" r="3.4" fill="#fff" />
    </svg>
  );
}

export function HoursIcon() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
      <rect width="40" height="40" rx="12" fill="#ecfeff" />
      <circle cx="20" cy="20" r="10" fill="#fff" stroke="#0891b2" strokeWidth="1.8" />
      <path d="M20 14v7l5 3" fill="none" stroke="#0e7490" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function RulesIcon() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
      <rect width="40" height="40" rx="12" fill="#f5f3ff" />
      <rect x="11" y="12" width="18" height="16" rx="3" fill="#fff" stroke="#7c3aed" strokeWidth="1.6" />
      <path d="M15 18h10M15 23h7" stroke="#6d28d9" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CustomerIcon() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
      <rect width="40" height="40" rx="12" fill="#eff6ff" />
      <circle cx="15" cy="18" r="4" fill="#93c5fd" />
      <circle cx="25" cy="18" r="4" fill="#c4b5fd" />
      <path d="M9 28c2-4 6-6 11-6s9 2 11 6" fill="none" stroke="#2563eb" strokeWidth="1.8" />
    </svg>
  );
}

export function ToneIcon() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden>
      <rect width="40" height="40" rx="12" fill="#e0e7ff" />
      <path d="M12 24c2-8 14-8 16 0" fill="none" stroke="#4338ca" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.6" fill="#4338ca" />
      <circle cx="24" cy="16" r="1.6" fill="#4338ca" />
    </svg>
  );
}

const JOURNEY = [
  { title: "Visitor inquiry", caption: "Website or inbound call" },
  { title: "AI conversation", caption: "Answers immediately" },
  { title: "Lead secured", caption: "Name, phone, address, need" },
  { title: "Email/SMS alert", caption: "Internal team notice" },
  { title: "Business follows up", caption: "While interest is high" },
];

export function JourneyFlow() {
  return (
    <ol className="grid gap-3 sm:grid-cols-5">
      {JOURNEY.map((step, index) => (
        <li key={step.title} className="pt-card relative rounded-3xl p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-violet-100 text-sm font-extrabold text-blue-700">
            {String(index + 1).padStart(2, "0")}
          </div>
          <p className="mt-4 text-sm font-semibold text-slate-900">{step.title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{step.caption}</p>
          {index < JOURNEY.length - 1 ? (
            <span className="absolute -right-2 top-10 hidden h-0.5 w-4 bg-gradient-to-r from-blue-400 to-violet-300 sm:block" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function EmailAlertCard() {
  return (
    <article className="pt-card overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-sky-50 to-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
              <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="m5 7.5 7 6 7-6" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Email alert</p>
            <p className="text-[11px] text-slate-500">Internal · dispatch</p>
          </div>
        </div>
        <span className="text-[11px] font-semibold text-blue-600">Now</span>
      </div>
      <div className="px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Subject</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">New lead secured — Jordan Blake</p>
        <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-600">
          (512) 555-0147 · 8914 Willow Creek Ln, Austin, TX · same-day AC repair.
        </p>
      </div>
    </article>
  );
}

export function SmsAlertCard() {
  return (
    <article className="pt-card overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-violet-50 to-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden>
              <path
                d="M4.5 6.2h15A1.8 1.8 0 0 1 21.3 8v7.2a1.8 1.8 0 0 1-1.8 1.8H9L4.5 20.2V8a1.8 1.8 0 0 1 1.8-1.8Z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">SMS alert</p>
            <p className="text-[11px] text-slate-500">Internal · on-call manager</p>
          </div>
        </div>
        <span className="text-[11px] font-semibold text-violet-600">Now</span>
      </div>
      <div className="px-4 py-4">
        <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-violet-600 px-3 py-2.5 text-sm leading-6 text-white">
          PulseTech: lead ready. Jordan Blake asked for same-day AC repair in Austin.
        </div>
        <p className="mt-3 text-[11px] text-slate-500">Sent to your team — not to the customer.</p>
      </div>
    </article>
  );
}

const TEST_STEPS = [
  { title: "Test", copy: "Talk through real visitor questions." },
  { title: "Adjust", copy: "Change rules, tone, and lead flow." },
  { title: "Approve", copy: "Confirm the experience feels like your team." },
  { title: "Go live", copy: "Put it on your website when ready." },
];

export function TestingWorkflow() {
  return (
    <div className="pt-card relative overflow-hidden rounded-[28px] p-5 sm:p-7">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-200/50 blur-2xl"
        aria-hidden
      />
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">Before go-live</p>
      <div className="relative mt-5 grid gap-3 sm:grid-cols-4">
        {TEST_STEPS.map((step, index) => (
          <div key={step.title} className="relative rounded-2xl border border-slate-100 bg-white p-4">
            <span className="text-xs font-extrabold text-blue-600">{String(index + 1).padStart(2, "0")}</span>
            <p className="mt-2 text-sm font-semibold text-slate-900">{step.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{step.copy}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FloatingOpsCard({
  kicker,
  title,
  children,
  className = "",
}: {
  kicker: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`pt-card rounded-2xl p-3 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.45)] ${className}`.trim()}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600">{kicker}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-2 text-xs leading-5 text-slate-600">{children}</div>
    </div>
  );
}
