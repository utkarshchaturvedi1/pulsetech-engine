import { NextRequest, NextResponse } from "next/server";
import {
  handlePaddleSandboxWebhook,
  paddleSandboxWebhookSecret,
  supabasePaddleNotificationStore,
} from "../../../../lib/paddleSandboxWebhook";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const result = await handlePaddleSandboxWebhook({
    rawBody,
    signatureHeader: request.headers.get("paddle-signature"),
    secret: paddleSandboxWebhookSecret(),
    store: supabasePaddleNotificationStore,
  });
  return NextResponse.json(result.body, { status: result.status });
}
