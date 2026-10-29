# V1.2 product completion — 29 October 2026

## Release target

- Development branch: `codex/v1.2-client-deployment` (published baseline `92b534bb6c9d009f2e1537d549bdc4d34769afde`).
- Staging alias: `https://staging.pulsetechlabs.com`.
- The Vercel Preview project currently uses Supabase project `wzjpcesxfsuykefcijju` (PulseTech V1.2), shown as the `main PRODUCTION` database in Supabase.
- The separate project `odyjjpnpstvevqalqsew` is isolated staging and is not wired to the current Preview. It is not a substitute for the active Preview database.
- The additive billing migration was applied to `wzjpcesxfsuykefcijju` on 29 October 2026 after the user approved the production database change. It was validated in isolated PGlite first. No customer rows were changed.

## Completed in the development branch

- Account recovery and invitation callbacks keep their intended destination and do not let stale signup metadata hijack the flow.
- Client portal has account billing and service state, recoverable lead history, support request history, full lead export, weekly lead outcomes, and monthly usage totals.
- Checkout uses a verified-email account membership, a single-use server-issued intent, exact setup/monthly item validation, signed webhook verification, idempotent billing lifecycle changes, and refund/dispute handling. No browser-supplied account ID is trusted.
- Operations view supports launch checks, status changes, request triage, domain validation, phone-number mapping checks, and internal launch attestation.
- Website assistant has a domain-restricted, isolated, accessible embed. Chat and phone leads are saved to the tenant's lead list; existing lead outcomes and first-captured timestamps survive updates.
- Monthly chat and inbound voice quotas are enforced and the usage summary is visible only to the signed-in account. Phone service checks verified billing and mapped channel state.
- The client dashboard degrades safely against the pre-migration schema. New billing, widget, quota and handover functions become operational only after the new SQL migration is applied.
- Updated regression commands use the local `tsx` loader so they run in restricted environments without the CLI's forbidden IPC socket.

## Verification

- All 12 regression suites pass, including billing event validation and the Postgres-compatible SQL integration test.
- The SQL integration test applies the existing V1.2 account, lead and Paddle migrations plus `supabase/client_billing.sql` in isolated PGlite, then verifies intent binding, duplicate delivery, stale lifecycle ordering, refund handling, usage caps, tenant RLS, private provider fields, partial lead merge and preservation of client-entered sales outcomes.
- TypeScript check, full lint (zero errors; existing image/unused-variable warnings remain), and optimized Next.js build pass.
- Browser-based staging support request and sandbox checkout were previously completed. No live payment was made.

## Activation gates

- The SQL migration is applied and verified on the connected Supabase project. The current Preview shares that production database; this means the production schema is ready for the V1.2 server routes.
- Production checkout and live Paddle webhooks remain disabled; the merchant's live account, live prices, and production callback have not been verified or enabled.
- Phone activation requires the account's existing inbound number to be mapped and launch checks to be completed. No phone number purchase or provider change was made.
- No production application deployment, production environment change, or customer-account edit is part of this branch work. The running application remains on the staging Preview alias.
