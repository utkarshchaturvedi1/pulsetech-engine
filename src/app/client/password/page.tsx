import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientPasswordForm from "./ClientPasswordForm";

export const metadata = { title: "Password | PulseTech Labs" };
export const dynamic = "force-dynamic";

type PasswordMode = "setup" | "reset" | "change";

export default async function ClientPasswordPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode: requestedMode } = await searchParams;
  const mode: PasswordMode = requestedMode === "reset" || requestedMode === "change" ? requestedMode : "setup";
  const supabase = await createClient().catch(() => null);
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!supabase || !user) redirect("/login?error=link");

  const title = mode === "reset" ? "Reset your password" : mode === "change" ? "Change your password" : "Create your password";
  const description = mode === "reset"
    ? "Choose a new password for your PulseTech client account."
    : mode === "change"
      ? "Choose a new password. You’ll use it the next time you sign in."
      : "Set a password to finish your client account setup.";

  return (
    <main className="marketing-shell flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-blue-950/10 sm:p-10">
        <a href="/" className="text-sm font-semibold text-blue-700">PulseTech Labs</a>
        <h1 className="mt-8 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
        <div className="mt-8"><ClientPasswordForm /></div>
        <p className="mt-6 text-center text-sm text-slate-500">Need help? <a className="font-medium text-blue-700 hover:underline" href="mailto:contact@pulsetechlabs.com">Contact PulseTech</a></p>
      </section>
    </main>
  );
}
