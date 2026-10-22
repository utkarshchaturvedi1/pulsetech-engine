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

export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string; token_hash?: string; type?: string }> }) {
  const { code, token_hash: tokenHash, type } = await searchParams;
  // Some Supabase email templates return to the site URL with an auth credential
  // instead of honoring the requested callback path. Forward supported links
  // directly to the server callback without rendering the marketing homepage.
  if (code || (tokenHash && (type === "recovery" || type === "invite"))) {
    const callback = new URLSearchParams({ next: "/reset-password" });
    if (code) callback.set("code", code);
    else {
      callback.set("token_hash", tokenHash!);
      callback.set("type", type!);
    }
    redirect(`/auth/callback?${callback.toString()}`);
  }

  return (
    <div className={`${landingSans.variable} ${landingSans.className}`}>
      <LandingPage />
    </div>
  );
}
