-- Generic deploy units (product-agnostic) + in-app / web push notifications.

alter table public.distributors
  add column if not exists deploy_units integer not null default 0
    check (deploy_units >= 0);

alter table public.distributors
  add column if not exists deploy_units_consumed integer not null default 0
    check (deploy_units_consumed >= 0);

comment on column public.distributors.deploy_units is
  'Prepaid deploy units for software retailers; usable on any product';
comment on column public.distributors.deploy_units_consumed is
  'Lifetime units consumed by software retailer deploys';
comment on column public.distributors.partner_tier is
  'distributor = unlimited deploys; software_retailer = prepaid deploy units (any product)';

-- Fold existing per-SKU stock into the generic pool (once).
update public.distributors d
set deploy_units = greatest(
  d.deploy_units,
  coalesce((
    select sum(i.license_credits)::integer
    from public.distributor_inventory i
    where i.distributor_id = d.id
  ), 0)
)
where d.partner_tier = 'software_retailer'
  and d.deploy_units = 0;

-- Allocate generic deploy units (Master → retailer).
create or replace function public.allocate_deploy_units(
  p_distributor_id uuid,
  p_units integer,
  p_actor uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
begin
  if p_units is null or p_units <= 0 then
    raise exception 'Units must be positive';
  end if;

  update public.distributors
  set deploy_units = deploy_units + p_units
  where id = p_distributor_id
  returning deploy_units into v_remaining;

  if not found then
    raise exception 'Distributor not found';
  end if;

  return v_remaining;
end;
$$;

grant execute on function public.allocate_deploy_units(uuid, integer, uuid) to service_role;

-- Retailer deploy: burn 1 generic unit regardless of product.
create or replace function public.reserve_deploy_license(
  p_distributor_id uuid,
  p_client_id uuid,
  p_product_id uuid,
  p_actor uuid default null
)
returns table (
  debit_mode text,
  amount_debited numeric,
  inventory_remaining integer,
  wallet_remaining numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_units integer;
  v_balance numeric(14, 2);
  v_tier public.partner_tier;
  v_is_master boolean;
begin
  select wallet_balance, partner_tier, coalesce(is_master, false), deploy_units
    into v_balance, v_tier, v_is_master, v_units
  from public.distributors
  where id = p_distributor_id
  for update;

  if not found then
    raise exception 'Distributor not found';
  end if;

  -- Master HQ and Distributors: unlimited
  if v_is_master or v_tier = 'distributor' then
    return query select
      'unlimited'::text,
      0::numeric,
      null::integer,
      v_balance;
    return;
  end if;

  -- Ensure product exists (choice is free; units are not product-tied)
  if not exists (
    select 1 from public.products where id = p_product_id and is_active = true
  ) then
    raise exception 'Product not found or inactive';
  end if;

  if coalesce(v_units, 0) <= 0 then
    raise exception
      'No deploy units left. Ask Master to sell you more units before deploying.';
  end if;

  update public.distributors
  set deploy_units = deploy_units - 1,
      deploy_units_consumed = deploy_units_consumed + 1
  where id = p_distributor_id
  returning deploy_units into v_units;

  return query select
    'inventory'::text,
    0::numeric,
    v_units,
    v_balance;
end;
$$;

grant execute on function public.reserve_deploy_license(uuid, uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Notifications + Web Push subscriptions
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null,
  href text,
  kind text not null default 'general',
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_profile_created_idx
  on public.notifications (profile_id, created_at desc);
create index if not exists notifications_profile_unread_idx
  on public.notifications (profile_id)
  where read_at is null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (profile_id = auth.uid() or public.is_platform_admin());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists push_subs_select_own on public.push_subscriptions;
create policy push_subs_select_own on public.push_subscriptions
  for select to authenticated
  using (profile_id = auth.uid() or public.is_platform_admin());

drop policy if exists push_subs_insert_own on public.push_subscriptions;
create policy push_subs_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists push_subs_update_own on public.push_subscriptions;
create policy push_subs_update_own on public.push_subscriptions
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists push_subs_delete_own on public.push_subscriptions;
create policy push_subs_delete_own on public.push_subscriptions
  for delete to authenticated
  using (profile_id = auth.uid());

-- Create in-app notification rows (service role / edge functions).
create or replace function public.create_notification(
  p_profile_id uuid,
  p_title text,
  p_body text,
  p_kind text default 'general',
  p_href text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notifications (profile_id, title, body, kind, href, metadata)
  values (p_profile_id, p_title, p_body, coalesce(p_kind, 'general'), p_href, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.create_notification(uuid, text, text, text, text, jsonb) to service_role;

-- Helper: platform admin profile ids
create or replace function public.platform_admin_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where role = 'platform_admin';
$$;

grant execute on function public.platform_admin_profile_ids() to service_role;
