import type { Metadata } from "next";
import LegalDocument, {
  CONTACT_EMAIL,
  CONTACT_MAILTO,
} from "../../components/landing/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service | PulseTech Labs",
  description:
    "Terms of Service for PulseTech Labs AI Sales Employee website chat and inbound phone calls.",
};

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of Service" updated="September 21, 2026">
      <p>
        These Terms of Service (“Terms”) govern access to the PulseTech Labs website and the
        PulseTech AI Sales Employee service. By using the website or service, you agree to these
        Terms. If you do not agree, do not use PulseTech.
      </p>
      <p>
        Questions: <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>1. The service</h2>
      <p>
        PulseTech Labs provides an AI Sales Employee that can answer website chat and inbound phone
        calls on behalf of a business. The system may collect lead information—which may include
        name, phone number, service address, and service need—and may send lead alerts to the
        relevant business by email and SMS.
      </p>
      <p>
        The AI Sales Employee is software. It is not a human employee, licensed professional, or
        substitute for your own sales, legal, or operational judgment. Chat and call interactions
        should be treated as conversations with an artificial intelligence system.
      </p>

      <h2>2. No guarantees</h2>
      <p>
        PulseTech does not guarantee leads, bookings, revenue, message delivery, or third-party
        service uptime. Outcomes depend on many factors outside our control, including visitor and
        caller behavior, the accuracy of business information you provide, network conditions, and
        the availability of email, SMS, phone, hosting, and AI providers.
      </p>
      <p>
        Lead alerts are sent on a commercially reasonable basis to the email address and phone
        number a business provides. We do not warrant that every conversation will produce a
        qualified lead, that every alert will be delivered or received, or that every chat or call
        will complete without interruption.
      </p>

      <h2>3. Your responsibilities</h2>
      <p>If you use PulseTech for your business, you are responsible for:</p>
      <ul>
        <li>
          providing accurate services, areas, hours, and other information the AI Sales Employee
          should use;
        </li>
        <li>
          disclosing to website visitors and callers, as required by law, that they may interact
          with AI and that conversations may be processed to capture leads;
        </li>
        <li>using lead information in compliance with applicable privacy and communications laws;</li>
        <li>
          keeping lead-alert email and SMS destinations accurate and under your control; and
        </li>
        <li>following up with customers; PulseTech does not close sales or perform the work.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>
        You may not use PulseTech to mislead customers about who they are speaking with, to collect
        information unlawfully, to send spam, or to interfere with the service or other users. We
        may suspend or terminate access if we believe these Terms are violated or if use presents
        risk to customers, businesses, or the platform.
      </p>

      <h2>5. Third-party services</h2>
      <p>
        Chat, voice, email, SMS, and related infrastructure may rely on third-party providers. Those
        providers have their own terms and availability. PulseTech is not responsible for outages,
        delays, failed delivery, or other failures of third-party services.
      </p>

      <h2>6. Intellectual property</h2>
      <p>
        PulseTech Labs owns the PulseTech name, branding, software, and website content, except
        for materials a business provides about its own company. You may not copy or reverse
        engineer the service except as allowed by law.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        The website and service are provided “as is” and “as available.” To the fullest extent
        permitted by law, PulseTech Labs disclaims warranties of merchantability, fitness for a
        particular purpose, and non-infringement. We do not warrant that the AI will be error-free,
        uninterrupted, or suitable for every inquiry.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, PulseTech Labs will not be liable for lost leads,
        lost bookings, lost revenue, failed or delayed email or SMS alerts, failed chats or calls,
        or third-party downtime. Our total liability arising from the website or service will not
        exceed the amounts, if any, you paid to PulseTech Labs for the service in the three months
        before the claim.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these Terms from time to time. The “Last updated” date on this page will
        change when we do. Continued use after an update constitutes acceptance of the revised
        Terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        PulseTech Labs
        <br />
        Contact &amp; Support: <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>
      </p>
    </LegalDocument>
  );
}
