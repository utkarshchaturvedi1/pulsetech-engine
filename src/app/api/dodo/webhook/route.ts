import { NextResponse } from "next/server";
import { billingAdmin } from "@/lib/clientBilling";
import { dodoBillingCommand, dodoCheckoutConfig, verifyDodoSignature } from "@/lib/dodoBilling";

export async function POST(request: Request) {
  const config = dodoCheckoutConfig();
  if (!config) return NextResponse.json({ error: "Dodo events are not configured for this environment." }, { status: 403 });
  const rawBody = await request.text();
  const webhookId = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");
  if (!verifyDodoSignature({ rawBody, webhookId, timestamp, signature, secret: config.webhookKey })) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
  let event: unknown;
  try { event = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 }); }
  const command = dodoBillingCommand({
    webhookId: webhookId!, event,
    setupProductId: config.setupProductId,
    monthlyProductId: config.monthlyProductId,
  });
  if (!command) return NextResponse.json({ received: true, applied: false });
  const completeCommand = {
    ...command,
    environment: config.environment,
    setupProductId: config.setupProductId,
    monthlyProductId: config.monthlyProductId,
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
