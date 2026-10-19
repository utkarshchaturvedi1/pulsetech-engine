"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ClientLoginForm({ nextPath = "/client" }: { nextPath?: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });
      setMessage(error
        ? "We couldn’t send a sign-in link. Check the email address or contact PulseTech."
        : "If this email is linked to a PulseTech account, a fresh sign-in link is on its way. Use this same email each time you sign in. No password is needed. Check spam if it doesn’t arrive.");
    } catch {
      setMessage("Client sign-in is not configured yet. Please contact PulseTech.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium text-slate-700" htmlFor="client-email">Work email</label>
      <input id="client-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="-mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="you@yourbusiness.com" />
      <button disabled={busy} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60" type="submit">{busy ? "Sending link…" : "Email me a sign-in link"}</button>
      {message && <p aria-live="polite" className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-900">{message}</p>}
    </form>
  );
}
