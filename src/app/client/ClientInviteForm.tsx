"use client";

import { useState } from "react";

export default function ClientInviteForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/client/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), demoId: data.get("demoId") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not invite client.");
      form.reset();
      setMessage(`Invitation sent. ${result.businessName} is customer ${result.customerId}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not invite client.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-medium text-slate-700">Client work email
      <input name="email" type="email" required autoComplete="email" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="owner@business.com" />
    </label>
    <label className="text-sm font-medium text-slate-700">Saved business profile ID
      <input name="demoId" required pattern="[A-Za-z0-9_-]+" className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="business-profile-id" />
    </label>
    <div className="sm:col-span-2">
      <button disabled={busy} className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{busy ? "Creating account…" : "Create account and email invite"}</button>
      {message && <p aria-live="polite" className="mt-3 text-sm leading-6 text-blue-900">{message}</p>}
    </div>
  </form>;
}
