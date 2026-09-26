"use client";

import dynamic from "next/dynamic";
import {
  BusinessIntelligence,
  ControlRail,
  FaqSection,
  HeroProductScene,
  InboundSignal,
  IndustriesGrid,
  PeterTransfer,
  ProcessJourney,
  RevenueCalculator,
} from "./LandingVisuals";
import SiteFooter from "./SiteFooter";
import "./landing.css";

const PulseTechSalesAssistant = dynamic(() => import("../PulseTechSalesAssistant"), {
  ssr: false,
  loading: () => <div className="pt-chat-loading">Preparing your AI Sales Employee...</div>,
});

const LOGO = "/branding/pulsetech-logo-color.svg";
const ICON = "/branding/pulsetech-icon-color.svg";

function focusLiveChat() {
  const root = document.getElementById("live-chat");
  root?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => {
    const input = root?.querySelector("input");
    if (input instanceof HTMLInputElement) input.focus();
  }, 550);
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function LiveChat() {
  return (
    <div id="live-chat" className="pt-live-chat">
      <div className="pt-live-chat-top">
        <span><img src={ICON} alt="" /> LIVE DEMO</span>
        <small>Enter your website to begin</small>
      </div>
      <div className="pt-live-chat-body">
        <PulseTechSalesAssistant agentName="Peter" agentRole="AI Sales Employee" agentAvatar={ICON} />
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="pt-landing">
      <header className="pt-header">
        <div className="pt-nav">
          <a href="#top" aria-label="PulseTech Labs"><img src={LOGO} className="pt-logo" alt="PulseTech Labs" /></a>
          <nav aria-label="Page navigation">
            <button onClick={() => scrollToId("how-it-works")}>How it works</button>
            <button onClick={() => scrollToId("revenue")}>Revenue Calculator</button>
            <button onClick={() => scrollToId("industries")}>Industries</button>
          </nav>
          <button className="pt-button pt-button-small" onClick={focusLiveChat}>Experience Yours</button>
        </div>
      </header>

      <main id="top">
        <section className="pt-hero">
          <div className="pt-hero-cinema" aria-hidden="true">
            <video className="pt-hero-video" autoPlay muted loop playsInline preload="metadata">
              <source src="/assets/website/pulsetech-hero-motion.mp4" type="video/mp4" />
            </video>
            <div className="pt-hero-video-wash" />
            <div className="pt-hero-video-grid" />
          </div>
          <div className="pt-hero-copy">
            <p className="pt-eyebrow">AI SALES EMPLOYEE FOR HIGH-INTENT BUSINESSES</p>
            <h1>Every customer inquiry matters.<span>Make sure none are missed.</span></h1>
            <p className="pt-lead">PulseTech gives your business an AI Sales Employee that responds instantly on website chat and inbound calls, captures the information your team needs, and alerts you while the customer is still engaged.</p>
            <div className="pt-actions">
              <button className="pt-button" onClick={focusLiveChat}>See Your Customized AI Sales Employee</button>
              <button className="pt-button-ghost" onClick={() => scrollToId("how-it-works")}>See How It Works <span>↓</span></button>
            </div>
            <p className="pt-micro">Enter your website in the chat to see it working around your business.</p>
          </div>
          <HeroProductScene><LiveChat /></HeroProductScene>
        </section>

        <section className="pt-section pt-process-section" id="how-it-works">
          <div className="pt-heading">
            <p className="pt-eyebrow">FROM INQUIRY TO OPPORTUNITY</p>
            <h2>What Your AI Sales Employee Does</h2>
            <p>Communicates naturally like a human, answering questions and handling objections so customers feel comfortable taking the next step.</p>
          </div>
          <ProcessJourney />
          <p className="pt-exclusive">Built exclusively around <strong>your business.</strong></p>
        </section>

        <section className="pt-section pt-intelligence-section">
          <div className="pt-heading">
            <p className="pt-eyebrow">BUSINESS-SPECIFIC INTELLIGENCE</p>
            <h2>It learns the way your business works.</h2>
            <p>Services, service areas, business hours, policies, pricing rules and customer questions become the knowledge your AI Sales Employee uses in every conversation.</p>
          </div>
          <BusinessIntelligence />
        </section>

        <section className="pt-section pt-revenue-section" id="revenue">
          <div className="pt-heading">
            <p className="pt-eyebrow">THE VALUE ALREADY REACHING YOU</p>
            <h2>What could missed opportunities be worth?</h2>
          </div>
          <RevenueCalculator />
        </section>

        <section className="pt-section pt-inbound-section">
          <div className="pt-heading">
            <p className="pt-eyebrow">RESPOND WHILE INTENT IS HIGH</p>
            <h2>Every inbound enquiry is a hot lead.</h2>
            <p>They've already taken the first step. They're looking for help, asking a question, or considering your service. The longer they wait, the greater the chance they move on to another business.</p>
          </div>
          <InboundSignal />
          <div className="pt-inbound-copy">
            <p>Your AI Sales Employee engages them immediately, communicates naturally, handles their questions and objections, and works to secure their contact details before that opportunity disappears.</p>
            <strong>Capture the opportunity before your competitor does.</strong>
          </div>
        </section>

        <section className="pt-section" id="industries">
          <div className="pt-heading">
            <p className="pt-eyebrow">BUILT FOR HIGH-INTENT BUSINESS</p>
            <h2>Who is PulseTech built for?</h2>
            <p>For businesses where an inbound enquiry can become real revenue.</p>
          </div>
          <IndustriesGrid />
          <p className="pt-section-note">And other service businesses where customers call or enquire online before choosing who to work with.</p>
        </section>

        <section className="pt-section pt-peter-section">
          <div className="pt-heading">
            <p className="pt-eyebrow">YOUR BUSINESS. YOUR RULES.</p>
            <h2>Not another generic AI. Yours.</h2>
            <p>Your AI Sales Employee is built specifically around your business, your services and the way you work. And your website doesn't need to contain everything.</p>
          </div>
          <PeterTransfer />
        </section>

        <section className="pt-section pt-control-section">
          <div className="pt-heading">
            <p className="pt-eyebrow">CONTROL WITHOUT COMPLEXITY</p>
            <h2>Your AI works for you. You stay in control.</h2>
          </div>
          <ControlRail />
        </section>

        <FaqSection />

        <section className="pt-final-cta">
          <div className="pt-final-orb" aria-hidden="true" />
          <p className="pt-eyebrow">YOUR NEXT INQUIRY COULD ARRIVE ANY MOMENT</p>
          <h2>Ready to see yours in action?</h2>
          <p>Experience your AI Sales Employee with your own business.</p>
          <button className="pt-button" onClick={focusLiveChat}>Experience Your AI Sales Employee</button>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
