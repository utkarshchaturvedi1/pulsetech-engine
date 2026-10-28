import Image from "next/image";
import Link from "next/link";

const CONTACT_MAILTO = "mailto:contact@pulsetechlabs.com";
const LOGO = "/branding/pulsetech-logo-color.svg";

export default function SiteFooter() {
  return (
    <footer className="pt-footer">
      <div className="pt-footer-inner">
        <div className="pt-footer-brand">
          <Link href="/" aria-label="PulseTech Labs home"><Image src={LOGO} alt="PulseTech Labs" width={180} height={38} className="pt-logo" /></Link>
          <p>AI Sales Employees for high-intent businesses</p>
          <p className="pt-design-credit">
            Design inspiration: <a href="https://www.figma.com/design/aUO1ZCxKlyTF5Yw3LswI7R/Ether---AI-Image-Generator-Website--Community-" target="_blank" rel="noreferrer">Ether – AI Image Generator Website</a> by Nickelfox, via Figma Community (CC BY 4.0).
          </p>
        </div>
        <nav className="pt-footer-nav" aria-label="Legal and support">
          <a href="/pricing">Pricing</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          <a href="/refund-policy">Cancellation &amp; Refund Policy</a>
          <a href={CONTACT_MAILTO}>Contact &amp; Support</a>
        </nav>
      </div>
    </footer>
  );
}
