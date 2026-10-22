-- V1.2 client lead list. Apply only to a dedicated V1.2 Supabase project.
-- This matches the schema already present in PulseTech V1.2.
create table if not exists public.customer_leads (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  conversation_id text not null check (char_length(conversation_id) between 8 and 128),
  customer_name text,
  customer_phone text,
  customer_email text,
  service_address text,
  primary_need text,
  urgency text not null default 'NONE' check (urgency in ('NONE', 'SOON', 'IMMEDIATE')),
  preferred_timing text,
  alert_delivery_status text not null default 'NOT_SENT'
    check (alert_delivery_status in ('NOT_SENT', 'QUEUED', 'SENT', 'FAILED')),
  first_captured_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sales_outcome text not null default 'unreviewed'
    check (sales_outcome in ('unreviewed', 'converted', 'not_converted')),
  sale_amount_usd numeric check (sale_amount_usd is null or sale_amount_usd >= 0),
  unique (customer_account_id, conversation_id),
  check (sales_outcome <> 'converted' or sale_amount_usd is not null)
);

create index if not exists customer_leads_account_date_idx
  on public.customer_leads(customer_account_id, first_captured_at desc);

alter table public.customer_leads enable row level security;
drop policy if exists "Client reads own leads" on public.customer_leads;
create policy "Client reads own leads" on public.customer_leads
  for select to authenticated using (exists (
    select 1 from public.customer_memberships membership
    where membership.customer_account_id = customer_leads.customer_account_id
      and membership.user_id = (select auth.uid())
  ));

drop policy if exists "Client updates own lead outcome" on public.customer_leads;
create policy "Client updates own lead outcome" on public.customer_leads
  for update to authenticated
  using (exists (
    select 1 from public.customer_memberships membership
    where membership.customer_account_id = customer_leads.customer_account_id
      and membership.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.customer_memberships membership
    where membership.customer_account_id = customer_leads.customer_account_id
      and membership.user_id = (select auth.uid())
  ));

revoke all on public.customer_leads from anon, public;
grant select, update (sales_outcome, sale_amount_usd) on public.customer_leads to authenticated;
grant all on public.customer_leads to service_role;
