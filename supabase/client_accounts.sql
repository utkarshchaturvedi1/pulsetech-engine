-- V1.2 client identity, login membership, and handover request foundation.
-- Apply only after reviewing and backing up the target Supabase project.
create sequence if not exists public.customer_accounts_customer_number_seq;

create table if not exists public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null unique default ('PTC-' || lpad(nextval('public.customer_accounts_customer_number_seq')::text, 6, '0')),
  business_name text not null,
  owner_email text not null,
  demo_id text not null unique,
  handover_status text not null default 'invited'
    check (handover_status in ('invited', 'setup', 'testing', 'approved', 'live')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.handover_requests (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  subject text not null check (char_length(subject) between 3 and 120),
  details text not null check (char_length(details) between 10 and 4000),
  status text not null default 'received' check (status in ('received', 'in_progress', 'resolved')),
  created_at timestamptz not null default now()
);

create index if not exists customer_memberships_account_idx on public.customer_memberships(customer_account_id);
create index if not exists handover_requests_account_date_idx on public.handover_requests(customer_account_id, created_at desc);

alter table public.customer_accounts enable row level security;
alter table public.customer_memberships enable row level security;
alter table public.handover_requests enable row level security;

drop policy if exists "Client reads own account" on public.customer_accounts;
create policy "Client reads own account" on public.customer_accounts
  for select to authenticated
  using (exists (
    select 1 from public.customer_memberships membership
    where membership.customer_account_id = customer_accounts.id
      and membership.user_id = (select auth.uid())
  ));

drop policy if exists "Client reads own membership" on public.customer_memberships;
create policy "Client reads own membership" on public.customer_memberships
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Client reads own handover requests" on public.handover_requests;
create policy "Client reads own handover requests" on public.handover_requests
  for select to authenticated
  using (requested_by = (select auth.uid()) and exists (
    select 1 from public.customer_memberships membership
    where membership.customer_account_id = handover_requests.customer_account_id
      and membership.user_id = (select auth.uid())
  ));

drop policy if exists "Client creates own handover requests" on public.handover_requests;
create policy "Client creates own handover requests" on public.handover_requests
  for insert to authenticated
  with check (requested_by = (select auth.uid()) and exists (
    select 1 from public.customer_memberships membership
    where membership.customer_account_id = handover_requests.customer_account_id
      and membership.user_id = (select auth.uid())
  ));

grant select on public.customer_accounts, public.customer_memberships, public.handover_requests to authenticated;
grant insert on public.handover_requests to authenticated;
revoke all on public.customer_accounts, public.customer_memberships, public.handover_requests from anon;
grant all on public.customer_accounts, public.customer_memberships, public.handover_requests to service_role;
revoke select on public.customer_accounts from authenticated;
grant select (id, customer_id, business_name, handover_status, created_at, updated_at)
  on public.customer_accounts to authenticated;
grant usage, select on sequence public.customer_accounts_customer_number_seq to service_role;
