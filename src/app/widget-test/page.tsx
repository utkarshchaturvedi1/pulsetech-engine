import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Chat installation preview | PulseTech Labs",
  robots: { index: false, follow: false },
};

export default function WidgetInstallationPreview() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return (
    <main className="min-h-screen bg-white px-5 py-10 text-slate-950 sm:px-10">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-slate-200 pb-5 font-semibold">PulseTech Labs · Website installation preview</header>
        <section className="grid items-start gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Private Preview test</p>
            <h1 className="mt-3 max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">How the client chat sits inside a real website.</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">This is the same iframe installation used in the client handover code. It is isolated from the host page styles, keeps a consistent width, and uses a fixed chat height that can scroll independently.</p>
            <p className="mt-5 max-w-xl rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">The conversation on this test page uses the bundled Texas Solar sample profile. It is not a PulseTech customer configuration.</p>
          </div>
          <div className="w-full max-w-[420px] overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-xl">
            <iframe
              src="/widget/texassolar"
              title="Sample AI Sales Employee website installation"
              width="100%"
              height="640"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              className="block w-full border-0"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
