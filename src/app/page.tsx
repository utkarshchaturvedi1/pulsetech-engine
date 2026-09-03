"use client";

import PulseTechSalesAssistant from "../components/PulseTechSalesAssistant";

const PETER_AVATAR = "https://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-icon-2.webp";
const PULSETECH_LOGO = "https://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-full-4.png";

const outcomes = [
  "Handles website chat and inbound phone calls, 24/7",
  "Qualifies intent and captures contact details early",
  "Delivers each sales opportunity by email and SMS",
];

const advantages = [
  {
    number: "01",
    title: "Every enquiry gets an answer",
    copy: "Website visitors and inbound callers get a helpful, on-brand response immediately — after hours, during installations, and while your team is busy.",
  },
  {
    number: "02",
    title: "The lead is secured before it disappears",
    copy: "Your Sales Employee asks the right questions, captures contact details and service needs, then puts the opportunity in front of your team by email and SMS.",
  },
  {
    number: "03",
    title: "Your team calls back while intent is high",
    copy: "A qualified alert means your team can respond to the right customer quickly instead of sorting through vague messages or missed calls.",
  },
];

export default function Home() {
  return (
    <main className="marketing-shell min-h-screen overflow-x-hidden">
      <nav className="mx-auto flex w-full max-w-[1240px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <img src={PULSETECH_LOGO} alt="PulseTech Labs" className="h-11 w-auto object-contain sm:h-12" />
        <div className="hidden items-center gap-2 text-sm font-medium text-slate-600 sm:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
          AI Sales Employee online
        </div>
      </nav>

      <section className="mx-auto grid w-full max-w-[1240px] items-center gap-10 px-5 pb-14 pt-6 sm:px-8 lg:min-h-[calc(100vh-82px)] lg:grid-cols-[1.08fr_.92fr] lg:gap-16 lg:px-10 lg:pb-20 lg:pt-4">
        <div className="max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-white/70 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700 shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            Revenue Recovery, built in
          </div>
          <h1 className="text-balance text-[clamp(2.75rem,6vw,5.6rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-slate-950">
            Turn more visitors into
            <span className="hero-gradient block">real sales opportunities.</span>
          </h1>
          <p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-slate-600 sm:text-xl">
            A trained AI Sales Employee that answers your website and phone calls, handles conversations, and secures the lead before the opportunity disappears.
          </p>
          <ul className="mt-8 space-y-3.5">
            {outcomes.map((outcome) => (
              <li key={outcome} className="flex items-center gap-3 text-[15px] font-medium text-slate-700 sm:text-base">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="m5 10 3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {outcome}
              </li>
            ))}
          </ul>
          <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
            <span><strong className="font-semibold text-slate-800">72-hour</strong> managed installation</span>
            <span className="hidden h-4 w-px bg-slate-300 sm:block" />
            <span>No training required</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[470px] lg:mx-0 lg:justify-self-end">
          <div className="absolute -inset-10 -z-10 rounded-full bg-blue-300/25 blur-3xl" />
          <div className="mb-3 flex items-end justify-between px-1">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-700">See yours before you buy</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Create your live demo</h2>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Free</span>
          </div>
          <div className="h-[570px] overflow-hidden rounded-[26px] border border-white/80 bg-white/80 p-2 shadow-[0_32px_90px_-32px_232px_rgba(15,23,42,0.4)] backdrop-blur-xl sm:h-[610px]">
            <PulseTechSalesAssistant agentName="Peter" agentRole="PulseTech AI Sales Agent" agentAvatar={PETER_AVATAR} />
          </div>
          <p className="mt-4 text-center text-xs leading-5 text-slate-500">
            Enter your website. We&apos;ll build a personalized AI Sales Employee around your business.
          </p>
        </div>
      </section>

      <section className="border-y border-slate-200/80 bg-white/70 px-5 py-8 backdrop-blur sm:px-8">
        <div className="mx-auto grid max-w-[1160px] gap-6 text-center sm:grid-cols-3 sm:divide-x sm:divide-slate-200">
          <div><p className="text-2xl font-semibold tracking-tight text-slate-950">24/7</p><p className="mt-1 text-sm text-slate-500">instant response</p></div>
          <div><p className="text-2xl font-semibold tracking-tight text-slate-950">3 details</p><p className="mt-1 text-sm text-slate-500">secure every qualified lead</p></div>
          <div><p className="text-2xl font-semibold tracking-tight text-slate-950">1 employee</p><p className="mt-1 text-sm text-slate-500">chat, inbound calls, email and SMS</p></div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8 lg:px-10 lg:py-28">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">The revenue-recovery system</p>
            <h2 className="mt-4 max-w-md text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-slate-950 sm:text-5xl">
              Stop paying for leads that nobody speaks to.
            </h2>
            <p className="mt-6 max-w-md text-lg leading-8 text-slate-600">
              PulseTech turns the first response into a dependable part of your sales process — not something left to chance when the office is busy.
            </p>
          </div>
          <div className="grid gap-4">
            {advantages.map((advantage) => (
              <article key={advantage.number} className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_55px_-38px_rgba(15,23,42,0.42)] sm:p-7">
                <div className="flex gap-5">
                  <span className="pt-1 text-xs font-bold tracking-[0.16em] text-blue-700">{advantage.number}</span>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight text-slate-950">{advantage.title}</h3>
                    <p className="mt-2 text-[15px] leading-7 text-slate-600">{advantage.copy}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-800 bg-slate-950 px-5 py-16 text-white sm:px-8 lg:py-20">
        <div className="mx-auto grid max-w-[1160px] gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">Make the numbers make sense</p>
            <h2 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-5xl">
              One saved opportunity can pay for the system.
            </h2>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/[0.07] p-6 sm:p-7">
            <p className="text-lg font-medium leading-8 text-white">You do not need hundreds of extra leads.</p>
            <p className="mt-3 text-[15px] leading-7 text-slate-300">
              You need to stop losing the high-intent people you already worked to attract. For most home-service businesses, a single additional booked job can outweigh the monthly investment.
            </p>
            <p className="mt-5 text-sm font-semibold text-blue-200">Your $2,000 setup includes a managed build around your business — you test it before you buy.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
