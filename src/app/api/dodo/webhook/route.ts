import { NextResponse } from "next/server";
import { billingAdmin } from "@/lib/clientBilling";
import { dodoBillingCommand, verifyDodoSignature } from "@/lib/dodoBilling";

export async function POST(request: Request) {
  if (process.env.VERCEL_ENV !== "production") return NextResponse.json({ error: "Live Dodo events are disabled outside Production." }, { status: 403 });
  const rawBody = await request.text();
  const webhookId = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");
  const secret = process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim() || "";
  if (!verifyDodoSignature({ rawBody, webhookId, timestamp, signature, secret })) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  let event: unknown;
  try { event = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 }); }
  const command = dodoBillingCommand({
    webhookId: webhookId!, event,
    setupProductId: process.env.DODO_SETUP_PRODUCT_ID || "",
    monthlyProductId: process.env.DODO_MONTHLY_PRODUCT_ID || "",
  });
  if (!command) return NextResponse.json({ received: true, applied: false });
  const completeCommand = {
    ...command,
    environment: "live",
    setupProductId: process.env.DODO_SETUP_PRODUCT_ID,
    monthlyProductId: process.env.DODO_MONTHLY_PRODUCT_ID,
  };
  try {
    const { error } = await billingAdmin().rpc("apply_dodo_billing_event", { command: completeCommand });
    if (error) throw error;
    return NextResponse.json({ received: true });
  } catch {
    // A non-2xx result asks Dodo to retry. Its webhook ID makes retries safe.
    return NextResponse.json({ error: "Webhook processing is temporarily unavailable." }, { status: 503 });
  }
}
