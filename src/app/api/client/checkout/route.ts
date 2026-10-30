import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billingAdmin, billingTokenHash, newBillingToken } from "@/lib/clientBilling";
import { configuredCheckoutProviders, type CheckoutProvider } from "@/lib/billingProviders";
import { dodoCheckoutConfig } from "@/lib/dodoBilling";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({})) as { provider?: unknown };
    const provider = body.provider;
    if (provider !== "dodo" && provider !== "paddle") return NextResponse.json({ error: "Choose a listed payment provider." }, { status: 400 });
    if (!configuredCheckoutProviders().includes(provider as CheckoutProvider)) return NextResponse.json({ error: "This secure payment option is not available right now. Please try the other option or contact support." }, { status: 503 });

    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user || !user.email_confirmed_at) return NextResponse.json({ error: "Confirm your email and sign in first." }, { status: 401 });
    const { data: membership, error: membershipError } = await session.from("customer_memberships").select("customer_account_id").eq("user_id", user.id).maybeSingle();
    if (membershipError || !membership) return NextResponse.json({ error: "Connect your business demo before checkout." }, { status: 403 });
    const admin = billingAdmin();
    const { data: account, error } = await admin.from("customer_accounts")
      .select("billing_status,paddle_subscription_id,dodo_subscription_id,owner_email,business_name")
      .eq("id", membership.customer_account_id).single();
    if (error) throw error;
    if (account.paddle_subscription_id || account.dodo_subscription_id || account.billing_status !== "unpaid") {
      return NextResponse.json({ error: "Your account already has billing activity. Contact support before starting another subscription." }, { status: 409 });
    }
    const now = new Date().toISOString();
    const { error: cleanupError } = await admin.from("checkout_intents").delete().eq("customer_account_id", membership.customer_account_id).is("consumed_transaction_id", null).lt("expires_at", now);
    if (cleanupError) throw cleanupError;
    const { data: pending, error: pendingError } = await admin.from("checkout_intents").select("id,provider").eq("customer_account_id", membership.customer_account_id).is("consumed_transaction_id", null).gt("expires_at", now).maybeSingle();
    if (pendingError) throw pendingError;
    if (pending) return NextResponse.json({ error: `A secure ${pending.provider || "payment"} checkout is already open. Finish or close it before changing providers.` }, { status: 409 });

    const token = newBillingToken();
    const environment = process.env.VERCEL_ENV === "production" ? "live" : "sandbox";
    const dodoConfig = provider === "dodo" ? dodoCheckoutConfig() : null;
    if (provider === "dodo" && !dodoConfig) {
      return NextResponse.json({ error: "Dodo checkout is not configured for this environment." }, { status: 503 });
    }
    const { data: intent, error: intentError } = await admin.from("checkout_intents").insert({
      customer_account_id: membership.customer_account_id,
      token_hash: billingTokenHash(token), environment, provider,
    }).select("id").single();
    if (intentError || !intent) throw intentError || new Error("Checkout intent was not created.");

    if (provider === "paddle") {
      return NextResponse.json({ provider, customData: { pulsetech_checkout_id: intent.id, pulsetech_checkout_token: token } }, { headers: { "Cache-Control": "no-store" } });
    }

    const apiKey = dodoConfig?.apiKey;
    const setupProductId = dodoConfig?.setupProductId;
    const monthlyProductId = dodoConfig?.monthlyProductId;
    const origin = process.env.PULSETECH_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || new URL(request.url).origin;
    if (!apiKey || !setupProductId || !monthlyProductId) throw new Error("Dodo checkout is missing secure configuration.");
    const base = dodoConfig?.environment === "live" ? "https://live.dodopayments.com" : "https://test.dodopayments.com";
    const response = await fetch(`${base}/checkouts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        product_cart: [{ product_id: setupProductId, quantity: 1 }, { product_id: monthlyProductId, quantity: 1 }],
        customer: { email: account.owner_email || user.email, name: account.business_name },
        metadata: { pulsetech_checkout_id: intent.id, pulsetech_checkout_token: token },
        return_url: `${origin}/client?checkout=return`,
        feature_flags: { allow_discount_code: false, allow_currency_selection: false, allow_customer_editing_email: false },
        customization: { force_language: "en", show_order_details: true, theme: "light" },
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      // Keep a short-lived intent so a timed-out external request cannot open a
      // second processor while Dodo's session creation result is ambiguous.
      await admin.from("checkout_intents").update({ expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }).eq("id", intent.id);
      return NextResponse.json({ error: "Dodo could not start checkout. Wait a few minutes and retry, or contact support if the issue continues." }, { status: 502 });
    }
    const result = await response.json() as { checkout_url?: unknown; session_id?: unknown };
    const checkoutUrl = typeof result.checkout_url === "string" ? result.checkout_url : "";
    if (!checkoutUrl.startsWith("https://checkout.dodopayments.com/")) {
      await admin.from("checkout_intents").update({ expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }).eq("id", intent.id);
      return NextResponse.json({ error: "Secure checkout could not be opened. Please retry shortly." }, { status: 502 });
    }
    if (typeof result.session_id === "string") await admin.from("checkout_intents").update({ provider_session_id: result.session_id }).eq("id", intent.id);
    return NextResponse.json({ provider, checkoutUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Checkout is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
