import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import ClientLoginForm from "./ClientLoginForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Log in | PulseTech Labs" };

export default async function ClientLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string }> }) {
  const supabase = await createClient().catch(() => null);
  const { data } = supabase ? await supabase.auth.getClaims() : { data: null };
  if (data?.claims?.sub) redirect("/client");
  const { error, reset } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col bg-white px-6">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-center py-7">
        <Link href="/" aria-label="PulseTech Labs home">
          <Image src="/branding/pulsetech-logo-blue-black.svg" alt="PulseTech Labs" width={210} height={42} priority />
        </Link>
      </header>
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-24">
        <h1 className="mb-8 text-center text-3xl font-semibold tracking-tight text-slate-950">Log in</h1>
        {error === "link" && <p role="alert" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">That invitation or reset link has expired. Please request a new one.</p>}
        {reset === "sent" && <p role="status" className="mb-5 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">If that email belongs to a client account, a password reset link is on its way.</p>}
        <ClientLoginForm />
        <p className="mt-7 text-center text-sm text-slate-500">New client? Set your password from the invitation email.</p>
      </section>
    </main>
  );
}
