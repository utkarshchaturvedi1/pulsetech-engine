"use client";
import Script from "next/script";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClientCheckout({ token, setupPriceId, monthlyPriceId }: { token: string; setupPriceId: string; monthlyPriceId: string }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  if (!token.startsWith("test_") || !setupPriceId || !monthlyPriceId) return <p className="mt-4 text-sm text-slate-600">Contact support for a secure payment option.</p>;
  async function checkout() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/client/checkout", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.Paddle!.Checkout.open({ items: [{ priceId: setupPriceId, quantity: 1 }, { priceId: monthlyPriceId, quantity: 1 }], customData: result.customData, settings: { showAddDiscounts: false, allowDiscountRemoval: false } });
    } catch (error) { setBusy(false); setMessage(error instanceof Error ? error.message : "Please try again."); }
  }
  return <div className="mt-5">
    <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="afterInteractive" onReady={() => {
      if (!window.Paddle) return;
      window.Paddle.Environment.set("sandbox");
      window.Paddle.Initialize({ token, eventCallback(event) {
        if (event.name === "checkout.completed") { setMessage("Test checkout completed. Select Refresh payment status while we verify the signed payment notification."); router.refresh(); }
        if (["checkout.closed", "checkout.error"].includes(event.name || "")) setBusy(false);
      } });
      setReady(true);
    }} onError={() => setMessage("Checkout could not load. Please try again or contact support.")} />
    <p className="text-sm font-semibold text-amber-800">Staging test payment only — no real charge.</p>
    <button type="button" disabled={!ready || busy} onClick={checkout} className="pt-portal-button mt-3 rounded-full px-6 py-3 font-bold disabled:opacity-50">{busy ? "Checkout open…" : "Test setup and monthly checkout"}</button>
    <button type="button" onClick={() => router.refresh()} className="ml-4 mt-3 text-sm font-semibold text-blue-700 underline">Refresh payment status</button>
    {message && <p role="status" className="mt-3 text-sm text-slate-700">{message}</p>}
  </div>;
}
