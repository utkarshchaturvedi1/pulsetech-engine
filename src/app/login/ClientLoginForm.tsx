"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ClientLoginForm({ nextPath = "/client" }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "recovery">("sign-in");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const normalizedEmail = email.trim().toLowerCase();

      if (mode === "recovery") {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/client/password?mode=reset")}`,
        });
        setMessage(error
          ? "We couldn’t send a reset link. Please try again or contact PulseTech."
          : "If this email is linked to a client account, a password reset link is on its way. Check your inbox and spam folder.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) {
        setMessage("We couldn’t sign you in with those details. Check your email and password, or use “Forgot password?” to reset it.");
        return;
      }

      router.replace(nextPath);
      router.refresh();
    } catch {
      setMessage("Client sign-in is temporarily unavailable. Please try again or contact PulseTech.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium text-slate-700" htmlFor="client-email">Account email</label>
      <input id="client-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="-mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="you@example.com" />

      {mode === "sign-in" ? (
        <>
          <label className="block text-sm font-medium text-slate-700" htmlFor="client-password">Password</label>
          <input id="client-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="-mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="Enter your password" />
          <div className="-mt-2 text-right">
            <button type="button" className="text-sm font-medium text-blue-700 hover:underline" onClick={() => { setMode("recovery"); setMessage(""); }}>Forgot password?</button>
          </div>
          <button disabled={busy} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60" type="submit">{busy ? "Signing in…" : "Sign in"}</button>
        </>
      ) : (
        <>
          <p className="-mt-2 text-sm leading-6 text-slate-600">We’ll email you a secure link to create a new password.</p>
          <button disabled={busy} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60" type="submit">{busy ? "Sending reset link…" : "Email me a reset link"}</button>
          <button type="button" className="w-full text-sm font-medium text-slate-600 hover:text-blue-700" onClick={() => { setMode("sign-in"); setMessage(""); }}>Back to sign in</button>
        </>
      )}

      {message && <p aria-live="polite" className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-900">{message}</p>}
    </form>
  );
}
