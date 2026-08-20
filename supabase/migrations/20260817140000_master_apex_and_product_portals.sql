-- Master stays on webfinance.app; partners get distributor1..100
-- Products define client subdomain base (e.g. mm.webfinance.app → slug.mm.webfinance.app)

alter table public.products
  add column if not exists client_portal_base_domain text;

update public.products
set client_portal_base_domain = coalesce(
  nullif(client_portal_base_domain, ''),
  nullif(metadata->>'host', ''),
  case sku
    when 'PRODUCT_A' then 'mm.webfinance.app'
    when 'PRODUCT_B' then 'pm.webfinance.app'
    else 'webfinance.app'
  end
);

alter table public.distributors
  add column if not exists is_master boolean not null default false;

-- Mark platform_admin distributor as master (no distributorN subdomain)
update public.distributors d
set
  is_master = true,
  subdomain = null,
  subdomain_slot = null
from public.profiles p
where d.profile_id = p.id
  and p.role = 'platform_admin';

-- Re-number non-master distributors from 1
do $$
declare
  r record;
  v_slot integer := 1;
begin
  -- Clear non-master slots first to avoid unique conflicts
  update public.distributors
  set subdomain_slot = null, subdomain = null
  where coalesce(is_master, false) = false;

  for r in
    select id from public.distributors
    where coalesce(is_master, false) = false
    order by created_at asc, id asc
  loop
    update public.distributors
    set
      subdomain_slot = v_slot,
      subdomain = 'distributor' || v_slot || '.webfinance.app'
    where id = r.id;
    v_slot := v_slot + 1;
  end loop;
end;
$$;

create or replace function public.assign_distributor_subdomain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot integer;
  v_is_admin boolean;
begin
  -- Master / platform admin workspace stays on apex webfinance.app
  select exists (
    select 1 from public.profiles p
    where p.id = new.profile_id and p.role = 'platform_admin'
  ) into v_is_admin;

  if coalesce(new.is_master, false) or v_is_admin then
    new.is_master := true;
    new.subdomain_slot := null;
    new.subdomain := null;
    return new;
  end if;

  if new.subdomain_slot is null or new.subdomain is null then
    v_slot := coalesce(new.subdomain_slot, public.next_distributor_subdomain_slot());
    new.subdomain_slot := v_slot;
    new.subdomain := coalesce(nullif(new.subdomain, ''), 'distributor' || v_slot || '.webfinance.app');
  end if;
  return new;
end;
$$;

create or replace function public.assign_client_portal_hostname()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host text;
  v_base text;
  v_n integer := 0;
  v_parent text;
begin
  if new.portal_hostname is null or new.portal_hostname = '' then
    select coalesce(
      nullif(pr.client_portal_base_domain, ''),
      nullif(pr.metadata->>'host', ''),
      'webfinance.app'
    )
    into v_parent
    from public.products pr
    where pr.id = new.product_id;

    v_parent := lower(regexp_replace(coalesce(v_parent, 'webfinance.app'), '^https?://', '', 'i'));
    v_parent := trim(both '/' from v_parent);

    v_base := lower(regexp_replace(coalesce(new.slug, 'tenant'), '[^a-z0-9-]+', '-', 'g'));
    v_base := trim(both '-' from v_base);
    if v_base = '' then
      v_base := 'tenant';
    end if;

    loop
      v_host := case
        when v_n = 0 then v_base || '.' || v_parent
        else v_base || '-' || v_n::text || '.' || v_parent
      end;

      exit when not exists (
        select 1 from public.clients c
        where c.portal_hostname = v_host
          and c.id is distinct from new.id
      )
      and not exists (
        select 1 from public.clients c2
        where c2.custom_domain = v_host
          and c2.id is distinct from new.id
      );

      v_n := v_n + 1;
      if v_n > 200 then
        raise exception 'Could not allocate portal hostname for slug %', new.slug;
      end if;
    end loop;

    new.portal_hostname := v_host;

    if new.custom_domain is null or new.custom_domain = '' then
      new.custom_domain := v_host;
    end if;
  end if;

  return new;
end;
$$;

-- Rebuild existing client portals under product bases
do $$
declare
  r record;
  v_host text;
  v_base text;
  v_parent text;
  v_n integer;
begin
  for r in
    select c.id, c.slug, c.product_id
    from public.clients c
    order by c.created_at asc
  loop
    select coalesce(
      nullif(pr.client_portal_base_domain, ''),
      nullif(pr.metadata->>'host', ''),
      'webfinance.app'
    )
    into v_parent
    from public.products pr
    where pr.id = r.product_id;

    v_parent := lower(regexp_replace(coalesce(v_parent, 'webfinance.app'), '^https?://', '', 'i'));
    v_parent := trim(both '/' from v_parent);

    v_base := lower(regexp_replace(coalesce(r.slug, 'tenant'), '[^a-z0-9-]+', '-', 'g'));
    v_base := trim(both '-' from v_base);
    if v_base = '' then v_base := 'tenant'; end if;

    v_n := 0;
    loop
      v_host := case when v_n = 0 then v_base || '.' || v_parent
                     else v_base || '-' || v_n::text || '.' || v_parent end;
      exit when not exists (
        select 1 from public.clients
        where portal_hostname = v_host and id <> r.id
      );
      v_n := v_n + 1;
    end loop;

    update public.clients
    set
      portal_hostname = v_host,
      custom_domain = case
        when custom_domain is null
          or custom_domain = ''
          or custom_domain like '%.webfinance.app'
        then v_host
        else custom_domain
      end
    where id = r.id;
  end loop;
end;
$$;
