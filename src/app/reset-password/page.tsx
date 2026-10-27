import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordForm from "./ResetPasswordForm";
import { safeClientRedirect } from "@/lib/clientAccess";

export const metadata = { title: "Set password | PulseTech Labs" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const supabase = await createClient().catch(() => null);
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!user) redirect("/login?error=link");

  return <main className="flex min-h-screen flex-col bg-white px-6">
    <header className="mx-auto flex w-full max-w-6xl items-center py-7"><Link href="/" aria-label="PulseTech Labs home"><Image src="/branding/pulsetech-logo-blue-black.svg" alt="PulseTech Labs" width={210} height={42} priority /></Link></header>
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-24">
      <h1 className="mb-3 text-center text-3xl font-semibold tracking-tight text-slate-950">Set your password</h1>
      <p className="mb-8 text-center text-sm text-slate-600">Choose a password to finish setting up your account.</p>
      <ResetPasswordForm nextPath={safeClientRedirect(next)} />
    </section>
  </main>;
}
