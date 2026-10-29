# V1.2 verification — 29 October 2026

## Target

- Development branch: `codex/v1.2-client-deployment`, base `46698b36545a615ca487d746992d8a924365258a`.
- Current Preview alias: `https://staging.pulsetechlabs.com`.
- Vercel Preview configuration points to Supabase project `wzjpcesxfsuykefcijju` (PulseTech V1.2).
- The older project `odyjjpnpstvevqalqsew` (PulseTech V1.2 Staging) is not the database used by this Preview. Do not apply its configuration to the current project.
- No Production deployment, configuration, or customer-data changes are part of this verification.

## Database checks

Two synthetic tenants were inserted inside a transaction, then queried as the authenticated role with each user's JWT subject. Verified own account/membership/lead reads, own lead outcome update, rejection of cross-tenant lead updates, rejection of account self-promotion, rejection of cross-tenant support requests, own support-request insert/read, and reverse-direction account/request isolation. The transaction was rolled back; subsequent queries returned zero fixture users and accounts. These checks passed on both projects, including the project actually used by Preview.

## Account fixes

- Password recovery and invitation callbacks do not claim stale signup demo metadata. Explicit password-setup destinations survive; ordinary signup confirmation still claims and opens its saved demo.
- The account page displays the database-assigned Customer ID.
- The existing support-request form and tenant-scoped request history/status are available in the dashboard. Refresh uses the router so the saved confirmation remains visible.

## Sandbox payment observations

- Completed a real sandbox checkout with a documented Paddle test card and synthetic buyer details. No live payment was made.
- Checkout contained setup and monthly items, quantity one each. A Dallas test ZIP produced a $2,500 subtotal, $165 tax, and $2,665 total. The monthly total shown including tax was $533.
- Paddle's destination still targeted the older `paddle-sandbox-payment-page` branch. Updated this existing sandbox destination to the current staging host, retaining its existing security configuration and subscribed events.
- Replayed `transaction.completed`; the current endpoint verified the signature, then returned storage unavailable. Vercel diagnostics: `insert-rejected`, HTTP 401, Postgres `42501`. The current database grants insertion to `service_role`, not anon or authenticated.
- Repair adds an Authorization bearer header for legacy JWT service keys while retaining apikey-only authentication for opaque secret keys. Regression coverage includes both formats. Deployment and successful replay must be verified before marking event storage repaired.

## Remaining release gates

The sandbox webhook records events only. It does not map verified payment to an account, activate a subscription, or implement cancellation/refund/renewal access changes. Do not treat a successful checkout or notification as paid-account activation. Live merchant approval, payment lifecycle, usage enforcement, installation/phone handover, and full release-journey checks remain open. Production release still requires the user's explicit approval.
