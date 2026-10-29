import { NextRequest, NextResponse } from "next/server";
import { applySandboxBilling } from "@/lib/clientBilling";
import {
  handlePaddleSandboxWebhook,
  paddleSandboxWebhookSecret,
  supabasePaddleNotificationStore,
} from "../../../../lib/paddleSandboxWebhook";

/**
 * Verifies and stores signed Paddle Sandbox events, then applies eligible
 * payments to the account bound by a one-time server-issued checkout intent.
 * The sandbox destination secret belongs in local .env.local and Vercel
 * Preview only. Production requests are rejected.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: request.headers.get("paddle-signature"),
    secret: paddleSandboxWebhookSecret(),
    store: supabasePaddleNotificationStore,
    vercelEnv: process.env.VERCEL_ENV,
    processNotification: applySandboxBilling,
  });
  return NextResponse.json(result.body, { status: result.status });
}
