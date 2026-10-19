"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ClientPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmation) {
      setMessage("The passwords don’t match. Please check both fields.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) {
        setMessage("We couldn’t update your password. Request a fresh reset link or contact PulseTech.");
        return;
      }
      setMessage("Password saved. Taking you to your client portal…");
      window.setTimeout(() => {
        router.replace("/client");
        router.refresh();
      }, 700);
    } catch {
      setMessage("We couldn’t update your password. Please try again or contact PulseTech.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium text-slate-700" htmlFor="new-password">New password</label>
      <input id="new-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="-mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="At least 8 characters" />
      <label className="block text-sm font-medium text-slate-700" htmlFor="confirm-password">Confirm new password</label>
      <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="-mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="Enter it again" />
      <button disabled={busy} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60" type="submit">{busy ? "Saving…" : "Save password"}</button>
      {message && <p aria-live="polite" className="rounded-xl bg-blue-50 p-3 text-sm leading-6 text-blue-900">{message}</p>}
    </form>
  );
}
