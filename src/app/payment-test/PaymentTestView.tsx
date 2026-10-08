"use client";

import Script from "next/script";
import { useRef, useState } from "react";

const PADDLE_JS_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

type PaddleEvent = {
  name?: string;
  data?: {
    error?: { detail?: string; message?: string };
  };
};

type PaddleJs = {
  Environment: {
    set: (environment: "sandbox") => void;
  };
  Initialize: (options: {
    token: string;
    eventCallback?: (event: PaddleEvent) => void;
  }) => void;
  Checkout: {
    open: (options: { items: { priceId: string; quantity: number }[] }) => void;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

type CheckoutConfig = {
  clientToken: string;
  setupPriceId: string;
  monthlyPriceId: string;
  problems: string[];
};

function readConfig(clientToken: string, setupPriceId: string, monthlyPriceId: string): CheckoutConfig {
  const token = clientToken.trim();
  const setup = setupPriceId.trim();
  const monthly = monthlyPriceId.trim();
  const problems: string[] = [];

  if (!token) {
    problems.push("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is empty.");
  } else if (token.startsWith("live_")) {
    problems.push(
      "The client token starts with live_. This page only accepts a Sandbox token that starts with test_.",
    );
  } else if (!/^test_[A-Za-z0-9]+$/.test(token)) {
    problems.push(
      "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN must be a Sandbox client-side token starting with test_.",
    );
  }

  if (!setup) {
    problems.push("NEXT_PUBLIC_PADDLE_SETUP_PRICE_ID is empty.");
  } else if (!/^pri_[a-z\d]+$/i.test(setup)) {
    problems.push("NEXT_PUBLIC_PADDLE_SETUP_PRICE_ID must be a Paddle price ID starting with pri_.");
  }

  if (!monthly) {
    problems.push("NEXT_PUBLIC_PADDLE_MONTHLY_PRICE_ID is empty.");
  } else if (!/^pri_[a-z\d]+$/i.test(monthly)) {
    problems.push(
      "NEXT_PUBLIC_PADDLE_MONTHLY_PRICE_ID must be a Paddle price ID starting with pri_.",
    );
  }

  if (setup && monthly && setup === monthly) {
    problems.push("The setup price ID and the monthly price ID must be two different Sandbox prices.");
  }

  return { clientToken: token, setupPriceId: setup, monthlyPriceId: monthly, problems };
}

const NAV = ["Product", "How it works", "Pricing", "Support"] as const;

const AVAILABLE_MONTHLY = [
  "Website chat AI Sales Employee",
  "Inbound voice call AI Sales Employee",
  "Hosting, AI processing, and tools needed to operate and maintain the system",
  "Email support from PulseTech",
  "Email and SMS lead alerts to one designated email address and one mobile number",
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-5 w-5 shrink-0 text-[#2563eb]">
      <circle cx="10" cy="10" r="9" fill="#eff6ff" />
      <path
        d="M6 10.2 8.4 12.6 14 7.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckoutButton({
  ready,
  loading,
  onClick,
  compact = false,
}: {
  ready: boolean;
  loading: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  if (!ready) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#2563eb] font-semibold text-white shadow-sm transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-slate-400 ${
        compact ? "px-4 py-2.5 text-sm" : "px-6 py-3 text-base"
      }`}
    >
      {loading ? "Loading Paddle.js…" : "Start sandbox checkout"}
      <span aria-hidden="true">→</span>
    </button>
  );
}

function PricingPage({
  readyToLoad,
  scriptReady,
  problems,
  status,
  scriptError,
  onCheckout,
}: {
  readyToLoad: boolean;
  scriptReady: boolean;
  problems: string[];
  status: string;
  scriptError: string;
  onCheckout: () => void;
}) {
  return (
    <div className="min-h-screen bg-white text-[#0b1f44]">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        {/* Logo artwork fills most of the 2400×800 viewBox, with about 6% padding. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/branding/pulsetech-logo-color.svg"
          alt="PulseTech Labs"
          className="h-14 w-auto sm:h-16"
        />
        <nav aria-label="On this page" className="order-3 flex w-full justify-center gap-5 text-sm text-[#5c6b80] md:order-none md:w-auto md:gap-8">
          {NAV.map((item) =>
            item === "Pricing" ? (
              <a
                key={item}
                href="#pricing"
                aria-current="page"
                className="font-semibold text-[#0b1f44] underline decoration-2 underline-offset-8 decoration-[#2563eb]"
              >
                {item}
              </a>
            ) : (
              <span key={item}>{item}</span>
            ),
          )}
        </nav>
        <CheckoutButton ready={readyToLoad} loading={!scriptReady} onClick={onCheckout} compact />
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <p className="mx-auto mt-4 w-fit rounded-full border border-amber-400 bg-amber-100 px-3 py-1 text-center text-xs font-bold tracking-wide text-amber-950 uppercase">
          Sandbox test only
        </p>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-6 text-[#5c6b80]">
          This is a local Paddle Sandbox checkout. It is not linked from the PulseTech Labs site.
          It does not take live payments, and it does not mean Paddle has approved a PulseTech Labs
          account.
        </p>

        <h1 className="mx-auto mt-10 max-w-3xl text-center text-4xl font-bold tracking-tight text-[#0b1f44] sm:text-5xl">
          A dedicated AI Sales Employee{" "}
          <span className="text-[#2563eb]">for your business</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-7 text-[#5c6b80] sm:text-lg">
          Purpose-built around your services, policies, and how your team works.
        </p>

        {problems.length > 0 ? (
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-950">
            <p className="font-semibold">Sandbox checkout is not configured yet.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
            <p className="mt-3">
              Add the placeholders to <code className="font-mono">.env.local</code> (do not commit
              that file), then restart <code className="font-mono">npm run dev</code>.
            </p>
          </div>
        ) : null}

        <section id="pricing" className="mt-12 grid items-stretch gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-[#e6edf5] bg-white p-6 shadow-sm sm:p-8">
            <p className="w-fit rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-bold tracking-wide text-[#2563eb] uppercase">
              One-time setup
            </p>
            <p className="mt-6 text-5xl font-bold tracking-tight text-[#0b1f44] sm:text-6xl">$2,000</p>
            <p className="mt-2 text-sm text-[#5c6b80]">Charged once.</p>
            <p className="mt-6 border-t border-[#e6edf5] pt-6 text-sm leading-7 text-[#334155] sm:text-base">
              We configure your AI Sales Employee specifically for your business using your
              services, policies, operating details, and instructions. Tailored to your business,
              not a generic chatbot.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/pulsetech-business-setup-diagram.png"
              alt="Services, policies, operating details, and owner instructions connected to the AI Sales Employee for website chat and inbound calls."
              className="mx-auto mt-6 h-auto w-full"
            />
          </article>

          <article className="rounded-3xl border-2 border-[#3b82f6] bg-white p-6 shadow-sm sm:p-8">
            <p className="w-fit rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-bold tracking-wide text-[#2563eb] uppercase">
              Monthly service
            </p>
            <p className="mt-6 text-5xl font-bold tracking-tight text-[#0b1f44] sm:text-6xl">
              $500
              <span className="ml-1 text-xl font-medium text-[#5c6b80] sm:text-2xl">/ month</span>
            </p>
            <p className="mt-2 text-sm text-[#5c6b80]">Ongoing service. Billed every month.</p>
            <ul className="mt-6 space-y-3 border-t border-[#e6edf5] pt-6 text-sm leading-6 text-[#1e293b] sm:text-base">
              {AVAILABLE_MONTHLY.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckIcon />
                  <span>{item}</span>
                </li>
              ))}
              <li className="flex items-start gap-3">
                <CheckIcon />
                <span>
                  Business knowledge updates for services, policies, and operating details.
                  <span className="mt-1 block text-sm text-[#5c6b80]">
                    Date and time stamps for each update are not available yet.
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#cbd5e1] text-xs text-[#64748b]"
                >
                  –
                </span>
                <span>
                  Lead list with captured details, conversion status, and sale value.
                  <span className="mt-1 block text-sm font-semibold text-[#5c6b80]">
                    Not available yet.
                  </span>
                </span>
              </li>
            </ul>
            <p className="mt-5 inline-flex rounded-full bg-[#f1f5f9] px-3 py-1.5 text-sm text-[#64748b]">
              Dashboard analysis — Coming soon
            </p>
          </article>
        </section>

        <ul className="mt-8 flex flex-col items-start gap-3 text-sm text-[#334155] sm:flex-row sm:flex-wrap sm:justify-center sm:gap-8">
          <li className="flex items-center gap-2">
            <CheckIcon /> Built for your business
          </li>
          <li className="flex items-center gap-2">
            <CheckIcon /> Ongoing service and support
          </li>
          <li className="flex items-center gap-2">
            <CheckIcon /> Focused on real sales outcomes
          </li>
        </ul>

        <div className="mt-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#0b1f44] sm:text-4xl">
            A business-specific AI employee,{" "}
            <span className="text-[#2563eb]">with ongoing service and support.</span>
          </h2>
          <div className="mt-6 flex justify-center">
            <CheckoutButton ready={readyToLoad} loading={!scriptReady} onClick={onCheckout} />
          </div>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[#5c6b80]">
            Checkout opens with both the $2,000 one-time setup price and the $500/month price. A
            buyer can still change a quantity or remove a line before paying.
          </p>
          {scriptError ? (
            <p className="mt-4 text-sm text-red-700" role="alert">
              {scriptError}
            </p>
          ) : null}
          {status ? (
            <p className="mt-4 text-sm text-[#334155]" role="status">
              {status}
            </p>
          ) : null}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm leading-6 text-[#5c6b80]">
          Uses the Sandbox client-side token only. No secret API key is read or sent from this
          page. Before opening checkout, set the Sandbox default payment link to{" "}
          <code className="font-mono">http://localhost:3000</code> if you are testing on this
          machine.
        </p>
      </main>
    </div>
  );
}

export default function PaymentTestView({
  clientToken,
  setupPriceId,
  monthlyPriceId,
}: {
  clientToken: string;
  setupPriceId: string;
  monthlyPriceId: string;
}) {
  const config = readConfig(clientToken, setupPriceId, monthlyPriceId);
  const readyToLoad = config.problems.length === 0;
  const [scriptReady, setScriptReady] = useState(false);
  const [scriptError, setScriptError] = useState("");
  const [status, setStatus] = useState("");
  const paddleReady = useRef(false);

  function initializePaddle() {
    if (!readyToLoad || !window.Paddle) return false;

    if (!paddleReady.current) {
      window.Paddle.Environment.set("sandbox");
      window.Paddle.Initialize({
        token: config.clientToken,
        eventCallback(event) {
          if (event.name === "checkout.completed") {
            setStatus("Sandbox checkout completed. This page did not send a live charge.");
          } else if (event.name === "checkout.error") {
            const detail = event.data?.error?.detail || event.data?.error?.message;
            setStatus(
              detail ? `Paddle checkout error: ${detail}` : "Paddle checkout reported an error.",
            );
          }
        },
      });
      paddleReady.current = true;
    }

    return true;
  }

  function startCheckout() {
    const paddle = window.Paddle;
    if (!paddle || !initializePaddle()) {
      setStatus("Paddle.js is not ready yet. Wait a moment and try again.");
      return;
    }

    setStatus("");
    paddle.Checkout.open({
      items: [
        { priceId: config.setupPriceId, quantity: 1 },
        { priceId: config.monthlyPriceId, quantity: 1 },
      ],
    });
  }

  return (
    <>
      {readyToLoad ? (
        <Script
          src={PADDLE_JS_SRC}
          strategy="afterInteractive"
          onLoad={() => {
            if (initializePaddle()) setScriptReady(true);
          }}
          onError={() => {
            setScriptError("Paddle.js did not load from https://cdn.paddle.com/paddle/v2/paddle.js.");
          }}
        />
      ) : null}
      <PricingPage
        readyToLoad={readyToLoad}
        scriptReady={scriptReady}
        problems={config.problems}
        status={status}
        scriptError={scriptError}
        onCheckout={startCheckout}
      />
    </>
  );
}
