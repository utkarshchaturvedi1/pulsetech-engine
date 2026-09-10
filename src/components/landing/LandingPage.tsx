"use client";

import dynamic from "next/dynamic";
import {
  ControlGrid,
  DualExperience,
  HeroLeadVisual,
  HowItWorksJourney,
  IndustriesGrid,
  ProblemContrast,
  Reveal,
  TestStoryVisual,
  VideoPreview,
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

const PULSETECH_LOGO = "/branding/pulsetech-logo-white.png";
const PULSETECH_ICON = "/branding/pulsetech-icon-white.png";

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

function BrandLogo() {
  return <img src={PULSETECH_LOGO} alt="PulseTech Labs" className="pt-logo" />;
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
          <header className="pt-header sticky top-0 z-30">
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
                className="pt-btn-primary hidden shrink-0 px-5 text-sm sm:inline-flex"
                onClick={() => focusLiveChat("live-chat")}
              >
                Build Your AI Sales Employee
              </button>
            </div>
          </header>

          <main id="top">
            <section className="pt-section-hero">
              <div className="pt-hero-grid">
                <div className="pt-hero-copy">
                  <p className="pt-kicker">AI Sales Employee for home-service businesses</p>
                  <h1 className="pt-hero-title">Stop paying for leads that nobody speaks to.</h1>
                  <p className="pt-hero-lead">
                    PulseTech gives your business an AI Sales Employee for website chat and inbound
                    phone calls. When a visitor or caller is ready to buy, it responds immediately,
                    captures the details your team needs, and alerts you before that lead goes cold.
                  </p>
                  <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      className="pt-btn-primary inline-flex w-full sm:w-auto"
                      onClick={() => focusLiveChat("live-chat")}
                    >
                      Build Your AI Sales Employee
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
                  <HeroLeadVisual>
                    <LiveChat
                      id="live-chat"
                      kicker="Live AI Sales Employee"
                      hint="Enter your website to begin"
                    />
                  </HeroLeadVisual>
                </div>
              </div>
            </section>

            <section className="pt-section-light pt-section-problem">
              <div className="pt-wrap pt-section-pad">
                <Reveal>
                  <p className="pt-kicker">Revenue recovery</p>
                  <h2 className="pt-section-title">Ready customers should not wait for a callback.</h2>
                  <p className="pt-section-copy">
                    Home-service businesses already pay to generate interest. The loss happens after
                    the inquiry — when nobody is free to answer. PulseTech covers that gap so your
                    team can follow up with a complete lead, not a missed message.
                  </p>
                </Reveal>
                <div className="mt-10">
                  <ProblemContrast />
                </div>
              </div>
            </section>

            <section className="pt-section-mist" id="experiences">
              <div className="pt-wrap pt-section-pad">
                <Reveal>
                  <p className="pt-kicker">Chat and phone, one product</p>
                  <h2 className="pt-section-title">One AI Sales Employee. Two customer experiences.</h2>
                  <p className="pt-section-copy">
                    Website visitors and inbound callers reach the same trained AI Sales Employee.
                    Both conversations collect the information your team needs to pick up the job.
                  </p>
                </Reveal>
                <div className="mt-10">
                  <DualExperience />
                </div>
              </div>
            </section>

            <section className="pt-section-dark" id="how-it-works">
              <div className="pt-wrap pt-section-pad">
                <Reveal>
                  <p className="pt-kicker">How it works</p>
                  <h2 className="pt-section-title">From first contact to a lead your team can use.</h2>
                  <p className="pt-section-copy">
                    A visual path — not a form that sits unanswered. The AI Sales Employee responds,
                    captures the details, and alerts the people who can follow up.
                  </p>
                </Reveal>
                <div className="mt-10">
                  <HowItWorksJourney />
                </div>
              </div>
            </section>

            <section className="pt-section-light" id="control">
              <div className="pt-wrap pt-section-pad">
                <Reveal>
                  <p className="pt-kicker">Configured around your company</p>
                  <h2 className="pt-section-title">Built around your business.</h2>
                  <p className="pt-section-copy">
                    The AI Sales Employee is set up with the services, areas, tone, information, and
                    pricing rules you provide — so chat and inbound calls represent the same
                    business.
                  </p>
                </Reveal>
                <div className="mt-10">
                  <ControlGrid />
                </div>
              </div>
            </section>

            <section className="pt-section-media" id="see-it">
              <div className="pt-wrap pt-section-pad">
                <Reveal>
                  <p className="pt-kicker">See it in action</p>
                  <h2 className="pt-section-title">A customer conversation, from first question to a secured lead.</h2>
                  <p className="pt-section-copy">
                    Watch how the AI Sales Employee handles a real home-service inquiry — then try
                    the live chat with your own website.
                  </p>
                </Reveal>
                <Reveal className="mt-10" delay={80}>
                  <VideoPreview />
                </Reveal>
              </div>
            </section>

            <section className="pt-section-test" id="try">
              <div className="pt-convert-grid">
                <div className="pt-convert-copy">
                  <TestStoryVisual />
                  <p className="pt-kicker">Test before you buy</p>
                  <h2 className="pt-section-title">Try your own personalized chat and voice experience first.</h2>
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

            <section className="pt-section-mist" id="industries">
              <div className="pt-wrap pt-section-pad">
                <Reveal>
                  <p className="pt-kicker">Built for home services</p>
                  <h2 className="pt-section-title">Made for the trades that live on inbound work.</h2>
                  <p className="pt-section-copy">
                    PulseTech is built first for US home-service businesses that cannot afford to
                    miss a ready customer.
                  </p>
                </Reveal>
                <div className="mt-10">
                  <IndustriesGrid />
                </div>
              </div>
            </section>

            <section className="pt-section-cta" id="final-cta">
              <div className="pt-wrap pt-section-pad pt-cta-inner">
                <Reveal>
                  <p className="pt-kicker">Keep the next ready customer</p>
                  <h2 className="pt-section-title">Do not lose the job because nobody picked up.</h2>
                  <p className="pt-section-copy">
                    Put an AI Sales Employee on your website and inbound line so interested
                    customers are spoken to immediately — and your team gets the lead while it is
                    still yours to win.
                  </p>
                  <button
                    type="button"
                    className="pt-btn-primary mt-8 inline-flex"
                    onClick={() => focusLiveChat("live-chat")}
                  >
                    Build Your AI Sales Employee
                  </button>
                </Reveal>
              </div>
            </section>
          </main>

          <footer className="pt-footer">
            <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div>
                <BrandLogo />
                <p className="pt-footer-tag">AI Sales Employees for home-service businesses</p>
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
