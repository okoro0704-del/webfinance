-- Retailer portals: r1…rN.webfinance.app; distributors keep d1…dN.

create or replace function public.next_partner_subdomain_slot(p_tier public.partner_tier)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot integer;
  v_lock bigint;
begin
  v_lock := case
    when p_tier = 'software_retailer' then 87236402
    else 87236401
  end;
  perform pg_advisory_xact_lock(v_lock);

  select s into v_slot
  from generate_series(1, 100) as s
  where not exists (
    select 1
    from public.distributors d
    where d.subdomain_slot = s
      and coalesce(d.partner_tier, 'distributor'::public.partner_tier) = p_tier
      and coalesce(d.is_master, false) = false
  )
  order by s
  limit 1;

  if v_slot is null then
    raise exception 'No free subdomain slots for tier %', p_tier;
  end if;
  return v_slot;
end;
$$;

-- Keep legacy name for distributors
create or replace function public.next_distributor_subdomain_slot()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.next_partner_subdomain_slot('distributor');
end;
$$;

drop index if exists public.distributors_subdomain_slot_uidx;

create unique index if not exists distributors_tier_subdomain_slot_uidx
  on public.distributors (partner_tier, subdomain_slot)
  where subdomain_slot is not null and coalesce(is_master, false) = false;

create or replace function public.assign_distributor_subdomain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot integer;
  v_is_admin boolean;
  v_tier public.partner_tier;
  v_prefix text;
begin
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

  v_tier := coalesce(new.partner_tier, 'distributor'::public.partner_tier);
  v_prefix := case when v_tier = 'software_retailer' then 'r' else 'd' end;

  if new.subdomain_slot is null
     or new.subdomain is null
     or new.subdomain like 'distributor%.webfinance.app'
     or (v_tier = 'software_retailer' and new.subdomain ~ '^d[0-9]+\.webfinance\.app$')
     or (v_tier = 'distributor' and new.subdomain ~ '^r[0-9]+\.webfinance\.app$')
  then
    v_slot := coalesce(new.subdomain_slot, public.next_partner_subdomain_slot(v_tier));
    new.subdomain_slot := v_slot;
    new.subdomain := v_prefix || v_slot::text || '.webfinance.app';
  end if;

  return new;
end;
$$;

-- Reserve rN / rs labels from tenant slug portals (preserve existing allocator)
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
  v_parent constant text := 'webfinance.app';
begin
  if new.portal_hostname is null
     or new.portal_hostname = ''
     or new.portal_hostname like '%.mm.webfinance.app'
     or new.portal_hostname like '%.pm.webfinance.app' then

    v_base := lower(regexp_replace(coalesce(new.slug, 'tenant'), '[^a-z0-9-]+', '-', 'g'));
    v_base := trim(both '-' from v_base);
    if v_base = '' then
      v_base := 'tenant';
    end if;

    if v_base in (
      'www', 'mm', 'pm', 'app', 'apps', 'mail', 'send', 'inbound', 'api', 'cdn', 'edge', 'rs',
      'distributor1', 'distributor2', 'distributor3'
    ) or v_base ~ '^d[0-9]+$'
      or v_base ~ '^r[0-9]+$'
      or v_base ~ '^distributor[0-9]+$' then
      v_base := v_base || '-tenant';
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
      )
      and not exists (
        select 1 from public.distributors d
        where d.subdomain = v_host
      );

      v_n := v_n + 1;
      if v_n > 200 then
        raise exception 'Could not allocate portal hostname for slug %', new.slug;
      end if;
    end loop;

    new.portal_hostname := v_host;
  end if;

  return new;
end;
$$;

grant execute on function public.next_partner_subdomain_slot(public.partner_tier)
  to authenticated, service_role;
grant execute on function public.next_distributor_subdomain_slot()
  to authenticated, service_role;
