import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billingAdmin, billingTokenHash, newBillingToken } from "@/lib/clientBilling";

export async function POST(request: Request) {
  // Only sandbox is enabled until the separately approved live merchant setup.
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ error: "Please contact PulseTech for secure payment." }, { status: 503 });
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user || !user.email_confirmed_at) return NextResponse.json({ error: "Confirm your email and sign in first." }, { status: 401 });
    const { data: membership, error: membershipError } = await session.from("customer_memberships").select("customer_account_id").eq("user_id", user.id).maybeSingle();
    if (membershipError || !membership) return NextResponse.json({ error: "Connect your business demo before checkout." }, { status: 403 });
    const admin = billingAdmin();
    const { data: account, error } = await admin.from("customer_accounts").select("billing_status,paddle_subscription_id").eq("id", membership.customer_account_id).single();
    if (error) throw error;
    if (account.paddle_subscription_id || account.billing_status !== "unpaid") return NextResponse.json({ error: "Your account already has billing activity. Contact support before starting another subscription." }, { status: 409 });
    const now = new Date().toISOString();
    const { error: cleanupError } = await admin.from("checkout_intents").delete().eq("customer_account_id", membership.customer_account_id).is("consumed_transaction_id", null).lt("expires_at", now);
    if (cleanupError) throw cleanupError;
    const { data: pending, error: pendingError } = await admin.from("checkout_intents").select("id").eq("customer_account_id", membership.customer_account_id).is("consumed_transaction_id", null).gt("expires_at", now).maybeSingle();
    if (pendingError) throw pendingError;
    if (pending) return NextResponse.json({ error: "A secure checkout is already open for this account. Finish or close it before starting another." }, { status: 409 });
    const token = newBillingToken();
    const { data: intent, error: intentError } = await admin.from("checkout_intents").insert({ customer_account_id: membership.customer_account_id, token_hash: billingTokenHash(token), environment: "sandbox" }).select("id").single();
    if (intentError) throw intentError;
    return NextResponse.json({ customData: { pulsetech_checkout_id: intent.id, pulsetech_checkout_token: token } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Checkout is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
