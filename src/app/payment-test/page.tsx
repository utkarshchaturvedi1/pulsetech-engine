import type { Metadata } from "next";
import { pricingSans } from "@/lib/plusJakarta";
import PaymentTestView from "./PaymentTestView";

export const metadata: Metadata = {
  title: "Sandbox payment test | PulseTech Labs",
  description:
    "Local Paddle Sandbox checkout test for PulseTech Labs setup and monthly service pricing.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PaymentTestPage() {
  return (
    <div className={`${pricingSans.className} bg-white`}>
      <PaymentTestView
        clientToken={process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? ""}
        setupPriceId={process.env.NEXT_PUBLIC_PADDLE_SETUP_PRICE_ID ?? ""}
        monthlyPriceId={process.env.NEXT_PUBLIC_PADDLE_MONTHLY_PRICE_ID ?? ""}
        publicBaseUrl={process.env.PULSETECH_PUBLIC_BASE_URL ?? "http://localhost:3000"}
      />
    </div>
  );
}
