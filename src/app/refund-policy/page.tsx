import type { Metadata } from "next";
import RefundsPage from "../../components/landing/RefundsPage";

export const metadata: Metadata = {
  title: "Cancellation and Refund Policy | PulseTech Labs",
  description: "PulseTech Labs subscription cancellation and billing policy.",
};

export default function RefundPolicyRoute() {
  return <RefundsPage />;
}
