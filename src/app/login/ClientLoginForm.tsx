"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ClientLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const normalizedEmail = email.trim().toLowerCase();
      if (resetMode) {
        // Keep the redirect URL identical to Supabase's allowlisted callback URL.
        // The callback route defaults to password setup, so no query string is needed.
        const redirectTo = `${window.location.origin}/auth/callback`;
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
        setMessage(error ? "We couldn’t send a reset link. Check the email address or contact PulseTech." : "If that email belongs to a client account, a password reset link is on its way.");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) {
        setMessage("That email and password didn’t match. Try again or reset your password.");
        return;
      }
      router.replace("/client");
      router.refresh();
    } catch {
      setMessage("Client sign-in is unavailable right now. Please try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium text-slate-800" htmlFor="client-email">Email</label>
        <input id="client-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="-mt-3 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="you@business.com" />
      {!resetMode && <>
        <label className="flex items-center justify-between text-sm font-medium text-slate-800" htmlFor="client-password"><span>Password</span><button type="button" onClick={() => { setResetMode(true); setMessage(""); }} className="font-medium text-blue-700 hover:underline">Forgot password?</button></label>
        <input id="client-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="-mt-3 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="Password" />
      </>}
      <button disabled={busy} className="w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-wait disabled:opacity-60" type="submit">{busy ? "Please wait…" : resetMode ? "Send reset link" : "Log in"}</button>
      {resetMode && <button type="button" onClick={() => { setResetMode(false); setMessage(""); }} className="w-full text-sm font-medium text-blue-700 hover:underline">Back to log in</button>}
      {message && <p aria-live="polite" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">{message}</p>}
    </form>
  );
}
