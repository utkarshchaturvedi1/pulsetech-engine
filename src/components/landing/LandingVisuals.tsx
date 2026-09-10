"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

export const LANDING_SAMPLE_VIDEO_SRC: string | null = null;
export const LANDING_SAMPLE_VIDEO_POSTER: string | undefined = undefined;

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.classList.add("is-inview");
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-inview");
          io.disconnect();
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`pt-reveal ${className}`.trim()}
      style={delay ? ({ "--pt-reveal-delay": `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

export function HeroLeadVisual({ children }: { children: ReactNode }) {
  return (
    <div className="pt-hero-stage">
      <div className="pt-hero-aurora" aria-hidden />
      <div className="pt-hero-grid-lines" aria-hidden />
      <svg className="pt-hero-trails" viewBox="0 0 640 720" aria-hidden>
        <defs>
          <linearGradient id="ptTrail" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7146E8" />
            <stop offset="45%" stopColor="#2F63F5" />
            <stop offset="100%" stopColor="#20D8F3" />
          </linearGradient>
        </defs>
        <path
          className="pt-trail-path"
          d="M90 86 C 180 86, 210 160, 320 210 C 430 260, 470 320, 540 132"
          fill="none"
          stroke="url(#ptTrail)"
          strokeWidth="1.6"
        />
        <path
          className="pt-trail-path pt-trail-path-delay"
          d="M90 620 C 200 560, 250 480, 320 430 C 410 370, 500 430, 540 610"
          fill="none"
          stroke="url(#ptTrail)"
          strokeWidth="1.6"
        />
      </svg>
      <article className="pt-flow-chip pt-flow-chip-inquiry">
        <span className="pt-chip-dot pt-chip-dot-aqua" />
        <div>
          <p className="pt-chip-kicker">Customer inquiry</p>
          <p className="pt-chip-title">Same-day AC repair</p>
          <p className="pt-chip-meta">Website chat · Austin, TX</p>
        </div>
      </article>

      <article className="pt-flow-chip pt-flow-chip-lead">
        <span className="pt-chip-dot pt-chip-dot-gold" />
        <div>
          <p className="pt-chip-kicker">Secured lead</p>
          <p className="pt-chip-title">Jordan Blake</p>
          <p className="pt-chip-meta">(512) 555-0147 · 8914 Willow Creek Ln</p>
        </div>
      </article>

      <article className="pt-flow-chip pt-flow-chip-alert">
        <span className="pt-chip-dot pt-chip-dot-coral" />
        <div>
          <p className="pt-chip-kicker">Business alert</p>
          <p className="pt-chip-title">Sent to your team now</p>
          <p className="pt-chip-meta">Email + SMS · internal only</p>
        </div>
      </article>

      <div className="pt-hero-chat-slot">
        <p className="pt-hero-slot-label">AI Sales Employee</p>
        {children}
      </div>
    </div>
  );
}

export function ProblemContrast() {
  return (
    <div className="pt-problem-grid">
      <Reveal>
        <article className="pt-problem-card pt-problem-lost">
          <div className="pt-problem-label">Without a fast response</div>
          <h3>A ready customer reaches out. Nobody answers in time.</h3>
          <ol className="pt-problem-steps">
            <li>Visitor or caller asks for service while they are ready to hire.</li>
            <li>The message sits, or the call goes unanswered.</li>
            <li>They contact the next company that picks up.</li>
          </ol>
          <p className="pt-problem-result pt-problem-result-lost">Opportunity lost</p>
        </article>
      </Reveal>
      <Reveal delay={90}>
        <article className="pt-problem-card pt-problem-won">
          <div className="pt-problem-label">With PulseTech</div>
          <h3>The AI Sales Employee responds while interest is still high.</h3>
          <ol className="pt-problem-steps">
            <li>Website chat or inbound call is answered immediately.</li>
            <li>Name, phone, service address, and request are captured in the conversation.</li>
            <li>Your team gets an immediate internal alert and can follow up.</li>
          </ol>
          <p className="pt-problem-result pt-problem-result-won">Lead ready for your team</p>
        </article>
      </Reveal>
    </div>
  );
}

function ChatMock() {
  return (
    <div className="pt-device pt-device-chat">
      <div className="pt-device-bar">
        <span className="pt-device-pips" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <p>Website chat</p>
      </div>
      <div className="pt-device-body">
        <div className="pt-bubble pt-bubble-in">
          Can you send someone for AC repair today? 8914 Willow Creek Ln.
        </div>
        <div className="pt-bubble pt-bubble-out">
          I can help with that. What’s the best number to reach you, and your name?
        </div>
        <div className="pt-bubble pt-bubble-in">
          Jordan Blake, (512) 555-0147. Late afternoon if possible.
        </div>
        <div className="pt-bubble pt-bubble-out">
          Thanks, Jordan. I’ve captured your name, phone, address, and request. I’ll note late afternoon as your preferred time — the team confirms availability.
        </div>
      </div>
    </div>
  );
}

function VoiceMock() {
  return (
    <div className="pt-device pt-device-voice">
      <div className="pt-device-bar">
        <span className="pt-live-dot" />
        <p>Inbound call</p>
        <span>0:42</span>
      </div>
      <div className="pt-device-voice-hero">
        <div className="pt-voice-avatar">
          <img src="/branding/pulsetech-icon-white.png" alt="" />
        </div>
        <div className="pt-wave" aria-hidden>
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i} style={{ "--pt-wave-i": i } as CSSProperties} />
          ))}
        </div>
      </div>
      <div className="pt-device-body">
        <p className="pt-voice-line">
          “Hi, this is the AI Sales Employee for Apex Heating. I can take the details and have the team follow up.”
        </p>
        <ul className="pt-capture-list">
          <li>Name and phone</li>
          <li>Service address</li>
          <li>Customer request</li>
          <li>Preferred visit time</li>
        </ul>
      </div>
    </div>
  );
}

export function DualExperience() {
  return (
    <div className="pt-dual">
      <Reveal className="pt-dual-card">
        <div className="pt-dual-copy">
          <p className="pt-kicker">Website chat</p>
          <h3>Answers the visitor who is already on your site.</h3>
          <p>
            The AI Sales Employee handles the conversation in the moment, then captures the same
            lead details your team needs to follow up.
          </p>
        </div>
        <ChatMock />
      </Reveal>
      <Reveal className="pt-dual-card" delay={80}>
        <div className="pt-dual-copy">
          <p className="pt-kicker">Inbound phone</p>
          <h3>Answers the caller when your line would otherwise wait.</h3>
          <p>
            One product, two customer experiences. Chat and voice collect the same important
            information — and the business confirms availability.
          </p>
        </div>
        <VoiceMock />
      </Reveal>
      <Reveal className="pt-dual-note" delay={120}>
        <p>
          Both conversations capture name, phone number, service address, and the customer request.
          The AI can also capture a preferred visit time. Your team confirms whether that time is
          available.
        </p>
      </Reveal>
    </div>
  );
}

const JOURNEY = [
  {
    title: "Visitor or caller",
    copy: "A customer reaches out on your website or inbound line.",
  },
  {
    title: "Immediate response",
    copy: "The AI Sales Employee answers while they are still interested.",
  },
  {
    title: "Details captured",
    copy: "Name, phone, service address, and request — secured in the conversation.",
  },
  {
    title: "Business alert",
    copy: "Your team is notified immediately, on the contacts you choose.",
  },
  {
    title: "Team follows up",
    copy: "You call back with the context needed to continue the job.",
  },
];

export function HowItWorksJourney() {
  return (
    <Reveal className="pt-journey">
      <div className="pt-journey-rail" aria-hidden>
        <span className="pt-journey-line" />
        <span className="pt-journey-pulse" />
      </div>
      <ol className="pt-journey-track">
        {JOURNEY.map((step, index) => (
          <li key={step.title} className="pt-journey-step">
            <span className="pt-journey-index">{String(index + 1).padStart(2, "0")}</span>
            <h3>{step.title}</h3>
            <p>{step.copy}</p>
          </li>
        ))}
      </ol>
    </Reveal>
  );
}

function MiniField({ label, value }: { label: string; value: string }) {
  return (
    <div className="pt-mini-field">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const CONTROL_CARDS = [
  {
    title: "Business name and welcome message",
    copy: "How the AI Sales Employee introduces your company at the start of a conversation.",
    preview: (
      <>
        <MiniField label="Business" value="Apex Heating & Air" />
        <MiniField label="Welcome" value="Thanks for reaching Apex. How can we help today?" />
      </>
    ),
  },
  {
    title: "Services offered",
    copy: "Conversations stay inside the work you actually do.",
    preview: (
      <>
        <MiniField label="Services" value="AC repair · Maintenance · Installs" />
        <MiniField label="Out of scope" value="Redirected, not invented" />
      </>
    ),
  },
  {
    title: "Service areas",
    copy: "Leads are qualified against the places you serve.",
    preview: (
      <>
        <MiniField label="Areas" value="Austin · Round Rock · Cedar Park" />
        <MiniField label="Outside area" value="Captured, then flagged for the team" />
      </>
    ),
  },
  {
    title: "Business information and FAQs",
    copy: "Hours, policies, and common questions stay consistent across chat and phone.",
    preview: (
      <>
        <MiniField label="Hours" value="Mon–Sat, 7am–7pm" />
        <MiniField label="FAQ" value="After-hours calls are still answered" />
      </>
    ),
  },
  {
    title: "Conversation tone",
    copy: "Professional, direct, or warm — trained to sound like your company.",
    preview: (
      <>
        <MiniField label="Tone" value="Clear, calm, no-pressure" />
        <MiniField label="Style" value="Home-service, not a script dump" />
      </>
    ),
  },
  {
    title: "Pricing and fee rules",
    copy: "Share only the pricing and fee guidance you approve — never invented rates.",
    preview: (
      <>
        <MiniField label="Fees" value="Use your stated visit / diagnostic rules" />
        <MiniField label="Quotes" value="Team confirms job pricing" />
      </>
    ),
  },
  {
    title: "Lead-alert email and phone contacts",
    copy: "New-lead alerts go to the people on your team who can respond.",
    preview: (
      <>
        <MiniField label="Email" value="dispatch@yourcompany.com" />
        <MiniField label="SMS" value="On-call manager number" />
      </>
    ),
  },
];

export function ControlGrid() {
  return (
    <div className="pt-control-grid">
      {CONTROL_CARDS.map((card, index) => (
        <Reveal key={card.title} delay={index * 45}>
          <article className="pt-ui-card">
            <div className="pt-ui-card-head">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{card.title}</h3>
            </div>
            <p className="pt-ui-card-copy">{card.copy}</p>
            <div className="pt-ui-card-preview">{card.preview}</div>
          </article>
        </Reveal>
      ))}
    </div>
  );
}

export function VideoPreview() {
  if (LANDING_SAMPLE_VIDEO_SRC) {
    return (
      <div className="pt-video-frame">
        <video
          className="pt-video"
          controls
          playsInline
          preload="metadata"
          poster={LANDING_SAMPLE_VIDEO_POSTER}
        >
          <source src={LANDING_SAMPLE_VIDEO_SRC} type="video/mp4" />
        </video>
      </div>
    );
  }

  return (
    <div
      className="pt-video-frame pt-video-preview"
      role="img"
      aria-label="Watch a sample customer conversation. This is a preview frame until a video is added."
    >
      <div className="pt-video-glow" aria-hidden />
      <div className="pt-video-scene" aria-hidden>
        <div className="pt-video-scene-chat">
          <span>Need AC repair today at 8914 Willow Creek.</span>
          <span>I can help — what’s the best number to reach you?</span>
          <span>Jordan Blake · (512) 555-0147</span>
        </div>
        <div className="pt-video-scene-phone">
          <strong>Inbound call</strong>
          <p>Lead alert sent to dispatch</p>
        </div>
      </div>
      <div className="pt-video-overlay">
        <span className="pt-play" aria-hidden>
          <svg viewBox="0 0 24 24">
            <path d="M8.4 5.6v12.8L19 12 8.4 5.6Z" />
          </svg>
        </span>
        <p>Watch a sample customer conversation</p>
        <span className="pt-video-caption">Preview · sample walkthrough coming soon</span>
      </div>
    </div>
  );
}

const INDUSTRIES = [
  {
    name: "HVAC",
    copy: "Repair, maintenance, and install inquiries answered as they come in.",
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden>
        <rect x="10" y="18" width="44" height="28" rx="6" fill="#111633" stroke="#20D8F3" strokeWidth="1.6" />
        <circle cx="32" cy="32" r="8" fill="none" stroke="#7146E8" strokeWidth="1.8" />
        <path d="M32 20v4M32 40v4M20 32h4M40 32h4" stroke="#FFBD59" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "Plumbing",
    copy: "Emergency and scheduled work captured before the next plumber is called.",
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M18 14h12v10H18z" fill="#111633" stroke="#2F63F5" strokeWidth="1.6" />
        <path d="M24 24v8c0 8 16 8 16 0V22" fill="none" stroke="#16C7B7" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="40" cy="20" r="5" fill="#7146E8" />
      </svg>
    ),
  },
  {
    name: "Electrical",
    copy: "Panel, wiring, and outage requests handled while the caller is still on the line.",
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden>
        <rect x="18" y="12" width="28" height="40" rx="4" fill="#111633" stroke="#7146E8" strokeWidth="1.6" />
        <path d="M34 20 26 34h8l-4 12 14-18h-8l6-8Z" fill="#FFBD59" />
      </svg>
    ),
  },
  {
    name: "Roofing",
    copy: "Storm damage and replacement leads collected with address and request intact.",
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M10 30 32 12l22 18" fill="none" stroke="#2F63F5" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M16 28v24h32V28" fill="#111633" stroke="#16C7B7" strokeWidth="1.6" />
        <rect x="28" y="36" width="8" height="16" fill="#7146E8" />
      </svg>
    ),
  },
  {
    name: "Solar",
    copy: "Site-visit interest captured with the details your estimators need.",
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden>
        <circle cx="20" cy="20" r="7" fill="#FFBD59" />
        <rect x="24" y="28" width="28" height="20" rx="3" transform="rotate(-18 38 38)" fill="#111633" stroke="#20D8F3" strokeWidth="1.6" />
        <path d="M30 30l22 8M28 38l22 8M36 26l8 22" stroke="#7146E8" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    name: "Landscaping",
    copy: "Design, maintenance, and seasonal work inquiries answered immediately.",
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M32 50V28" stroke="#16C7B7" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M32 34c-10-2-16-12-14-20 10 2 16 12 14 20Z" fill="#111633" stroke="#2F63F5" strokeWidth="1.5" />
        <path d="M32 30c10-2 16-12 14-20-10 2-16 12-14 20Z" fill="#111633" stroke="#7146E8" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    name: "Pest Control",
    copy: "Inspection and treatment requests secured before the homeowner moves on.",
    icon: (
      <svg viewBox="0 0 64 64" aria-hidden>
        <path d="M32 12 48 20v14c0 12-10 20-16 22-6-2-16-10-16-22V20Z" fill="#111633" stroke="#16C7B7" strokeWidth="1.6" />
        <path d="M24 34h16M32 26v16" stroke="#FFBD59" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function IndustriesGrid() {
  return (
    <div className="pt-industry-grid">
      {INDUSTRIES.map((item, index) => (
        <Reveal key={item.name} delay={index * 40}>
          <article className="pt-industry-card">
            <div className="pt-industry-icon">{item.icon}</div>
            <h3>{item.name}</h3>
            <p>{item.copy}</p>
          </article>
        </Reveal>
      ))}
    </div>
  );
}

export function TestStoryVisual() {
  return (
    <div className="pt-test-story" aria-hidden>
      <div className="pt-test-orb pt-test-orb-a" />
      <div className="pt-test-orb pt-test-orb-b" />
      <div className="pt-test-orb pt-test-orb-c" />
      <div className="pt-test-path">
        <span>Your website</span>
        <span>Personalized chat</span>
        <span>Voice experience</span>
        <span>Go live when ready</span>
      </div>
    </div>
  );
}
