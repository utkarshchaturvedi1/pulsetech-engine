import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import ClientLoginForm from "./ClientLoginForm";
import { createClient } from "@/lib/supabase/server";
import { safeClientRedirect } from "@/lib/clientAccess";
import "./login-theme.css";

export const metadata = { title: "Log in | PulseTech Labs" };

export default async function ClientLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string; next?: string; mode?: string }> }) {
  const supabase = await createClient().catch(() => null);
  const { error, reset, next, mode } = await searchParams;
  const { data } = supabase ? await supabase.auth.getClaims() : { data: null };
  if (data?.claims?.sub) redirect(safeClientRedirect(next));

  return (
    <main className="pt-login flex min-h-screen flex-col px-6">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-center py-8">
        <Link href="/" aria-label="PulseTech Labs home">
          <Image src="/branding/pulsetech-logo-blue-black.svg" alt="PulseTech Labs" width={210} height={42} priority />
        </Link>
      </header>
      <section className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center pb-24">
        <div className="pt-login-card rounded-[28px] border p-7 sm:p-9">
          <p className="text-center text-xs font-extrabold uppercase tracking-[.18em] text-[#246bfe]">PulseTech account</p>
          <h1 className="mt-3 text-center text-3xl font-extrabold tracking-tight text-[#111217]">{mode === "signup" ? "Create your free account" : "Log in"}</h1>
          <p className="mt-2 text-center text-sm text-slate-600">{mode === "signup" ? "Use your email as your login ID and choose a password." : "Use your email and password to open your PulseTech account."}</p>
          {error === "link" && <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">That invitation or reset link has expired. Please request a new one.</p>}
          {reset === "sent" && <p role="status" className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">If that email belongs to a client account, a password reset link is on its way.</p>}
          <div className="mt-7"><ClientLoginForm initialMode={mode === "signup" ? "signup" : "login"} nextPath={next} /></div>
          {error === "account" && <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">We couldn’t connect this demo to your account. Please contact PulseTech for help.</p>}
        </div>
      </section>
    </main>
  );
}
