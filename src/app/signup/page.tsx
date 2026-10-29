import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import ClientLoginForm from "../login/ClientLoginForm";
import SignupWebsiteForm from "./SignupWebsiteForm";
import { loadSharedProfile } from "@/lib/sharedProfileStore";
import { sanitizeDemoId } from "@/lib/demoRepository";
import { createClient } from "@/lib/supabase/server";
import "../login/login-theme.css";

export const metadata = { title: "Create your PulseTech account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ step?: string; demoId?: string }> }) {
  const { step, demoId: rawDemoId } = await searchParams;
  const supabase = await createClient().catch(() => null);
  const { data } = supabase ? await supabase.auth.getClaims() : { data: null };
  if (data?.claims?.sub) redirect("/client");

  const demoId = sanitizeDemoId(rawDemoId || "");
  const demo = step === "2" && demoId ? await loadSharedProfile(demoId) : null;

  return <main className="pt-login flex min-h-screen flex-col px-6">
    <header className="mx-auto flex w-full max-w-6xl items-center justify-center py-8">
      <Link href="/" aria-label="PulseTech Labs home"><Image src="/branding/pulsetech-logo-blue-black.svg" alt="PulseTech Labs" width={210} height={42} priority /></Link>
    </header>
    <section className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center pb-24">
      <div className="pt-login-card rounded-[28px] border p-7 sm:p-9">
        {demo ? <>
          <p className="text-center text-xs font-extrabold uppercase tracking-[.18em] text-[#246bfe]">Step 2 of 2 · {demo.profile.businessName}</p>
          <div className="mt-6"><ClientLoginForm initialMode="signup" nextPath={`/demo?id=${encodeURIComponent(demoId!)}`} /></div>
        </> : <SignupWebsiteForm />}
        <div className="mt-6 text-center text-sm text-slate-600"><Link href="/login" className="font-semibold text-blue-700 hover:underline">Already have an account? Log in</Link></div>
      </div>
    </section>
  </main>;
}
