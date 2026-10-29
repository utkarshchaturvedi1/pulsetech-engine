"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ClientLoginFormProps = {
  nextPath?: string;
  initialMode?: "login" | "signup";
};

function safeNextPath(value?: string) {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\\\u0000-\u0020\u007f]/.test(value)) return "/client";
  return value;
}

function demoIdFromPath(value: string): string | null {
  const destination = new URL(value, "https://pulsetech.invalid");
  const pathMatch = /^\/demo\/([a-z0-9_-]+)$/i.exec(destination.pathname);
  const id = pathMatch?.[1]
    ? decodeURIComponent(pathMatch[1])
    : destination.pathname === "/demo" ? destination.searchParams.get("id") : null;
  return id && /^[a-z0-9_-]{2,120}$/i.test(id) ? id : null;
}

export default function ClientLoginForm({ nextPath, initialMode = "login" }: ClientLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [signupMode, setSignupMode] = useState(initialMode === "signup");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const normalizedEmail = email.trim().toLowerCase();
      const destination = safeNextPath(nextPath);
      if (resetMode) {
        // Password reset always returns to password setup; successful reset defaults to the dashboard.
        const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
        setMessage(error ? "We couldn’t send a reset link. Check the email address or contact PulseTech." : "If that email belongs to a client account, a password reset link is on its way.");
        return;
      }
      if (signupMode) {
        const demoId = demoIdFromPath(destination);
        if (!demoId) {
          setMessage("Start from your two-chatbot demo to create a free account.");
          return;
        }
        // Keep the redirect on the exact Supabase-allowlisted callback path. The
        // demo ID travels in verified user metadata so no new redirect URL is needed.
        const emailRedirectTo = `${window.location.origin}/auth/callback`;
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo, data: { pending_demo_id: demoId } },
        });
        if (error) {
          setMessage(error.message.toLowerCase().includes("already")
            ? "That email may already have an account. Try logging in or use Forgot password."
            : "We couldn’t create your account. Check the email and password, then try again.");
          return;
        }
        if (data.session) {
          const claimResponse = await fetch("/api/client/claim-demo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ demoId }),
          });
          if (!claimResponse.ok) {
            const claimResult = await claimResponse.json().catch(() => ({}));
            setMessage(claimResult.error || "We couldn’t connect your demo to your account. Please try again.");
            return;
          }
          router.replace(destination);
          router.refresh();
        } else {
          setMessage("If this is a new account, check your email to confirm it and return to your demo. If you already have an account, log in or use Forgot password.");
        }
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) {
        setMessage("That email and password didn’t match. Try again or reset your password.");
        return;
      }
      const demoId = demoIdFromPath(destination);
      if (demoId) {
        const claimResponse = await fetch("/api/client/claim-demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ demoId }),
        });
        if (!claimResponse.ok) {
          const claimResult = await claimResponse.json().catch(() => ({}));
          setMessage(claimResult.error || "We couldn’t connect your demo to your account. Please try again.");
          return;
        }
      }
      router.replace(destination);
      router.refresh();
    } catch {
      setMessage("Client sign-in is unavailable right now. Please try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="mb-2">
        <h1 className="text-center text-3xl font-extrabold tracking-tight text-[#111217]">
          {resetMode ? "Reset your password" : signupMode ? "Create your free account" : "Log in"}
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          {resetMode
            ? "Enter your email and we’ll send you a secure password reset link."
            : signupMode
              ? "Use your email as your login ID and choose a password."
              : "Use your email and password to open your PulseTech account."}
        </p>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-slate-800" htmlFor="client-email">Email</label>
        <input id="client-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="you@business.com" />
      </div>
      {!resetMode && <>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3"><label className="text-sm font-semibold text-slate-800" htmlFor="client-password">Password</label>{!signupMode && <button type="button" onClick={() => { setResetMode(true); setMessage(""); }} className="text-sm font-semibold text-blue-700 hover:underline">Forgot password?</button>}</div>
          <input id="client-password" type="password" autoComplete={signupMode ? "new-password" : "current-password"} minLength={signupMode ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder={signupMode ? "Create a password (8+ characters)" : "Password"} />
        </div>
      </>}
      <button disabled={busy} className="pt-login-submit w-full rounded-full bg-blue-700 px-4 py-3 font-bold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-wait disabled:opacity-60" type="submit">{busy ? "Please wait…" : resetMode ? "Send reset link" : signupMode ? "Create free account" : "Log in"}</button>
      {resetMode && <button type="button" onClick={() => { setResetMode(false); setMessage(""); }} className="w-full text-sm font-medium text-blue-700 hover:underline">Back to log in</button>}
      {!resetMode && <button type="button" onClick={() => { setSignupMode(!signupMode); setPassword(""); setMessage(""); }} className="w-full text-sm font-semibold text-blue-700 hover:underline">{signupMode ? "Already have an account? Log in" : "Create a free account"}</button>}
      {message && <p aria-live="polite" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">{message}</p>}
    </form>
  );
}
