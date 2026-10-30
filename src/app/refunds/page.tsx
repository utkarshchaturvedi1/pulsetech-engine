import type { Metadata } from "next";
import RefundsPage from "../../components/landing/RefundsPage";

export const metadata: Metadata = {
  title: "Cancellation and Refund Policy | PulseTech Labs",
  description:
    "How to cancel PulseTech Labs subscriptions and request review of a billing issue.",
};

export default function RefundsRoute() {
  return <RefundsPage />;
}
