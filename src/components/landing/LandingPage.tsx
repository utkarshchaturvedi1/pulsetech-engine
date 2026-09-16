"use client";

import dynamic from "next/dynamic";
import {
  DualChannelVisual,
  FutureVisualCard,
  HeroProductScene,
  IndustriesGrid,
  InquiryProtectStory,
  SetupExperience,
} from "./LandingVisuals";
import "./landing.css";

const PulseTechSalesAssistant = dynamic(
  () => import("../PulseTechSalesAssistant"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#F7F8FA] text-sm text-slate-500">
        Loading your AI Sales Employee...
      </div>
    ),
  }
);

const PULSETECH_LOGO = "/branding/pulsetech-logo-color.svg";
const PULSETECH_LOGO_ON_DARK = "/branding/pulsetech-logo-white.svg";
const PULSETECH_ICON = "/branding/pulsetech-icon-color.svg";

function focusLiveChat(id: string) {
  const root = document.getElementById(id);
  root?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    const input = root?.querySelector("input");
    if (input instanceof HTMLInputElement) input.focus();
  }, 350);
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function BrandLogo({ onDark = false }: { onDark?: boolean }) {
  return (
    <img
      src={onDark ? PULSETECH_LOGO_ON_DARK : PULSETECH_LOGO}
      alt="PulseTech Labs"
      className={onDark ? "pt-logo pt-logo-on-dark" : "pt-logo"}
    />
  );
}

function LiveChat({
  id,
  kicker,
  hint,
}: {
  id: string;
  kicker: string;
  hint: string;
}) {
  return (
    <div id={id} className="pt-chat-stage">
      <div className="pt-chat-shell">
        <div className="pt-chat-chrome">
          <div className="pt-chat-chrome-left">
            <img src={PULSETECH_ICON} alt="" className="pt-chat-icon" />
            <p>{kicker}</p>
          </div>
          <p>{hint}</p>
        </div>
        <div className="pt-chat-body">
          <PulseTechSalesAssistant
            agentName="Peter"
            agentRole="AI Sales Agent"
            agentAvatar={PULSETECH_ICON}
          />
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="pt-landing pt-home min-h-screen">
      <div className="pt-shell">
        <div className="pt-content">
          <header className="pt-header sticky top-0 z-40">
            <div className="pt-header-inner">
              <a href="#top" className="shrink-0 py-1" aria-label="PulseTech Labs">
                <BrandLogo />
              </a>
              <nav className="pt-header-nav" aria-label="Page">
                <button type="button" onClick={() => scrollToId("how-it-works")}>
                  How it works
                </button>
                <button type="button" onClick={() => scrollToId("industries")}>
                  Industries
                </button>
              </nav>
              <button
                type="button"
                className="pt-btn-primary pt-btn-nav hidden shrink-0 sm:inline-flex"
                onClick={() => focusLiveChat("live-chat")}
              >
                See Your Customized AI Sales Employee
              </button>
            </div>
          </header>

          <main id="top">
            {/* Hero */}
            <section className="pt-section-hero">
              <div className="pt-hero-grid">
                <div className="pt-hero-copy">
                  <p className="pt-kicker">AI Sales Employee for high-intent businesses</p>
                  <h1 className="pt-hero-title">
                    <span className="pt-hero-title-line">Every customer inquiry matters.</span>
                    <span className="pt-hero-title-accent">Make sure none are missed.</span>
                  </h1>
                  <p className="pt-hero-lead">
                    PulseTech gives your business an AI Sales Employee that responds instantly on
                    website chat and inbound calls, captures the information your team needs, and
                    alerts you while the customer is still engaged.
                  </p>
                  <div className="pt-hero-actions">
                    <button
                      type="button"
                      className="pt-btn-primary inline-flex w-full sm:w-auto"
                      onClick={() => focusLiveChat("live-chat")}
                    >
                      See Your Customized AI Sales Employee
                    </button>
                    <button
                      type="button"
                      className="pt-btn-secondary inline-flex w-full sm:w-auto"
                      onClick={() => scrollToId("how-it-works")}
                    >
                      See How It Works
                    </button>
                  </div>
                  <p className="pt-hero-note">
                    Enter your website in the chat to see it working around your business.
                  </p>
                </div>

                <div className="pt-hero-product">
                  <HeroProductScene>
                    <LiveChat
                      id="live-chat"
                      kicker="Live AI Sales Employee"
                      hint="Enter your website to begin"
                    />
                  </HeroProductScene>
                </div>
              </div>
            </section>

            {/* Problem bridge */}
            <section className="pt-section-light">
              <div className="pt-wrap pt-section-pad pt-bridge">
                <p className="pt-kicker pt-kicker-dark">The gap that costs you customers</p>
                <h2 className="pt-section-title pt-title-dark">
                  Ready customers should not wait for a callback.
                </h2>
                <p className="pt-section-copy pt-copy-dark">
                  High-intent businesses already pay to generate interest. The loss happens after
                  the inquiry — when nobody is free to answer. PulseTech covers that gap so your
                  team can follow up with complete customer details, not a missed message.
                </p>
              </div>
            </section>

            {/* Scroll story — the one major motion moment */}
            <section className="pt-section-story" id="how-it-works">
              <div className="pt-wrap pt-story-intro">
                <p className="pt-kicker">How PulseTech protects every inquiry</p>
                <h2 className="pt-section-title">From first contact to a lead your team can use.</h2>
                <p className="pt-section-copy">
                  Scroll through the sequence. Watch how an inquiry moves from contact to captured
                  details to an alert your team can act on.
                </p>
              </div>
              <InquiryProtectStory />
            </section>

            {/* Website + Phone */}
            <section className="pt-section-mist" id="experiences">
              <div className="pt-wrap pt-section-pad">
                <p className="pt-kicker pt-kicker-dark">Chat and phone, one product</p>
                <h2 className="pt-section-title pt-title-dark">
                  One AI Sales Employee. Two customer experiences.
                </h2>
                <p className="pt-section-copy pt-copy-dark">
                  Website visitors and inbound callers reach the same trained AI Sales Employee.
                  Both conversations collect the information your team needs to follow up.
                </p>
                <div className="mt-10">
                  <DualChannelVisual />
                </div>
              </div>
            </section>

            {/* Setup / control */}
            <section className="pt-section-light" id="control">
              <div className="pt-wrap pt-section-pad">
                <p className="pt-kicker pt-kicker-dark">Configured around your company</p>
                <h2 className="pt-section-title pt-title-dark">Built around your business.</h2>
                <p className="pt-section-copy pt-copy-dark">
                  The AI Sales Employee is set up with the services, areas, tone, information, and
                  pricing rules you provide — so chat and inbound calls represent the same
                  business.
                </p>
                <div className="mt-10">
                  <SetupExperience />
                </div>
                <div className="mt-8">
                  <FutureVisualCard />
                </div>
              </div>
            </section>

            {/* Try */}
            <section className="pt-section-test" id="try">
              <div className="pt-convert-grid">
                <div className="pt-convert-copy">
                  <p className="pt-kicker">Test before you buy</p>
                  <h2 className="pt-section-title">
                    Try your own personalized chat and voice experience first.
                  </h2>
                  <p className="pt-section-copy">
                    Enter your website to see an AI Sales Employee shaped around your business.
                    Review how it talks about your services, then decide when you are ready to go
                    live.
                  </p>
                  <p className="pt-section-copy pt-section-copy-follow">
                    You can test both the chat and the voice experience before anything is published
                    on your site or phone line.
                  </p>
                </div>
                <div className="pt-convert-product">
                  <LiveChat
                    id="live-chat-create"
                    kicker="Build your personalized AI Sales Employee"
                    hint="Independent live chat"
                  />
                </div>
              </div>
            </section>

            {/* Industries */}
            <section className="pt-section-mist" id="industries">
              <div className="pt-wrap pt-section-pad">
                <p className="pt-kicker pt-kicker-dark">Where inbound interest is expensive to miss</p>
                <h2 className="pt-section-title pt-title-dark">
                  Built for businesses where every inquiry matters.
                </h2>
                <p className="pt-section-copy pt-copy-dark">
                  PulseTech is built for high-intent businesses that cannot afford to miss a ready
                  customer — from home services to venues, travel, and local professionals.
                </p>
                <div className="mt-10">
                  <IndustriesGrid />
                </div>
              </div>
            </section>

            {/* Final CTA */}
            <section className="pt-section-cta" id="final-cta">
              <div className="pt-wrap pt-section-pad pt-cta-inner">
                <p className="pt-kicker">Keep the next ready customer</p>
                <h2 className="pt-section-title">
                  Do not lose the inquiry because nobody picked up.
                </h2>
                <p className="pt-section-copy">
                  Put an AI Sales Employee on your website and inbound line so interested customers
                  are spoken to immediately — and your team gets the lead while the customer is
                  still engaged.
                </p>
                <button
                  type="button"
                  className="pt-btn-primary mt-8 inline-flex"
                  onClick={() => focusLiveChat("live-chat")}
                >
                  See Your Customized AI Sales Employee
                </button>
              </div>
            </section>
          </main>

          <footer className="pt-footer">
            <div className="pt-footer-inner">
              <div>
                <BrandLogo onDark />
                <p className="pt-footer-tag">AI Sales Employees for high-intent businesses</p>
              </div>
              <nav className="pt-footer-nav">
                <a href="https://pulsetechlabs.com/privacy-policy/">Privacy</a>
                <a href="https://pulsetechlabs.com/terms-of-service/">Terms</a>
              </nav>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
