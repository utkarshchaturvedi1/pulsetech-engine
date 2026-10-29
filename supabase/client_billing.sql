-- Additive V1.2 billing foundation. Apply to isolated Preview first.
begin;
alter table public.customer_accounts add column if not exists billing_status text not null default 'unpaid'
  check (billing_status in ('unpaid','paid','past_due','paused','canceled','refunded','disputed'));
alter table public.customer_accounts add column if not exists billing_environment text check (billing_environment in ('sandbox','live'));
alter table public.customer_accounts add column if not exists paddle_customer_id text;
alter table public.customer_accounts add column if not exists paddle_subscription_id text;
alter table public.customer_accounts add column if not exists paid_at timestamptz;
alter table public.customer_accounts add column if not exists billing_period_start timestamptz;
alter table public.customer_accounts add column if not exists billing_period_end timestamptz;
alter table public.customer_accounts add column if not exists subscription_event_at timestamptz;
alter table public.customer_accounts add column if not exists website_status text not null default 'pending' check (website_status in ('pending','ready','live','suspended'));
alter table public.customer_accounts add column if not exists phone_status text not null default 'pending' check (phone_status in ('pending','ready','live','suspended'));
alter table public.customer_accounts add column if not exists inbound_phone text;
alter table public.customer_accounts add column if not exists allowed_domain text;
alter table public.customer_accounts add column if not exists launch_checked_at timestamptz;
alter table public.customer_accounts add column if not exists launch_checked_by uuid references auth.users(id);
create unique index if not exists customer_accounts_subscription_unique on public.customer_accounts(billing_environment,paddle_subscription_id) where paddle_subscription_id is not null;
grant select (billing_status,billing_environment,paid_at,billing_period_start,billing_period_end,website_status,phone_status,inbound_phone,allowed_domain,launch_checked_at) on public.customer_accounts to authenticated;

create table if not exists public.checkout_intents (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  token_hash text not null check (length(token_hash)=64),
  environment text not null check (environment in ('sandbox','live')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '24 hours'),
  consumed_transaction_id text unique
);
create unique index if not exists checkout_intents_one_unconsumed_per_account
  on public.checkout_intents(customer_account_id) where consumed_transaction_id is null;
create table if not exists public.client_billing_events (
  event_id text primary key,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  kind text not null,
  entity_id text not null,
  status text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
create table if not exists public.client_transactions (
  transaction_id text primary key,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  subscription_id text not null,
  customer_id text not null,
  environment text not null,
  initial_payment boolean not null,
  completed_at timestamptz not null
);
alter table public.checkout_intents enable row level security;
alter table public.client_billing_events enable row level security;
alter table public.client_transactions enable row level security;
revoke all on public.checkout_intents,public.client_billing_events,public.client_transactions from public,anon,authenticated;
grant all on public.checkout_intents,public.client_billing_events,public.client_transactions to service_role;

-- Enforce the included monthly usage before accepting more work. Conversation
-- ids and call durations come from the server's verified channel session.
create table if not exists public.client_chat_sessions (
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  conversation_id text not null,
  period_start date not null,
  created_at timestamptz not null default now(),
  primary key(customer_account_id,conversation_id)
);
create index if not exists client_chat_sessions_period_idx on public.client_chat_sessions(customer_account_id,period_start);
create table if not exists public.client_voice_calls (
  conversation_id text primary key,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  period_start date not null,
  duration_seconds integer not null check (duration_seconds between 0 and 86400),
  created_at timestamptz not null default now()
);
create index if not exists client_voice_calls_period_idx on public.client_voice_calls(customer_account_id,period_start);
alter table public.client_chat_sessions enable row level security;
alter table public.client_voice_calls enable row level security;
revoke all on public.client_chat_sessions,public.client_voice_calls from public,anon,authenticated;
grant all on public.client_chat_sessions,public.client_voice_calls to service_role;

create or replace function public.reserve_client_chat_conversation(p_demo_id text,p_conversation_id text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.customer_accounts%rowtype; month_start date := date_trunc('month',now() at time zone 'utc')::date; used integer;
begin
 if p_conversation_id is null or char_length(p_conversation_id) not between 8 and 128 then return false; end if;
 select * into a from public.customer_accounts where demo_id=p_demo_id for update;
 if a.id is null or a.billing_status<>'paid' or a.handover_status<>'live' or a.website_status<>'live' or a.launch_checked_at is null then return false; end if;
 if exists(select 1 from public.client_chat_sessions where customer_account_id=a.id and conversation_id=p_conversation_id) then
   update public.client_chat_sessions set period_start=month_start where customer_account_id=a.id and conversation_id=p_conversation_id;
   return true;
 end if;
 select count(*) into used from public.client_chat_sessions where customer_account_id=a.id and period_start=month_start;
 if used>=1000 then return false; end if;
 insert into public.client_chat_sessions(customer_account_id,conversation_id,period_start) values(a.id,p_conversation_id,month_start);
 return true;
end $$;
revoke all on function public.reserve_client_chat_conversation(text,text) from public,anon,authenticated;
grant execute on function public.reserve_client_chat_conversation(text,text) to service_role;

create or replace function public.client_voice_minutes_available(p_demo_id text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.customer_accounts%rowtype; month_start date := date_trunc('month',now() at time zone 'utc')::date; used integer;
begin
 select * into a from public.customer_accounts where demo_id=p_demo_id;
 -- Existing mapped demos outside the client portal keep their current behavior.
 if a.id is null then return true; end if;
 if a.billing_status<>'paid' or a.phone_status<>'live' or a.launch_checked_at is null then return false; end if;
 select coalesce(sum(duration_seconds),0) into used from public.client_voice_calls where customer_account_id=a.id and period_start=month_start;
 return used<15000;
end $$;
revoke all on function public.client_voice_minutes_available(text) from public,anon,authenticated;
grant execute on function public.client_voice_minutes_available(text) to service_role;

create or replace function public.record_client_voice_call(p_demo_id text,p_conversation_id text,p_duration_seconds integer) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare aid uuid; month_start date := date_trunc('month',now() at time zone 'utc')::date;
begin
 if p_conversation_id is null or char_length(p_conversation_id) not between 8 and 128 or p_duration_seconds is null or p_duration_seconds not between 0 and 86400 then return; end if;
 select id into aid from public.customer_accounts where demo_id=p_demo_id and billing_status='paid';
 if aid is null then return; end if;
 insert into public.client_voice_calls(conversation_id,customer_account_id,period_start,duration_seconds)
 values(p_conversation_id,aid,month_start,p_duration_seconds) on conflict(conversation_id) do nothing;
end $$;
revoke all on function public.record_client_voice_call(text,text,integer) from public,anon,authenticated;
grant execute on function public.record_client_voice_call(text,text,integer) to service_role;

create or replace function public.get_client_monthly_usage() returns table(website_chat_conversations integer,inbound_voice_minutes numeric)
language plpgsql security definer set search_path=public,pg_temp as $$
declare aid uuid; month_start date := date_trunc('month',now() at time zone 'utc')::date;
begin
 select customer_account_id into aid from public.customer_memberships where user_id=auth.uid();
 if aid is null then return; end if;
 return query select
   (select count(*)::integer from public.client_chat_sessions where customer_account_id=aid and period_start=month_start),
   (select round(coalesce(sum(duration_seconds),0)::numeric/60,1) from public.client_voice_calls where customer_account_id=aid and period_start=month_start);
end $$;
revoke all on function public.get_client_monthly_usage() from public,anon;
grant execute on function public.get_client_monthly_usage() to authenticated,service_role;

create or replace function public.get_client_weekly_report() returns table(new_enquiries integer,converted_leads integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare aid uuid;
begin
 select customer_account_id into aid from public.customer_memberships where user_id=auth.uid();
 if aid is null then return; end if;
 return query select
   (select count(*)::integer from public.customer_leads where customer_account_id=aid and first_captured_at>=now()-interval '7 days'),
   (select count(*)::integer from public.customer_leads where customer_account_id=aid and first_captured_at>=now()-interval '7 days' and sales_outcome='converted');
end $$;
revoke all on function public.get_client_weekly_report() from public,anon;
grant execute on function public.get_client_weekly_report() to authenticated,service_role;

-- Atomic idempotency, account binding and state transitions. Callable only by
-- the trusted server after raw-body provider signature and item verification.
create or replace function public.apply_client_billing_event(command jsonb) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a public.customer_accounts%rowtype;
  i public.checkout_intents%rowtype;
  account_id uuid;
  event_time timestamptz := (command->>'occurredAt')::timestamptz;
  env text := coalesce(command->>'environment','sandbox');
  state text := command->>'status';
  kind text := command->>'kind';
begin
  if env not in ('sandbox','live') or command->>'eventId' !~ '^evt_[a-z0-9]{26}$' then return 'ignored'; end if;
  if exists(select 1 from public.client_billing_events where event_id=command->>'eventId') then return 'duplicate'; end if;
  if kind='adjustment' then
    select customer_account_id into account_id from public.client_transactions where transaction_id=command->>'transactionId' and environment=env and customer_id=command->>'customerId';
  else
    select id into account_id from public.customer_accounts where paddle_subscription_id=command->>'subscriptionId' and paddle_customer_id=command->>'customerId' and billing_environment=env;
  end if;
  if account_id is null and kind in ('payment','subscription') and command->>'intentId' is not null and command->>'tokenHash' is not null then
    select * into i from public.checkout_intents where id=(command->>'intentId')::uuid and token_hash=command->>'tokenHash' and environment=env for update;
    if i.id is null or event_time < i.created_at-interval '5 minutes' or event_time>i.expires_at then return 'ignored'; end if;
    if kind='subscription' then return 'deferred'; end if;
    if not coalesce((command->>'initial')::boolean,false) then return 'ignored'; end if;
    if i.consumed_transaction_id is not null and i.consumed_transaction_id<>command->>'transactionId' then return 'ignored'; end if;
    account_id := i.customer_account_id;
  end if;
  if account_id is null then return 'ignored'; end if;
  select * into a from public.customer_accounts where id=account_id for update;
  -- Serialize duplicate events even when concurrent webhook requests race.
  if exists(select 1 from public.client_billing_events where event_id=command->>'eventId') then return 'duplicate'; end if;
  if a.paddle_subscription_id is not null and (a.paddle_subscription_id<>command->>'subscriptionId' or a.paddle_customer_id<>command->>'customerId' or a.billing_environment<>env) and kind<>'adjustment' then return 'ignored'; end if;
  if kind='payment' then
    -- The checkout intent may bind exactly one initial setup+monthly payment.
    -- Once a subscription is bound, later transactions may renew the monthly
    -- item only; another setup charge must never be replayed as a new initial.
    if a.paddle_subscription_id is null and (i.id is null or not coalesce((command->>'initial')::boolean,false)) then return 'ignored'; end if;
    if a.paddle_subscription_id is not null and coalesce((command->>'initial')::boolean,false) then return 'ignored'; end if;
    insert into public.client_transactions(transaction_id,customer_account_id,subscription_id,customer_id,environment,initial_payment,completed_at)
      values(command->>'transactionId',account_id,command->>'subscriptionId',command->>'customerId',env,(command->>'initial')::boolean,event_time) on conflict do nothing;
    update public.customer_accounts set
      paddle_subscription_id=command->>'subscriptionId',paddle_customer_id=command->>'customerId',billing_environment=env,
      paid_at=coalesce(paid_at,event_time),
      billing_status=case when billing_status in ('refunded','disputed','canceled','paused') or subscription_event_at>event_time then billing_status else 'paid' end,
      billing_period_start=case when billing_period_start is null or billing_period_start<(command->>'periodStart')::timestamptz then (command->>'periodStart')::timestamptz else billing_period_start end,
      billing_period_end=case when billing_period_end is null or billing_period_end<(command->>'periodEnd')::timestamptz then (command->>'periodEnd')::timestamptz else billing_period_end end,
      handover_status=case when handover_status='invited' then 'setup' else handover_status end,updated_at=now() where id=account_id;
    if i.id is not null then update public.checkout_intents set consumed_transaction_id=command->>'transactionId' where id=i.id; end if;
  elsif kind='subscription' then
    if a.subscription_event_at is null or a.subscription_event_at<event_time then
      update public.customer_accounts set
        billing_status=case when billing_status in ('refunded','disputed') then billing_status when state='paid' and paid_at is null then 'unpaid' else state end,
        subscription_event_at=event_time,
        billing_period_start=coalesce((command->>'periodStart')::timestamptz,billing_period_start),
        billing_period_end=coalesce((command->>'periodEnd')::timestamptz,billing_period_end),updated_at=now() where id=account_id;
    end if;
  elsif kind='adjustment' and state in ('refunded','disputed') then
    update public.customer_accounts set billing_status=state,updated_at=now() where id=account_id;
  end if;
  insert into public.client_billing_events(event_id,customer_account_id,kind,entity_id,status,occurred_at)
    values(command->>'eventId',account_id,kind,command->>'entityId',state,event_time);
  return 'applied';
end $$;
revoke all on function public.apply_client_billing_event(jsonb) from public,anon,authenticated;
grant execute on function public.apply_client_billing_event(jsonb) to service_role;

alter table public.customer_leads add column if not exists source text not null default 'website';
alter table public.customer_leads add column if not exists capture_status text not null default 'qualified';
create or replace function public.capture_client_lead(p_demo_id text,p_lead jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare aid uuid;
begin
 select id into aid from public.customer_accounts where demo_id=p_demo_id and handover_status='live' and billing_status='paid';
 if aid is null then return; end if;
 insert into public.customer_leads(customer_account_id,conversation_id,source,customer_name,customer_phone,customer_email,service_address,primary_need,urgency,preferred_timing,alert_delivery_status,capture_status)
 values(aid,p_lead->>'conversation_id',coalesce(p_lead->>'source','website'),p_lead->>'customer_name',p_lead->>'customer_phone',p_lead->>'customer_email',p_lead->>'service_address',p_lead->>'primary_need',p_lead->>'urgency',p_lead->>'preferred_timing',p_lead->>'alert_delivery_status',p_lead->>'capture_status')
 on conflict(customer_account_id,conversation_id) do update set
 customer_name=coalesce(excluded.customer_name,customer_leads.customer_name),customer_phone=coalesce(excluded.customer_phone,customer_leads.customer_phone),
 customer_email=coalesce(excluded.customer_email,customer_leads.customer_email),service_address=coalesce(excluded.service_address,customer_leads.service_address),
 primary_need=coalesce(excluded.primary_need,customer_leads.primary_need),urgency=excluded.urgency,preferred_timing=coalesce(excluded.preferred_timing,customer_leads.preferred_timing),
 alert_delivery_status=excluded.alert_delivery_status,capture_status=excluded.capture_status,updated_at=now();
 -- first_captured_at and the owner's outcome/value are never overwritten.
end $$;
revoke all on function public.capture_client_lead(text,jsonb) from public,anon,authenticated;
grant execute on function public.capture_client_lead(text,jsonb) to service_role;

alter table public.paddle_sandbox_notifications drop constraint if exists paddle_sandbox_notifications_event_type_check;
alter table public.paddle_sandbox_notifications add constraint paddle_sandbox_notifications_event_type_check check (event_type in (
 'transaction.completed','transaction.payment_failed','subscription.created','subscription.updated','subscription.activated','subscription.resumed','subscription.paused','subscription.past_due','subscription.canceled','adjustment.created','adjustment.updated'));
revoke all on public.paddle_sandbox_notifications from public,anon,authenticated;
grant all on public.paddle_sandbox_notifications to service_role;
commit;
