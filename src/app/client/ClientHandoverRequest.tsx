"use client";

import { useState } from "react";

export default function ClientHandoverRequest() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/client/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: data.get("subject"), details: data.get("details") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send request.");
      form.reset();
      setMessage("Your handover request is saved to this client account.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="mt-5 space-y-4">
    <label className="block text-sm font-medium text-slate-700">What do you need?
      <input name="subject" required minLength={3} maxLength={120} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="For example, update our business hours" />
    </label>
    <label className="block text-sm font-medium text-slate-700">Details
      <textarea name="details" required minLength={10} maxLength={4000} rows={4} className="mt-2 w-full resize-y rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="Tell us what you’d like changed or checked." />
    </label>
    <button disabled={busy} className="rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60">{busy ? "Sending…" : "Send handover request"}</button>
    {message && <p aria-live="polite" className="text-sm leading-6 text-blue-900">{message}</p>}
  </form>;
}
