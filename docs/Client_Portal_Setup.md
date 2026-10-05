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

The invited business profile must already exist in the current shared profile store. This flow does not crawl a website, create a profile, provision a phone number, publish an embed widget, or alter chat/voice behavior.

## Current limits

- This is a login and handover foundation, not a full dashboard or a launch approval.
- Handover requests are saved to Supabase and visible to that client. There is not yet an internal request queue, alert, status-update screen, or automatic reply.
- Customer ID assignment is database-generated; do not create or edit customer IDs by hand.
- Each account currently supports one sign-in user and one saved business profile.
- The migration is a new file only. It must not be applied to a database without explicit review/approval.
