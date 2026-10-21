-- Client-owned lead outcome tracking. Apply to the isolated V1.2 Preview project.
-- Clients may update only the two outcome columns; all contact data stays read-only.

alter table public.customer_leads
  add column if not exists sales_outcome text not null default 'unreviewed';
alter table public.customer_leads
  add column if not exists sale_amount_usd numeric(12, 2);

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_leads_sales_outcome_check'
      and conrelid = 'public.customer_leads'::regclass
  ) then
    alter table public.customer_leads
      add constraint customer_leads_sales_outcome_check
      check (sales_outcome in ('unreviewed', 'converted', 'not_converted'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_leads_sale_amount_nonnegative'
      and conrelid = 'public.customer_leads'::regclass
  ) then
    alter table public.customer_leads
      add constraint customer_leads_sale_amount_nonnegative
      check (sale_amount_usd is null or sale_amount_usd >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_leads_converted_requires_amount'
      and conrelid = 'public.customer_leads'::regclass
  ) then
    alter table public.customer_leads
      add constraint customer_leads_converted_requires_amount
      check (sales_outcome <> 'converted' or sale_amount_usd is not null);
  end if;
end $$;

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

revoke update on public.customer_leads from authenticated;
grant update (sales_outcome, sale_amount_usd) on public.customer_leads to authenticated;
