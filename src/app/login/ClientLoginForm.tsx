"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type ClientLoginFormProps = {
  nextPath?: string;
  initialMode?: "login" | "signup";
};

function safeNextPath(value?: string) {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20\x7f]/.test(value)) return "/client";
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
  const [resendBusy, setResendBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [signupMode, setSignupMode] = useState(initialMode === "signup");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmationEmailRequired, setConfirmationEmailRequired] = useState(false);

  async function resendConfirmationEmail() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setMessage("Enter your email address first.");
      return;
    }

    setResendBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setMessage(error
        ? "We couldn’t send a new confirmation email. Please try again shortly."
        : "A fresh confirmation link has been requested. Check your inbox and Spam folder.");
    } catch {
      setMessage("We couldn’t send a new confirmation email. Please try again shortly.");
    } finally {
      setResendBusy(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setConfirmationEmailRequired(false);
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
            ? "You may already have an account with this email. Log in or use Forgot password."
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
          router.replace("/client?onboarding=ready");
          router.refresh();
        } else {
          setConfirmationEmailRequired(true);
          setMessage("Check your email to confirm this account and return to your demo.");
        }
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) {
        const needsConfirmation = error.message.toLowerCase().includes("email not confirmed");
        setConfirmationEmailRequired(needsConfirmation);
        setMessage(needsConfirmation
          ? "Please confirm your email address before signing in. You can request a fresh confirmation email below."
          : "We couldn’t sign you in with those details. Check them or use Forgot password.");
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
        <input id="client-email" type="email" autoComplete="email" required value={email} onChange={(event) => { setEmail(event.target.value); setConfirmationEmailRequired(false); }} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="you@business.com" />
      </div>
      {!resetMode && <>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3"><label className="text-sm font-semibold text-slate-800" htmlFor="client-password">Password</label>{!signupMode && <button type="button" onClick={() => { setResetMode(true); setShowPassword(false); setConfirmationEmailRequired(false); setMessage(""); }} className="text-sm font-semibold text-blue-700 hover:underline">Forgot password?</button>}</div>
          <div className="relative">
            <input id="client-password" type={showPassword ? "text" : "password"} autoComplete={signupMode ? "new-password" : "current-password"} minLength={signupMode ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-4 pr-16 text-slate-950 outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder={signupMode ? "Create a password (8+ characters)" : "Password"} />
            <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} className="absolute inset-y-0 right-4 my-auto h-fit text-sm font-semibold text-blue-700 hover:underline">{showPassword ? "Hide" : "Show"}</button>
          </div>
        </div>
      </>}
      <button disabled={busy} className="pt-login-submit w-full rounded-full bg-blue-700 px-4 py-3 font-bold text-white transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-wait disabled:opacity-60" type="submit">{busy ? "Please wait…" : resetMode ? "Send reset link" : signupMode ? "Create free account" : "Log in"}</button>
      {!resetMode && (!signupMode || confirmationEmailRequired) && <div className="space-y-1 text-center">
        <p className="text-sm text-slate-600">Didn’t get the confirmation email?</p>
        <button type="button" onClick={resendConfirmationEmail} disabled={resendBusy} className="text-sm font-semibold text-blue-700 hover:underline disabled:cursor-wait disabled:opacity-60">{resendBusy ? "Sending confirmation email…" : "Resend confirmation email"}</button>
      </div>}
      {resetMode && <button type="button" onClick={() => { setResetMode(false); setShowPassword(false); setMessage(""); }} className="w-full text-sm font-medium text-blue-700 hover:underline">Back to log in</button>}
      {!resetMode && (signupMode
        ? <button type="button" onClick={() => { setSignupMode(false); setPassword(""); setShowPassword(false); setConfirmationEmailRequired(false); setMessage(""); }} className="w-full text-sm font-semibold text-blue-700 hover:underline">Already have an account? Log in</button>
        : <Link href="/signup" className="block w-full text-center text-sm font-semibold text-blue-700 hover:underline">Create a free account</Link>)}
      {message && <p aria-live="polite" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">{message}</p>}
    </form>
  );
}
