import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import PaymentTestView from "./PaymentTestView";

const pricingSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

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
      />
    </div>
  );
}
