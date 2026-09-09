-- PulseTech Voice Demo sessions (prospect testing only).
-- Paying clients use assigned/ported numbers with NO access code.
-- Run in Supabase SQL editor with service role available to the Next.js app.

create table if not exists public.voice_demo_sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  demo_id text not null,
  status text not null default 'active'
    check (status in ('active', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz null
);

-- One active code value at a time (expired/revoked may reuse codes later).
create unique index if not exists voice_demo_sessions_active_code_uidx
  on public.voice_demo_sessions (code)
  where status = 'active';

create index if not exists voice_demo_sessions_demo_active_idx
  on public.voice_demo_sessions (demo_id, status, expires_at desc);

create table if not exists public.voice_demo_invalid_attempts (
  id bigserial primary key,
  caller_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists voice_demo_invalid_attempts_caller_idx
  on public.voice_demo_invalid_attempts (caller_key, created_at desc);

create table if not exists public.voice_demo_call_bindings (
  call_sid text primary key,
  demo_id text not null,
  session_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists voice_demo_call_bindings_expires_idx
  on public.voice_demo_call_bindings (expires_at);

alter table public.voice_demo_sessions enable row level security;
alter table public.voice_demo_invalid_attempts enable row level security;
alter table public.voice_demo_call_bindings enable row level security;

-- No anon policies: only the service role (bypasses RLS) should read/write these tables.
