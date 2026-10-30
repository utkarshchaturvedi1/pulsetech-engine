"use client";
import Script from "next/script";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Provider = "dodo" | "paddle";

export default function ClientCheckout({ providers, token, setupPriceId, monthlyPriceId }: { providers: Provider[]; token: string; setupPriceId: string; monthlyPriceId: string }) {
  const [provider, setProvider] = useState<Provider>(providers[0] || "dodo");
  const [paddleReady, setPaddleReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  const paddleAvailable = providers.includes("paddle") && Boolean(token && setupPriceId && monthlyPriceId);

  if (!providers.length) return <p className="mt-4 text-sm text-slate-600">Secure online checkout is being prepared. Contact PulseTech for current payment instructions.</p>;

  async function checkout() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/client/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Checkout could not start.");
      if (provider === "dodo") {
        if (typeof result.checkoutUrl !== "string" || !result.checkoutUrl.startsWith("https://checkout.dodopayments.com/")) throw new Error("Secure checkout could not be opened. Please try again.");
        window.location.assign(result.checkoutUrl);
        return;
      }
      if (!window.Paddle || !paddleReady) throw new Error("Paddle checkout is still loading. Please try again.");
      window.Paddle.Checkout.open({ items: [{ priceId: setupPriceId, quantity: 1 }, { priceId: monthlyPriceId, quantity: 1 }], customData: result.customData, settings: { showAddDiscounts: false, allowDiscountRemoval: false } });
      setMessage("Complete checkout in the secure payment window. PulseTech will update your account after the payment provider confirms it.");
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Please try again.");
    }
  }

  return <div className="mt-5">
    {paddleAvailable && <Script src="https://cdn.paddle.com/paddle/v2/paddle.js" strategy="afterInteractive" onReady={() => {
      if (!window.Paddle) return;
      if (token.startsWith("test_")) window.Paddle.Environment.set("sandbox");
      window.Paddle.Initialize({ token, eventCallback(event) {
        if (event.name === "checkout.completed") { setMessage("Payment received. Your account will update after the signed payment confirmation arrives."); setBusy(false); router.refresh(); }
        if (["checkout.closed", "checkout.error"].includes(event.name || "")) setBusy(false);
      } });
      setPaddleReady(true);
    }} onError={() => setMessage("Paddle checkout could not load. Try the other payment option or contact support.")} />}
    {providers.length > 1 && <fieldset className="mb-4">
      <legend className="mb-2 text-sm font-semibold text-slate-800">Choose a secure payment option</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {providers.map((item) => <label key={item} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-semibold ${provider === item ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-700"}`}>
          <input type="radio" name="billing-provider" value={item} checked={provider === item} onChange={() => { setProvider(item); setMessage(""); }} />
          {item === "dodo" ? "Dodo Payments" : "Paddle"}
        </label>)}
      </div>
    </fieldset>}
    <p className="text-sm text-slate-600">One-time setup: $2,000. Then $500/month. Your subscription continues monthly until canceled.</p>
    <p className="mt-2 text-xs leading-5 text-slate-500">Your account is activated only after the provider confirms payment. Returning from checkout alone does not mark payment as complete.</p>
    <button type="button" disabled={busy || (provider === "paddle" && !paddleReady)} onClick={checkout} className="pt-portal-button mt-4 rounded-full px-6 py-3 font-bold disabled:opacity-50">{busy ? "Opening secure checkout…" : "Continue to secure checkout"}</button>
    {message && <p role="status" className="mt-3 text-sm text-slate-700">{message}</p>}
  </div>;
}
