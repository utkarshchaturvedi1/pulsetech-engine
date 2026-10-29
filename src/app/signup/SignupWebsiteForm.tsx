"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupWebsiteForm() {
  const router = useRouter();
  const [website, setWebsite] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website: website.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.id !== "string") {
        setMessage(typeof result.error === "string" ? result.error : "We couldn’t prepare your business profile. Check the website and try again.");
        return;
      }
      router.push(`/signup?step=2&demoId=${encodeURIComponent(result.id)}`);
    } catch {
      setMessage("We couldn’t reach PulseTech just now. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="space-y-5">
    <div className="mb-2">
      <p className="text-center text-xs font-extrabold uppercase tracking-[.18em] text-[#246bfe]">Step 1 of 2</p>
      <h1 className="mt-3 text-center text-3xl font-extrabold tracking-tight text-[#111217]">Start with your website</h1>
      <p className="mt-2 text-center text-sm text-slate-600">We’ll prepare your business profile, then you’ll create your PulseTech login.</p>
    </div>
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-800" htmlFor="signup-website">Business website</label>
      <input id="signup-website" type="text" autoComplete="url" required value={website} onChange={(event) => setWebsite(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="yourbusiness.com" />
    </div>
    <button disabled={busy} className="pt-login-submit w-full rounded-full px-4 py-3 font-bold text-white transition disabled:cursor-wait disabled:opacity-60" type="submit">{busy ? "Preparing your profile…" : "Continue"}</button>
    {message && <p role="alert" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">{message}</p>}
  </form>;
}
