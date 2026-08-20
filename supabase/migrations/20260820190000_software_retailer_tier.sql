-- Software Retailer tier: inventory-only deploys; Distributors stay unlimited.

do $$ begin
  create type public.partner_tier as enum ('distributor', 'software_retailer');
exception when duplicate_object then null;
end $$;

alter table public.distributors
  add column if not exists partner_tier public.partner_tier not null default 'distributor';

comment on column public.distributors.partner_tier is
  'distributor = unlimited deploys; software_retailer = prepaid product units only';

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
  v_credits integer;
  v_price numeric(12, 2);
  v_balance numeric(14, 2);
  v_new_balance numeric(14, 2);
  v_tier public.partner_tier;
  v_is_master boolean;
begin
  select wallet_balance, partner_tier, coalesce(is_master, false)
    into v_balance, v_tier, v_is_master
  from public.distributors
  where id = p_distributor_id
  for update;

  if not found then
    raise exception 'Distributor not found';
  end if;

  -- Master HQ and Distributors: unlimited (no debit)
  if v_is_master or v_tier = 'distributor' then
    return query select
      'unlimited'::text,
      0::numeric,
      null::integer,
      v_balance;
    return;
  end if;

  -- Software Retailer: inventory only (never wallet fallback)
  select wholesale_unit_price into v_price
  from public.products
  where id = p_product_id and is_active = true;

  if not found then
    raise exception 'Product not found or inactive';
  end if;

  insert into public.distributor_inventory (distributor_id, product_id, license_credits)
  values (p_distributor_id, p_product_id, 0)
  on conflict (distributor_id, product_id) do nothing;

  select license_credits into v_credits
  from public.distributor_inventory
  where distributor_id = p_distributor_id and product_id = p_product_id
  for update;

  if coalesce(v_credits, 0) <= 0 then
    raise exception
      'No product units left for this SKU. Ask Master to sell you more units before deploying.';
  end if;

  update public.distributor_inventory
  set license_credits = license_credits - 1,
      licenses_consumed = licenses_consumed + 1
  where distributor_id = p_distributor_id and product_id = p_product_id
  returning license_credits into v_credits;

  return query select
    'inventory'::text,
    0::numeric,
    v_credits,
    v_balance;
end;
$$;

-- Helper: total remaining units across products for a partner
create or replace function public.partner_inventory_summary(p_distributor_id uuid)
returns table (
  product_id uuid,
  sku text,
  product_name text,
  license_credits integer,
  licenses_consumed integer,
  licenses_allocated integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.sku,
    p.name,
    coalesce(i.license_credits, 0)::integer,
    coalesce(i.licenses_consumed, 0)::integer,
    coalesce(i.licenses_allocated, 0)::integer
  from public.products p
  left join public.distributor_inventory i
    on i.product_id = p.id
   and i.distributor_id = p_distributor_id
  where p.is_active = true
  order by p.sku;
$$;

grant execute on function public.partner_inventory_summary(uuid) to authenticated, service_role;
grant execute on function public.reserve_deploy_license(uuid, uuid, uuid, uuid) to service_role;
