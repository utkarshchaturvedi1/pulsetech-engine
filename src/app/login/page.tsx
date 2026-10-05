import Link from "next/link";
import { redirect } from "next/navigation";
import ClientLoginForm from "./ClientLoginForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Client sign in | PulseTech Labs" };

export default async function ClientLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient().catch(() => null);
  const { data } = supabase ? await supabase.auth.getClaims() : { data: null };
  if (data?.claims?.sub) redirect("/client");
  const { error } = await searchParams;

  return (
    <main className="marketing-shell relative flex min-h-screen items-center justify-center px-5 py-12">
      <section className="relative z-10 w-full max-w-md rounded-3xl border border-white/80 bg-white/90 p-8 shadow-2xl shadow-blue-950/10 backdrop-blur sm:p-10">
        <Link href="/" className="text-sm font-semibold text-blue-700">PulseTech Labs</Link>
        <h1 className="mt-8 text-3xl font-bold tracking-tight text-slate-950">Client sign in</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Use the work email connected to your PulseTech account. We’ll send you a secure one-time sign-in link.</p>
        <div className="mt-8"><ClientLoginForm /></div>
        {error === "link" && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">That link could not be verified. Request a fresh sign-in link.</p>}
        <p className="mt-7 text-center text-sm text-slate-500">Need access? <a className="font-medium text-blue-700 hover:underline" href="mailto:leads@pulsetechlabs.com">Contact PulseTech</a></p>
      </section>
    </main>
  );
}
