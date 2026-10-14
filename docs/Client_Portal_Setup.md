# V1.2 Client Login and Handover

This feature is additive. Existing public chat, voice, demo and lead-alert routes are not changed.

## What it adds

- Email one-time-link login at `/login`. Login does not create unapproved accounts.
- An account receives a unique database-generated ID such as `PTC-000001`.
- Each account links to one existing saved business profile (`demo_id`).
- The client can view the linked business identity and handover status, submit requests, and review their own requests.
- Supabase Row Level Security limits account and request rows to an authenticated account member.
- A PulseTech administrator can invite a client from `/client` after signing in.

## Required setup before using the portal

1. Back up the intended Supabase project and apply `supabase/client_accounts.sql` after review. This migration creates new tables; it does not change or delete `business_profiles`.
2. Configure Vercel with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PULSETECH_ADMIN_EMAILS`, and `PULSETECH_PUBLIC_BASE_URL`.
3. In Supabase Auth, configure email delivery and allow the canonical callback URL, for example `https://www.pulsetechlabs.com/auth/callback`.
4. Add each PulseTech administrator as a Supabase Auth user and include that exact email in `PULSETECH_ADMIN_EMAILS`.
5. Deploy a preview and verify login, onboarding, profile linkage, handover requests, and account isolation before enabling production access.

## Invite a first client

Sign in at `/login` using an administrator email. Open `/client`, enter the client's work email and the ID of an already saved business profile, then create the account. The client receives an email invite. The account and membership are linked before the portal displays the customer ID.

The invited business profile must already exist in the shared profile store. The authenticated client portal now provides a client-specific iframe embed URL and copyable WordPress/Wix/Squarespace instructions. The public widget renders only branding in the browser; chat replies and lead routing reload the authoritative saved profile on the server.

## Current limits

- This is a first-client handover portal, not the full lead-history or business-settings dashboard.
- Handover requests are saved to Supabase and visible to that client. There is not yet an internal request queue, alert, status-update screen, or automatic reply.
- Customer ID assignment is database-generated; do not create or edit customer IDs by hand.
- Each account currently supports one sign-in user and one saved business profile.
- Phone service is manually configured for the initial clients. Map each dedicated E.164 Twilio number to the client's saved profile in `INBOUND_VOICE_NUMBER_MAP`, point its inbound Voice webhook at `/api/twilio/voice-demo`, and run an inbound call/alert test. Shared public demo numbers remain protected by the six-digit code flow.
- Do not call the account live until the migration, Supabase Auth, website placement, real inbound call, and actual lead-alert delivery have been verified in Preview.
- The migration is a new file only. It must not be applied to a database without explicit review/approval.
