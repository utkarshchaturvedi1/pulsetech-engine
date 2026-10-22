import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus_Jakarta_Sans } from "next/font/google";
import LandingPage from "../components/landing/LandingPage";

const landingSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-landing-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PulseTech Labs | AI Sales Employees for high-intent businesses",
  description:
    "PulseTech gives your business an AI Sales Employee that answers website chat and inbound phone calls, captures the information your team needs, and alerts you while the customer is still engaged.",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  // Supabase can fall back to the configured site URL for older or misconfigured
  // invite/reset links. If that URL is the homepage, forward the auth code to
  // the session-exchange route instead of rendering the marketing page.
  if (code) {
    redirect(`/auth/callback?code=${encodeURIComponent(code)}&next=%2Freset-password`);
  }

  return (
    <div className={`${landingSans.variable} ${landingSans.className}`}>
      <LandingPage />
    </div>
  );
}
