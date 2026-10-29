-- Business profiles for an isolated V1.2 Preview database.
-- Apply alongside client_accounts.sql and voice_demo_sessions.sql.
-- App routes use the service role; never expose this table through anon access.

create table if not exists public.business_profiles (
  id text primary key,
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.business_profiles enable row level security;
revoke all on public.business_profiles from public, anon, authenticated;
grant all on public.business_profiles to service_role;

-- updated_at is supplied by commitSharedProfile and used for optimistic locking.
-- Do not add a trigger that rewrites it: concurrent-save comparisons use its value.
