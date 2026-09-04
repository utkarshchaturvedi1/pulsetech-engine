import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import LandingPage from "../components/landing/LandingPage";

const landingSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-landing-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PulseTech Labs | AI Sales Employees for home-service businesses",
  description:
    "PulseTech gives home-service businesses an AI Sales Employee that answers website chat and inbound phone calls 24/7, captures the lead, and alerts your team immediately.",
};

export default function Home() {
  return (
    <div className={`${landingSans.variable} ${landingSans.className}`}>
      <LandingPage />
    </div>
  );
}
