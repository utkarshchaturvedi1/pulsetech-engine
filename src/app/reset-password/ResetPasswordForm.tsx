"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordForm({ nextPath = "/client" }: { nextPath?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (password !== confirm) {
      setMessage("Those passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) {
        setMessage("We couldn’t save that password. Please use at least 8 characters and try again.");
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setMessage("We couldn’t save that password. Please reopen your invitation link and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium text-slate-800" htmlFor="new-password">New password</label>
      <input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="-mt-3 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
      <label className="block text-sm font-medium text-slate-800" htmlFor="confirm-password">Confirm password</label>
      <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(event) => setConfirm(event.target.value)} className="-mt-3 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" />
      <button disabled={busy} type="submit" className="w-full rounded-lg bg-[#08090B] px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{busy ? "Saving…" : "Set password"}</button>
      {message && <p role="alert" className="text-sm text-amber-800">{message}</p>}
    </form>
  );
}
