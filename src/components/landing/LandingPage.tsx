"use client";

import dynamic from "next/dynamic";
import {
  AreaIcon,
  ChatMark,
  CustomerIcon,
  EmailAlertCard,
  FloatingOpsCard,
  HoursIcon,
  JourneyFlow,
  LeadMark,
  PhoneIllustration,
  RulesIcon,
  SmsAlertCard,
  TestingWorkflow,
  ToneIcon,
  WelcomeIcon,
} from "./LandingVisuals";
import "./landing.css";

const PulseTechSalesAssistant = dynamic(
  () => import("../PulseTechSalesAssistant"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading your AI Sales Employee...
      </div>
    ),
  }
);

const PULSETECH_LOGO =
  "https://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-full-4.png";
const PETER_AVATAR =
  "https://pulsetechlabs.com/wp-content/uploads/2026/07/PulseTech-Labs-Logo-icon-2.webp";

function focusLiveChat() {
  const root = document.getElementById("live-chat");
  root?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    const input = root?.querySelector("input");
    if (input instanceof HTMLInputElement) input.focus();
  }, 350);
}

function BrandLogo() {
  return (
    <img
      src={PULSETECH_LOGO}
      alt="PulseTech Labs"
      className="pt-logo"
    />
  );
}

function LiveChat() {
  return (
    <div id="live-chat" className="relative">
      <div
        className="pointer-events-none absolute -inset-6 rounded-[36px] bg-gradient-to-br from-sky-200/70 via-blue-100/40 to-violet-200/70 blur-2xl"
        aria-hidden
      />
      <div className="relative rounded-[28px] border border-slate-200/80 bg-white p-2 shadow-[0_28px_60px_-32px_rgba(37,99,235,0.45)] sm:p-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600">
            Live AI Sales Employee
          </p>
          <p className="text-[11px] text-slate-500">Enter your website to begin</p>
        </div>
        <div className="pt-hero-chat overflow-hidden rounded-[22px] bg-white">
          <PulseTechSalesAssistant
            agentName="Peter"
            agentRole="AI Sales Agent"
            agentAvatar={PETER_AVATAR}
          />
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="pt-landing min-h-screen">
      <div className="pt-shell">
        <div className="pt-content">
          <header className="pt-header sticky top-0 z-30">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8 sm:py-5">
              <a href="#top" className="shrink-0 py-1" aria-label="PulseTech Labs">
                <BrandLogo />
              </a>
              <button
                type="button"
                className="pt-btn-primary hidden shrink-0 px-5 text-sm sm:inline-flex"
                onClick={focusLiveChat}
              >
                See Your AI Sales Employee
              </button>
            </div>
          </header>

          <main id="top">
            <section className="mx-auto grid max-w-6xl items-start gap-8 px-5 pb-12 pt-8 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-10 lg:pb-20 lg:pt-12">
              <div className="lg:pt-4">
                <p className="pt-kicker">AI Sales Employee</p>
                <h1 className="mt-4 max-w-[18ch] text-[1.85rem] font-extrabold leading-[1.15] tracking-[-0.035em] text-slate-950 sm:text-4xl lg:text-[3.05rem] lg:leading-[1.08]">
                  Stop paying for leads that nobody speaks to.
                </h1>
                <p className="mt-5 max-w-xl text-[0.98rem] leading-7 text-slate-600 sm:text-lg sm:leading-8">
                  PulseTech gives your home-service business an AI Sales Employee that answers
                  website chat and inbound phone calls 24/7, captures the lead, and alerts your
                  team immediately.
                </p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <button type="button" className="pt-btn-primary inline-flex w-full sm:w-auto" onClick={focusLiveChat}>
                    See Your AI Sales Employee
                  </button>
                  <button type="button" className="pt-btn-secondary inline-flex w-full sm:w-auto" onClick={focusLiveChat}>
                    Try the Live Demo
                  </button>
                </div>
                <p className="mt-4 text-sm text-slate-500">
                  Built around your services, service areas, business rules, and tone.
                </p>
              </div>

              <div className="relative lg:min-h-[560px] lg:pr-2">
                <LiveChat />
                <div className="pointer-events-none mt-4 grid gap-3 sm:grid-cols-3 lg:absolute lg:-left-5 lg:bottom-10 lg:mt-0 lg:w-[200px] lg:grid-cols-1">
                  <FloatingOpsCard kicker="Inbound call" title="Incoming now">
                    (512) 555-0192
                    <br />
                    Website visitor · Austin
                  </FloatingOpsCard>
                </div>
                <div className="pointer-events-none mt-3 grid gap-3 sm:grid-cols-2 lg:absolute lg:right-0 lg:top-14 lg:mt-0 lg:w-[220px] lg:grid-cols-1">
                  <FloatingOpsCard kicker="Lead secured" title="Jordan Blake">
                    Phone (512) 555-0147
                    <br />
                    8914 Willow Creek Ln
                    <br />
                    Same-day AC repair
                  </FloatingOpsCard>
                  <FloatingOpsCard kicker="Team alert" title="Email + SMS">
                    Immediate notice to your team — not to the customer.
                  </FloatingOpsCard>
                </div>
              </div>
            </section>

            <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
              <p className="pt-kicker">Every opportunity gets a response</p>
              <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-[-0.03em] text-slate-950 sm:text-4xl">
                Your next customer should not reach voicemail.
              </h2>
              <div className="mt-10 grid gap-4 lg:grid-cols-3">
                <article className="pt-card rounded-3xl p-6">
                  <ChatMark />
                  <h3 className="mt-5 text-lg font-semibold text-slate-900">Website Chat</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Answers questions on your website the moment a visitor is ready.
                  </p>
                </article>
                <article className="pt-card rounded-3xl p-6">
                  <PhoneIllustration />
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">Inbound Phone Calls</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Handles inbound calls professionally, even when your team is busy.
                  </p>
                </article>
                <article className="pt-card rounded-3xl p-6">
                  <LeadMark />
                  <h3 className="mt-5 text-lg font-semibold text-slate-900">Lead Capture</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Captures the details your team needs before the opportunity disappears.
                  </p>
                </article>
              </div>
            </section>

            <section className="relative overflow-hidden">
              <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
                <p className="pt-kicker">Revenue recovery</p>
                <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-[-0.03em] text-slate-950 sm:text-4xl">
                  Stop losing opportunities halfway through the conversation.
                </h2>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                  PulseTech secures the details that make a lead recoverable: name, phone number,
                  service address, and what the customer needs.
                </p>
                <div className="mt-10">
                  <JourneyFlow />
                </div>
              </div>
            </section>

            <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-2 lg:py-20">
              <div>
                <p className="pt-kicker">Immediate alert</p>
                <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-slate-950 sm:text-4xl">
                  Your team knows while the customer is still interested.
                </h2>
                <p className="mt-4 text-base leading-7 text-slate-600">
                  Every secured lead can trigger an immediate email and SMS alert, helping your
                  team respond before the customer contacts another business.
                </p>
              </div>
              <div className="grid gap-4">
                <EmailAlertCard />
                <SmsAlertCard />
              </div>
            </section>

            <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
              <p className="pt-kicker">Built around the business</p>
              <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-[-0.03em] text-slate-950 sm:text-4xl">
                Not a generic bot. Your sales employee.
              </h2>
              <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    title: "Business name and welcome message",
                    copy: "The first impression matches how your company actually greets people.",
                    icon: WelcomeIcon,
                  },
                  {
                    title: "Services and service areas",
                    copy: "Conversations stay inside the work you do and the places you serve.",
                    icon: AreaIcon,
                  },
                  {
                    title: "Opening hours and availability",
                    copy: "Availability is described the way your dispatch team would describe it.",
                    icon: HoursIcon,
                  },
                  {
                    title: "Visit charges and business rules",
                    copy: "Fees, after-hours policies, and other rules are applied consistently.",
                    icon: RulesIcon,
                  },
                  {
                    title: "How the business refers to its customers",
                    copy: "Homeowners, members, or clients — the language stays yours.",
                    icon: CustomerIcon,
                  },
                  {
                    title: "Tone of voice and sales approach",
                    copy: "Professional, direct, or warm — trained to sound like your team.",
                    icon: ToneIcon,
                  },
                ].map((item) => (
                  <article key={item.title} className="pt-card rounded-3xl p-5">
                    <item.icon />
                    <h3 className="mt-4 text-base font-semibold text-slate-900">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.copy}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:py-20">
              <p className="pt-kicker">Test before go-live</p>
              <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-[-0.03em] text-slate-950 sm:text-4xl">
                Test it before you put it on your website.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                See the experience your customers will receive. Request changes to the
                conversation, business rules, tone, and lead flow before it goes live.
              </p>
              <div className="mt-8">
                <TestingWorkflow />
              </div>
            </section>

            <section className="px-5 pb-16 sm:px-8 lg:pb-24">
              <div className="mx-auto max-w-4xl rounded-[32px] border border-blue-100 bg-gradient-to-br from-white via-sky-50 to-violet-50 px-6 py-12 text-center sm:px-10">
                <h2 className="text-3xl font-bold tracking-[-0.03em] text-slate-950 sm:text-4xl">
                  Turn more visitors into real sales opportunities.
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-600">
                  See what a trained AI Sales Employee can do for your business.
                </p>
                <button
                  type="button"
                  className="pt-btn-primary mt-7 inline-flex w-full sm:w-auto"
                  onClick={focusLiveChat}
                >
                  Talk to Your AI Sales Employee
                </button>
              </div>
            </section>
          </main>

          <footer className="border-t border-slate-200/80">
            <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div>
                <BrandLogo />
                <p className="mt-3 text-sm text-slate-500">
                  AI Sales Employees for home-service businesses
                </p>
              </div>
              <nav className="flex gap-5 text-sm text-slate-500">
                <a className="hover:text-slate-900" href="https://pulsetechlabs.com/privacy-policy/">
                  Privacy
                </a>
                <a className="hover:text-slate-900" href="https://pulsetechlabs.com/terms-of-service/">
                  Terms
                </a>
              </nav>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
