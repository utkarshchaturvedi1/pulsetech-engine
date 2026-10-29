import type { Metadata } from "next";
import LegalDocument, {
  CONTACT_EMAIL,
  CONTACT_MAILTO,
} from "../../components/landing/LegalDocument";

export const metadata: Metadata = {
  title: "Cancellation and Refund Policy | PulseTech Labs",
  description:
    "How to cancel PulseTech Labs subscriptions and request review of a billing issue.",
};

export function RefundsPage() {
  return (
    <LegalDocument title="Cancellation and Refund Policy" updated="October 22, 2026">
      <p>
        This policy explains how to stop a PulseTech Labs subscription and how we handle refund
        requests for the AI Sales Employee service. Questions or requests can be sent to{" "}
        <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>1. Canceling a monthly subscription</h2>
      <p>
        You may request cancellation at any time by emailing{" "}
        <a href={`${CONTACT_MAILTO}?subject=Subscription%20cancellation`}>
          {CONTACT_EMAIL}
        </a>
        . Please include your business name and the email address on your account. We will confirm
        the cancellation by email. Cancellation stops future renewals; access remains available
        through the end of the current paid billing period. We do not provide a partial refund for
        an unused portion of that period.
      </p>

      <h2>2. One-time setup fee</h2>
      <p>
        The one-time setup fee covers configuration and customization of the AI Sales Employee for
        your business. You may request cancellation before business-specific setup work begins. Once
        that work has begun, the setup fee is not refundable, except where a refund is required by
        applicable law or under Section 4 below.
      </p>

      <h2>3. Refunds for subscription charges</h2>
      <p>
        Subscription payments are not refundable after the billing period has started. Canceling
        stops future renewals but does not reverse a completed charge or create a prorated refund.
      </p>

      <h2>4. Billing errors and required refunds</h2>
      <p>
        If you believe you were charged twice or charged in error, email{" "}
        <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a> with the business name, charge date, and a
        description of the issue. We will review the charge and correct verified billing errors.
        Nothing in this policy limits refund or cancellation rights that cannot legally be waived.
      </p>

      <h2>5. Contact</h2>
      <p>
        PulseTech Labs
        <br />
        Billing and support: <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>
      </p>
    </LegalDocument>
  );
}

export default RefundsPage;
