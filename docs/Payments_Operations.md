# PulseTech payment provider operations

The checkout flow supports a secure hosted checkout from Dodo Payments and Paddle. A provider is shown only when its live configuration is complete. If both are active, the customer can choose either before checkout. A payment redirect by itself never activates the account; the signed provider webhook does.

## Production database

Apply `supabase/multi_provider_billing.sql` after the existing `supabase/client_billing.sql` migration. This adds provider identifiers, checkout provider/session fields, the production Paddle notification table, and the Dodo payment application procedure. Existing Paddle billing history remains in place.

## Dodo Payments

The live products already in the Dodo catalogue are:

- Setup and training: `$2,000` one time (`pdt_0NqqS9Oa274LBB5NcBL1J`)
- Monthly service: `$500` monthly (`pdt_0NqqSKk27jMr6B740Vvrw`)

Add these Production environment variables in Vercel:

- `DODO_LIVE_ENABLED=true`
- `DODO_PAYMENTS_API_KEY` (server-only secret)
- `DODO_PAYMENTS_WEBHOOK_KEY` (server-only secret)
- `DODO_SETUP_PRODUCT_ID=pdt_0NqqS9Oa274LBB5NcBL1J`
- `DODO_MONTHLY_PRODUCT_ID=pdt_0NqqSKk27jMr6B740Vvrw`
- `PULSETECH_PUBLIC_BASE_URL=https://www.pulsetechlabs.com`

In the Dodo Live dashboard, create a webhook endpoint for `https://www.pulsetechlabs.com/api/dodo/webhook`. Subscribe to `payment.succeeded`, subscription active/renewed/on-hold/past-due/paused/unpaused/cancelled/expired/failed, `refund.succeeded`, and `dispute.opened`. Put that endpoint's signing secret in `DODO_PAYMENTS_WEBHOOK_KEY` as a Vercel Production Secret. Do not use a Test-mode API key or webhook secret in Production.

## Safe Dodo Test Mode on Preview

The same checkout and webhook handlers run on Preview in Dodo Test Mode when all of these are configured for the Vercel Preview environment only:

- `DODO_TEST_ENABLED=true`
- `DODO_TEST_API_KEY` (Dodo Test Mode API key)
- `DODO_TEST_WEBHOOK_KEY` (signing secret from the Test Mode webhook endpoint)
- `DODO_TEST_SETUP_PRODUCT_ID` and `DODO_TEST_MONTHLY_PRODUCT_ID` (Test Mode product IDs)

Create the test webhook endpoint at `https://staging.pulsetechlabs.com/api/dodo/webhook` and subscribe it to the same event types listed above. Production continues to read only the live `DODO_*` variables. Preview reads only `DODO_TEST_*` variables and stores test billing events with the `sandbox` environment. Never copy live credentials or product IDs into Preview.

## Paddle fallback

Paddle is kept as a second provider. It is exposed in Production only after the domain is approved and the following Production values are configured:

- `PADDLE_LIVE_ENABLED=true`
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` (a Paddle live client-side token)
- `NEXT_PUBLIC_PADDLE_SETUP_PRICE_ID` and `NEXT_PUBLIC_PADDLE_MONTHLY_PRICE_ID`
- `PADDLE_LIVE_WEBHOOK_SECRET` (server-only secret)

Configure Paddle to send the supported billing events to `https://www.pulsetechlabs.com/api/paddle/live-webhook`. If Paddle is in review or any live value is missing, it remains hidden from customers; Dodo can continue as the available option.

## Switching providers

When both providers are fully configured, the account checkout shows a provider choice before the customer opens checkout. A provider that cannot create a session returns an error and does not report payment success. Do not automatically open a second provider after a payment timeout: the first provider may have accepted the payment while its response was delayed. The checkout intent blocks simultaneous open sessions for the same client account until its session expires or is resolved.

For testing, use isolated test products and test credentials in a non-Production deployment. Never test by submitting a live payment. The production callback page only reports “checking your payment”; the account changes after a verified webhook.
