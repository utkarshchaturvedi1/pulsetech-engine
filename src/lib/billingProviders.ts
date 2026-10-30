import { dodoCheckoutEnabled } from "./dodoBilling";

export type CheckoutProvider = "dodo" | "paddle";

export function configuredCheckoutProviders(): CheckoutProvider[] {
  const providers: CheckoutProvider[] = [];
  if (dodoCheckoutEnabled()) providers.push("dodo");
  const paddleLiveReady = process.env.VERCEL_ENV === "production" && process.env.PADDLE_LIVE_ENABLED === "true" &&
    (process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "").startsWith("live_") &&
    Boolean(process.env.NEXT_PUBLIC_PADDLE_SETUP_PRICE_ID && process.env.NEXT_PUBLIC_PADDLE_MONTHLY_PRICE_ID && process.env.PADDLE_LIVE_WEBHOOK_SECRET);
  const paddleSandboxReady = process.env.VERCEL_ENV !== "production" &&
    (process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "").startsWith("test_") &&
    Boolean(process.env.NEXT_PUBLIC_PADDLE_SETUP_PRICE_ID && process.env.NEXT_PUBLIC_PADDLE_MONTHLY_PRICE_ID);
  if (paddleLiveReady || paddleSandboxReady) providers.push("paddle");
  return providers;
}
