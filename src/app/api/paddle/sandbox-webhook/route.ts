import { NextRequest, NextResponse } from "next/server";
import {
  handlePaddleSandboxWebhook,
  paddleSandboxWebhookSecret,
  supabasePaddleNotificationStore,
} from "../../../../lib/paddleSandboxWebhook";

/**
 * Verifies a Paddle Sandbox notification and stores it with the Supabase
 * service role. It does not activate a client account or associate a payment
 * with a business. The destination secret belongs in local .env.local and
 * Vercel Preview only. Production requests are rejected.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: request.headers.get("paddle-signature"),
    secret: paddleSandboxWebhookSecret(),
    store: supabasePaddleNotificationStore,
    vercelEnv: process.env.VERCEL_ENV,
  });
  return NextResponse.json(result.body, { status: result.status });
}
