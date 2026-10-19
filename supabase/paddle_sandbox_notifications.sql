-- PulseTech Paddle Billing Sandbox notifications only.
-- Run in the existing Supabase SQL editor. This is not a new database.
-- Stores verified notification records. It does not activate accounts or
-- associate a payment with a business.
-- Row level security is on and client access is not granted.
-- Only the server-side service role, which bypasses RLS, can read or write.

create table if not exists public.paddle_sandbox_notifications (
  event_id text primary key,
  -- Platform deliveries store ntf_. Simulation deliveries store ntfsimntf_
  -- or the ntfsimevt_ event id when notification_id is omitted.
  notification_id text not null,
  event_type text not null
    check (event_type in (
      'transaction.completed',
      'subscription.created',
      'subscription.updated',
      'subscription.canceled'
    )),
  occurred_at timestamptz not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.paddle_sandbox_notifications enable row level security;
revoke all on public.paddle_sandbox_notifications from public, anon, authenticated;
grant insert on public.paddle_sandbox_notifications to service_role;
