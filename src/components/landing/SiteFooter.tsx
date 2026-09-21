const CONTACT_MAILTO = "mailto:contact@pulsetechlabs.com";
const PULSETECH_LOGO_ON_DARK = "/branding/pulsetech-logo-white.svg";

export default function SiteFooter() {
  return (
    <footer className="pt-footer">
      <div className="pt-footer-inner">
        <div>
          <a href="/" aria-label="PulseTech Labs home">
            <img
              src={PULSETECH_LOGO_ON_DARK}
              alt="PulseTech Labs"
              className="pt-logo pt-logo-on-dark"
            />
          </a>
          <p className="pt-footer-tag">AI Sales Employees for high-intent businesses</p>
        </div>
        <nav className="pt-footer-nav" aria-label="Legal and support">
          <a href="/privacy">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
          <a href={CONTACT_MAILTO}>Contact &amp; Support</a>
        </nav>
      </div>
    </footer>
  );
}
