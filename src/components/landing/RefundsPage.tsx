import LegalDocument, {
  CONTACT_EMAIL,
  CONTACT_MAILTO,
} from "./LegalDocument";

export default function RefundsPage() {
  return (
    <LegalDocument title="Cancellation and Refund Policy" updated="October 30, 2026">
      <p>
        This policy explains how to cancel the AI Sales Employee service and where to request help
        with a payment or refund. The payment provider shown at checkout is the seller of record
        for your purchase and handles transaction support. Use the buyer-support link in your
        payment receipt, or contact <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>1. Canceling a monthly subscription</h2>
      <p>
        You may cancel at any time through the subscription-management link in your payment
        receipt or by emailing{" "}
        <a href={`${CONTACT_MAILTO}?subject=Subscription%20cancellation`}>
          {CONTACT_EMAIL}
        </a>
        . Please include your business name and the email address on your account. We will confirm
        requests sent to us by email. Cancellation stops future renewals; access remains available
        through the end of the current paid billing period. Cancellation does not itself issue a
        refund. Refund eligibility is determined by the payment provider&apos;s applicable policy
        and applicable law.
      </p>

      <h2>2. One-time setup fee</h2>
      <p>
        The one-time setup fee covers configuration and customization of the AI Sales Employee for
        your business. You may request cancellation before business-specific setup work begins. Once
        that work has begun, our setup fee is not refundable except where required by applicable
        law or where the payment provider approves a refund under its policy. Submit a request using
        the buyer-support link in your payment receipt.
      </p>

      <h2>3. Refunds for subscription charges</h2>
      <p>
        We do not provide prorated refunds for an unused portion of a billing period. A refund is
        not automatic when you cancel. The payment provider reviews refund requests under its
        applicable policy, including any discretionary refunds and rights required by applicable
        law. Submit a request using the buyer-support link in your payment receipt.
      </p>

      <h2>4. Billing errors and required refunds</h2>
      <p>
        If you believe a payment was charged twice or charged in error, contact the payment provider
        using the buyer-support link in your receipt or email{" "}
        <a href={CONTACT_MAILTO}>{CONTACT_EMAIL}</a> with the business name, charge date, and a
        description of the issue. We will help investigate service or account issues. The payment
        provider processes any refund it approves. Nothing in this policy limits refund or
        cancellation rights that cannot legally be waived.
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
