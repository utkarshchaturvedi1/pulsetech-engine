import type { ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import SiteFooter from "./SiteFooter";
import "./landing.css";

const landingSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-landing-sans",
  display: "swap",
});

const PULSETECH_LOGO = "/branding/pulsetech-logo-color.svg";
export const CONTACT_EMAIL = "contact@pulsetechlabs.com";
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

export default function LegalDocument({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className={`${landingSans.variable} ${landingSans.className} pt-landing pt-legal min-h-screen`}>
      <div className="pt-shell">
        <div className="pt-content">
          <header className="pt-header sticky top-0 z-40">
            <div className="pt-header-inner">
              <a href="/" className="shrink-0 py-1" aria-label="PulseTech Labs">
                <img src={PULSETECH_LOGO} alt="PulseTech Labs" className="pt-logo" />
              </a>
              <nav className="pt-legal-header-nav" aria-label="Support">
                <a href="/">Home</a>
                <a href={CONTACT_MAILTO}>Contact &amp; Support</a>
              </nav>
            </div>
          </header>
          <main className="pt-legal-main">
            <article className="pt-legal-article">
              <p className="pt-kicker pt-kicker-dark">PulseTech Labs</p>
              <h1 className="pt-legal-title">{title}</h1>
              <p className="pt-legal-updated">Last updated: {updated}</p>
              {children}
            </article>
          </main>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}
