-- Additive payment-provider support. Existing Paddle account history is retained.
begin;

alter table public.customer_accounts add column if not exists billing_provider text
  check (billing_provider in ('paddle','dodo'));
alter table public.customer_accounts add column if not exists dodo_customer_id text;
alter table public.customer_accounts add column if not exists dodo_subscription_id text;
alter table public.checkout_intents add column if not exists provider text not null default 'paddle'
  check (provider in ('paddle','dodo'));
alter table public.checkout_intents add column if not exists provider_session_id text;
create unique index if not exists customer_accounts_dodo_subscription_unique
  on public.customer_accounts(billing_environment,dodo_subscription_id) where dodo_subscription_id is not null;
create table if not exists public.paddle_live_notifications (
  event_id text primary key,
  notification_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
alter table public.paddle_live_notifications enable row level security;
revoke all on public.paddle_live_notifications from public,anon,authenticated;
grant all on public.paddle_live_notifications to service_role;
grant select (billing_provider) on public.customer_accounts to authenticated;
update public.customer_accounts set billing_provider='paddle' where paddle_subscription_id is not null and billing_provider is null;

create or replace function public.set_client_billing_provider() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.billing_provider is null then
    if new.dodo_subscription_id is not null then new.billing_provider := 'dodo';
    elsif new.paddle_subscription_id is not null then new.billing_provider := 'paddle'; end if;
  end if;
  return new;
end $$;
drop trigger if exists set_client_billing_provider on public.customer_accounts;
create trigger set_client_billing_provider before insert or update on public.customer_accounts
for each row execute function public.set_client_billing_provider();

create or replace function public.apply_dodo_billing_event(command jsonb) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  a public.customer_accounts%rowtype;
  i public.checkout_intents%rowtype;
  account_id uuid;
  event_time timestamptz := (command->>'occurredAt')::timestamptz;
  kind text := command->>'kind';
  state text := command->>'status';
  env text := command->>'environment';
  expected_setup text := command->>'setupProductId';
  expected_monthly text := command->>'monthlyProductId';
  product_list jsonb := command->'products';
  expected_initial boolean;
begin
  if env is distinct from 'live' or command->>'provider' is distinct from 'dodo'
     or length(command->>'eventId') not between 1 and 160
     or event_time is null or kind not in ('payment','subscription','adjustment') then return 'ignored'; end if;
  if exists(select 1 from public.client_billing_events where event_id='dodo:'||(command->>'eventId')) then return 'duplicate'; end if;
  if kind='adjustment' then
    select customer_account_id into account_id from public.client_transactions
      where transaction_id=command->>'paymentId' and environment='live';
  else
    select id into account_id from public.customer_accounts
      where dodo_subscription_id=command->>'subscriptionId'
        and dodo_customer_id=command->>'customerId' and billing_environment='live';
  end if;
  if account_id is null and kind='payment' and command->>'intentId' is not null and command->>'tokenHash' is not null then
    select * into i from public.checkout_intents
      where id=(command->>'intentId')::uuid and token_hash=command->>'tokenHash'
        and provider='dodo' and environment='live' for update;
    if i.id is null or event_time < i.created_at-interval '5 minutes' or event_time > i.expires_at then return 'ignored'; end if;
    if i.consumed_transaction_id is not null and i.consumed_transaction_id<>command->>'paymentId' then return 'ignored'; end if;
    account_id := i.customer_account_id;
  end if;
  if account_id is null then return 'ignored'; end if;
  select * into a from public.customer_accounts where id=account_id for update;
  if exists(select 1 from public.client_billing_events where event_id='dodo:'||(command->>'eventId')) then return 'duplicate'; end if;
  if kind='payment' then
    expected_initial := coalesce((command->>'initial')::boolean,false);
    if command->>'currency' is distinct from 'USD' or command->>'customerId' is null
       or command->>'subscriptionId' is null or command->>'paymentId' is null
       or expected_setup is null or expected_monthly is null or jsonb_typeof(product_list) is distinct from 'array'
       or command->>'amount' is null then return 'ignored'; end if;
    if expected_initial then
      if i.id is null or a.dodo_subscription_id is not null or (command->>'amount')::numeric < 250000
         or jsonb_array_length(product_list)<>2
         or not (product_list @> jsonb_build_array(jsonb_build_object('productId',expected_setup,'quantity',1)))
         or not (product_list @> jsonb_build_array(jsonb_build_object('productId',expected_monthly,'quantity',1))) then return 'ignored'; end if;
    else
      if a.dodo_subscription_id is null or a.dodo_subscription_id<>command->>'subscriptionId'
         or a.dodo_customer_id<>command->>'customerId' or (command->>'amount')::numeric < 50000
         or jsonb_array_length(product_list)<>1
         or not (product_list @> jsonb_build_array(jsonb_build_object('productId',expected_monthly,'quantity',1))) then return 'ignored'; end if;
    end if;
    insert into public.client_transactions(transaction_id,customer_account_id,subscription_id,customer_id,environment,initial_payment,completed_at)
      values(command->>'paymentId',account_id,command->>'subscriptionId',command->>'customerId','live',expected_initial,event_time)
      on conflict(transaction_id) do nothing;
    update public.customer_accounts set
      billing_provider='dodo',dodo_subscription_id=command->>'subscriptionId',dodo_customer_id=command->>'customerId',billing_environment='live',
      paid_at=coalesce(paid_at,event_time),
      billing_status=case when billing_status in ('refunded','disputed','canceled','paused') or subscription_event_at>event_time then billing_status else 'paid' end,
      billing_period_start=case when command->>'periodStart' is not null then coalesce((command->>'periodStart')::timestamptz,billing_period_start) else billing_period_start end,
      billing_period_end=case when command->>'periodEnd' is not null then coalesce((command->>'periodEnd')::timestamptz,billing_period_end) else billing_period_end end,
      handover_status=case when handover_status='invited' then 'setup' else handover_status end,updated_at=now()
      where id=account_id;
    if i.id is not null then update public.checkout_intents set consumed_transaction_id=command->>'paymentId' where id=i.id; end if;
  elsif kind='subscription' then
    if a.dodo_subscription_id is distinct from command->>'subscriptionId' then return 'ignored'; end if;
    if a.subscription_event_at is null or a.subscription_event_at<event_time then
      update public.customer_accounts set
        billing_status=case when billing_status in ('refunded','disputed') then billing_status when state='paid' and paid_at is null then 'unpaid' else state end,
        billing_provider='dodo',subscription_event_at=event_time,
        billing_period_start=coalesce((command->>'periodStart')::timestamptz,billing_period_start),
        billing_period_end=coalesce((command->>'periodEnd')::timestamptz,billing_period_end),updated_at=now()
        where id=account_id;
    end if;
  elsif kind='adjustment' and state in ('refunded','disputed') then
    update public.customer_accounts set billing_status=state,billing_provider='dodo',updated_at=now() where id=account_id;
  else return 'ignored';
  end if;
  insert into public.client_billing_events(event_id,customer_account_id,kind,entity_id,status,occurred_at)
    values('dodo:'||(command->>'eventId'),account_id,kind,command->>'entityId',state,event_time);
  return 'applied';
end $$;
revoke all on function public.apply_dodo_billing_event(jsonb) from public,anon,authenticated;
grant execute on function public.apply_dodo_billing_event(jsonb) to service_role;

commit;
