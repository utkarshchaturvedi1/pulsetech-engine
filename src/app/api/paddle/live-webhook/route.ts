import { NextRequest, NextResponse } from "next/server";
import { applyPaddleBilling } from "@/lib/clientBilling";
import {
  handlePaddleSandboxWebhook,
  supabasePaddleLiveNotificationStore,
} from "../../../../lib/paddleSandboxWebhook";

export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production" || process.env.PADDLE_LIVE_ENABLED !== "true") {
    return NextResponse.json({ error: "Live Paddle billing is disabled." }, { status: 403 });
  }
  const result = await handlePaddleSandboxWebhook({
    rawBody: await request.text(),
    signatureHeader: request.headers.get("paddle-signature"),
    secret: process.env.PADDLE_LIVE_WEBHOOK_SECRET?.trim() || "",
    store: supabasePaddleLiveNotificationStore,
    vercelEnv: process.env.VERCEL_ENV,
    allowLive: true,
    processNotification: (record) => applyPaddleBilling(record, "live"),
  });
  return NextResponse.json(result.body, { status: result.status });
}
