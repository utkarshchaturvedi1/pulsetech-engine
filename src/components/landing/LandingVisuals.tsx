"use client";

import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "framer-motion";
import { useRef, useState, type ReactNode } from "react";

const ICON = "/branding/pulsetech-icon-color.svg";

/* ─── Hero product canvas ─────────────────────────────────────────────── */

export function HeroProductScene({ children }: { children: ReactNode }) {
  return (
    <div className="pt-product-scene" aria-label="AI Sales Employee product scene">
      <div className="pt-product-scene-glow" aria-hidden />
      <div className="pt-product-canvas">
        <div className="pt-product-channels" aria-hidden>
          <span className="pt-channel-pill pt-channel-pill-active">
            <i className="pt-channel-dot" />
            Website chat
          </span>
          <span className="pt-channel-pill">
            <i className="pt-channel-dot pt-channel-dot-call" />
            Inbound call
          </span>
        </div>

        <div className="pt-product-main">
          <div className="pt-product-chat-col">
            <p className="pt-product-label">Live AI Sales Employee</p>
            {children}
          </div>

          <aside className="pt-product-side" aria-hidden>
            <div className="pt-side-card pt-side-inquiry">
              <p className="pt-side-kicker">1 · Inquiry</p>
              <p className="pt-side-title">Weekend availability?</p>
              <p className="pt-side-meta">High-intent visitor · just now</p>
            </div>

            <div className="pt-side-card pt-side-reply">
              <p className="pt-side-kicker">2 · Instant reply</p>
              <p className="pt-side-body">
                “I can help with that. What’s the best number to reach you?”
              </p>
            </div>

            <div className="pt-side-card pt-side-secure">
              <p className="pt-side-kicker">3 · Details secured</p>
              <ul className="pt-side-fields">
                <li>
                  <span>Name</span>
                  <strong>Jordan Blake</strong>
                </li>
                <li>
                  <span>Phone</span>
                  <strong>(512) 555-0147</strong>
                </li>
                <li>
                  <span>Need</span>
                  <strong>Weekend availability</strong>
                </li>
              </ul>
            </div>

            <div className="pt-side-card pt-side-alert">
              <div className="pt-side-alert-head">
                <img src={ICON} alt="" />
                <div>
                  <p className="pt-side-kicker">4 · Business alert</p>
                  <p className="pt-side-title">Sent to your team</p>
                </div>
              </div>
              <p className="pt-side-meta">Email + SMS · while the customer is still engaged</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ─── Sticky scroll story ─────────────────────────────────────────────── */

const STORY_STEPS = [
  {
    title: "A customer reaches out",
    copy: "A ready visitor opens website chat — or calls your inbound line — while interest is still high.",
    visual: "reach",
  },
  {
    title: "AI responds immediately",
    copy: "Your AI Sales Employee answers in the moment, so the inquiry never sits unanswered.",
    visual: "respond",
  },
  {
    title: "The right details are secured",
    copy: "Name, phone, and inquiry details are captured in the conversation — ready for your team.",
    visual: "secure",
  },
  {
    title: "Your team is alerted",
    copy: "An immediate internal alert reaches the people you choose, while the customer is still engaged.",
    visual: "alert",
  },
] as const;

function StoryVisual({ kind }: { kind: (typeof STORY_STEPS)[number]["visual"] }) {
  const reduce = useReducedMotion();
  const enter = reduce ? false : { opacity: 0, y: 16 };
  const shown = { opacity: 1, y: 0 };
  const leave = reduce ? undefined : { opacity: 0, y: -12 };

  return (
    <div className={`pt-story-visual pt-story-visual-${kind}`}>
      <div className="pt-story-frame">
        <div className="pt-story-frame-bar">
          <span />
          <span />
          <span />
          <p>PulseTech · AI Sales Employee</p>
        </div>

        <AnimatePresence mode="wait">
          {kind === "reach" && (
            <motion.div
              key="reach"
              className="pt-story-panel"
              initial={enter}
              animate={shown}
              exit={leave}
              transition={{ duration: 0.35 }}
            >
              <div className="pt-story-split">
                <div className="pt-story-channel">
                  <p className="pt-story-chip">Website chat</p>
                  <div className="pt-story-bubble pt-story-bubble-in">
                    Do you have availability this weekend for a private event?
                  </div>
                </div>
                <div className="pt-story-channel">
                  <p className="pt-story-chip">Inbound call</p>
                  <div className="pt-story-call">
                    <img src={ICON} alt="" />
                    <div>
                      <strong>Incoming</strong>
                      <p>High-intent caller</p>
                    </div>
                    <em>0:01</em>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {kind === "respond" && (
            <motion.div
              key="respond"
              className="pt-story-panel"
              initial={enter}
              animate={shown}
              exit={leave}
              transition={{ duration: 0.35 }}
            >
              <div className="pt-story-thread">
                <div className="pt-story-bubble pt-story-bubble-in">
                  Do you have availability this weekend?
                </div>
                <div className="pt-story-bubble pt-story-bubble-out">
                  I can help with that right away. What’s the best number to reach you, and your
                  name?
                </div>
                <p className="pt-story-status">Responded instantly · conversation active</p>
              </div>
            </motion.div>
          )}

          {kind === "secure" && (
            <motion.div
              key="secure"
              className="pt-story-panel"
              initial={enter}
              animate={shown}
              exit={leave}
              transition={{ duration: 0.35 }}
            >
              <p className="pt-story-chip">Secured in conversation</p>
              <div className="pt-story-fields">
                <div>
                  <span>Name</span>
                  <strong>Jordan Blake</strong>
                </div>
                <div>
                  <span>Phone</span>
                  <strong>(512) 555-0147</strong>
                </div>
                <div>
                  <span>Inquiry</span>
                  <strong>Weekend private event</strong>
                </div>
                <div>
                  <span>Preferred time</span>
                  <strong>Saturday afternoon</strong>
                </div>
              </div>
            </motion.div>
          )}

          {kind === "alert" && (
            <motion.div
              key="alert"
              className="pt-story-panel"
              initial={enter}
              animate={shown}
              exit={leave}
              transition={{ duration: 0.35 }}
            >
              <div className="pt-story-alert-card">
                <div className="pt-story-alert-top">
                  <img src={ICON} alt="" />
                  <div>
                    <p className="pt-story-chip">Business alert</p>
                    <strong>New lead ready</strong>
                  </div>
                  <span className="pt-story-now">Now</span>
                </div>
                <p>
                  Jordan Blake · (512) 555-0147 · Weekend private event · Saturday afternoon
                </p>
                <div className="pt-story-alert-tags">
                  <span>Email</span>
                  <span>SMS</span>
                  <span>Internal only</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function InquiryProtectStory() {
  const reduce = useReducedMotion();
  const pinRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: pinRef,
    offset: ["start start", "end end"],
  });
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (progress) => {
    const next = Math.min(
      STORY_STEPS.length - 1,
      Math.max(0, Math.floor(progress * STORY_STEPS.length))
    );
    setActive((prev) => (prev === next ? prev : next));
  });

  if (reduce) {
    return (
      <div className="pt-story pt-story-static">
        <ol className="pt-story-mobile-list">
          {STORY_STEPS.map((step) => (
            <li key={step.title} className="pt-story-mobile-item">
              <div className="pt-story-mobile-copy">
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </div>
              <StoryVisual kind={step.visual} />
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <>
      {/* Desktop sticky pin */}
      <div ref={pinRef} className="pt-story-pin-track">
        <div className="pt-story-pin-sticky">
          <div className="pt-story-pin-grid">
            <ol className="pt-story-steps">
              {STORY_STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className={`pt-story-step${active === index ? " is-active" : ""}`}
                >
                  <button
                    type="button"
                    className="pt-story-step-btn"
                    onClick={() => {
                      const el = pinRef.current;
                      if (!el) return;
                      const rect = el.getBoundingClientRect();
                      const top = window.scrollY + rect.top;
                      const height = el.offsetHeight - window.innerHeight;
                      const target = top + (height * index) / (STORY_STEPS.length - 1);
                      window.scrollTo({ top: target, behavior: "smooth" });
                    }}
                  >
                    <span className="pt-story-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="pt-story-step-text">
                      <strong>{step.title}</strong>
                      <em>{step.copy}</em>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="pt-story-stage">
              <StoryVisual kind={STORY_STEPS[active].visual} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile stacked sequence */}
      <div className="pt-story-mobile">
        <ol className="pt-story-mobile-list">
          {STORY_STEPS.map((step) => (
            <li key={step.title} className="pt-story-mobile-item">
              <div className="pt-story-mobile-copy">
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
              </div>
              <StoryVisual kind={step.visual} />
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/* ─── Dual channel ────────────────────────────────────────────────────── */

export function DualChannelVisual() {
  return (
    <div className="pt-dual-stage">
      <article className="pt-dual-panel pt-dual-chat">
        <header>
          <p className="pt-kicker">Website chat</p>
          <h3>Answers the visitor already on your site.</h3>
        </header>
        <div className="pt-mock-chat">
          <p className="pt-example-tag">Home Services example</p>
          <div className="pt-mock-bubble in">
            Can you send someone for AC repair today? 8914 Willow Creek Ln.
          </div>
          <div className="pt-mock-bubble out">
            I can help with that. What’s the best number to reach you, and your name?
          </div>
          <div className="pt-mock-bubble in">Jordan Blake, (512) 555-0147. Late afternoon.</div>
          <div className="pt-mock-bubble out">
            Thanks, Jordan. I’ve captured your name, phone, service address, and request.
          </div>
        </div>
      </article>

      <article className="pt-dual-panel pt-dual-call">
        <header>
          <p className="pt-kicker">Inbound phone</p>
          <h3>Answers the caller when your line would otherwise wait.</h3>
        </header>
        <div className="pt-mock-call">
          <div className="pt-mock-call-hero">
            <img src={ICON} alt="" />
            <div>
              <strong>AI Sales Employee</strong>
              <p>Inbound line · live</p>
            </div>
          </div>
          <p className="pt-mock-quote">
            “Hi, this is the AI Sales Employee for Harbor &amp; Pine. I can take the details and
            have the team follow up.”
          </p>
          <ul className="pt-mock-capture">
            <li>Name and phone</li>
            <li>Inquiry details</li>
            <li>Booking or service requirements</li>
            <li>Preferred time</li>
          </ul>
        </div>
      </article>
    </div>
  );
}

/* ─── Setup / control ─────────────────────────────────────────────────── */

const SETUP_ITEMS = [
  {
    title: "Welcome message",
    copy: "How the AI Sales Employee introduces your company at the start of a conversation.",
    preview: "Thanks for reaching Harbor & Pine. How can we help today?",
  },
  {
    title: "Services and FAQs",
    copy: "Conversations stay inside the work you actually do — hours, policies, and common questions.",
    preview: "HVAC · Plumbing · Electrical",
  },
  {
    title: "Lead-alert recipient",
    copy: "New-lead alerts go to the people on your team who can respond.",
    preview: "dispatch@yourcompany.com",
  },
  {
    title: "Business rules",
    copy: "Service areas, pricing guidance you approve, and what the AI should never invent.",
    preview: "Austin metro · no invented rates",
  },
  {
    title: "Preferred communication style",
    copy: "Professional, direct, or warm — trained to sound like your company.",
    preview: "Professional · clear · helpful",
  },
];

export function SetupExperience() {
  return (
    <div className="pt-setup">
      <p className="pt-setup-note">
        Presented as the setup experience — not a live client portal. Personal login and dashboard
        are a future product milestone.
      </p>
      <div className="pt-setup-grid">
        {SETUP_ITEMS.map((item, index) => (
          <article key={item.title} className="pt-setup-card">
            <span className="pt-setup-index">{String(index + 1).padStart(2, "0")}</span>
            <h3>{item.title}</h3>
            <p>{item.copy}</p>
            <div className="pt-setup-preview">{item.preview}</div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ─── Future capability ───────────────────────────────────────────────── */

export function FutureVisualCard() {
  return (
    <article className="pt-future-card">
      <div className="pt-future-badge">Upcoming</div>
      <h3>Next: Visual inquiry context</h3>
      <p>Let customers share photos and videos when the conversation needs more context.</p>
      <div className="pt-future-mock" aria-hidden>
        <div className="pt-future-slot">Photo</div>
        <div className="pt-future-slot">Video</div>
        <div className="pt-future-slot pt-future-slot-soon">Coming later</div>
      </div>
    </article>
  );
}

/* ─── Industries ──────────────────────────────────────────────────────── */

const INDUSTRIES = [
  {
    name: "Home Services",
    copy: "High-intent repair and install inquiries answered as they come in. A service address can appear when the work is at a property.",
    tags: ["HVAC", "Plumbing", "Electrical", "Roofing", "Solar"],
    tone: "home",
  },
  {
    name: "Events & Venues",
    copy: "Tour requests, date holds, and event details captured while the planner is still engaged.",
    tags: ["Wedding venues", "Banquet halls", "Event spaces"],
    tone: "events",
  },
  {
    name: "Premium Travel & Charter",
    copy: "Charter and luxury transport inquiries captured with the booking requirements your team needs.",
    tags: ["Yacht charter", "Private aviation", "Luxury transport"],
    tone: "travel",
  },
  {
    name: "Professional & Local Services",
    copy: "Consults, estimates, and appointment interest captured before the next provider is called.",
    tags: ["Legal", "Real estate", "Clinics", "Cleaning"],
    tone: "pro",
  },
];

export function IndustriesGrid() {
  return (
    <div className="pt-industry-grid">
      {INDUSTRIES.map((item) => (
        <article key={item.name} className={`pt-industry-card pt-industry-${item.tone}`}>
          <div className="pt-industry-art" aria-hidden />
          <div className="pt-industry-body">
            <h3>{item.name}</h3>
            <p>{item.copy}</p>
            <ul>
              {item.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          </div>
        </article>
      ))}
    </div>
  );
}
