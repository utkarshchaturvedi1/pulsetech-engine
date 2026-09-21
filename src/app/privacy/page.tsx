import type { Metadata } from "next";
import LegalDocument, {
  CONTACT_EMAIL,
  CONTACT_MAILTO,
} from "../../components/landing/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy | PulseTech Labs",
  description:
    "How PulseTech Labs collects, uses, and shares information for AI Sales Employee website chat and inbound phone calls.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy Policy" updated="September 21, 2026">
      <p>
        PulseTech Labs (“PulseTech,” “we,” “us,” or “our”) provides an AI Sales Employee that
        answers website chat and inbound phone calls for businesses. This Privacy Policy explains
        what information we handle, how it is used, and how to contact us about privacy questions.
      </p>
      <p>
        Privacy requests and questions:{" "}
        <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>1. What PulseTech does</h2>
      <p>
        PulseTech’s product is an AI Sales Employee for high-intent businesses. It can converse
        with website visitors in chat and with callers on inbound phone lines. During those
        conversations it may collect lead information so the relevant business can follow up. When
        a lead is captured, PulseTech may send lead alerts to that business by email and SMS.
      </p>
      <p>
        Conversations are conducted by an artificial intelligence system, not a human employee.
        Callers and chat visitors should understand they may be interacting with AI.
      </p>

      <h2>2. Information we may collect</h2>
      <h3>Website and service use</h3>
      <p>
        When you visit pulsetechlabs.com or use our public pages, we may collect limited technical
        information such as browser type, device information, approximate location derived from IP
        address, and pages viewed. We use this to operate, secure, and improve the website.
      </p>
      <h3>Business customers and demo users</h3>
      <p>
        If you create or configure an AI Sales Employee, we may collect business details you
        provide, such as your website, business name, contact information, services, service areas,
        and the email address and mobile number you designate for lead alerts.
      </p>
      <h3>Leads from chat and inbound calls</h3>
      <p>
        When a customer chats on a business website or calls a PulseTech inbound line, the AI Sales
        Employee may collect lead information needed for follow-up. That information may include
        name, phone number, service address, and service need, along with other details the
        customer chooses to share (for example email, timing, or notes about the request). Call
        audio, chat transcripts, and related conversation metadata may be processed to operate the
        service and to prepare lead alerts.
      </p>

      <h2>3. How we use information</h2>
      <p>We use information to:</p>
      <ul>
        <li>operate website chat and inbound phone conversations for the relevant business;</li>
        <li>capture and organize lead details for that business;</li>
        <li>send lead alerts by email and SMS to the contact details the business provides;</li>
        <li>configure, improve, secure, and support the PulseTech service; and</li>
        <li>respond to privacy, support, and legal requests.</li>
      </ul>
      <p>
        Lead information is collected for the business that owns the chat widget or inbound number.
        PulseTech processes that information to deliver the service; we do not sell lead lists as a
        product.
      </p>

      <h2>4. Sharing</h2>
      <p>We may share information with:</p>
      <ul>
        <li>
          the business that the visitor or caller contacted, including through email and SMS lead
          alerts;
        </li>
        <li>
          service providers that help us host the product, process AI conversations, or deliver
          email, SMS, and phone communications; and
        </li>
        <li>authorities when required by law, or to protect rights, safety, and the service.</li>
      </ul>
      <p>
        Third-party providers process information only as needed to provide their services. We do
        not control those providers’ independent platforms, and we do not guarantee their uptime or
        message delivery.
      </p>

      <h2>5. AI, chat, and call disclosure</h2>
      <p>
        PulseTech uses automated systems to generate chat replies and to speak with inbound callers.
        Content of chats and calls is processed so the AI can respond and so lead details can be
        captured and alerted to the business. Do not submit information you do not want processed
        for those purposes. Businesses that deploy PulseTech are responsible for any additional
        notices required on their websites or phone lines.
      </p>

      <h2>6. Retention and security</h2>
      <p>
        We retain information only as long as needed to provide the service, support the relevant
        business, meet legal obligations, and resolve disputes. We use reasonable administrative
        and technical measures to protect information, but no method of transmission or storage is
        completely secure.
      </p>

      <h2>7. Your choices and rights</h2>
      <p>
        Depending on where you live, you may have rights to request access, correction, deletion,
        or restriction of personal information, or to object to certain processing. To make a
        privacy request, email <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>. We may need to verify
        your identity and, for lead data, may need to coordinate with the business that received
        the lead.
      </p>
      <p>
        If you are a customer of a business using PulseTech, you can also contact that business
        directly about the lead they received.
      </p>

      <h2>8. Children</h2>
      <p>
        PulseTech is intended for business use and for adult customers of those businesses. We do
        not knowingly collect personal information from children.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update this Privacy Policy from time to time. The “Last updated” date at the top of
        this page will change when we do. Continued use of the website or service after an update
        means you should review the revised policy.
      </p>

      <h2>10. Contact</h2>
      <p>
        PulseTech Labs
        <br />
        Privacy and support: <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>
      </p>
    </LegalDocument>
  );
}
