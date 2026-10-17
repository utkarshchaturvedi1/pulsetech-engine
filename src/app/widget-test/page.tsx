import type { Metadata } from "next";
import { notFound } from "next/navigation";
import WidgetLauncherPreview from "./WidgetLauncherPreview";
import { sanitizeDemoId } from "../../lib/demoRepository";
import { loadSharedProfile } from "../../lib/sharedProfileStore";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Chat installation preview | PulseTech Labs",
  robots: { index: false, follow: false },
};

export default async function WidgetInstallationPreview({
  searchParams,
}: {
  searchParams: Promise<{ demoId?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();

  const query = await searchParams;
  const demoId = sanitizeDemoId(query.demoId || "texassolar");
  const saved = demoId ? await loadSharedProfile(demoId) : null;
  if (!saved?.profile?.businessName) notFound();

  const businessName = saved.profile.businessName;
  const primaryColor = saved.profile.primaryColor || "#2563eb";

  return (
    <main className="min-h-screen bg-white px-6 py-8 text-slate-950 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between border-b border-slate-200 pb-5">
          <span className="font-semibold">PulseTech Labs · Website installation preview</span>
          <span className="text-sm text-slate-500">Private staging test</span>
        </header>
        <section className="max-w-3xl py-16 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Floating website chat</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">A compact chat window, opened when a visitor wants help.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
            This preview uses the same installation code provided in the client handover. Select the chat button in the lower-right corner to open or close the conversation.
          </p>
          <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
            <p className="text-sm font-medium text-slate-500">Preview configured for</p>
            <p className="mt-1 text-xl font-semibold">{businessName}</p>
          </div>
        </section>
        <footer className="border-t border-slate-200 py-6 text-sm text-slate-500">
          Staging installation preview · This does not change the live PulseTech website.
        </footer>
      </div>
      <WidgetLauncherPreview demoId={demoId!} businessName={businessName} primaryColor={primaryColor} />
    </main>
  );
}
