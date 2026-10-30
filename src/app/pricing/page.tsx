import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteFooter from "@/components/landing/SiteFooter";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./pricing.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-pricing-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Pricing | PulseTech Labs",
  description:
    "PulseTech AI Sales Employee pricing: business-specific setup plus a monthly service for website chat and inbound calls.",
};

const features = [
  "Business-specific AI Sales Employee for website chat and inbound phone calls",
  "Lead capture and lead alerts to your team by email and SMS",
  "Business information updates through Peter, with saved instructions",
  "Hosting and upkeep of the service and its connected tools",
  "Email support from PulseTech Labs",
  "Lead list with fields to track sale conversion and job value",
];

export default function PricingPage() {
  return (
    <div className={`${jakarta.variable} ${jakarta.className} pt-pricing-page`}>
      <header className="pt-pricing-header">
        <div className="pt-pricing-nav">
          <Link href="/" aria-label="PulseTech Labs home">
            <Image
              src="/branding/pulsetech-logo-color.svg"
              alt="PulseTech Labs"
              width={180}
              height={42}
              priority
            />
          </Link>
          <div className="pt-pricing-links">
            <Link href="/">Home</Link>
            <Link href="/login?next=%2Fclient">Log in</Link>
            <a href="mailto:contact@pulsetechlabs.com?subject=PulseTech%20pricing">Contact</a>
          </div>
        </div>
      </header>

      <main className="pt-pricing-main">
        <section className="pt-pricing-intro">
          <p className="pt-pricing-kicker">CLEAR, BUSINESS-SPECIFIC PRICING</p>
          <h1>A sales employee built around your business.</h1>
          <p>
            One-time setup makes the AI Sales Employee specific to your business. The monthly
            service keeps it running across website chat and inbound calls.
          </p>
        </section>

        <section className="pt-pricing-grid" aria-label="PulseTech pricing">
          <article className="pt-price-card pt-setup-card">
            <p className="pt-price-label">One-time business setup</p>
            <p className="pt-price-amount"><span>$</span>2,000</p>
            <p className="pt-price-caption">Paid once to configure your business-specific AI Sales Employee.</p>
            <ul>
              <li>Configured around your business, services, service areas, hours, verified prices, and policies</li>
              <li>Website chat and inbound voice setup for your business</li>
              <li>Launch checks before activation</li>
            </ul>
          </article>

          <article className="pt-price-card pt-monthly-card">
            <p className="pt-price-label">Ongoing service</p>
            <p className="pt-price-amount"><span>$</span>500<small>/month</small></p>
            <p className="pt-price-caption">Continues month to month until canceled.</p>
            <ul>
              {features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
            <p className="pt-coming-soon">Advanced dashboard analysis is coming soon.</p>
          </article>
        </section>

        <section className="pt-pricing-note" aria-label="Monthly usage included">
          <h2>Usage included each month</h2>
          <p>
            Your monthly service includes up to <strong>1,000 website chat conversations</strong> and
            <strong> 250 inbound voice minutes</strong>. We will not add usage charges without your
            written agreement.
          </p>
        </section>

        <section className="pt-pricing-note">
          <h2>Start your setup</h2>
          <p>
            Create your account, connect your business website, review the profile, and continue to secure checkout when you’re ready.
            Your assistant activates after payment is securely confirmed and PulseTech completes the launch checks.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/signup" className="inline-flex items-center justify-center rounded-full bg-[#246bfe] px-6 py-3 font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700">
              Create your account <span className="ml-2" aria-hidden="true">↗</span>
            </Link>
            <Link href="/login?next=%2Fclient" className="font-semibold text-blue-700 hover:underline">Already have an account? Log in</Link>
          </div>
          <p className="mt-4 text-sm text-slate-600">Need help first? <a className="underline" href="mailto:contact@pulsetechlabs.com?subject=Start%20PulseTech%20setup">Contact PulseTech Labs</a></p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
