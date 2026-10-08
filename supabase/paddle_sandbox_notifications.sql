-- PulseTech Paddle Billing Sandbox notifications only.
-- Run in the existing Supabase SQL editor. This is not a new database.
-- Service role bypasses RLS. Do not add an anon policy.

create table if not exists public.paddle_sandbox_notifications (
  event_id text primary key,
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
